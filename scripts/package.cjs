const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const rootFiles = ['manifest.json', 'injected.js', 'content.js', 'popup.html', 'popup.js', 'popup.css'];
const iconFiles = ['icon16.png', 'icon32.png', 'icon48.png', 'icon128.png'];

const folder = path.join(root, 'dist', 'etyping-keymapper');
const distVersionFolder = path.join(root, 'dist', `etyping-keymapper-${manifest.version}`);
const zip = path.join(root, 'dist', `etyping-keymapper-${manifest.version}.zip`);

// Ensure clean directories
for (const dir of [folder, distVersionFolder]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'icons'), { recursive: true });

  for (const f of rootFiles) {
    fs.copyFileSync(path.join(root, f), path.join(dir, f));
  }
  for (const f of iconFiles) {
    fs.copyFileSync(path.join(root, 'icons', f), path.join(dir, 'icons', f));
  }
}

// Package into ZIP using PowerShell Compress-Archive
const literal = text => "'" + text.replaceAll("'", "''") + "'";
const filesToArchive = [
  ...rootFiles.map(f => literal(path.join(folder, f))),
  literal(path.join(folder, 'icons'))
].join(',');

const command = `Compress-Archive -LiteralPath @(${filesToArchive}) -DestinationPath ${literal(zip)} -Force`;
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.error?.message || 'Archive failed');
  process.exit(1);
}

const sha = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
fs.writeFileSync(zip + '.sha256', `${sha}  ${path.basename(zip)}\n`);

console.log(`Release packaged successfully!`);
console.log(`Unpacked: ${folder}`);
console.log(`ZIP:      ${zip}`);
console.log(`SHA256:   ${sha}`);
