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
  assert.equal(m.version, '3.6.1');
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

  // The guide must not change the flag used by the site to reveal Romaji.
  assert.equal(mockView._isKBHandView, undefined, 'Native visual state must be preserved');
  assert.equal(guideActivated, true, '_nextKeyActive must be invoked for guide highlight');

  // Now press physical key 'x' -> must be remapped to 't' via engine!
  const e = r.key('keydown', { key: 'x', code: 'KeyX' });
  assert.equal(e.key, 't', 'Must remap to "t" from engine in Romaji-OFF mode');
  assert.equal(e.isTrusted, true);
});

function createNativeView(r, isRomaView = false) {
  const native = require('./fixtures/etyping-view.cjs');
  const highlights = [];
  let index = 0;
  let sentence = 'TOKYO';
  const textNode = () => ({
    value: '',
    text(value) { if (value === undefined) return this.value; this.value = value; },
    width() { return this.value.length; }
  });
  const sentenceView = {
    _text: '', _enteredNode: textNode(), _notEnteredNode: textNode(),
    _container: { empty() {} },
    init(text) { this._text = text; this._enteredNode.text(''); this._notEnteredNode.text(text); },
    scroll() {}, highlight: native.highlight, appendHighlightedText: native.appendHighlightedText
  };
  const view = {
    _config: { isRomaView, isKBHGuide: true, IS_HAND: true, SCREEN_ALPHA_POINT: 500 },
    _isKBHandView: isRomaView,
    _typing: {
      state: 'typing',
      currentExample: () => '東京',
      currentExampleSentence: () => sentence,
      currentSentenceIndex: () => index,
      nextKeyCharCode: () => sentence.charCodeAt(index),
      nextKeyCode: () => sentence.charCodeAt(index),
      getCurrentWPM: () => 200
    },
    _sentenceTextView: sentenceView,
    _exampleTextView: { pxScroll() {}, init() {} },
    _keyboard: { changeKeyState() {}, alpha: 1 },
    _hands: { setHighlightedFinger(code) { highlights.push(code); }, removeHighlightedFinger() {} },
    _prevKey: 0, _progressBar: null,
    correctKey: native.correctKey,
    exampleChangeComplete: native.exampleChangeComplete,
    displayExample: native.displayExample,
    displayExampleSentence: native.displayExampleSentence,
    _nextKeyActive: native._nextKeyActive,
    _prevKeyDeactive: native._prevKeyDeactive
  };
  r.sentence.value = '';
  r.window.jQuery = { fn: {}, proxy: (fn, ctx) => fn.bind(ctx) };
  const observe = () => r.window.jQuery.proxy(() => {}, view);
  observe();
  view.displayExample();
  return {
    view, sentenceView, highlights, observe,
    accept() { index++; view.correctKey(); },
    nextSentence() { index = 0; sentence = 'NEKO'; view.exampleChangeComplete(); }
  };
}

test('Romaji OFF: correct input only reveals entered letters while native guides follow', () => {
  const r = createInjectedRuntime();
  const n = createNativeView(r);
  // Site initialization assigns this flag after jQuery.proxy first observes the view.
  n.view._isKBHandView = false;
  const wrappedGuide = n.view._nextKeyActive;
  n.observe();
  assert.equal(n.view._nextKeyActive, wrappedGuide, 'Repeated proxy calls must not stack wrappers');
  for (const entered of ['T', 'TO', 'TOK']) {
    const e = r.key('keydown');
    assert.equal(e.key, entered.at(-1).toLowerCase());
    n.accept();
    r.key('keyup');
    assert.equal(n.sentenceView._enteredNode.text(), entered);
    assert.equal(n.sentenceView._notEnteredNode.text(), '', 'Correct input must not reveal the rest of the sentence');
    assert.equal(n.view._isKBHandView, false);
    assert.equal(n.highlights.at(-1), 'TOKYO'.charCodeAt(entered.length));
  }
  n.nextSentence();
  assert.equal(n.sentenceView._notEnteredNode.text(), '');
  assert.equal(r.key().key, 'n');
  n.accept();
  assert.equal(n.sentenceView._enteredNode.text(), 'N');
  assert.equal(n.sentenceView._notEnteredNode.text(), '');
});

test('Romaji ON and native reveal state keep their original rendering behavior', () => {
  for (const isRomaView of [true, false]) {
    const r = createInjectedRuntime();
    const n = createNativeView(r, isRomaView);
    // The game may enable the same flag after a wrong key in Romaji-OFF mode.
    n.view._isKBHandView = true;
    n.accept();
    assert.equal(n.sentenceView._enteredNode.text(), 'T');
    assert.equal(n.sentenceView._notEnteredNode.text(), 'OKYO');
    assert.equal(n.view._isKBHandView, true);
    n.nextSentence();
    assert.equal(n.view._isKBHandView, isRomaView);
    assert.equal(n.sentenceView._notEnteredNode.text(), isRomaView ? 'NEKO' : '');
  }
});

test('Guide wrapper restores native state after errors and respects disabled remapping', () => {
  const r = createInjectedRuntime();
  const n = createNativeView(r);
  const count = n.highlights.length;
  r.config({ enabled: false });
  n.view._nextKeyActive();
  assert.equal(n.highlights.length, count);
  r.config({ enabled: true });
  n.view._config.isKBHGuide = false;
  n.view._nextKeyActive();
  assert.equal(n.highlights.length, count, 'The site guide preference must be respected');
  assert.equal(n.view._isKBHandView, false);
  n.view._config.isKBHGuide = true;
  n.view._hands.setHighlightedFinger = () => { throw new Error('guide failed'); };
  assert.throws(() => n.view._nextKeyActive(), /guide failed/);
  assert.equal(n.view._isKBHandView, false);
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
