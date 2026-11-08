// Controlled browser benchmark, not a claim about frame latency on every user's machine.
// Both releases run against the same local game-shaped fixture via request interception.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ETKM_PLAYWRIGHT_PATH||'playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.browser-test');
const files=['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
const digest=crypto.createHash('sha256');for(const f of files)digest.update(f).update(fs.readFileSync(path.join(root,f)));
const report={version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,sourceDigest:digest.digest('hex'),passed:false,scope:'500 trusted strokes per build in an identical controlled Romaji-hidden fixture with changing answers and a virtual keyboard; timers and event loop are real Chromium.'};
const fixture=`<!doctype html><html><head><meta charset="utf-8"><title>KeyMapper performance fixture</title></head><body>
<div id="app"><div id="full_keyboard"><div>N</div><div>E</div><div>K</div><div>O</div><div>,</div><div>1</div><div>-</div><div>?</div></div><div id="kanaText">ねこ</div><div id="sentenceText"><span class="entered"></span><span></span></div></div>
<script>
window.__gameCount=0;window.__gameErrors=0;window.__hudMutations=0;window.__bridgeMessages=0;
const jq=function(){};jq.fn={};jq.proxy=(fn,ctx)=>function(...args){return fn.apply(ctx,args);};window.jQuery=jq;
const phrase='NEKO,1-?'.repeat(8);
const engine={state:'typing',example:{},currentExampleSentence:()=>phrase,currentSentenceIndex:()=>window.__gameCount%64,nextKeyCharCode:()=>phrase.charCodeAt(window.__gameCount%64),currentExampleKana:()=> 'ねこ'};
document.addEventListener('keypress',jq.proxy(function(e){if(e.charCode===phrase[window.__gameCount%64].toLowerCase().charCodeAt(0))window.__gameCount++;else window.__gameErrors++;e.preventDefault();},engine));
new MutationObserver(records=>{for(const r of records){const e=r.target.nodeType===1?r.target:r.target.parentElement;if(e?.closest('#etyping-auto-hud'))window.__hudMutations++;}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
window.addEventListener('message',e=>{if(e.source===window&&(e.data?.__etypingStateRequest||e.data?.__etypingEngineState||e.data?.__etypingHudUpdate))window.__bridgeMessages++;});
</script></body></html>`;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function run(name,source){
  const stamp=Date.now(),copy=path.join(out,`perf-extension-${name}-${stamp}`);fs.mkdirSync(copy,{recursive:true});
  for(const f of files)fs.copyFileSync(path.join(source,f),path.join(copy,f));
  let code=fs.readFileSync(path.join(copy,'injected.js'),'utf8');
  const anchor='  function onPhysicalKey(e) {';assert.ok(code.includes(anchor));
  code=code.replace(anchor,`  function __benchPhysicalKey(e) { const start=performance.now(); try { return onPhysicalKey(e); } finally { (window.__benchTimes ||= []).push({type:e.type,ms:performance.now()-start}); } }\n${anchor}`);
  const matches=code.match(/, onPhysicalKey, true\)/g)||[];assert.ok(matches.length>=3);
  fs.writeFileSync(path.join(copy,'injected.js'),code.replaceAll(', onPhysicalKey, true)',', __benchPhysicalKey, true)'));
  const context=await chromium.launchPersistentContext(path.join(out,`perf-profile-${name}-${stamp}`),{executablePath:process.env.ETKM_BROWSER||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${copy}`,`--load-extension=${copy}`],viewport:{width:1100,height:750}});
  try{
    await context.route('**/*',route=>route.request().url().startsWith('https://www.e-typing.ne.jp/app/jsa_std/typing.asp')?route.fulfill({contentType:'text/html; charset=utf-8',body:fixture}):route.abort());
    const page=await context.newPage();await page.goto('https://www.e-typing.ne.jp/app/jsa_std/typing.asp?t=fixture.0');
    const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
    await page.locator('#etyping-auto-hud').waitFor({state:'visible'});await page.locator('#app').click();
    await page.keyboard.type('x'.repeat(30),{delay:2});await pause(150);
    await page.evaluate(()=>{window.__gameCount=0;window.__gameErrors=0;window.__hudMutations=0;window.__bridgeMessages=0;window.__benchTimes=[];});
    const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    const started=Date.now();await page.keyboard.type('x'.repeat(500),{delay:2});await pause(150);
    const result=await page.evaluate(()=>{
      const times=window.__benchTimes.filter(x=>x.type==='keydown').map(x=>x.ms).sort((a,b)=>a-b);
      return {characters:window.__gameCount,errors:window.__gameErrors,hudMutations:window.__hudMutations,bridgeMessages:window.__bridgeMessages,keyDownMedianMs:times[Math.floor(times.length*.5)],keyDownP95Ms:times[Math.floor(times.length*.95)]};
    });result.wallMs=Date.now()-started;
    const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
    for(const metric of ['ScriptDuration','LayoutDuration','RecalcStyleDuration','TaskDuration'])result[metric+'Ms']=(after[metric]-before[metric])*1000;
    result.layoutCount=after.LayoutCount-before.LayoutCount;
    assert.equal(result.characters,500);assert.equal(result.errors,0);console.log(name,JSON.stringify(result));return result;
  }finally{await context.close();}
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});report.baseline=await run('3.1.1',path.join(root,'archive','v3.1.1-baseline'));report.candidate=await run(report.version,root);
  report.hudMutationReductionPercent=(1-report.candidate.hudMutations/report.baseline.hudMutations)*100;
  report.bridgeReductionPercent=(1-report.candidate.bridgeMessages/report.baseline.bridgeMessages)*100;
  assert.ok(report.candidate.hudMutations<report.baseline.hudMutations*.6,'HUD writes should fall substantially');
  assert.ok(report.candidate.bridgeMessages<report.baseline.bridgeMessages*.7,'Per-key bridge traffic must be removed');
  report.passed=true;
})().catch(e=>{report.failure=e.stack;console.error(e);process.exitCode=1;}).finally(()=>{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'performance-report.json'),JSON.stringify(report,null,2));console.log('Performance passed:',report.passed);});
