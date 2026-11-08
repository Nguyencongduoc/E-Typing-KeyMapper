const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = ['manifest.json', 'injected.js', 'content.js', 'background.js', 'popup.html', 'popup.js', 'popup.css'];
const digest = crypto.createHash('sha256');
for (const file of files) digest.update(file).update(fs.readFileSync(path.join(root,file)));
const reportPath = path.join(root,'.browser-test','report.json');
if (!fs.existsSync(reportPath)) throw new Error('Run the live browser acceptance tests before packaging.');
const report = JSON.parse(fs.readFileSync(reportPath,'utf8'));
if (!report.passed || report.version !== manifest.version || report.sourceDigest !== digest.digest('hex')) throw new Error('Live browser tests must pass for these exact source files before release.');
const recovery = JSON.parse(fs.readFileSync(path.join(root,'.browser-test','recovery-report.json'),'utf8'));
if (!recovery.passed || recovery.version !== manifest.version || recovery.sourceDigest !== report.sourceDigest) throw new Error('The live missing-frame recovery test must also pass for these exact files.');
const performance = JSON.parse(fs.readFileSync(path.join(root,'.browser-test','performance-report.json'),'utf8'));
if (!performance.passed || performance.sourceDigest !== report.sourceDigest) throw new Error('The browser performance regression test must pass for these exact files.');
const keyboard=JSON.parse(fs.readFileSync(path.join(root,'.browser-test','keyboard-report.json'),'utf8'));
if(!keyboard.passed||keyboard.version!==manifest.version||keyboard.sourceDigest!==report.sourceDigest)throw new Error('Keyboard and same-document replay tests must pass for these exact source files.');
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
