const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function assertSampleFile(file) {
  const current = read(file), original = read('tests/fixtures/sample/' + file);
  if (file === 'content.js') {
    // Permit only the shortcut listener to differ from the supplied sample.
    const outsideShortcut = source => {
      const start = source.indexOf('  // Lắng nghe phím tắt') >= 0
        ? source.indexOf('  // Lắng nghe phím tắt')
        : source.indexOf('  // Chỉ bật/tắt bằng');
      const end = source.indexOf("  window.addEventListener('message'", start);
      assert.ok(start >= 0 && end > start);
      return source.slice(0, start) + source.slice(end);
    };
    assert.equal(outsideShortcut(current), outsideShortcut(original));
  } else if (file === 'popup.html') {
    assert.equal(current.replace('<kbd>Ctrl + Shift + F8</kbd>', '<kbd>Alt + S</kbd> hoặc <kbd>F8</kbd>'), original);
  } else {
    assert.deepEqual(fs.readFileSync(path.join(root, file)), fs.readFileSync(path.join(root, 'tests/fixtures/sample', file)));
  }
}
module.exports = { assertSampleFile };
