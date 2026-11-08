// Local browser fixture server. No dependencies, no external requests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
http.createServer((req, res) => {
  const route = new URL(req.url, 'http://127.0.0.1').pathname;
  const allowed = ['/tests/browser.html', '/tests/browser.js', '/core.js', '/etyping-adapter.js', '/injected.js', '/popup.html', '/popup.css', '/popup.js', '/tests/popup-mock.js'];
  if (!allowed.includes(route)) { res.writeHead(404); res.end(); return; }
  const file = path.join(root, route);
  res.setHeader('Content-Type', route.endsWith('.js') ? 'text/javascript; charset=utf-8' : route.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  if (route === '/popup.html') {
    const html = fs.readFileSync(file, 'utf8').replace('<script src="core.js">', '<script src="/tests/popup-mock.js"></script><script src="core.js">');
    res.end(html);
  } else fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('Browser fixture: http://127.0.0.1:4173/tests/browser.html'));
