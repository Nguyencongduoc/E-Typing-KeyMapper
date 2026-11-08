// Acceptance of the sample with the requested shortcut change. Answers come from visible DOM.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ETKM_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.browser-test');
const files=['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
const digest=crypto.createHash('sha256');for(const f of files)digest.update(f).update(fs.readFileSync(path.join(root,f)));
const report={version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,sourceDigest:digest.digest('hex'),passed:false,checks:[],errors:[],networkFailures:[],scope:'Sample with Ctrl+Shift+F8, visible Romaji and native site guide; two complete rounds in one document at 85 ms test cadence.'};
const pause=ms=>new Promise(r=>setTimeout(r,ms)),pass=(name,data={})=>{report.checks.push({name,...data});console.log('PASS',name,JSON.stringify(data));};
let context,page,game,popup;
async function visible(){return game.evaluate(()=>({
  remaining:Array.from(document.querySelectorAll('#sentenceText span:not(.entered)')).map(s=>s.textContent).join(''),
  result:document.getElementById('result')?.innerText||'',
  hud:document.getElementById('etyping-auto-hud')?.innerText||''
}));}
async function begin(replay=false){
  if(replay){
    // Observe the result as a user would; the original game's shortcut installs after 500 ms.
    await pause(650);await game.locator('#replay_btn').click();
  }else{
    await page.locator('#level_check_btn').click();await page.frameLocator('#typing_content').locator('#start_btn').waitFor({timeout:60000});
    game=page.frames().find(f=>f.url().includes('/app/jsa_std/typing.asp'));
    for(const [i,on] of [[0,true],[3,true],[2,false]]){
      const c=game.locator('#func_view .switch_btn').nth(i);if((await c.locator('.on_btn').getAttribute('class')).includes('show')!==on)await c.click();
    }
    await game.locator('#start_btn').click();
  }
  await game.locator('#start_msg').waitFor();await page.keyboard.press('Space');
  await game.waitForFunction(()=>document.querySelector('#sentenceText span:not(.entered)')?.textContent.length>0,{},{timeout:15000});
  await game.locator('#etyping-auto-hud').waitFor({state:'visible'});
}
async function finish(){
  let strokes=0;
  for(let n=0;n<2500;n++){
    const before=await visible();if(before.result.trim().length>30)break;
    if(!before.remaining){await pause(60);continue;}
    await page.keyboard.press('x');strokes++;await pause(85);
    const after=await visible();if(after.remaining)assert.equal(after.remaining,before.remaining.slice(1),'One native press must consume one visible target');
    if(strokes%100===0)console.log('Accepted',strokes);
  }
  await game.waitForFunction(()=>document.getElementById('result')?.innerText.trim().length>30,{},{timeout:15000});
  const result=(await visible()).result,score=Number(result.match(/スコア\s+(-?\d+)/)?.[1]),typed=Number(result.match(/入力文字数\s+(\d+)/)?.[1]),misses=Number(result.match(/ミス入力数\s+(\d+)/)?.[1]);
  assert.ok(score>=0&&Number.isFinite(score),result);assert.ok(typed>0);assert.equal(misses,0);
  return {strokes,typed,misses,score,result};
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});context=await chromium.launchPersistentContext(path.join(out,`sample-profile-${Date.now()}`),{
    executablePath:process.env.ETKM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1280,height:1000}
  });
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.protocol==='chrome-extension:'||u.hostname==='e-typing.ne.jp'||u.hostname.endsWith('.e-typing.ne.jp')||u.hostname==='ajax.googleapis.com'?route.continue():route.abort();});
  page=await context.newPage();let extensionId;const cdp=await context.newCDPSession(page);
  cdp.on('Runtime.executionContextCreated',({context:c})=>{if(c.origin?.startsWith('chrome-extension://'))extensionId=new URL(c.origin).hostname;if(/^[a-p]{32}$/.test(c.name||''))extensionId=c.name;});await cdp.send('Runtime.enable');
  page.on('pageerror',e=>{if(e.message!=='microadTd is not defined')report.errors.push(e.stack);});
  context.on('requestfailed',req=>{if(/e-typing\.ne\.jp|ajax\.googleapis\.com/.test(req.url()))report.networkFailures.push({url:req.url(),error:req.failure()?.errorText});});
  const scriptReads=[];page.on('response',res=>{if(/\/js\/app\.min\.js/.test(res.url()))scriptReads.push(res.body().then(body=>{
    fs.writeFileSync(path.join(out,'sample-tested-game.js'),body);report.gameSourceURL=res.url();report.gameSourceSHA256=crypto.createHash('sha256').update(body).digest('hex');
    const source=body.toString('utf8');report.scoreThresholdInGame=Number(source.match(/this\.FRAUD_SCORE=(\d+)/)?.[1]);report.gameInvalidationRuleObserved=source.includes('this.score=-1,this.levelRank=0,this._totalTime=0');
  }).catch(()=>{}));});
  await page.goto('https://www.e-typing.ne.jp/roma/check/',{waitUntil:'domcontentloaded',timeout:60000});await begin();assert.ok(extensionId);
  const token=await game.evaluate(()=>window.__sampleDocumentToken=crypto.randomUUID());
  const installed=await game.evaluate(()=>({sample:window.__etypingRemapperInstalled===true,jqueryAccessor:Boolean(Object.getOwnPropertyDescriptor(window,'jQuery')?.get),customKeyboard:!!document.getElementById('etkm-keyboard-style')}));
  assert.ok(installed.sample);assert.equal(installed.jqueryAccessor,false);assert.equal(installed.customKeyboard,false);assert.equal(context.serviceWorkers().length,0);pass('original-static-injection-no-worker-or-engine-hook');
  const idle=await visible();await pause(2000);assert.equal((await visible()).remaining,idle.remaining);pass('idle-does-not-generate-input');
  await game.evaluate(()=>{window.__sampleKeys=[];document.addEventListener('keypress',e=>window.__sampleKeys.push({key:e.key,charCode:e.charCode,isTrusted:e.isTrusted,timeStamp:e.timeStamp}));});
  const first=await finish();pass('full-game-original-dom-mapping',first);await page.screenshot({path:path.join(out,'sample-result-0.png')});
  await begin(true);assert.equal(await game.evaluate(()=>window.__sampleDocumentToken),token);
  const second=await finish();pass('full-game-replay-same-document',second);await page.screenshot({path:path.join(out,'sample-result-1.png')});
  const keys=await game.evaluate(()=>window.__sampleKeys);assert.ok(keys.length>100&&keys.every(k=>k.isTrusted));pass('trusted-input-retains-native-events',{keyPresses:keys.length});
  popup=await context.newPage();await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  assert.equal(await popup.locator('input').count(),3);assert.equal(await popup.locator('#accuracy').getAttribute('min'),'80');assert.equal(await popup.locator('#accuracy').getAttribute('max'),'100');assert.equal(await popup.locator('button').count(),0);
  await popup.screenshot({path:path.join(out,'sample-popup.png')});pass('popup-is-the-original-three-controls');
  await page.bringToFront();await begin(true);
  assert.ok((await popup.locator('.footer').innerText()).includes('Ctrl + Shift + F8'));
  const beforeShortcut=await visible();
  for(const key of ['F8','Alt+s','Control+F8','Shift+F8']){
    await page.keyboard.press(key);await pause(100);
    assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get({enabled:true})).enabled),true,key+' must not toggle');
  }
  pass('old-and-incomplete-shortcuts-do-not-toggle');
  await page.keyboard.down('Control');await page.keyboard.down('Shift');await page.keyboard.down('F8');
  await pause(250);assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get({enabled:true})).enabled),false);
  for(let i=0;i<5;i++)await page.keyboard.down('F8');
  await pause(250);assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get({enabled:true})).enabled),false);
  await page.keyboard.up('F8');await page.keyboard.up('Shift');await page.keyboard.up('Control');
  await page.keyboard.press('Control+Shift+F8');await pause(250);
  assert.equal(await popup.evaluate(async()=>(await chrome.storage.local.get({enabled:true})).enabled),true);
  assert.equal((await visible()).remaining,beforeShortcut.remaining,'Shortcut must not consume typing targets');
  pass('ctrl-shift-f8-toggles-once-per-press-and-persists');
  const current=await visible();await page.keyboard.press('x');await pause(85);assert.equal((await visible()).remaining,current.remaining.slice(1));
  await page.screenshot({path:path.join(out,'sample-hud-keyboard.png')});await Promise.all(scriptReads);assert.deepEqual(report.errors,[]);pass('no-extension-or-game-errors-during-tested-flow');
  report.browser=await page.evaluate(()=>navigator.userAgent);report.passed=true;
})().catch(async e=>{report.failure=e.stack;console.error(e);process.exitCode=1;try{if(page)await page.screenshot({path:path.join(out,'sample-failure.png')});}catch(_){}
}).finally(async()=>{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'sample-report.json'),JSON.stringify(report,null,2));if(context)await context.close();console.log('Sample passed:',report.passed);});
