// Update only an explicitly selected unpacked copy inside this workspace, after live tests pass.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
if(!process.argv[2])throw new Error('Specify the existing unpacked extension directory.');
const target=fs.realpathSync(path.resolve(process.argv[2]));
if(!target.startsWith(root+path.sep))throw new Error('Target must stay inside this workspace.');
const files=['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
const digest=crypto.createHash('sha256');for(const f of files)digest.update(f).update(fs.readFileSync(path.join(root,f)));
const report = JSON.parse(fs.readFileSync(path.join(root,'.browser-test/sample-report.json'),'utf8'));
const expectedDigest=digest.digest('hex');
const expectedVersion=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version;
if(!report.passed||report.version!==expectedVersion||report.sourceDigest!==expectedDigest)throw new Error('The restored sample must pass live tests for these exact seven source files.');
const fullGames=report.checks.filter(c=>c.name.startsWith('full-game'));
if(fullGames.length!==2||fullGames.some(c=>!Number.isFinite(c.score)||c.score<0||c.typed<=0||c.misses!==0))throw new Error('Both native DOM-based games including Replay must have valid results.');
for(const name of ['old-and-incomplete-shortcuts-do-not-toggle','ctrl-shift-f8-toggles-once-per-press-and-persists'])if(!report.checks.some(c=>c.name===name))throw new Error('Missing live shortcut verification: '+name);
const old=JSON.parse(fs.readFileSync(path.join(target,'manifest.json'),'utf8'));
if(!old.name.startsWith('e-typing Key Remapper'))throw new Error('Unexpected extension target.');
const backup=path.join(root,'archive',`installed-${old.version}-${Date.now()}`);fs.mkdirSync(backup,{recursive:true});
for(const f of files)fs.copyFileSync(path.join(target,f),path.join(backup,f));
// Replace code first, then the manifest version. No settings or Chrome profile files are written.
for(const f of files.filter(f=>f!=='manifest.json'))fs.copyFileSync(path.join(root,f),path.join(target,f));
fs.copyFileSync(path.join(root,'manifest.json'),path.join(target,'manifest.json'));
for(const f of files)if(!fs.readFileSync(path.join(target,f)).equals(fs.readFileSync(path.join(root,f))))throw new Error(`Copy mismatch: ${f}`);
console.log(JSON.stringify({updated:target,version:report.version,backup,sourceDigest:report.sourceDigest},null,2));
