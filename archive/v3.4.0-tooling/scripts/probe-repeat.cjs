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
    await game.locator('#start_msg').click();await page.keyboard.press('Space');await waitState(s=>s?.active);return;
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

  await openGame(false);
  for(let round=0;round<4;round++){
    const b=await state();for(let n=0;n<6;n++)await page.keyboard.press('x');const a=await state();assert.equal(a.remainingText,b.remainingText.slice(6));console.log('REPEAT ROUND',round,JSON.stringify(a));
    await page.keyboard.press('Escape');await game.locator('#replay_btn').waitFor({timeout:15000});await openGame(false,true);
  }
  report.passed=true;
})().catch(async e=>{
  report.failure=e.stack||String(e);console.error(report.failure);process.exitCode=1;
  try{if(page)await page.screenshot({path:path.join(out,'failure.png')});if(game)report.failureDOM=(await game.locator('body').innerText()).slice(0,7000);}catch(_){}
}).finally(async()=>{
  report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'repeat-probe.json'),JSON.stringify(report,null,2));
  if(context)await context.close();console.log('Report:',path.join(out,'repeat-probe.json'),'passed:',report.passed);
});
