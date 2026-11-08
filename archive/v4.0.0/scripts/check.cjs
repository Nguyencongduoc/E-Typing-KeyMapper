const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = new Set(['core.js', 'etyping-adapter.js', 'injected.js', 'content.js', 'background.js', 'popup.js']);
for (const entry of manifest.content_scripts) for (const file of entry.js) files.add(file);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
}
for (const file of [manifest.action.default_popup, manifest.background.service_worker, 'popup.css']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}
if (manifest.permissions.some(p => p !== 'storage')) throw new Error('Unexpected permission');
if (manifest.content_scripts.some(entry => entry.matches.some(pattern => !pattern.includes('/app/jsa_std/typing.asp')))) throw new Error('Unexpected content script scope');
if (manifest.content_scripts[0].world !== 'MAIN' || manifest.content_scripts[0].run_at !== 'document_start') throw new Error('Main listener must load early');
const injected = fs.readFileSync(path.join(root, 'injected.js'), 'utf8');
if (/dispatchEvent|new KeyboardEvent|setInterval|setTimeout/.test(injected)) throw new Error('Unexpected synthetic keyboard/timer path');
console.log(`Syntax and manifest checks passed (${files.size} JavaScript files; storage permission only).`);
