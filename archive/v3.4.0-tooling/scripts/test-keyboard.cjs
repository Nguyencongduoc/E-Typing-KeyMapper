// Real website, no popup and no HUD/state-message polling to drive the keyboard UI.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ETKM_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.browser-test');
const names=['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
const digest=crypto.createHash('sha256');for(const n of names)digest.update(n).update(fs.readFileSync(path.join(root,n)));
const report={version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,sourceDigest:digest.digest('hex'),passed:false,checks:[],errors:[],scope:'Live keyboard visuals, four replay rounds with HUD OFF and actual 3.3.0 upgrade; never open popup or request engine-state messages.'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const pass=(name,detail={})=>{report.checks.push({name,...detail});console.log('PASS',name,JSON.stringify(detail));};
let context,page,game;
async function ready(){await game.waitForFunction(()=>{
  const e=window.__etypingRemapperController?.takeover().typingEngine;return e?.state==='typing'&&!e._isExampleChangeInterval;
},{},{timeout:15000});}
async function keyboard(){await game.waitForFunction(()=>{
  const e=window.__etypingRemapperController?.takeover().typingEngine;if(e?.state!=='typing'||e._isExampleChangeInterval)return false;
  const char=String.fromCharCode(e.nextKeyCharCode()).replace('ー','-').toUpperCase();
  const keys=document.querySelectorAll('[data-etkm-next]');return keys.length===1&&keys[0].getAttribute('data-etkm-next')===char&&getComputedStyle(keys[0]).backgroundColor==='rgb(255, 159, 0)';
},{},{timeout:3000});}
async function strokes(n){for(let i=0;i<n;i++){
  await ready();await keyboard();
  const before=await game.evaluate(()=>{const e=window.__etypingRemapperController.takeover().typingEngine;return e.currentExampleSentence().slice(e.currentSentenceIndex());});
  await page.keyboard.press('x');await pause(150);
  const after=await game.evaluate(()=>{const e=window.__etypingRemapperController.takeover().typingEngine;return {active:e.state==='typing'&&!e._isExampleChangeInterval,text:e.currentExampleSentence().slice(e.currentSentenceIndex())};});
  if(after.active){assert.equal(after.text,before.slice(1));await keyboard();}
}}
(async()=>{
  fs.mkdirSync(out,{recursive:true});context=await chromium.launchPersistentContext(path.join(out,`keyboard-profile-${Date.now()}`),{
    executablePath:process.env.ETKM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1280,height:1000}
  });
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.protocol==='chrome-extension:'||u.hostname==='e-typing.ne.jp'||u.hostname.endsWith('.e-typing.ne.jp')||u.hostname==='ajax.googleapis.com'?route.continue():route.abort();});
  context.on('page',p=>p.on('pageerror',e=>{if(e.message!=='microadTd is not defined')report.errors.push(e.stack);}));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');await worker.evaluate(()=>chrome.storage.local.set({enabled:true,accuracy:100,showHud:false}));
  page=await context.newPage();await page.goto('https://www.e-typing.ne.jp/roma/check/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#level_check_btn').click();await page.frameLocator('#typing_content').locator('#start_btn').waitFor({timeout:30000});game=page.frames().find(f=>f.url().includes('/app/jsa_std/typing.asp'));
  for(const i of [0,3,2]){const c=game.locator('#func_view .switch_btn').nth(i);if((await c.locator('.on_btn').getAttribute('class')).includes('show'))await c.click();}
  await game.locator('#start_btn').click();await game.locator('#start_msg').waitFor();await page.keyboard.press('Space');await ready();await keyboard();
  assert.equal(await game.locator('#etyping-auto-hud:visible').count(),0);assert.equal((await game.locator('#sentenceText span:not(.entered)').allTextContents()).join(''),'');
  pass('target-key-highlight-with-romaji-guide-and-hud-off');
  const token=await game.evaluate(()=>window.__keyboardDocumentToken=crypto.randomUUID());
  for(let round=0;round<4;round++){
    await strokes(12);const previous=await game.evaluate(()=>window.__etypingRemapperController.health().round);
    await page.keyboard.press('Escape');await game.locator('#replay_btn').waitFor({timeout:15000});await game.locator('#replay_btn').click();await game.locator('#start_msg').waitFor();
    await page.keyboard.press('Space');await ready();await keyboard();
    assert.equal(await game.evaluate(()=>window.__keyboardDocumentToken),token);
    assert.ok(await game.evaluate(()=>window.__etypingRemapperController.health().round)>previous);
    assert.equal(await game.locator('#etyping-auto-hud:visible').count(),0);
  }
  pass('four-replays-keep-mapping-and-keyboard-without-popup-refocus-or-hud');
  await worker.evaluate(()=>chrome.storage.local.set({enabled:false}));await game.waitForFunction(()=>!document.querySelector('[data-etkm-next]'));
  pass('turning-mapper-off-restores-native-keyboard');
  await worker.evaluate(()=>chrome.storage.local.set({enabled:true}));await keyboard();await strokes(8);pass('reenabling-restores-correct-key-highlight');
  await page.screenshot({path:path.join(out,'keyboard-follow.png')});await context.close();
  await upgrade();await pause(650);assert.deepEqual(report.errors,[]);pass('no-stale-result-callback-errors');report.passed=true;
})().catch(async e=>{report.failure=e.stack;console.error(e);process.exitCode=1;try{if(page)await page.screenshot({path:path.join(out,'keyboard-failure.png')});}catch(_){}
}).finally(async()=>{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'keyboard-report.json'),JSON.stringify(report,null,2));if(context)await context.close();console.log('Keyboard passed:',report.passed);});

async function upgrade(){
  const stamp=Date.now(),extension=path.join(out,`upgrade-extension-${stamp}`);fs.mkdirSync(extension);
  for(const name of names)fs.copyFileSync(path.join(root,'archive/v3.3.0-baseline',name),path.join(extension,name));
  context=await chromium.launchPersistentContext(path.join(out,`upgrade-profile-${stamp}`),{
    executablePath:process.env.ETKM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:1000}
  });
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.protocol==='chrome-extension:'||u.hostname==='e-typing.ne.jp'||u.hostname.endsWith('.e-typing.ne.jp')||u.hostname==='ajax.googleapis.com'?route.continue():route.abort();});
  context.on('page',p=>p.on('pageerror',e=>{if(e.message!=='microadTd is not defined')report.errors.push(e.stack);}));
  const oldWorker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');await oldWorker.evaluate(()=>chrome.storage.local.set({enabled:true,accuracy:100,showHud:false}));
  page=await context.newPage();await page.goto('https://www.e-typing.ne.jp/roma/check/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#level_check_btn').click();await page.frameLocator('#typing_content').locator('#start_btn').waitFor({timeout:30000});game=page.frames().find(f=>f.url().includes('/app/jsa_std/typing.asp'));
  for(const i of [0,3,2]){const c=game.locator('#func_view .switch_btn').nth(i);if((await c.locator('.on_btn').getAttribute('class')).includes('show'))await c.click();}
  await game.locator('#start_btn').click();await game.locator('#start_msg').waitFor();await page.keyboard.press('Space');await ready();
  const token=await game.evaluate(()=>window.__keyboardDocumentToken=crypto.randomUUID());
  const before=await game.evaluate(()=>{const e=window.__etypingRemapperController.takeover().typingEngine;return e.currentExampleSentence().slice(e.currentSentenceIndex());});
  for(const name of names.filter(n=>n!=='manifest.json'))fs.copyFileSync(path.join(root,name),path.join(extension,name));fs.copyFileSync(path.join(root,'manifest.json'),path.join(extension,'manifest.json'));
  const next=context.waitForEvent('serviceworker',{timeout:20000});await oldWorker.evaluate(()=>chrome.runtime.reload()).catch(e=>{if(!/closed|destroyed/i.test(e.message))throw e;});await next;
  await game.waitForFunction(version=>window.__etypingRemapperController?.version===version,report.version,{timeout:15000});
  assert.equal(await game.evaluate(()=>window.__keyboardDocumentToken),token);
  assert.equal(await game.evaluate(()=>{const e=window.__etypingRemapperController.takeover().typingEngine;return e.currentExampleSentence().slice(e.currentSentenceIndex());}),before);
  await keyboard();await strokes(8);pass('actual-3.3-upgrade-keeps-live-game-and-adds-correct-key-visual');
  await page.keyboard.press('Escape');await game.locator('#replay_btn').waitFor({timeout:15000});await game.locator('#replay_btn').click();await game.locator('#start_msg').waitFor();await page.keyboard.press('Space');await ready();await keyboard();await strokes(8);
  pass('replay-after-actual-upgrade-remains-ready');
}
