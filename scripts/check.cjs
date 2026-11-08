const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// Verify manifest structure and permissions
assert.equal(manifest.manifest_version, 3, 'Must be Manifest V3');
assert.equal(manifest.version, '3.6.0', 'Version must be 3.6.0');
assert.deepEqual(manifest.permissions, ['storage'], 'Permissions must strictly be ["storage"]');
assert.ok(!manifest.permissions.includes('debugger'), 'Must not require debugger permission');
assert.equal(manifest.background, undefined, 'Must not register unneeded background worker');

// Verify icons exist
for (const size of ['16', '32', '48', '128']) {
  const iconPath = path.join(root, `icons/icon${size}.png`);
  assert.ok(fs.existsSync(iconPath), `Icon icons/icon${size}.png must exist`);
}

// Verify syntax of all JavaScript files
const jsFiles = ['injected.js', 'content.js', 'popup.js'];
for (const file of jsFiles) {
  const filePath = path.join(root, file);
  assert.ok(fs.existsSync(filePath), `${file} must exist`);
  const r = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`Syntax check failed in ${file}: ${r.stderr}`);
}

console.log('Integrity passed: Manifest V3 valid, minimal permissions, icons verified, syntax passed.');
