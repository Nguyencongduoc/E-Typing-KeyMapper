const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
for(const file of ['injected.js','content.js','background.js','popup.html','popup.js','popup.css'])test(`${file} preserves the sample outside the requested shortcut change`,()=>{
  require('../scripts/sample-invariants.cjs').assertSampleFile(file);
});
test('manifest differs from the original only by release version',()=>{
  const current=JSON.parse(read('manifest.json')),original=JSON.parse(read('tests/fixtures/sample/manifest.json'));
  assert.equal(current.version,'3.5.1');assert.deepEqual({...current,version:original.version},original);
  assert.deepEqual(current.permissions,['storage']);assert.equal(current.background,undefined);
});
function runtime(){
  const handlers={},posted=[],sentence={value:'NEKO'},window={addEventListener(type,fn){(handlers[type]||=[]).push(fn);},postMessage(m){posted.push(m);}};
  const document={getElementById:()=>({querySelectorAll:()=>[{classList:{contains:()=>false},textContent:sentence.value}]})};
  const box=vm.createContext({window,document});vm.runInContext(read('injected.js'),box);
  return {window,box,posted,sentence,config(value){for(const fn of handlers.message||[])fn({data:{__etypingConfigUpdate:value},source:window});},key(type='keydown',extra={}){
    const e={type,key:'x',code:'KeyX',keyCode:88,charCode:type==='keypress'?120:0,which:88,shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,timeStamp:321,isTrusted:true,...extra};for(const fn of handlers[type]||[])fn(e);return e;
  }};
}
test('sample DOM mapping patches the existing physical event and retains cadence/trust',()=>{
  const r=runtime();for(const type of ['keydown','keypress','keyup']){const e=r.key(type);assert.equal(e.key,'n');assert.equal(e.isTrusted,true);assert.equal(e.timeStamp,321);}
  assert.equal(r.posted.length,1);r.sentence.value='EKO';assert.equal(r.key().key,'e');
});
test('original enabled, Accuracy and OS repeat behaviors remain unchanged',()=>{
  const r=runtime();r.config({enabled:false});assert.equal(r.key().key,'x');r.config({enabled:true,accuracy:100});assert.equal(r.key('keydown',{repeat:true}).key,'n');
  r.config({accuracy:80});vm.runInContext('Math.random=()=>0.99',r.box);assert.notEqual(r.key().key,'n');
});
test('Romaji absent from DOM is not replaced by private engine access',()=>{
  const r=runtime();r.sentence.value='';assert.equal(r.key().key,'x');
  assert.ok(!/jQuery|typingEngine|webNavigation|MutationObserver|dispatchEvent|setTimeout|setInterval/.test(read('injected.js')));
});
test('inactive sample background is not registered or granted debugger access',()=>{
  const m=JSON.parse(read('manifest.json'));assert.equal(m.background,undefined);assert.ok(!m.permissions.includes('debugger'));
  assert.ok(read('content.js').includes('setInterval(renderHUD, 200)'));
});

function shortcutRuntime() {
  const handlers = {}, writes = [], posted = [];
  const window = {addEventListener(type, fn) {(handlers[type] ||= []).push(fn);}, postMessage(m) {posted.push(m);}};
  const chrome = {storage: {local: {
    get(defaults, callback) {callback(defaults);},
    set(value) {writes.push({...value});}
  }, onChanged: {addListener() {}}}};
  vm.runInNewContext(read('content.js'), {window, chrome, document: {body: null}, setInterval() {}});
  return {writes, posted, key(extra = {}) {
    const e = {code: 'F8', key: 'F8', ctrlKey: true, shiftKey: true, altKey: false, metaKey: false,
      repeat: false, isComposing: false, prevented: false, stopped: false,
      preventDefault() {this.prevented = true;}, stopImmediatePropagation() {this.stopped = true;}, ...extra};
    for (const handler of handlers.keydown) handler(e);
    return e;
  }};
}
test('Ctrl+Shift+F8 toggles and persists both ways, and consumes only that exact combination', () => {
  const r = shortcutRuntime();
  for (const enabled of [false, true]) {
    const e = r.key();
    assert.ok(e.prevented && e.stopped);
    assert.equal(r.writes.at(-1).enabled, enabled);
    assert.equal(r.posted.at(-1).__etypingConfigUpdate.enabled, enabled);
  }
});
test('holding the shortcut does not toggle repeatedly', () => {
  const r = shortcutRuntime(); r.key();
  for (let i = 0; i < 20; i++) assert.ok(r.key({repeat: true}).prevented);
  assert.deepEqual(r.writes, [{enabled: false}]);
  r.key(); assert.deepEqual(r.writes, [{enabled: false}, {enabled: true}]);
});
test('old shortcuts, partial modifiers, extra modifiers and IME do not toggle or get consumed', () => {
  const r = shortcutRuntime();
  for (const modifiers of [
    {ctrlKey: false, shiftKey: false}, {ctrlKey: false}, {shiftKey: false},
    {altKey: true}, {metaKey: true}, {isComposing: true},
    {key: 's', code: 'KeyS', altKey: true, ctrlKey: false, shiftKey: false},
    {key: 'x', code: 'KeyX'}, {key: 'F9', code: 'F9'}
  ]) {
    const e = r.key(modifiers); assert.equal(e.prevented, false); assert.equal(e.stopped, false);
  }
  assert.equal(r.writes.length, 0);
});
