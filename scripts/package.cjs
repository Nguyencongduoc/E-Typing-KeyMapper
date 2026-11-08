const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = ['manifest.json', 'injected.js', 'content.js', 'background.js', 'popup.html', 'popup.js', 'popup.css'];
const digest = crypto.createHash('sha256');
for (const file of files) digest.update(file).update(fs.readFileSync(path.join(root,file)));
const report = JSON.parse(fs.readFileSync(path.join(root,'.browser-test/sample-report.json'),'utf8'));
const expectedDigest=digest.digest('hex');
const expectedVersion=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version;
if(!report.passed||report.version!==expectedVersion||report.sourceDigest!==expectedDigest)throw new Error('The restored sample must pass live tests for these exact seven source files.');
const fullGames=report.checks.filter(c=>c.name.startsWith('full-game'));
if(fullGames.length!==2||fullGames.some(c=>!Number.isFinite(c.score)||c.score<0||c.typed<=0||c.misses!==0))throw new Error('Both native DOM-based games including Replay must have valid results.');
for(const name of ['old-and-incomplete-shortcuts-do-not-toggle','ctrl-shift-f8-toggles-once-per-press-and-persists'])if(!report.checks.some(c=>c.name===name))throw new Error('Missing live shortcut verification: '+name);
const folder = path.join(root, 'dist', 'etyping-keymapper');
const zip = path.join(root, 'dist', `etyping-keymapper-${manifest.version}.zip`);
fs.mkdirSync(folder, { recursive: true });
// Installable package: exactly the same seven files as the original sample.
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(folder, file));
if (fs.readdirSync(folder).some(file => !files.includes(file))) throw new Error('Unexpected file in the seven-file install folder.');
// No user-derived command text: escape absolute paths as PowerShell literal strings.
const literal = text => "'" + text.replaceAll("'", "''") + "'";
const archiveInputs = files.map(file => literal(path.join(folder, file))).join(',');
const command = `Compress-Archive -LiteralPath @(${archiveInputs}) -DestinationPath ${literal(zip)} -Force`;
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) { process.stderr.write(result.stderr || result.error?.message || 'Archive failed'); process.exit(1); }
const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(zip + '.sha256', `${sha}  ${path.basename(zip)}\n`);
console.log(`Unpacked: ${folder}\nZIP: ${zip}\nSHA256: ${sha}`);
