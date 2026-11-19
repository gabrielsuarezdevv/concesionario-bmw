const assert = require('node:assert/strict');
const fs = require('node:fs');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
function decode(buffer) {
  const png = PNG.sync.read(buffer);
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(result, 'El QR debe poder leerse con un decodificador independiente');
  return result.data;
}
(async () => {
  if (process.argv[2]) {
    const actual = decode(fs.readFileSync(process.argv[2]));
    assert.equal(actual, process.argv[3]);
    console.log('QR de la interfaz verificado: coincide con el enlace de compra.');
    return;
  }
  for (const origin of ['http://192.168.1.20:4300', 'https://concesionario.example.test']) {
    const link = origin + '/?checkout=85e552d0-734c-4a13-9da4-d88a4a030550';
    const png = await QRCode.toBuffer(link, { width:288, margin:4, errorCorrectionLevel:'M', color:{ dark:'#111820', light:'#ffffff' } });
    assert.equal(decode(png), link);
  }
  console.log('QR LAN y HTTPS legibles; conservan el token y la URL completos.');
})().catch(error => { console.error(error); process.exitCode=1; });
