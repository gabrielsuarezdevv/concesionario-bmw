// Serve the production build and API on one explicitly selected local interface.
// Example: node scripts/checkout-preview.cjs --host 192.168.1.20
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf('--' + name);
  return i < 0 ? fallback : args[i + 1];
}
const host = option('host', '127.0.0.1');
const port = Number(option('port', '4300'));
const apiPort = Number(option('api-port', '8080'));
const addresses = Object.values(os.networkInterfaces()).flat().filter(Boolean).map(a => a.address);
const privateAddress = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
if (!addresses.includes(host) || !privateAddress.test(host)) throw Error('Selecciona una IPv4 privada de este equipo; no se admiten interfaces globales.');
if (![port, apiPort].every(p => Number.isInteger(p) && p > 0 && p < 65536)) throw Error('Puerto no válido.');
const root = fs.realpathSync(path.join(__dirname, '../frontend/dist/atelier/browser'));
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.glb':'model/gltf-binary', '.wasm':'application/wasm', '.woff2':'font/woff2', '.ico':'image/x-icon' };
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'POST'].includes(req.method) || !/^\/api\/(health|catalog|quotes|configurations|checkouts)(\/|$)/.test(url.pathname)) {
        res.writeHead(404).end(); return;
      }
      const upstream = http.request({ hostname:'127.0.0.1', port:apiPort, method:req.method, path:url.pathname + url.search,
        headers:{ ...req.headers, host:'127.0.0.1:' + apiPort } }, reply => {
        res.writeHead(reply.statusCode, { ...reply.headers, 'cache-control':'no-store', 'referrer-policy':'no-referrer' });
        reply.pipe(res);
      });
      upstream.setTimeout(20000, () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502, {'Content-Type':'application/json'}); res.end('{"message":"El servidor de pedidos no está disponible."}'); });
      req.on('aborted', () => upstream.destroy()); req.pipe(upstream); return;
    }
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(url.pathname);
    const candidate = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const target = await fs.promises.realpath(candidate);
    if (!target.startsWith(root + path.sep) || !(await fs.promises.stat(target)).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    res.setHeader('Content-Length', (await fs.promises.stat(target)).size);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(target).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(404).end(); }
});
server.requestTimeout = 30000;
server.listen(port, host, () => console.log(`Vista móvil: http://${host}:${port}\nCHECKOUT_PUBLIC_URL=http://${host}:${port}\nDetener con Ctrl+C. Solo se sirven la web compilada y su API.`));
