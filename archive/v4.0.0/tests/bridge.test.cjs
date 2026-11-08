const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../core.js');
const load = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function storageArea(initial = {}) {
  const data = { ...initial };
  return { data,
    async get(keys) { await Promise.resolve(); const list = Array.isArray(keys) ? keys : [keys]; return Object.fromEntries(list.filter(k => Object.hasOwn(data,k)).map(k => [k,data[k]])); },
    async set(values) { await Promise.resolve(); Object.assign(data,values); },
    async remove(key) { delete data[key]; }
  };
}
const gameSender = tabId => ({ id:'extension', tab:{id:tabId}, frameId:2, url:'https://www.e-typing.ne.jp/app/jsa_std/typing.asp?t=test.0' });
const popupSender = { id:'extension', url:'chrome-extension://extension/popup.html' };
function worker() {
  let listener, removed;
  const sent = [], local = storageArea({ settings: C.DEFAULTS }), session = storageArea();
  const chrome = {
    storage:{local,session},
    runtime:{ id:'extension', getURL:p=>'chrome-extension://extension/'+p, onMessage:{ addListener:fn=>{listener=fn;} } },
    tabs:{onRemoved:{addListener:fn=>{removed=fn;}}, async sendMessage(tabId,msg) { sent.push({tabId,msg}); return {ok:true,status:{state:'typing',ready:true}}; }}
  };
  vm.runInContext(load('background.js'), vm.createContext({ chrome, ETKMCore:C, importScripts() {}, URL }));
  return { chrome, local, session, sent, removed:id=>removed(id), request:(msg,sender)=>new Promise(resolve=>listener(msg,sender,resolve)) };
}
test('worker persists tab overrides independently and keeps default settings unchanged', async () => {
  const w = worker();
  assert.equal((await w.request({type:'SET_TAB_ENABLED',tabId:1,enabled:false},popupSender)).enabled,false);
  assert.equal((await w.request({type:'FRAME_CONTEXT'},gameSender(1))).enabled,false);
  assert.equal((await w.request({type:'FRAME_CONTEXT'},gameSender(2))).enabled,true);
  assert.equal(w.local.data.settings.enabled,true);
  assert.equal((await w.request({type:'SET_TAB_ENABLED',tabId:1,enabled:null},popupSender)).override,null);
});
test('two concurrent shortcut toggles are serialized instead of losing one update', async () => {
  const w = worker();
  const results = await Promise.all([w.request({type:'TOGGLE_TAB'},gameSender(1)),w.request({type:'TOGGLE_TAB'},gameSender(1))]);
  assert.equal(results[0].enabled,false); assert.equal(results[1].enabled,true);
  assert.equal((await w.request({type:'FRAME_CONTEXT'},gameSender(1))).enabled,true);
});
test('worker rejects content frames outside its declared game scope and popup commands from content', async () => {
  const w = worker();
  assert.equal((await w.request({type:'FRAME_CONTEXT'},{...gameSender(1),url:'https://www.e-typing.ne.jp/login/'})).ok,false);
  assert.equal((await w.request({type:'SET_TAB_ENABLED',tabId:99,enabled:false},gameSender(1))).ok,false);
  assert.equal((await w.request({type:'SET_TAB_ENABLED',tabId:-1,enabled:false},popupSender)).ok,false);
  assert.equal(Object.keys(w.session.data).length,0);
});
test('worker routes a status request and removes the override on tab close', async () => {
  const w = worker();
  await w.request({type:'SET_TAB_ENABLED',tabId:1,enabled:false},popupSender);
  const response = await w.request({type:'GET_TAB_STATE',tabId:1},popupSender);
  assert.equal(response.frame.status.state,'typing'); assert.equal(w.sent.at(-1).msg.type,'GET_FRAME_STATE');
  w.removed(1); await tick(); assert.equal(w.session.data['tabEnabled:1'],undefined);
});
function bridge(options = {}) {
  let runtimeListener, changedListener;
  const handlers = {}, posted = [], callbacks = [];
  const local = storageArea({settings:{...C.DEFAULTS,showHud:false,...options.settings}});
  const chrome = { storage:{local,onChanged:{addListener:fn=>{changedListener=fn;}}}, runtime:{
    onMessage:{addListener:fn=>{runtimeListener=fn;}}, sendMessage:async msg=>msg.type==='FRAME_CONTEXT'?{ok:true,override:options.override??null}:{ok:true,override:false}
  }};
  const window = { addEventListener(type,fn) {(handlers[type] ||= []).push(fn);}, postMessage(msg) {posted.push(msg);} };
  vm.runInContext(load('content.js'),vm.createContext({chrome,ETKMCore:C,window,document:{documentElement:{}},location:{origin:'https://www.e-typing.ne.jp'},requestAnimationFrame:fn=>callbacks.push(fn),setTimeout,clearTimeout}));
  return {posted,local,window, async boot(){await tick();},
    receive(msg, source=window) {for (const fn of handlers.message||[]) fn({data:msg,source,origin:'https://www.e-typing.ne.jp'});},
    request(msg,respond){return runtimeListener(msg,{},respond);},
    change(settings,area='local'){changedListener({settings:{newValue:settings}},area);}
  };
}
test('isolated bridge sends config only after reading storage and the tab context', async () => {
  const b = bridge({settings:{enabled:true},override:false});
  assert.equal(b.posted.length,0);await b.boot();
  assert.equal(b.posted.find(msg=>msg.type==='CONFIG').config.enabled,false);
  assert.equal(b.posted.find(msg=>msg.type==='CONFIG').config.allowRepeat,false);
});
test('a global settings update preserves the explicit tab override', async () => {
  const b = bridge({override:false});await b.boot();
  b.change({...C.DEFAULTS,enabled:true,showHud:false,allowRepeat:true});
  assert.equal(b.posted.at(-1).config.enabled,false);assert.equal(b.posted.at(-1).config.allowRepeat,true);
  const count=b.posted.length;b.change(C.DEFAULTS,'session');assert.equal(b.posted.length,count);
});
test('isolated bridge validates and bounds MAIN status before replying to popup', async () => {
  const b = bridge();await b.boot();let response;
  b.request({type:'GET_FRAME_STATE'},r=>{response=r;});
  b.receive(C.message('STATUS',{status:{state:'not-real'}}));assert.equal(response,undefined);
  b.receive(C.message('STATUS',{status:{state:'typing',ready:true,stats:{presses:NaN,kpm:123,correctionRate:-4},last:{physicalKey:'a'.repeat(100),mappedKey:'n'}}}));
  assert.equal(response.status.stats.presses,0);assert.equal(response.status.stats.kpm,123);
  assert.equal(response.status.stats.correctionRate,0);assert.equal(response.status.last.physicalKey.length,16);
});
test('isolated bridge ignores foreign status and requires a config acknowledgement', async () => {
  const b=bridge();await b.boot();let response;
  b.request({type:'GET_FRAME_STATE'},r=>{response=r;});
  b.receive(C.message('STATUS',{status:{state:'typing'}}),{});assert.equal(response,undefined);
  b.receive(C.message('CONFIG_ACK'));
  b.receive(C.message('STATUS',{status:{state:'typing',ready:true}}));
  assert.equal(response.acknowledged,true);assert.equal(response.status.state,'typing');
});
