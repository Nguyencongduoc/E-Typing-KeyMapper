const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const folder = path.join(root, 'dist', 'etyping-keymapper');
const zip = path.join(root, 'dist', `etyping-keymapper-${manifest.version}.zip`);
fs.mkdirSync(folder, { recursive: true });
const files = ['manifest.json', 'core.js', 'etyping-adapter.js', 'injected.js', 'content.js', 'background.js', 'popup.html', 'popup.js', 'popup.css', 'README.md', 'VALIDATION.md'];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(folder, file));
// No user-derived command text: escape absolute paths as PowerShell literal strings.
const literal = text => "'" + text.replaceAll("'", "''") + "'";
const archiveInputs = files.map(file => literal(path.join(folder, file))).join(',');
const command = `Compress-Archive -LiteralPath @(${archiveInputs}) -DestinationPath ${literal(zip)} -Force`;
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) { process.stderr.write(result.stderr || result.error?.message || 'Archive failed'); process.exit(1); }
const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(zip + '.sha256', `${sha}  ${path.basename(zip)}\n`);
console.log(`Unpacked: ${folder}\nZIP: ${zip}\nSHA256: ${sha}`);
