const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),files=['injected.js','content.js','background.js','popup.html','popup.js','popup.css'];
for(const f of files)require('./sample-invariants.cjs').assertSampleFile(f);
const now=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))),original=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/sample/manifest.json')));assert.deepEqual({...now,version:original.version},original);
for(const f of files.filter(f=>f.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);}
console.log('Sample mapping, HUD and popup preserved; only the shortcut listener, footer and release version differ. Syntax passed.');
