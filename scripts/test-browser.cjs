// Live e-typing acceptance tests in a disposable headless Edge profile.
// Uses real extension worlds, chrome.storage/scripting and trusted browser key events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(process.env.ETKM_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const files = ['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
const sourceDigest = crypto.createHash('sha256');
for (const f of files) sourceDigest.update(f).update(fs.readFileSync(path.join(root,f)));
const report = { version: JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,
  sourceDigest: sourceDigest.digest('hex'), startedAt: new Date().toISOString(), passed: false, checks: [], errors: [] };
const out = path.join(root,'.browser-test'); fs.mkdirSync(out,{recursive:true});
let context, page, game, popup, extensionId;
const pause = ms => new Promise(r=>setTimeout(r,ms));
const pass = (name, detail = {}) => { report.checks.push({name,...detail}); console.log('PASS',name,JSON.stringify(detail)); };
async function state() {
  return game.evaluate(() => new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{window.removeEventListener('message',listener);reject(new Error('MAIN bridge did not reply'));},1500);
    function listener(e){if(e.source===window&&e.data&&Object.hasOwn(e.data,'__etypingEngineState')){clearTimeout(timer);window.removeEventListener('message',listener);resolve(e.data.__etypingEngineState);}}
    window.addEventListener('message',listener);window.postMessage({__etypingStateRequest:true},'*');
  }));
}
async function waitState(predicate, timeout = 15000) {
  const start=Date.now();
  while(Date.now()-start<timeout){const s=await state();if(predicate(s))return s;await pause(60);}
  throw new Error('Engine state timeout: '+JSON.stringify(await state()));
}
async function openGame(roma, replay = false) {
  if(replay) {
    await game.locator('#replay_btn').click();await game.locator('#start_msg').waitFor({state:'visible',timeout:30000});
    await page.keyboard.press('Space');await waitState(s=>s?.active);return;
  }
  else { if(await page.locator('#typing_content').count()) await page.locator('a.pp_close').click(); await page.locator('#level_check_btn').click(); }
  await page.frameLocator('#typing_content').locator('#start_btn').waitFor({timeout:30000});
  game=page.frames().find(f=>f.url().includes('/app/jsa_std/typing.asp'));
  for(const [i,on] of [[0,roma],[3,false],[2,false]]) {
    const control=game.locator('#func_view .switch_btn').nth(i);
    const current=(await control.locator('.on_btn').getAttribute('class')).includes('show');
    if(current!==on)await control.click();
    assert.equal((await control.locator('.on_btn').getAttribute('class')).includes('show'),on);
  }
  await game.locator('#etyping-auto-hud').waitFor({state:'visible',timeout:5000});
  await game.locator('#start_btn').click();
  await game.locator('#start_msg').waitFor({state:'visible'});
  await game.locator('#start_msg').click();
  await page.keyboard.press('Space');
  await waitState(s=>s?.active);
}
async function configure(settings) {
  await popup.evaluate(async settings=>{await chrome.storage.local.set(settings);},settings);
  await pause(250);
}
async function completeGame() {
  let count=0;
  while(count<1600){
    const before=await waitState(s=>s?.active||s?.state==='complete',20000);
    if(before.state==='complete')break;
    await page.keyboard.press('x');count++;
    await pause(150); // Physical test cadence (~400 KPM); no delay is added to extension code.
    const after=await state();
    if(after?.active)assert.equal(after.remainingText,before.remainingText.slice(1),'Each wrong physical key must advance exactly one target character');
    if(count%80===0)console.log('Typing accepted:',count);
  }
  assert.ok(count<1600,'Game must finish');
  await game.locator('#result').waitFor({timeout:10000});
  await game.waitForFunction(()=>document.getElementById('result')?.innerText.trim().length>30,{},{timeout:15000});
  const text=await game.locator('#result').innerText();
  const score=Number(text.match(/スコア\s+(-?\d+)/)?.[1]);
  const typed=Number(text.match(/入力文字数\s+(\d+)/)?.[1]);
  const misses=Number(text.match(/ミス入力数\s+(\d+)/)?.[1]);
  assert.ok(Number.isFinite(score)&&score>=0,'The game must report a valid score');
  assert.ok(typed>0,'The game must count the accepted characters');
  assert.equal(misses,0,'Accuracy 100% must produce zero game misses');
  await page.screenshot({path:path.join(out,`result-${report.checks.filter(c=>c.name.startsWith('full-game')).length}.png`)});
  return {count,score,typed,misses,text};
}
(async()=>{
  context=await chromium.launchPersistentContext(path.join(out,`profile-${Date.now()}`),{
    executablePath:process.env.ETKM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1280,height:1000}
  });
  // Keep unrelated ad interstitials out of the acceptance flow; the game assets are unmodified.
  // The user's Chrome also has a content blocker enabled.
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.protocol==='chrome-extension:'||u.hostname==='e-typing.ne.jp'||u.hostname.endsWith('.e-typing.ne.jp')||u.hostname==='ajax.googleapis.com')return route.continue();
    return route.abort();
  });
  report.networkFailures=[];context.on('requestfailed',req=>{if(/e-typing\.ne\.jp|ajax\.googleapis\.com/.test(req.url()))report.networkFailures.push({url:req.url(),error:req.failure()?.errorText});});
  report.thirdPartyAdsBlocked=true;
  page=await context.newPage();
  report.adErrors=[];
  page.on('pageerror',e=>{
    if(e.message==='microadTd is not defined')report.adErrors.push({message:e.message,stack:e.stack});
    else report.errors.push({message:e.message,stack:e.stack});
  });
  const cdp=await context.newCDPSession(page);
  cdp.on('Runtime.executionContextCreated',({context:c})=>{
    if(c.origin?.startsWith('chrome-extension://'))extensionId=new URL(c.origin).hostname;
    if(/^[a-p]{32}$/.test(c.name||''))extensionId=c.name;
  });
  await cdp.send('Runtime.enable');
  await context.addInitScript(()=>{
    window.__etkmTestKeys=[];
    for(const type of ['keydown','keypress','keyup'])document.addEventListener(type,e=>{
      window.__etkmTestKeys.push({type:e.type,key:e.key,charCode:e.charCode,timeStamp:e.timeStamp,isTrusted:e.isTrusted,repeat:e.repeat});
    });
  });
  for(let attempt=0;;attempt++){
    try{await page.goto('https://www.e-typing.ne.jp/roma/check/',{waitUntil:'domcontentloaded',timeout:45000});break;}
    catch(e){if(attempt>=2)throw e;await pause(1000);}
  }
  await page.locator('#level_check_btn').waitFor();
  if(!extensionId){
    const own=await context.newPage();await own.goto('edge://extensions');
    const ids=await own.evaluate(()=>{
      function scan(root){const all=[];for(const e of root.querySelectorAll('*')){if(e.data?.id)all.push({id:e.data.id,name:e.data.name});if(e.shadowRoot)all.push(...scan(e.shadowRoot));}return all;}
      return scan(document);
    });
    extensionId=ids.find(x=>x.name.includes('e-typing'))?.id;await own.close();
  }
  assert.ok(extensionId,'The extension must actually be loaded');
  popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  assert.equal(await popup.locator('#accuracy').getAttribute('min'),'80');
  assert.equal(await popup.locator('#accuracy').getAttribute('max'),'100');
  await configure({enabled:true,accuracy:100,showHud:true});await page.bringToFront();
  report.browser=await page.evaluate(()=>navigator.userAgent);report.extensionId=extensionId;
  pass('real-extension-loaded',{browser:report.browser,extensionId});

  await openGame(true);
  assert.ok(await game.evaluate(()=>window.__etypingRemapperInstalled));
  for(const frame of page.frames().filter(f=>f.url().includes('/app/ad_code')))assert.equal(await frame.locator('#etyping-auto-hud').count(),0);
  pass('fresh-frame-hud-and-main');
  const idle=await state();await pause(10000);assert.deepEqual(await state(),idle);pass('ten-seconds-idle-no-input');
  for(const delay of [120,200,90]){await page.keyboard.press('x');await pause(delay);}
  const trusted=await game.evaluate(()=>window.__etkmTestKeys.filter(e=>e.type==='keypress').slice(-3));
  assert.equal(trusted.length,3);assert.ok(trusted.every(e=>e.isTrusted));
  pass('trusted-keypress-and-manual-cadence',{keypresses:trusted});
  const token=await game.evaluate(()=>window.__sameDocumentToken=crypto.randomUUID());
  const onResult=await completeGame();pass('full-game-romaji-on',onResult);

  await openGame(true, true);
  assert.equal(await game.evaluate(()=>window.__sameDocumentToken),token);
  const replayState=await state();await page.keyboard.press('x');assert.equal((await state()).remainingText,replayState.remainingText.slice(1));pass('same-document-replay-after-full-game');
  await page.reload({waitUntil:'domcontentloaded'});await openGame(false);
  assert.equal(await game.locator('#sentenceText span:not(.entered)').textContent(),'');
  const start=await state();await page.keyboard.press('x');assert.equal((await state()).remainingText,start.remainingText.slice(1));
  assert.equal(await game.locator('#sentenceText span:not(.entered)').textContent(),'');
  pass('romaji-and-guide-off-native-input');
  await game.locator('#etyping-auto-hud').evaluate(e=>e.remove());
  await game.locator('#etyping-auto-hud').waitFor({state:'visible',timeout:2000});pass('detached-hud-self-heals');

  assert.equal(await popup.locator('#reconnect').count(),0);
  pass('no-manual-reconnect-control');
  await page.bringToFront();
  await page.keyboard.press('F8');await pause(150);assert.equal(await popup.evaluate(async()=> (await chrome.storage.local.get('enabled')).enabled),false);
  await page.keyboard.press('Alt+s');await pause(150);assert.equal(await popup.evaluate(async()=> (await chrome.storage.local.get('enabled')).enabled),true);pass('both-shortcuts-global-toggle');

  await configure({showHud:false});await game.locator('#etyping-auto-hud').waitFor({state:'hidden'});
  const hidden=await state();await page.keyboard.press('x');assert.equal((await state()).remainingText,hidden.remainingText.slice(1));pass('hidden-hud-does-not-disable-mapping');
  await configure({showHud:true});await game.locator('#etyping-auto-hud').waitFor({state:'visible'});
  const repeatBefore=await state();await page.keyboard.down('x');await page.keyboard.down('x');await page.keyboard.up('x');
  const repeatAfter=await state();if(repeatAfter.active)assert.equal(repeatAfter.remainingText,repeatBefore.remainingText.slice(2));pass('os-repeat-preserved');

  const offToken=await game.evaluate(()=>window.__sameDocumentToken=crypto.randomUUID());
  const offResult=await completeGame();pass('full-game-romaji-off',offResult);
  await openGame(false,true);assert.equal(await game.evaluate(()=>window.__sameDocumentToken),offToken);
  const secondOff=await completeGame();pass('full-game-romaji-off-replay-same-document',secondOff);
  for(let round=0;round<3;round++){
    await openGame(false,true);const before=await state();await page.keyboard.press('x');assert.equal((await state()).remainingText,before.remainingText.slice(1));
    await page.keyboard.press('Escape');await game.locator('#replay_btn').waitFor({timeout:15000});
  }
  pass('three-interrupted-replays-remain-ready-without-refocusing');
  // Check command registration and its production worker handler with real extension APIs.
  // Renderer CDP keyboard input does not reliably generate browser-process accelerators.
  const commands=await popup.evaluate(()=>chrome.commands.getAll());
  const command=commands.find(c=>c.name==='toggle-keymapper');assert.ok(command?.shortcut);
  await configure({enabled:false});await configure({enabled:true});
  const worker=context.serviceWorkers().find(w=>w.url()===`chrome-extension://${extensionId}/background.js`) || await context.waitForEvent('serviceworker',{predicate:w=>w.url()===`chrome-extension://${extensionId}/background.js`,timeout:10000});
  assert.ok(worker,'Shortcut service worker must be loaded');
  await worker.evaluate(()=>onBrowserCommand('toggle-keymapper'));
  assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get('enabled')).enabled),false);
  await popup.waitForFunction(async()=>await chrome.action.getBadgeText({})==='OFF');
  assert.equal(await popup.evaluate(()=>chrome.action.getBadgeText({})),'OFF');
  await worker.evaluate(()=>onBrowserCommand('toggle-keymapper'));
  assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get('enabled')).enabled),true);
  pass('browser-command-registration-and-worker-toggle',{shortcut:command.shortcut,invocation:'real worker handler; browser accelerator not synthesized'});
  await configure({accuracy:80});
  await page.reload({waitUntil:'domcontentloaded'});await openGame(false);
  const heldState=await state();
  await page.keyboard.down('F8');for(let n=0;n<8;n++)await page.keyboard.down('F8');await page.keyboard.up('F8');await pause(250);
  assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get('enabled')).enabled),false);
  await page.keyboard.press('Alt+s');await pause(250);
  assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get('enabled')).enabled),true);
  for(let n=0;n<20;n++)await page.keyboard.press('F8');await pause(500);
  assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get('enabled')).enabled),true);
  assert.deepEqual(await state(),heldState);pass('held-and-rapid-shortcuts-do-not-bounce-or-type');
  await configure({accuracy:100});
  const overlap=await waitState(s=>s?.active&&s.remainingText.length>6);
  await page.keyboard.down('a');await page.keyboard.down('b');await page.keyboard.up('a');await page.keyboard.down('c');await page.keyboard.up('b');await page.keyboard.up('c');
  assert.equal((await state()).remainingText,overlap.remainingText.slice(3));pass('overlapping-native-key-strokes');
  await configure({accuracy:80});
  let misses=0,accepted=0;
  for(let n=0;n<120;n++){
    const before=await waitState(s=>s?.active||s?.state==='complete');if(before.state==='complete')break;
    await page.keyboard.press('x');await pause(150);const after=await state();
    if(after.active&&after.remainingText===before.remainingText)misses++;else accepted++;
  }
  assert.ok(misses>0&&accepted>0);pass('accuracy-slider-keeps-intentional-misses',{misses,accepted});
  await configure({accuracy:100});
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));pass('no-extension-or-game-runtime-errors');
  report.passed=true;
})().catch(async e=>{
  report.failure=e.stack||String(e);report.frames=page?.frames().map(f=>({url:f.url()}));console.error(report.failure);process.exitCode=1;
  try{if(page)await page.screenshot({path:path.join(out,'failure.png')});if(game)report.failureDOM=(await game.locator('body').innerText()).slice(0,7000);}catch(_){}
}).finally(async()=>{
  report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  if(context)await context.close();console.log('Report:',path.join(out,'report.json'),'passed:',report.passed);
});
