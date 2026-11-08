const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');
const load = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Event objects and trust flags here are emulated, not a browser trust assertion.
function runtime() {
  class Element { closest() { return this.editable ? this : null; } }
  const handlers = {}, docHandlers = {}, posted = [], frames = [];
  const body = new Element();
  const doc = { activeElement: body, visibilityState: 'visible', hidden: false,
    focused: true, hasFocus() { return this.focused; }, addEventListener(type, fn) { (docHandlers[type] ||= []).push(fn); } };
  let state = { state: 'typing', expected: 'n', recognized: true };
  const window = { addEventListener(type, fn) { (handlers[type] ||= []).push(fn); }, postMessage(msg) { posted.push(msg); } };
  const box = vm.createContext({ window, document: doc, Element, location: { origin: 'https://www.e-typing.ne.jp' },
    ETKMCore: C, ETKMAdapter: { Adapter: class { constructor(notify) { this.notify = notify; } read() { return state; } } },
    performance: { now: (() => { let value = 0; return () => value += .05; })() }, requestAnimationFrame(fn) { frames.push(fn); } });
  vm.runInContext(load('injected.js'), box);
  function receive(data, source = window, origin = 'https://www.e-typing.ne.jp') {
    for (const fn of handlers.message || []) fn({ data, source, origin });
  }
  return {
    posted, doc, body, frames,
    receive,
    configure(extra = {}) { receive(C.message('CONFIG', { config: { ...C.DEFAULTS, ...extra } })); },
    state(next) { state = next; },
    flush() { for (const fn of frames.splice(0)) fn(); },
    fire(type, extra = {}) {
      const e = { type, code: 'KeyA', key: 'a', location: 0, charCode: type === 'keypress' ? 97 : 0, keyCode: 65, which: 65,
        isTrusted: true, shiftKey: false, repeat: false, target: body, timeStamp: 100,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
      for (const fn of handlers[type] || []) { fn(e); if (e.stopped) break; } return e;
    },
    fireObject(e) { for (const fn of handlers[e.type] || []) fn(e); },
    docEvent(type, target = body) { for (const fn of docHandlers[type] || []) fn({ target }); }
  };
}
test('MAIN stays inactive until configuration arrives, including saved disabled state', () => {
  const r = runtime();
  assert.equal(r.fire('keydown').key, 'a');
  r.configure({ enabled: false }); assert.equal(r.fire('keydown').key, 'a');
  assert.equal(r.posted.at(-1).status.state, 'disabled');
});
test('runtime patches the existing object and preserves original trust and timestamp', () => {
  const r = runtime(); r.configure();
  const e = r.fire('keydown', { timeStamp: 123.4 });
  assert.equal(e.key, 'n'); assert.equal(e.code, 'KeyN'); assert.equal(e.isTrusted, true); assert.equal(e.timeStamp, 123.4);
  assert.equal(r.fire('keypress').charCode, 110);
  r.state({ state: 'transitioning', expected: null, recognized: true });
  assert.equal(r.fire('keyup').key, 'n');
  r.flush(); const s = r.posted.at(-1).status;
  assert.equal(s.last.physicalKey, 'a'); assert.equal(s.last.mappedKey, 'n');
});
test('runtime never maps an untrusted keyboard event', () => {
  const r = runtime(); r.configure();
  assert.equal(r.fire('keydown', { isTrusted: false }).key, 'a');
  r.receive(C.message('SNAPSHOT')); assert.equal(r.posted.at(-1).status.stats.presses, 0);
});
test('a malformed or foreign bridge message cannot enable the mapper', () => {
  const r = runtime();
  r.receive(C.message('CONFIG', { config: { ...C.DEFAULTS } }), {});
  r.receive(C.message('CONFIG', { config: { ...C.DEFAULTS } }), undefined, 'https://other.example');
  r.receive(C.message('CONFIG', { config: { enabled: true, allowRepeat: 'yes' } }));
  assert.equal(r.fire('keydown').key, 'a');
});
test('suppressed repeats do not leak their following keypress into the game', () => {
  const r = runtime(); r.configure(); r.fire('keydown'); r.fire('keypress');
  assert.ok(r.fire('keydown', { repeat: true }).stopped);
  assert.ok(r.fire('keypress').stopped);
});
test('nonconfigurable event properties pause mapping and suppress the entire failed stroke', () => {
  const r = runtime(); r.configure();
  const e = { type: 'keydown', code: 'KeyA', location: 0, keyCode: 65, isTrusted: true, target: r.body,
    timeStamp: 100, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
  Object.defineProperty(e, 'key', { value: 'a', configurable: false });
  r.fireObject(e); assert.ok(e.prevented); assert.equal(e.code, 'KeyA');
  assert.ok(r.fire('keypress').stopped); assert.ok(r.fire('keyup').stopped);
  r.flush(); assert.equal(r.posted.at(-1).status.state, 'error');
});
test('IME and editable focus cancel pending strokes before touching unrelated input', () => {
  const r = runtime(); r.configure(); r.fire('keydown');
  r.body.editable = true; assert.equal(r.fire('keypress').key, 'a');
  r.body.editable = false; assert.equal(r.fire('keyup').key, 'a');
  r.fire('compositionstart'); assert.equal(r.fire('keydown').key, 'a');
  r.fire('compositionend'); assert.equal(r.fire('keydown').key, 'n');
});
test('keyboard shortcut toggles once per stroke, without becoming a typed character', () => {
  const r = runtime(); r.configure();
  const e = r.fire('keydown', { code: 'F8', key: 'F8' }); assert.ok(e.stopped);
  assert.equal(r.posted.filter(m => m.type === 'TOGGLE_REQUEST').length, 1);
  r.fire('keydown', { code: 'F8', key: 'F8', repeat: true });
  assert.equal(r.posted.filter(m => m.type === 'TOGGLE_REQUEST').length, 1);
  assert.equal(r.fire('keydown').key, 'a');
});
test('blur cancels held mappings and reset only resets session numbers', () => {
  const r = runtime(); r.configure(); r.fire('keydown'); r.fire('blur');
  assert.equal(r.fire('keypress').key, 'a');
  r.receive(C.message('RESET_STATS'));
  assert.equal(r.posted.at(-1).status.stats.presses, 0);
  assert.equal(r.fire('keydown').key, 'n');
});
test('telemetry can flush repeatedly while idle without generating any keyboard actions', () => {
  const r = runtime(); r.configure();
  for (let i = 0; i < 100; i++) { r.flush(); r.receive(C.message('SNAPSHOT')); }
  assert.equal(r.posted.at(-1).status.stats.presses, 0);
  assert.ok(r.posted.every(msg => ['READY','CONFIG_ACK','STATUS'].includes(msg.type)));
});

function adapter() {
  class Node {
    constructor(id, text = '') { this.id = id; this.textContent = text; this.isConnected = true; this.nodeType = 1; this.parentElement = null; this.hidden = false; this.style = {}; this.children = []; this.entered = false; }
    get classList() { return { contains: name => name === 'entered' && this.entered }; }
    getClientRects() { return [1]; }
    getAttribute() { return null; }
    closest(selector) { return selector === '.entered' && this.entered ? this : this.parentElement?.closest(selector) || null; }
    querySelector(selector) { if (selector === 'span') return this.children.find(n => n.id === 'span') || null; return this.children.find(n => '#' + n.id === selector) || null; }
    querySelectorAll(selector) { return selector === 'span' ? this.children : []; }
  }
  const app = new Node('app'), sentence = new Node('sentenceText'), kana = new Node('kanaText');
  const entered = new Node('span', 'NE'); entered.entered = true;
  const rest = new Node('span', 'KO'); sentence.children = [entered, rest]; app.children = [sentence, kana];
  for (const node of [sentence,kana]) node.parentElement = app;
  for (const node of [entered,rest]) node.parentElement = sentence;
  const nodes = { app };
  let observerCallback;
  class Observer { constructor(fn) { this.fn = fn; observerCallback = fn; } observe() {} disconnect() {} }
  const box = vm.createContext({ window: {}, ETKMCore: C,
    document: { getElementById: id => nodes[id] || null },
    location: { href: 'https://www.e-typing.ne.jp/app/jsa_std/typing.asp?t=trysc.trysc.trysc.std.0' },
    URL, MutationObserver: Observer, queueMicrotask() {}, getComputedStyle: el => ({ display: el.style.display || 'block', visibility: 'visible' }) });
  vm.runInContext(load('etyping-adapter.js'), box);
  return { api: box.window.ETKMAdapter, Node, box, app, sentence, kana, entered, rest, nodes, get observerCallback() { return observerCallback; } };
}
test('adapter reads the remaining uppercase Romaji span, ignoring entered content', () => {
  const a = adapter(), instance = new a.api.Adapter(() => {});
  assert.equal(instance.read().expected, 'k'); assert.equal(instance.read().remaining, 'KO');
  a.rest.textContent = 'O'; assert.equal(instance.read().expected, 'o');
});
test('adapter handles empty/replaced spans and refuses unsupported characters', () => {
  const a = adapter(), instance = new a.api.Adapter(() => {});
  a.sentence.children = []; assert.equal(instance.read().state, 'transitioning');
  a.sentence.children = [a.entered,a.rest]; a.rest.textContent = '';
  assert.equal(instance.read().state, 'transitioning');
  a.rest.textContent = 'あ'; assert.equal(instance.read().state, 'unknown');
});
test('adapter detects ready, waiting, countdown, hidden view and result', () => {
  for (const [id, state] of [['start_view','ready'],['start_msg','waiting'],['countdown','countdown'],['result','result']]) {
    const a = adapter(), instance = new a.api.Adapter(() => {}); a.app.children.push(new a.Node(id));
    assert.equal(instance.read().state, state, id);
  }
  const a = adapter(), instance = new a.api.Adapter(() => {});
  a.app.style.display = 'none'; assert.equal(instance.read().state, 'unknown');
});
test('adapter requires the supported frame mode and a kana view', () => {
  const a = adapter(), instance = new a.api.Adapter(() => {});
  a.box.location.href = 'https://www.e-typing.ne.jp/app/jsa_std/typing.asp?t=anything.1';
  assert.equal(instance.read().state, 'unsupported');
  a.box.location.href = 'https://www.e-typing.ne.jp/app/jsa_std/typing.asp?t=anything.0';
  a.app.children = [a.sentence]; assert.equal(instance.read().state, 'unsupported');
});
