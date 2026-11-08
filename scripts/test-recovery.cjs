// Live fault injection: static scripts omitted only in a disposable extension copy.
// Production lifecycle events must repair every document. Never open the popup.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ETKM_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.browser-test');
const files=['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
const digest=crypto.createHash('sha256');for(const f of files)digest.update(f).update(fs.readFileSync(path.join(root,f)));
const report={version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,sourceDigest:digest.digest('hex'),passed:false,checks:[],scenario:'Static scripts omitted; automatic navigation, activation and extension lifecycle recovery; no popup.'};
let context,page,game,worker,id;
const pass=(name,detail={})=>{report.checks.push({name,...detail});console.log('PASS',name,JSON.stringify(detail));};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function state(){return game.evaluate(()=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{window.removeEventListener('message',listener);reject(Error('No engine bridge'));},1500);
  function listener(e){if(e.source===window&&e.data&&Object.hasOwn(e.data,'__etypingEngineState')){clearTimeout(timer);window.removeEventListener('message',listener);resolve(e.data.__etypingEngineState);}}
  window.addEventListener('message',listener);window.postMessage({__etypingStateRequest:true},'*');
}));}
async function active(){for(let n=0;n<160;n++){const s=await state();if(s?.active)return s;await delay(60);}throw Error('Engine never became active');}
async function openGame(){
  if(await page.locator('#typing_content').count()){await page.locator('a.pp_close').click();await page.locator('#typing_content').waitFor({state:'detached'});}
  await page.locator('#level_check_btn').click();await page.frameLocator('#typing_content').locator('#start_btn').waitFor({timeout:30000});
  game=page.frames().find(f=>f.url().includes('/app/jsa_std/typing.asp'));
  await game.waitForFunction(version=>window.__etypingRemapperController?.version===version,report.version,{timeout:10000});
  await game.locator('#etyping-auto-hud').waitFor({state:'visible',timeout:10000});assert.equal(await game.locator('#etyping-auto-hud').count(),1);
  for(const i of [0,3,2]){const c=game.locator('#func_view .switch_btn').nth(i);if((await c.locator('.on_btn').getAttribute('class')).includes('show'))await c.click();}
  await game.locator('#start_btn').click();await game.locator('#start_msg').waitFor();await game.locator('#start_msg').click();await page.keyboard.press('Space');await active();
}
async function strokes(count=4,checkHidden=true){for(let n=0;n<count;n++){
  const before=await active();await page.keyboard.press('x');await delay(150);const after=await state();if(after.active)assert.equal(after.remainingText,before.remainingText.slice(1));
}if(checkHidden)assert.equal((await game.locator('#sentenceText span:not(.entered)').allTextContents()).join(''),'');}
async function getWorker(){return context.serviceWorkers().find(w=>w.url()===`chrome-extension://${id}/background.js`)||await context.waitForEvent('serviceworker',{predicate:w=>w.url()===`chrome-extension://${id}/background.js`,timeout:15000});}
async function setting(expected){for(let n=0;n<100;n++){
  if(await worker.evaluate(async()=> (await chrome.storage.local.get({enabled:true})).enabled)===expected)return;await delay(50);
}throw Error('Enabled setting did not persist: '+expected);}
async function reloadExtension(){
  const next=context.waitForEvent('serviceworker',{predicate:w=>w.url()===`chrome-extension://${id}/background.js`,timeout:20000});
  await worker.evaluate(()=>chrome.runtime.reload()).catch(e=>{if(!/closed|destroyed/i.test(e.message))throw e;});worker=await next;await delay(800);
}
async function recoveredReload(name,mutate){
  let navigations=0;const listener=frame=>{if(frame===page.mainFrame())navigations++;};page.on('framenavigated',listener);
  const navigation=page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame(),timeout:20000});
  await game.evaluate(mutate);await reloadExtension();await navigation;await page.locator('#level_check_btn').waitFor();await openGame();await strokes();await delay(1500);
  assert.equal(navigations,1,'Recovery must not loop or reload each exercise');page.off('framenavigated',listener);pass(name,{automaticPageReloads:navigations,romajiOff:true});
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});const stamp=Date.now(),extension=path.join(out,`automatic-extension-${stamp}`);fs.mkdirSync(extension);for(const f of files)fs.copyFileSync(path.join(root,f),path.join(extension,f));
  const key=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'der'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}).publicKey;
  id=crypto.createHash('sha256').update(key).digest('hex').slice(0,32).replace(/[0-9a-f]/g,c=>String.fromCharCode(97+parseInt(c,16)));
  const manifest=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));delete manifest.content_scripts;manifest.key=key.toString('base64');fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(path.join(out,`automatic-profile-${stamp}`),{executablePath:process.env.ETKM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:1000}});
  report.networkFailures=[];context.on('requestfailed',req=>{if(/e-typing\.ne\.jp|ajax\.googleapis\.com/.test(req.url()))report.networkFailures.push({url:req.url(),error:req.failure()?.errorText});});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return u.protocol==='chrome-extension:'||u.hostname==='e-typing.ne.jp'||u.hostname.endsWith('.e-typing.ne.jp')||u.hostname==='ajax.googleapis.com'?route.continue():route.abort();});
  page=await context.newPage();await page.goto('https://www.e-typing.ne.jp/roma/check/',{waitUntil:'domcontentloaded',timeout:45000});worker=await getWorker();
  await openGame();await strokes();pass('automatic-bootstrap-without-static-registration',{romajiOff:true,popupOpened:false});
  for(let n=0;n<5;n++){await openGame();await strokes();}pass('six-consecutive-close-and-open-exercises',{rounds:6,popupOpened:false});
  await page.reload({waitUntil:'domcontentloaded'});await openGame();await strokes();pass('page-reload-is-ready-without-popup');
  const before=await state();await reloadExtension();assert.deepEqual(await state(),before);
  await page.keyboard.press('F8');await setting(false);await page.keyboard.press('F8');await setting(true);await strokes();
  await game.evaluate(()=>{window.__requestCount=0;window.addEventListener('message',e=>{if(e.source===window&&e.data?.__etypingStateRequest)window.__requestCount++;});});
  await delay(1200);const requests=await game.evaluate(()=>window.__requestCount);assert.ok(requests<=18,`Duplicate poll timers after reload: ${requests}`);pass('real-extension-reload-preserves-engine-and-storage',{hudRequestsIn1200Ms:requests});
  await page.keyboard.press('F8');await setting(false);await openGame();const off=await state();await page.keyboard.press('x');await delay(150);assert.deepEqual(await state(),off);await setting(false);
  assert.equal(await game.evaluate(()=>localStorage.getItem('isRomaView')),'0');
  await page.keyboard.press('F8');await setting(true);await strokes(4,false);pass('explicit-off-persists-and-hotkey-reenables',{siteRevealsHintAfterRawMiss:true});
  const oldPage=page;page=await context.newPage();await page.goto('https://www.e-typing.ne.jp/roma/check/',{waitUntil:'domcontentloaded',timeout:45000});await openGame();await strokes();await oldPage.close();pass('new-tab-automatically-ready');
  await recoveredReload('legacy-3.2-document-upgrades-automatically-once',()=>{window.__etypingRemapperController.dispose();window.__etypingRemapperInstalled=true;window.__etypingRemapperVersion='3.2.0';});
  await recoveredReload('late-hook-recovers-private-engine-automatically-once',()=>window.__etypingRemapperController.dispose());
  const cdp=await context.newCDPSession(page);let stopped=false,restarted=false;
  cdp.on('ServiceWorker.workerVersionUpdated',({versions})=>{for(const v of versions){if(v.scriptURL!==`chrome-extension://${id}/background.js`)continue;if(v.runningStatus==='stopped')stopped=true;if(stopped&&v.runningStatus==='running')restarted=true;}});
  await cdp.send('ServiceWorker.enable');await delay(200);await cdp.send('ServiceWorker.stopAllWorkers');
  for(let n=0;n<100&&!stopped;n++)await delay(50);assert.ok(stopped,'CDP must observe the extension worker stopped');
  await page.reload({waitUntil:'domcontentloaded'});await openGame();await strokes();assert.ok(restarted,'Navigation must wake the extension worker');
  pass('suspended-worker-wakes-on-next-navigation',{workerStopObserved:stopped,workerRestartObserved:restarted});
  assert.ok(context.pages().every(p=>!p.url().includes('/popup.html')));pass('entire-suite-never-opens-popup');await page.screenshot({path:path.join(out,'recovery.png')});report.passed=true;
})().catch(async e=>{report.failure=e.stack;report.frames=page?.frames().map(f=>({url:f.url()}));console.error(e);process.exitCode=1;try{if(page)await page.screenshot({path:path.join(out,'recovery-failure.png')});}catch(_){}
}).finally(async()=>{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'recovery-report.json'),JSON.stringify(report,null,2));if(context)await context.close();console.log('Recovery passed:',report.passed);});
