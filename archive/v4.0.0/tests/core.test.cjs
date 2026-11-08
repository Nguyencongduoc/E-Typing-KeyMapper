const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const context = extra => ({ enabled: true, focused: true, editable: false, composing: false, allowRepeat: false, state: 'typing', expected: 'N', ...extra });
const event = (type, code = 'KeyA', key = 'a', extra = {}) => ({ type, code, key, location: 0, isTrusted: true, repeat: false, timeStamp: 100, ...extra });

test('settings accept only supported values', () => {
  assert.deepEqual(C.settings({ enabled: 'true', shortcut: 'evil', hudPosition: { x: NaN, y: 2 } }), C.DEFAULTS);
  assert.equal(C.settings({ allowRepeat: true }).allowRepeat, true);
  assert.deepEqual(C.settings({ hudPosition: { x: -5, y: 20 } }).hudPosition, { x: 0, y: 20 });
});
test('all printable ASCII has a consistent virtual key and keypress charCode', () => {
  for (let i = 32; i < 127; i++) {
    const c = String.fromCharCode(i), d = C.keyProps(c, 'keydown'), p = C.keyProps(c, 'keypress');
    assert.ok(d.code, c); assert.equal(p.charCode, c.toLowerCase().charCodeAt(0)); assert.equal(d.charCode, 0);
  }
  assert.equal(C.keyProps(':', 'keydown').code, 'Semicolon');
  assert.equal(C.keyProps('ー', 'keypress').charCode, 45);
  assert.equal(C.keyProps('あ', 'keydown'), null);
});
test('protocol rejects foreign channels and versions', () => {
  assert.ok(C.isMessage(C.message('CONFIG'), ['CONFIG']));
  assert.ok(!C.isMessage({ ...C.message('CONFIG'), version: 2 }, ['CONFIG']));
  assert.ok(!C.isMessage(C.message('STATUS'), ['CONFIG']));
});
test('wrong physical key maps to the expected character without changing input timestamp', () => {
  const m = new C.Mapper(), e = event('keydown');
  assert.equal(m.handle(e, context()).char, 'n');
  assert.equal(e.timeStamp, 100);
  assert.equal(m.snapshot().presses, 1); assert.equal(m.snapshot().corrected, 1);
});
test('untrusted events never change held state or metrics', () => {
  const m = new C.Mapper();
  assert.equal(m.handle(event('keydown', 'KeyA', 'a', { isTrusted: false }), context()).action, 'pass');
  assert.equal(m.snapshot().presses, 0); assert.equal(m.held.size, 0);
});
test('overlapping keys retain their own mapping even when released out of order', () => {
  const m = new C.Mapper();
  m.handle(event('keydown', 'KeyA'), context({ expected: 'N' }));
  m.handle(event('keydown', 'KeyB', 'b'), context({ expected: 'E' }));
  assert.equal(m.handle(event('keypress', 'KeyA'), context()).char, 'n');
  assert.equal(m.handle(event('keyup', 'KeyB', 'b'), context()).char, 'e');
  assert.equal(m.handle(event('keyup', 'KeyA'), context()).char, 'n');
  assert.equal(m.held.size, 0);
});
test('the same code in different locations is tracked separately', () => {
  const m = new C.Mapper();
  m.handle(event('keydown', 'Digit1', '1', { location: 0 }), context({ expected: 'a' }));
  m.handle(event('keydown', 'Digit1', '1', { location: 3 }), context({ expected: 'b' }));
  assert.equal(m.handle(event('keyup', 'Digit1', '1', { location: 0 }), context()).char, 'a');
  assert.equal(m.handle(event('keyup', 'Digit1', '1', { location: 3 }), context()).char, 'b');
});
test('keypress and keyup complete the original mapping across a sentence boundary', () => {
  const m = new C.Mapper(); m.handle(event('keydown'), context({ expected: 'i' }));
  assert.equal(m.handle(event('keypress'), context({ state: 'transitioning', expected: null })).char, 'i');
  assert.equal(m.handle(event('keyup'), context({ state: 'typing', expected: 't' })).char, 'i');
});
test('turning off finishes the current stroke, then stops mapping new strokes', () => {
  const m = new C.Mapper(); m.handle(event('keydown'), context());
  assert.equal(m.handle(event('keypress'), context({ enabled: false })).char, 'n');
  assert.equal(m.handle(event('keyup'), context({ enabled: false })).char, 'n');
  assert.equal(m.handle(event('keydown'), context({ enabled: false })).action, 'pass');
});
test('OS repeat after disabling passes normally instead of inheriting the old keypress suppression', () => {
  const m = new C.Mapper(); m.handle(event('keydown'), context()); m.handle(event('keypress'), context());
  assert.equal(m.handle(event('keydown', 'KeyA', 'a', { repeat: true }), context({ enabled: false })).action, 'pass');
  assert.equal(m.handle(event('keypress'), context({ enabled: false })).action, 'pass');
  assert.equal(m.handle(event('keyup'), context({ enabled: false })).action, 'pass');
});
test('repeat is blocked by default, including a stray keypress', () => {
  const m = new C.Mapper(); m.handle(event('keydown'), context()); m.handle(event('keypress'), context());
  assert.equal(m.handle(event('keydown', 'KeyA', 'a', { repeat: true }), context()).action, 'suppress');
  assert.equal(m.handle(event('keypress'), context()).action, 'suppress');
  assert.equal(m.handle(event('keyup'), context()).char, 'n');
  assert.equal(m.snapshot().presses, 1); assert.equal(m.snapshot().repeats, 0);
});
test('enabled OS repeat uses the newly observed target without generating extra physical presses', () => {
  const m = new C.Mapper(); m.handle(event('keydown'), context());
  assert.equal(m.handle(event('keydown', 'KeyA', 'a', { repeat: true }), context({ allowRepeat: true, expected: 'e' })).char, 'e');
  assert.equal(m.handle(event('keypress'), context()).char, 'e');
  assert.equal(m.snapshot().presses, 1); assert.equal(m.snapshot().repeats, 1);
});
test('a duplicate keypress cannot advance a stroke twice', () => {
  const m = new C.Mapper(); m.handle(event('keydown'), context());
  assert.equal(m.handle(event('keypress'), context()).action, 'patch');
  assert.equal(m.handle(event('keypress'), context()).action, 'suppress');
});
test('game controls, modifier keys, IME, editable fields and unfocused frames pass through', () => {
  for (const key of ['Shift', 'Backspace', 'Enter', 'Escape', 'Tab', 'ArrowLeft', 'Process', 'Dead']) {
    assert.equal(new C.Mapper().handle(event('keydown', key, key), context()).action, 'pass', key);
  }
  for (const props of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    assert.equal(new C.Mapper().handle(event('keydown', 'KeyA', 'a', props), context()).action, 'pass');
  }
  for (const props of [{ enabled: false }, { focused: false }, { editable: true }, { composing: true }]) {
    assert.equal(new C.Mapper().handle(event('keydown'), context(props)).action, 'pass');
  }
});
test('Space starts normally while waiting and can map during typing', () => {
  assert.equal(new C.Mapper().handle(event('keydown', 'Space', ' '), context({ state: 'waiting' })).action, 'pass');
  assert.equal(new C.Mapper().handle(event('keydown', 'Space', ' '), context()).char, 'n');
});
test('strokes during a known countdown/transition are discarded without replay', () => {
  const m = new C.Mapper();
  assert.equal(m.handle(event('keydown'), context({ state: 'transitioning' })).action, 'suppress');
  assert.equal(m.handle(event('keypress'), context({ expected: 'e' })).action, 'suppress');
  assert.equal(m.handle(event('keyup'), context()).action, 'suppress');
  assert.equal(m.snapshot().presses, 0);
});
test('unknown and unsupported targets never get guessed', () => {
  for (const ctx of [{ expected: 'あ' }, { expected: null }, { state: 'unknown' }, { state: 'unsupported' }]) {
    assert.equal(new C.Mapper().handle(event('keydown'), context(ctx)).action, 'pass');
  }
});
test('clear cancels held state without resetting statistics', () => {
  const m = new C.Mapper(); m.handle(event('keydown'), context()); m.clear();
  assert.equal(m.handle(event('keypress'), context()).action, 'pass'); assert.equal(m.snapshot().presses, 1);
});
test('KPM uses physical timestamp intervals, excludes repeat and preserves a pause', () => {
  const m = new C.Mapper();
  for (const timeStamp of [100, 220, 420, 510]) m.handle(event('keydown', 'KeyA', 'a', { timeStamp }), context());
  assert.equal(m.snapshot().averageGapMs, 410 / 3);
  assert.equal(m.snapshot().kpm, 3 * 60000 / 410);
  m.handle(event('keydown', 'KeyA', 'a', { timeStamp: 10510 }), context());
  assert.equal(m.snapshot().kpm, 4 * 60000 / 10410);
  m.resetStats(); assert.equal(m.snapshot().kpm, 0);
});
test('shortcut cannot toggle repeatedly when held', () => {
  assert.ok(C.shortcut(event('keydown', 'F8', 'F8'), 'F8'));
  assert.ok(!C.shortcut(event('keydown', 'F8', 'F8', { repeat: true }), 'F8'));
  assert.ok(C.shortcut(event('keydown', 'KeyS', 's', { altKey: true }), 'AltS'));
  assert.ok(!C.shortcut(event('keydown', 'KeyS', 's', { altKey: true, ctrlKey: true }), 'AltS'));
});
