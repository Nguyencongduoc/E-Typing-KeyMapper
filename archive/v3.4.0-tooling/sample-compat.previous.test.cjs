const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sourcePath = path.join(root, 'research/app.min.js');
const gameSource = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : null;

// Event objects and isTrusted flags are simulated; these tests do not assert native browser trust.
function runtime(options = {}) {
  const handlers = {}, posted = [];
  const sentence = { querySelectorAll: () => options.spans || [] };
  const document = { getElementById: id => options.elements?.[id] || (id === 'sentenceText' ? sentence : null) };
  const window = { addEventListener(type, fn) { (handlers[type] ||= []).push(fn); }, removeEventListener(type, fn) { handlers[type] = (handlers[type] || []).filter(f => f !== fn); }, postMessage(msg) { posted.push(msg); } };
  if (options.jQuery) Object.defineProperty(window, 'jQuery', { value: options.jQuery, writable: !options.locked, configurable: !options.locked, enumerable: true });
  const math = Object.create(Math); if (options.random) math.random = options.random;
  const raf=[];
  const box = vm.createContext({ window, document, Math: math, requestAnimationFrame(fn){raf.push(fn);} });
  vm.runInContext(read('injected.js'), box);
  return { window, document, posted, box, flush(){while(raf.length)raf.shift()();}, clearListeners() { for (const key of Object.keys(handlers)) handlers[key] = []; },
    emit(type, extra = {}) {
      const e = { type, key: 'x', code: 'KeyX', keyCode: type === 'keypress' ? 120 : 88, charCode: type === 'keypress' ? 120 : 0,
        which: 88, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, repeat: false, timeStamp: 100, isTrusted: true,
        preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra };
      for (const fn of handlers[type] || []) fn(e); return e;
    },
    receive(data, source = window) { for (const fn of handlers.message || []) fn({ data, source }); },
    config(settings) { this.receive({ __etypingConfigUpdate: settings }); }
  };
}
function jquery() {
  const jq = function () {}; jq.fn = {}; jq.guid = 1;
  jq.proxy = function (fn, context, ...prefix) {
    if (typeof context === 'string') { const method = fn[context]; context = fn; fn = method; }
    if (typeof fn !== 'function') return undefined;
    const proxy = function (...args) { return fn.apply(context || this, prefix.concat(args)); };
    proxy.guid = fn.guid = fn.guid || jq.guid++; return proxy;
  }; return jq;
}
function engine(sentences = ['NEKO']) {
  return {
    state: 'typing', _isExampleChangeInterval: false, _config: { isRomaView: false, isKBHGuide: false, type: '0x00' }, correct: 0, misses: 0,
    example: { data: sentences, currentExampleIndex: 0, currentSentenceIndex: 0,
      getSentence(index) { return this.data[index]; },
      currentSentenceCharCode() { return this.data[this.currentExampleIndex].charCodeAt(this.currentSentenceIndex); },
      keyCompare(code) { if (code !== this.currentSentenceCharCode()) return false; this.currentSentenceIndex++; return true; }
    },
    currentExampleSentence() { return this.example.getSentence(this.example.currentExampleIndex); },
    currentSentenceIndex() { return this.example.currentSentenceIndex; },
    nextKeyCharCode() { return this.example.currentSentenceCharCode(); },
    currentExampleKana() { return 'ねこ'; },
    isiOS() { return false; }, judgeSpaceKey() { return false; },
    correctKey() {
      this.correct++;
      if (this.example.currentSentenceIndex === this.currentExampleSentence().length) {
        if (this.example.currentExampleIndex + 1 === this.example.data.length) this.state = 'complete';
        else this._isExampleChangeInterval = true;
      }
    },
    missKey() { this.misses++; },
    keyPressEvent(e) {
      if (!this._isExampleChangeInterval && e.charCode) {
        if (this.example.keyCompare(String.fromCharCode(e.charCode).toUpperCase().charCodeAt(0))) this.correctKey(); else this.missKey();
      } return false;
    },
    nextSentence() { this.example.currentExampleIndex++; this.example.currentSentenceIndex = 0; this._isExampleChangeInterval = false; }
  };
}
function bind(r, e, jq = jquery()) {
  r.window.jQuery = jq; const judge = jq.proxy(e.keyPressEvent, e);
  return { jq, stroke(extra = {}) {
    const down = r.emit('keydown', extra), press = r.emit('keypress', extra);
    if (e.state === 'typing') judge(press);
    const up = r.emit('keyup', extra); return { down, press, up };
  }};
}
const span = (text, entered = false) => ({ textContent: text, classList: { contains: value => value === 'entered' && entered } });

test('sample CSS, legacy background code and original popup controls remain intact', () => {
  for (const file of ['popup.css']) assert.deepEqual(fs.readFileSync(path.join(root,file)), fs.readFileSync(path.join(root,'tests/fixtures/sample',file)), file);
  const norm=s=>s.replace(/\r\n/g,'\n').trim();
  assert.ok(norm(read('background.js')).includes(norm(read('tests/fixtures/sample/background.js'))));
  assert.ok(norm(read('popup.js')).startsWith(norm(read('tests/fixtures/sample/popup.js'))));
  assert.equal(norm(read('popup.html')).replace(/    <!-- Automatic operation[\s\S]*?(?=    <div class="footer">)/,''),norm(read('tests/fixtures/sample/popup.html')));
});
test('manifest preserves scope and registers the browser shortcut without debugger permissions', () => {
  const now=JSON.parse(read('manifest.json')),before=JSON.parse(read('tests/fixtures/sample/manifest.json'));
  const {background,commands,...base}=now;
  assert.deepEqual({...base,version:before.version,permissions:before.permissions},before);assert.equal(now.version,'3.4.0');
  assert.equal(background.service_worker,'background.js');assert.equal(commands['toggle-keymapper'].suggested_key.default,'Alt+Shift+K');
  assert.deepEqual(now.permissions,['storage','scripting','webNavigation']);
});
test('original key-property table and wrong-character selection are preserved', () => {
  const normalize=s=>s.replace(/\r\n/g,'\n');
  const original=normalize(read('tests/fixtures/sample/injected.js')),current=normalize(read('injected.js'));
  function body(source,name){const start=source.indexOf(`function ${name}(`),brace=source.indexOf('{',start);let depth=1,end=brace+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(start,end);}
  for(const name of ['getKeyProps','getWrongChar'])assert.equal(body(current,name),body(original,name));
});
test('original DOM mapping remains available without a captured engine', () => {
  const r=runtime({spans:[span('NE',true),span('KO')]});assert.equal(r.emit('keydown').key,'k');assert.equal(r.emit('keypress').charCode,107);
});
test('an empty DOM without an engine is never guessed', () => {assert.equal(runtime().emit('keydown').key,'x');});
test('Romaji OFF and keyboard guide OFF accept four wrong keys as NEKO', () => {
  const r=runtime(),e=engine(),b=bind(r,e),mapped=[];for(let i=0;i<4;i++)mapped.push(b.stroke().press.key);
  assert.equal(mapped.join(''),'neko');assert.equal(e.correct,4);assert.equal(e.misses,0);
  assert.equal(e._config.isRomaView,false);assert.equal(e._config.isKBHGuide,false);
  assert.equal(r.document.getElementById('sentenceText').querySelectorAll().length,0);
});
test('engine progress overrides stale or partial displayed Romaji', () => {
  const r=runtime({spans:[span('WRONG')]}),e=engine(),b=bind(r,e);e.example.currentSentenceIndex=2;assert.equal(b.stroke().down.key,'k');
});
test('Accuracy 80% preserves intentional misses and can return to 100%', () => {
  const r=runtime({random:()=>.99}),e=engine(['A']),b=bind(r,e);r.config({accuracy:80});
  assert.equal(b.stroke().press.key,'z');assert.equal(e.misses,1);assert.equal(e.example.currentSentenceIndex,0);
  r.config({accuracy:100});assert.equal(b.stroke().press.key,'a');assert.equal(e.correct,1);
});
test('global enabled setting retains its original behavior', () => {
  const r=runtime(),e=engine(),b=bind(r,e);r.config({enabled:false});assert.equal(b.stroke().press.key,'x');assert.equal(e.misses,1);
  r.config({enabled:true});assert.equal(b.stroke().press.key,'n');
});
test('OS repeat remains enabled exactly as in the sample', () => {
  const r=runtime(),e=engine(),b=bind(r,e);assert.equal(b.stroke().press.key,'n');assert.equal(b.stroke({repeat:true}).press.key,'e');assert.equal(e.correct,2);
});
test('timestamps and trust flags are unchanged on the existing event objects', () => {
  const r=runtime(),e=engine(),b=bind(r,e);
  for(const timeStamp of [100,220,420,510])for(const event of Object.values(b.stroke({timeStamp}))){assert.equal(event.timeStamp,timeStamp);assert.equal(event.isTrusted,true);}
});
test('waiting, countdown, transitions and results do not advance the engine', () => {
  for(const state of ['wait','countdown','complete']){const r=runtime(),e=engine();bind(r,e);e.state=state;assert.equal(r.emit('keydown').key,'x');assert.equal(e.example.currentSentenceIndex,0);}
  const r=runtime(),e=engine();bind(r,e);e._isExampleChangeInterval=true;assert.equal(r.emit('keydown').key,'x');
});
test('sentence changes and replay use the current engine rather than a guessed cursor', () => {
  const r=runtime(),e=engine(['NE','KO']),b=bind(r,e);b.stroke();b.stroke();assert.equal(r.emit('keydown').key,'x');
  e.nextSentence();assert.equal(b.stroke().press.key,'k');b.stroke();const again=bind(r,engine(['A']),r.window.jQuery);assert.equal(again.stroke().press.key,'a');
});
test('jQuery proxy preserves binding, guid, overload, return value and exceptions', () => {
  const r=runtime(),jq=jquery();r.window.jQuery=jq;const ctx={value:7,method(a,b){return this.value+a+b;}};
  const fn=jq.proxy(ctx.method,ctx,2);assert.equal(fn(3),12);assert.equal(fn.guid,ctx.method.guid);
  assert.equal(jq.proxy(ctx,'method',4)(5),16);assert.equal(jq.proxy(null,ctx),undefined);
  const error=new Error('expected');assert.throws(()=>jq.proxy(()=>{throw error;},ctx)(),v=>v===error);
});
test('both external and bundled jQuery assignments are observed', () => {
  const r=runtime();r.window.jQuery=jquery();const second=jquery(),e=engine();r.window.jQuery=second;second.proxy(e.keyPressEvent,e);assert.equal(r.emit('keydown').key,'n');
});
test('reassigning the same jQuery object does not lose the engine', () => {
  const r=runtime(),jq=jquery();r.window.jQuery=jq;r.window.jQuery=jq;const e=engine();jq.proxy(e.keyPressEvent,e);assert.equal(r.emit('keydown').key,'n');
});
test('an existing nonconfigurable jQuery global can still expose the engine through proxy', () => {
  const jq=jquery(),r=runtime({jQuery:jq,locked:true}),e=engine();jq.proxy(e.keyPressEvent,e);assert.equal(r.emit('keydown').key,'n');
});
test('HUD polling exposes hidden answers without generating any input', () => {
  const r=runtime(),e=engine();bind(r,e);for(let i=0;i<20;i++)r.receive({__etypingStateRequest:true});
  const state=r.posted.at(-1).__etypingEngineState;assert.equal(state.remainingText,'NEKO');assert.equal(state.kanaText,'ねこ');assert.equal(e.correct,0);assert.equal(e.example.currentSentenceIndex,0);
});
test('HUD engine requests from another window are ignored', () => {
  const r=runtime();bind(r,engine());const count=r.posted.length;r.receive({__etypingStateRequest:true},{});assert.equal(r.posted.length,count);
});
test('modifier and control exclusions remain intact', () => {
  for(const properties of [{ctrlKey:true},{altKey:true},{metaKey:true},{key:'Escape'},{key:'Tab'},{key:'F7'}]){
    const r=runtime();bind(r,engine());assert.equal(r.emit('keydown',properties).key,properties.key||'x');
  }
});
test('a malformed engine falls back to the original DOM reader', () => {
  const r=runtime({spans:[span('A')]}),e=engine();bind(r,e);e.nextKeyCharCode=()=>NaN;assert.equal(r.emit('keydown').key,'a');
});
test('public game keypress judge accepts the remapped hidden Romaji', {skip:!gameSource}, () => {
  function method(name){const marker=`u.prototype.${name}=`,start=gameSource.indexOf(marker)+marker.length;assert.ok(start>=marker.length);const end=gameSource.indexOf('},u.prototype.',start)+1;assert.ok(end>start);return vm.runInNewContext('('+gameSource.slice(start,end)+')');}
  const r=runtime(),e=engine();for(const name of ['keyPressEvent','currentExampleSentence','currentSentenceIndex','nextKeyCharCode'])e[name]=method(name);
  const jq=jquery();jq.isFunction=fn=>typeof fn==='function';
  const start=gameSource.indexOf('proxy:function')+'proxy:'.length,end=gameSource.indexOf('},now:Date.now',start)+1;
  assert.ok(end>start);jq.proxy=vm.runInNewContext('('+gameSource.slice(start,end)+')',{p:jq,s:Array.prototype.slice});
  const b=bind(r,e,jq);for(let i=0;i<4;i++)b.stroke();assert.equal(e.correct,4);assert.equal(e.misses,0);
});

function content(options = {}) {
  const handlers={},posted=[],writes=[],timers=[],raf=[];let hud=null,changed;
  const document={hidden:false,addEventListener(){},removeEventListener(){},body:{appendChild(el){hud=el;el.isConnected=true;}},getElementById(id){if(options.adFrame)return null;if(id==='etyping-auto-hud')return hud;return id==='sentenceText'?{querySelectorAll:()=>[]}:id==='kanaText'?{textContent:'ねこ'}:null;},createElement(){return {style:{},innerHTML:'',fields:{},querySelector(selector){return this.fields[selector]||=( {style:{},textContent:''} );}};}};
  const window={addEventListener(type,fn){(handlers[type]||=[]).push(fn);},removeEventListener(type,fn){handlers[type]=(handlers[type]||[]).filter(f=>f!==fn);},postMessage(msg){posted.push(msg);}};
  const chrome={runtime:{getManifest:()=>({version:'3.4.0'})},storage:{local:{get(defaults,fn){fn({...defaults});},set(value){writes.push(value);return Promise.resolve();}},onChanged:{addListener(fn){changed=fn;},removeListener(fn){if(changed===fn)changed=null;}}}};
  const flush=()=>{while(raf.length)raf.shift()();};
  const box=vm.createContext({window,document,chrome,location:{pathname:options.adFrame?'/app/ad_code_728s.asp':'/app/jsa_std/typing.asp'},requestAnimationFrame(fn){raf.push(fn);},setInterval(fn,ms){const timer={active:true,fn(){if(timer.active){fn();flush();}},ms};timers.push(timer);return timer;},clearInterval(timer){timer.active=false;}});
  vm.runInContext(read('content.js'),box);
  flush();
  return {posted,writes,timers,window,chrome,reinstall(){vm.runInContext(read('content.js'),box);flush();},get hud(){return hud;},receive(data){for(const fn of handlers.message||[])fn({data,source:window});flush();},change(changes){changed(changes);flush();}};
}
test('Alt+S and F8 toggle immediately and persist the original global enabled key', async () => {
  const r=runtime(),e=engine();bind(r,e);const c=content();
  r.emit('keydown',{key:'F8',code:'F8'});assert.equal(r.emit('keydown').key,'x');
  c.receive(r.posted.at(-1));await new Promise(setImmediate);assert.equal(c.writes.at(-1).enabled,false);
  r.emit('keydown',{altKey:true,code:'KeyS',key:'s'});assert.equal(r.emit('keydown').key,'n');
  c.receive(r.posted.at(-1));await new Promise(setImmediate);assert.equal(c.writes.at(-1).enabled,true);
});
test('HUD retains original fields and displays the hidden answer', () => {
  const c=content();c.receive({__etypingEngineState:{active:true,remainingText:'NEKO',kanaText:'ねこ'}});
  for(const text of ['Hiragana:','Romaji:','Ký tự đích:'])assert.ok(c.hud.innerHTML.includes(text));assert.equal(c.hud.id,'etyping-auto-hud');
  assert.equal(c.hud.fields['[data-field="roma"]'].textContent,'NEKO');
  assert.equal(c.timers[0].ms,100);c.timers[0].fn();assert.equal(c.posted.at(-1).__etypingStateRequest,true);
});
test('HUD toggle and Accuracy retain the original configuration message format', () => {
  const c=content();c.receive({__etypingEngineState:{active:true,remainingText:'NEKO',kanaText:'ねこ'}});c.change({showHud:{newValue:false},accuracy:{newValue:85}});
  const config=c.posted.at(-1).__etypingConfigUpdate;assert.equal(config.showHud,false);assert.equal(config.accuracy,85);c.timers[0].fn();assert.equal(c.hud.style.display,'none');
});
test('an advertising frame under /app/ never creates a duplicate HUD', () => {
  const c=content({adFrame:true});assert.equal(c.timers.length,0);assert.equal(c.hud,null);
});
test('holding a shortcut cannot toggle repeatedly', () => {
  const r=runtime();bind(r,engine());r.emit('keydown',{key:'F8',code:'F8'});
  for(let n=0;n<20;n++)r.emit('keydown',{key:'F8',code:'F8',repeat:true});
  assert.equal(r.posted.filter(m=>m.__etypingToggleRequest).length,1);
});
test('overlapping strokes retain separate keypress and keyup mappings', () => {
  const r=runtime(),e=engine();bind(r,e);
  r.emit('keydown',{code:'KeyA',key:'a'});r.emit('keypress',{code:'KeyA',key:'a'});e.example.currentSentenceIndex=1;
  r.emit('keydown',{code:'KeyB',key:'b'});assert.equal(r.emit('keyup',{code:'KeyA',key:'a'}).key,'n');
  assert.equal(r.emit('keypress',{code:'KeyB',key:'b'}).key,'e');assert.equal(r.emit('keyup',{code:'KeyB',key:'b'}).key,'e');
});
test('keypress and keyup do not construct full engine snapshots', () => {
  const r=runtime(),e=engine();let snapshots=0;e.currentExampleSentence=()=>{snapshots++;return 'NEKO';};bind(r,e);
  r.emit('keydown');r.emit('keypress');r.emit('keyup');assert.equal(snapshots,0);assert.equal(r.posted.length,0);
});
test('HUD polling stops when HUD is hidden', () => {
  const c=content();c.change({showHud:{newValue:false}});const messages=c.posted.length;c.timers[0].fn();assert.equal(c.posted.length,messages);
});
test('browser shortcut worker serializes toggles and updates the ON/OFF badge', async () => {
  let handler,changed,badge='';const data={enabled:true};
  const chrome={commands:{onCommand:{addListener(fn){handler=fn;}}},action:{setBadgeText:async({text})=>{badge=text;},setBadgeBackgroundColor:async()=>{}},storage:{local:{async get(){return {...data};},async set(values){const old=data.enabled;Object.assign(data,values);changed({enabled:{oldValue:old,newValue:data.enabled}},'local');}},onChanged:{addListener(fn){changed=fn;}}}};
  const event={addListener(){}};
  chrome.runtime={getManifest:()=>({version:'3.4.0'}),onInstalled:event,onStartup:event,onMessage:event};
  chrome.webNavigation={onCommitted:event,onDOMContentLoaded:event};chrome.tabs={onActivated:event,onRemoved:event};
  vm.runInContext(read('background.js'),vm.createContext({chrome}));await Promise.all([handler('toggle-keymapper'),handler('toggle-keymapper')]);assert.equal(data.enabled,true);assert.equal(badge,'ON');await handler('toggle-keymapper');assert.equal(data.enabled,false);assert.equal(badge,'OFF');
});

test('repeated MAIN initialization preserves the engine and toggles exactly once', () => {
  const r=runtime(),e=engine(),b=bind(r,e);
  for(let i=0;i<20;i++)vm.runInContext(read('injected.js'),r.box);
  assert.equal(b.stroke().press.key,'n');assert.equal(e.correct,1);
  r.emit('keydown',{key:'F8',code:'F8'});
  assert.equal(r.posted.filter(m=>m.__etypingToggleRequest).length,1);
  assert.equal(r.emit('keydown').key,'x');
});

test('reattaching after listener loss preserves the private engine position', () => {
  const r=runtime(),e=engine();bind(r,e);e.example.currentSentenceIndex=2;
  r.clearListeners();vm.runInContext(read('injected.js'),r.box);
  assert.equal(r.emit('keydown').key,'k');
});

test('MAIN disposal restores jQuery and removes every native input hook', () => {
  const jq=jquery(),original=jq.proxy,r=runtime({jQuery:jq});bind(r,engine(),jq);
  r.window.__etypingRemapperController.dispose();
  assert.equal(jq.proxy,original);assert.equal(r.window.jQuery,jq);
  assert.equal(r.emit('keydown').key,'x');
  r.emit('keydown',{key:'F8',code:'F8'});assert.equal(r.posted.length,0);
});

test('a controller upgrade preserves the engine and explicit OFF setting', () => {
  const r=runtime(),e=engine();bind(r,e);e.example.currentSentenceIndex=2;r.config({enabled:false});
  vm.runInContext(read('injected.js').replace("const VERSION = '3.4.0'","const VERSION = 'test-upgrade'"),r.box);
  assert.equal(r.window.__etypingRemapperController.health().engine,true);
  assert.equal(r.emit('keydown').key,'x');r.emit('keydown',{key:'F8',code:'F8'});
  assert.equal(r.emit('keydown').key,'k');assert.equal(r.posted.filter(m=>m.__etypingToggleRequest).length,1);
});

test('repeated ISOLATED initialization retains one HUD timer and one storage write', async () => {
  const c=content(),hud=c.hud;for(let i=0;i<20;i++)c.reinstall();
  assert.equal(c.timers.length,1);assert.equal(c.hud,hud);
  c.receive({__etypingToggleRequest:{enabled:false,sequence:1}});await new Promise(setImmediate);
  assert.equal(c.writes.length,1);assert.equal(c.writes[0].enabled,false);
});

test('replacing the ISOLATED controller stops its previous polling timer', () => {
  const c=content();c.chrome.runtime.getManifest=()=>({version:'test-upgrade'});c.reinstall();
  assert.equal(c.timers.filter(t=>t.active).length,1);assert.equal(c.timers[0].active,false);
  assert.equal(c.window.__etypingContentController.version,'test-upgrade');
});

test('an invalidated extension context is replaced rather than reused', () => {
  const c=content();c.window.__etypingContentController.isAlive=()=>false;c.reinstall();
  assert.equal(c.timers.filter(t=>t.active).length,1);assert.equal(c.timers[0].active,false);
});

test('MAIN ownership handover disposes timers left by a reloaded isolated world', () => {
  const c=content(),token=c.posted.find(m=>m.__etypingContentClaim).__etypingContentClaim;
  c.receive({__etypingContentOwner:'older-owner'});assert.equal(c.timers[0].active,true);
  c.receive({__etypingContentOwner:token});c.receive({__etypingContentOwner:'newer-owner'});
  assert.equal(c.timers[0].active,false);assert.equal(c.window.__etypingContentController,undefined);
  const count=c.posted.length;c.timers[0].fn();assert.equal(c.posted.length,count);
});

function background(options={}) {
  const events={},calls=[],reloads=[];let installed=Boolean(options.legacy),version=options.legacy?'3.2.0':'3.4.0';
  const event=name=>({addListener(fn){events[name]=fn;}});
  const chrome={
    commands:{onCommand:event('command')},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
    storage:{local:{get:async()=>({enabled:true})},onChanged:event('storage')},
    runtime:{getManifest:()=>({version:'3.4.0'}),onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
    webNavigation:{onCommitted:event('committed'),onDOMContentLoaded:event('domready'),getAllFrames:async()=>[]},
    tabs:{onActivated:event('activated'),onRemoved:event('removed'),query:async()=>[],reload:async id=>{reloads.push(id);}},
    scripting:{async executeScript(request){
      calls.push(request);
      if(options.failOnce){options.failOnce=false;throw Error('Document navigated');}
      if(request.files){if(request.files[0]==='injected.js'){installed=true;version='3.4.0';}return [];}
      if(request.func.toString().includes('typingView'))return [{result:{typingView:Boolean(options.late),health:{engine:!options.late}}}];
      return [{result:{installed,version,controller:installed&&!options.legacy}}];
    }}
  };
  const box=vm.createContext({chrome,URL});vm.runInContext(read('background.js'),box);
  return {calls,reloads,events,ensure:details=>box.ensureDocument(details)};
}
const frameDetails={tabId:7,frameId:3,documentId:'document-one',url:'https://www.e-typing.ne.jp/app/jsa_std/typing.asp'};

test('document lifecycle recovery deduplicates simultaneous events and pins the document ID', async () => {
  const b=background();const jobs=Array.from({length:10},()=>b.ensure(frameDetails));
  assert.ok(jobs.every(p=>p===jobs[0]));await Promise.all(jobs);
  assert.equal(b.calls.filter(c=>c.files).length,2);
  assert.ok(b.calls.every(c=>c.target.documentIds[0]==='document-one'&&!('frameIds'in c.target)));
  assert.equal(b.reloads.length,0);
});

test('a navigation race is retried on DOMContentLoaded without popup interaction', async () => {
  const b=background({failOnce:true});await b.events.committed(frameDetails);await b.events.domready(frameDetails);
  assert.equal(b.calls.filter(c=>c.files).length,2);assert.equal(b.reloads.length,0);
});

test('foreign sites and advertising documents never trigger recovery injection', async () => {
  const b=background();for(const url of ['https://example.com/','https://www.e-typing.ne.jp/app/ad_code_728s.asp','file:///tmp/test'])await b.ensure({...frameDetails,url});
  assert.equal(b.calls.length,0);
});

test('legacy and late-loaded documents reload automatically with a bounded cooldown', async () => {
  for(const options of [{legacy:true},{late:true}]){
    const b=background(options);await b.ensure(frameDetails);await b.ensure({...frameDetails,documentId:'document-two'});
    assert.deepEqual(b.reloads,[7]);
  }
});

test('the popup has no manual connection check or scripting dependency', () => {
  assert.ok(!/reconnect|connectionStatus|chrome\.scripting/.test(read('popup.js')+read('popup.html')));
  assert.ok(read('popup.html').includes('id="automationInfo"'));
});

test('an older delayed bridge claim cannot retire the newest isolated world', () => {
  const r=runtime();r.receive({__etypingContentClaim:'200:new'});r.receive({__etypingContentClaim:'100:old'});
  assert.equal(r.posted.at(-1).__etypingContentOwner,'200:new');
  const count=r.posted.length;r.receive({__etypingContentClaim:'invalid'});assert.equal(r.posted.length,count);
});

test('a replaced proxy function on the same jQuery object is observed again', () => {
  const r=runtime(),e=engine(['A']),b=bind(r,e);b.stroke();
  b.jq.proxy=jquery().proxy;r.window.__etypingRemapperController.attach();const next=bind(r,engine(['KO']),b.jq);
  assert.equal(next.stroke().press.key,'k');
});

test('a replay view context exposes its new private engine', () => {
  const r=runtime(),jq=jquery(),e=engine(['KO']);r.window.jQuery=jq;
  jq.proxy(function(){},{_typing:e,startTyping(){}});
  assert.equal(r.emit('keydown').key,'k');
});

test('each replacement start screen reconciles the active judge once', () => {
  const elements={start_msg:{}},r=runtime({elements}),jq=jquery(),first=engine(['A']),next=engine(['KO']);
  r.window.jQuery=jq;let judge=jq.proxy(first.keyPressEvent,first);jq._data=()=>({keypress:[{handler:judge}]});r.flush();
  assert.equal(r.window.__etypingRemapperController.health().round,1);
  first.state='complete';judge=jq.proxy(next.keyPressEvent,next);jq.proxy(first.keyPressEvent,first);
  elements.start_msg={};r.window.__etypingRemapperController.attach();r.flush();
  assert.equal(r.emit('keydown').key,'k');assert.equal(r.window.__etypingRemapperController.health().round,2);
  r.window.__etypingRemapperController.attach();r.flush();assert.equal(r.posted.filter(m=>m.__etypingRoundReady).length,2);
});

test('keyboard rendering follows engine progress and clears when disabled', () => {
  const key=char=>({textContent:char,attrs:{},getAttribute(n){return this.attrs[n]??null;},setAttribute(n,v){this.attrs[n]=v;},removeAttribute(n){delete this.attrs[n];}});
  const keys=['N','E','K','O'].map(key),root={...key(''),children:keys,contains(el){return keys.includes(el);}},elements={full_keyboard:root,'etkm-keyboard-style':{}};
  const r=runtime({elements}),e=engine(),b=bind(r,e);r.flush();assert.equal(keys[0].attrs['data-etkm-next'],'N');
  b.stroke();r.flush();assert.equal(keys[0].getAttribute('data-etkm-next'),null);assert.equal(keys[1].attrs['data-etkm-next'],'E');
  r.config({enabled:false});r.flush();assert.ok(keys.every(k=>!k.getAttribute('data-etkm-next')));assert.equal(root.getAttribute('data-etkm-follow'),null);
});

test('a delayed result shortcut callback retires after immediate Replay', () => {
  const r=runtime(),jq=jquery();r.window.jQuery=jq;let calls=0;
  const result={_document:{on(){calls++;}},view:{},addShortCutKeyEvent(){},shortCutKeyEvent(){}};
  const callback=function(){this._document.on('keydown');return 7;},bound=jq.proxy(callback,result);
  assert.equal(bound.guid,callback.guid);assert.equal(bound(),7);assert.equal(calls,1);
  result._document=null;result.view=null;assert.equal(bound(),undefined);assert.equal(calls,1);
});

test('live result callbacks retain arguments, return values and exceptions', () => {
  const r=runtime(),jq=jquery();r.window.jQuery=jq;
  const result={_document:{},view:{},value:5,addShortCutKeyEvent(){},shortCutKeyEvent(){}};
  assert.equal(jq.proxy(function(a,b){return this.value+a+b;},result,2)(3),10);
  const error=Error('live result error');assert.throws(()=>jq.proxy(()=>{throw error;},result)(),v=>v===error);
});

test('Replay releases an unacknowledged old toggle so saved settings apply again', () => {
  const elements={start_msg:{}},r=runtime({elements});bind(r,engine());r.flush();
  r.emit('keydown',{key:'F8',code:'F8'});r.config({enabled:true});assert.equal(r.emit('keydown').key,'x');
  elements.start_msg={};r.window.__etypingRemapperController.attach();r.flush();
  r.config({enabled:true});assert.equal(r.emit('keydown').key,'n');
  r.config({enabled:false});elements.start_msg={};r.window.__etypingRemapperController.attach();r.flush();r.config({enabled:false});assert.equal(r.emit('keydown').key,'x');
});
