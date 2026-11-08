const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('manifest.json is valid MV3, has icons and minimal permissions', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.version, '3.6.0');
  assert.deepEqual(m.permissions, ['storage']);
  assert.ok(!m.permissions.includes('debugger'));
  assert.equal(m.background, undefined);
  assert.ok(m.icons && m.icons['16'] && m.icons['128']);
  assert.ok(m.action && m.action.default_icon);

  // Check icon files actually exist
  for (const size of ['16', '32', '48', '128']) {
    assert.ok(fs.existsSync(path.join(root, `icons/icon${size}.png`)), `Icon ${size} must exist`);
  }
});

function createInjectedRuntime() {
  const handlers = {};
  const posted = [];
  const sentence = { value: 'NEKO' };
  const window = {
    addEventListener(type, fn) {
      (handlers[type] ||= []).push(fn);
    },
    postMessage(m) {
      posted.push(m);
    }
  };
  const document = {
    getElementById: id => {
      if (id === 'sentenceText') {
        if (!sentence.value) return null;
        return {
          querySelectorAll: () => [
            { classList: { contains: () => false }, textContent: sentence.value }
          ]
        };
      }
      return null;
    }
  };
  const box = vm.createContext({ window, document });
  vm.runInContext(read('injected.js'), box);

  return {
    window,
    box,
    posted,
    sentence,
    config(value) {
      for (const fn of handlers.message || []) {
        fn({ data: { __etypingConfigUpdate: value }, source: window });
      }
    },
    key(type = 'keydown', extra = {}) {
      const e = {
        type,
        key: 'x',
        code: 'KeyX',
        keyCode: 88,
        charCode: type === 'keypress' ? 120 : 0,
        which: 88,
        shiftKey: false,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        timeStamp: 321,
        isTrusted: true,
        repeat: false,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
        ...extra
      };
      for (const fn of handlers[type] || []) fn(e);
      return e;
    }
  };
}

test('DOM mapping patches existing physical event and retains cadence/trust', () => {
  const r = createInjectedRuntime();
  for (const type of ['keydown', 'keypress', 'keyup']) {
    const e = r.key(type);
    assert.equal(e.key, 'n');
    assert.equal(e.isTrusted, true);
    assert.equal(e.timeStamp, 321);
  }
  assert.equal(r.posted.length, 1);
  r.sentence.value = 'EKO';
  assert.equal(r.key().key, 'e');
});

test('Romaji-OFF fallback: reads directly from typingEngine when DOM has no Romaji', () => {
  const r = createInjectedRuntime();
  // Clear DOM sentence (simulating Romaji-OFF)
  r.sentence.value = '';

  let guideActivated = false;
  // Simulate e-typing engine and view initialization via jQuery.proxy
  const mockView = {
    _config: { isRomaView: false, isKBHGuide: true },
    _typing: {
      state: 'typing',
      currentExampleSentence: () => 'TOKYO',
      currentSentenceIndex: () => 0,
      nextKeyCharCode: () => 116 // 't'
    },
    _nextKeyActive() {
      guideActivated = true;
    }
  };

  const jq = { fn: {}, proxy: (fn, ctx) => fn.bind(ctx) };
  r.window.jQuery = jq;
  r.window.jQuery.proxy(() => {}, mockView)();

  // Verify that _isKBHandView is forced true to keep finger guide & keyboard active
  assert.equal(mockView._isKBHandView, true, 'Visual guide flag _isKBHandView must be active');
  assert.equal(guideActivated, true, '_nextKeyActive must be invoked for guide highlight');

  // Now press physical key 'x' -> must be remapped to 't' via engine!
  const e = r.key('keydown', { key: 'x', code: 'KeyX' });
  assert.equal(e.key, 't', 'Must remap to "t" from engine in Romaji-OFF mode');
  assert.equal(e.isTrusted, true);
});

test('Key rollover: tracks active keys independently by code to avoid mismatched keyup', () => {
  const r = createInjectedRuntime();
  r.sentence.value = 'CAT';

  // Press KeyA -> expected 'c'
  const e1Down = r.key('keydown', { key: 'a', code: 'KeyA' });
  assert.equal(e1Down.key, 'c');

  // Advance target to 'A'
  r.sentence.value = 'AT';

  // Press KeyB before KeyA released -> expected 'a'
  const e2Down = r.key('keydown', { key: 'b', code: 'KeyB' });
  assert.equal(e2Down.key, 'a');

  // Release KeyA -> must retain 'c' mapped from KeyA, NOT overwrite with 'a'!
  const e1Up = r.key('keyup', { key: 'a', code: 'KeyA' });
  assert.equal(e1Up.key, 'c', 'KeyA keyup must retain its original mapped character');

  // Release KeyB -> must retain 'a'
  const e2Up = r.key('keyup', { key: 'b', code: 'KeyB' });
  assert.equal(e2Up.key, 'a', 'KeyB keyup must retain its original mapped character');
});

test('Ignored keys: standalone Shift, CapsLock, navigation and function keys are not consumed', () => {
  const r = createInjectedRuntime();
  r.sentence.value = 'TEST';

  const ignoredKeys = [
    { key: 'Shift', code: 'ShiftLeft' },
    { key: 'Shift', code: 'ShiftRight' },
    { key: 'Control', code: 'ControlLeft' },
    { key: 'Alt', code: 'AltLeft' },
    { key: 'CapsLock', code: 'CapsLock' },
    { key: 'ArrowDown', code: 'ArrowDown' },
    { key: 'ArrowUp', code: 'ArrowUp' },
    { key: 'ArrowLeft', code: 'ArrowLeft' },
    { key: 'ArrowRight', code: 'ArrowRight' },
    { key: 'Insert', code: 'Insert' },
    { key: 'Delete', code: 'Delete' },
    { key: 'Home', code: 'Home' },
    { key: 'End', code: 'End' },
    { key: 'PageUp', code: 'PageUp' },
    { key: 'PageDown', code: 'PageDown' },
    { key: 'Escape', code: 'Escape' },
    { key: 'Tab', code: 'Tab' },
    { key: 'F1', code: 'F1' },
    { key: 'F12', code: 'F12' }
  ];

  for (const item of ignoredKeys) {
    const e = r.key('keydown', item);
    assert.equal(e.key, item.key, `Key ${item.key} must not be patched`);
  }
  // Target sentence should not have been affected
  assert.equal(r.key('keydown', { key: 'z', code: 'KeyZ' }).key, 't');
});

test('Special characters & punctuation keycodes', () => {
  const r = createInjectedRuntime();
  const testChars = [
    { char: 'ー', expectedKey: '-', expectedCode: 'Minus' },
    { char: '!', expectedKey: '!', expectedCode: 'Digit1', shiftKey: true },
    { char: '?', expectedKey: '?', expectedCode: 'Slash', shiftKey: true },
    { char: '_', expectedKey: '_', expectedCode: 'Minus', shiftKey: true },
    { char: '(', expectedKey: '(', expectedCode: 'Digit9', shiftKey: true },
    { char: ')', expectedKey: ')', expectedCode: 'Digit0', shiftKey: true },
    { char: '"', expectedKey: '"', expectedCode: 'Quote', shiftKey: true },
    { char: '@', expectedKey: '@', expectedCode: 'Digit2', shiftKey: true }
  ];

  for (const tc of testChars) {
    r.sentence.value = tc.char;
    const e = r.key('keydown', { key: 'x', code: 'KeyX' });
    assert.equal(e.key, tc.expectedKey);
    assert.equal(e.code, tc.expectedCode);
    if (tc.shiftKey) assert.equal(e.shiftKey, true);
  }
});

test('blockRepeat: ignores or cancels repeat keydown when enabled', () => {
  const r = createInjectedRuntime();
  r.sentence.value = 'HELLO';

  // When blockRepeat is false (default): repeat is processed
  r.config({ blockRepeat: false });
  const e1 = r.key('keydown', { repeat: true });
  assert.equal(e1.prevented, false);
  assert.equal(e1.key, 'h');

  // When blockRepeat is true: repeat is stopped to prevent -1 fraud score
  r.config({ blockRepeat: true });
  const e2 = r.key('keydown', { repeat: true });
  assert.equal(e2.prevented, true);
  assert.equal(e2.stopped, true);
});

function createContentRuntime() {
  const handlers = {};
  const writes = [];
  const posted = [];
  const window = {
    addEventListener(type, fn) {
      (handlers[type] ||= []).push(fn);
    },
    postMessage(m) {
      posted.push(m);
    }
  };
  const chrome = {
    storage: {
      local: {
        get(defaults, cb) { cb(defaults); },
        set(val) { writes.push({ ...val }); }
      },
      onChanged: { addListener() {} }
    }
  };
  const document = { body: null };

  vm.runInNewContext(read('content.js'), {
    window,
    chrome,
    document,
    setInterval() {}
  });

  return {
    writes,
    posted,
    key(extra = {}) {
      const e = {
        code: 'F8',
        key: 'F8',
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        repeat: false,
        isComposing: false,
        prevented: false,
        stopped: false,
        preventDefault() { this.prevented = true; },
        stopImmediatePropagation() { this.stopped = true; },
        ...extra
      };
      for (const handler of handlers.keydown || []) handler(e);
      return e;
    }
  };
}

test('Ctrl+Shift+F8 toggles and persists enabled state', () => {
  const r = createContentRuntime();
  for (const enabled of [false, true]) {
    const e = r.key();
    assert.ok(e.prevented && e.stopped);
    assert.equal(r.writes.at(-1).enabled, enabled);
    assert.equal(r.posted.at(-1).__etypingConfigUpdate.enabled, enabled);
  }
});

test('Holding shortcut does not toggle repeatedly', () => {
  const r = createContentRuntime();
  r.key();
  for (let i = 0; i < 20; i++) assert.ok(r.key({ repeat: true }).prevented);
  assert.deepEqual(r.writes, [{ enabled: false }]);
  r.key();
  assert.deepEqual(r.writes, [{ enabled: false }, { enabled: true }]);
});

test('Old shortcuts and extra modifiers do not toggle', () => {
  const r = createContentRuntime();
  for (const modifiers of [
    { ctrlKey: false, shiftKey: false },
    { ctrlKey: false },
    { shiftKey: false },
    { altKey: true },
    { metaKey: true },
    { isComposing: true },
    { key: 's', code: 'KeyS', altKey: true, ctrlKey: false, shiftKey: false },
    { key: 'F8', code: 'F8', ctrlKey: false, shiftKey: false }
  ]) {
    const e = r.key(modifiers);
    assert.equal(e.prevented, false);
    assert.equal(e.stopped, false);
  }
  assert.equal(r.writes.length, 0);
});
