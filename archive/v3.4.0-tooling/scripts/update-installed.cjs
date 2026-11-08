// Update only an explicitly selected unpacked copy inside this workspace, after live tests pass.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
if(!process.argv[2])throw new Error('Specify the existing unpacked extension directory.');
const target=fs.realpathSync(path.resolve(process.argv[2]));
if(!target.startsWith(root+path.sep))throw new Error('Target must stay inside this workspace.');
const files=['manifest.json','injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
const digest=crypto.createHash('sha256');for(const f of files)digest.update(f).update(fs.readFileSync(path.join(root,f)));
const r=JSON.parse(fs.readFileSync(path.join(root,'.browser-test/report.json'),'utf8'));
const recovery=JSON.parse(fs.readFileSync(path.join(root,'.browser-test/recovery-report.json'),'utf8'));
if(!r.passed||!recovery.passed||r.sourceDigest!==digest.digest('hex')||r.sourceDigest!==recovery.sourceDigest)throw new Error('Live tests must pass for these exact source files before updating.');
const performance=JSON.parse(fs.readFileSync(path.join(root,'.browser-test/performance-report.json'),'utf8'));
if(!performance.passed||performance.sourceDigest!==r.sourceDigest)throw new Error('Performance tests must also pass for these exact files.');
const keyboard=JSON.parse(fs.readFileSync(path.join(root,'.browser-test','keyboard-report.json'),'utf8'));
if(!keyboard.passed||keyboard.version!==r.version||keyboard.sourceDigest!==r.sourceDigest)throw new Error('Keyboard and same-document replay tests must pass for these exact source files.');
const old=JSON.parse(fs.readFileSync(path.join(target,'manifest.json'),'utf8'));
if(!old.name.startsWith('e-typing Key Remapper'))throw new Error('Unexpected extension target.');
const backup=path.join(root,'archive',`installed-${old.version}-${Date.now()}`);fs.mkdirSync(backup,{recursive:true});
for(const f of files)fs.copyFileSync(path.join(target,f),path.join(backup,f));
// Replace code first, then the manifest version. No settings or Chrome profile files are written.
for(const f of files.filter(f=>f!=='manifest.json'))fs.copyFileSync(path.join(root,f),path.join(target,f));
fs.copyFileSync(path.join(root,'manifest.json'),path.join(target,'manifest.json'));
for(const f of files)if(!fs.readFileSync(path.join(target,f)).equals(fs.readFileSync(path.join(root,f))))throw new Error(`Copy mismatch: ${f}`);
console.log(JSON.stringify({updated:target,version:r.version,backup,sourceDigest:r.sourceDigest},null,2));
