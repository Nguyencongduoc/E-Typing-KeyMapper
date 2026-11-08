const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const original = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/sample/manifest.json'), 'utf8'));
const { background, commands, ...base } = manifest;
assert.deepEqual({ ...base, version: original.version, permissions: original.permissions }, original, 'Keep the original manifest fields.');
assert.deepEqual(background, { service_worker: 'background.js' });
assert.equal(commands['toggle-keymapper'].suggested_key.default, 'Alt+Shift+K');
assert.deepEqual(manifest.permissions, ['storage', 'scripting', 'webNavigation']);
for (const file of ['injected.js', 'content.js', 'background.js', 'popup.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(1); }
}
for (const file of ['popup.css']) {
  assert.deepEqual(fs.readFileSync(path.join(root, file)), fs.readFileSync(path.join(root, 'tests/fixtures/sample', file)), `${file} must remain byte-identical to the sample.`);
}
const normalize = text => text.replace(/\r\n/g, '\n').trim();
assert.ok(normalize(fs.readFileSync(path.join(root, 'popup.js'), 'utf8')).startsWith(normalize(fs.readFileSync(path.join(root, 'tests/fixtures/sample/popup.js'), 'utf8'))));
const popup = normalize(fs.readFileSync(path.join(root, 'popup.html'), 'utf8')).replace(/    <!-- Automatic operation[\s\S]*?(?=    <div class="footer">)/, '');
assert.equal(popup, normalize(fs.readFileSync(path.join(root, 'tests/fixtures/sample/popup.html'), 'utf8')));
assert.ok(!manifest.permissions.includes('debugger'));
assert.ok(normalize(fs.readFileSync(path.join(root, 'background.js'), 'utf8')).includes(normalize(fs.readFileSync(path.join(root, 'tests/fixtures/sample/background.js'), 'utf8'))));
const injected = fs.readFileSync(path.join(root, 'injected.js'), 'utf8');
assert.ok(injected.includes(`const VERSION = '${manifest.version}'`));
assert.ok(!/dispatchEvent|new KeyboardEvent|setInterval|setTimeout/.test(injected), 'No character replay or timer input.');
console.log('Syntax passed; seven-file structure, original controls and Accuracy preserved; shortcut worker uses no debugger permission.');
