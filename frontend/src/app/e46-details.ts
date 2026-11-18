import * as T from 'three';

/** Original illustrative dial artwork, applied to the model's existing instrument faces. */
export function e46Gauges(): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 320;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#101317'; c.fillRect(0, 0, canvas.width, canvas.height);
  for (const [z, radius, max, label] of [[-.477,.02,120,'°C'],[-.405,.038,260,'km/h'],[-.275,.038,7,'×1000'],[-.202,.02,1,'FUEL']] as const) {
    const x = (z + .504) / .316 * canvas.width, y = 160, r = radius / .08 * canvas.height;
    c.save(); c.translate(x, y);
    c.fillStyle = '#080b0f'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    const count = max === 7 ? 7 : 10;
    for (let i = 0; i <= count * 5; i++) {
      const a = (-220 + i / (count * 5) * 260) * Math.PI / 180, major = i % 5 === 0;
      c.strokeStyle = max === 7 && i > 28 ? '#dc493e' : '#e8edf1'; c.lineWidth = major ? 2.5 : 1;
      c.beginPath(); c.moveTo(Math.cos(a) * r * (major ? .79 : .87), Math.sin(a) * r * (major ? .79 : .87));
      c.lineTo(Math.cos(a) * r * .95, Math.sin(a) * r * .95); c.stroke();
      if (major && max !== 1) {
        c.fillStyle = '#e8edf1'; c.font = Math.round(r * .17) + 'px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(Math.round(i / (count * 5) * max)), Math.cos(a) * r * .62, Math.sin(a) * r * .62);
      }
    }
    c.fillStyle = '#bbc5cc'; c.font = Math.round(r * .13) + 'px Arial'; c.textAlign = 'center'; c.fillText(label, 0, r * .42);
    c.strokeStyle = '#ed6748'; c.lineWidth = 2; c.beginPath(); c.moveTo(6, 4); c.lineTo(-r * .62, r * .5); c.stroke();
    c.fillStyle = '#30363d'; c.beginPath(); c.arc(0, 0, r * .09, 0, Math.PI * 2); c.fill(); c.restore();
  }
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

/** Project artwork onto existing geometry; no extra surfaces or foreign cabin parts. */
export function projectE46Artwork(geometry: T.BufferGeometry, gauges: boolean) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, size = box.getSize(new T.Vector3());
  const positions = geometry.getAttribute('position'), uv = new Float32Array(positions.count * 2);
  const thinAxis = size.x < size.y && size.x < size.z ? 'x' : size.y < size.z ? 'y' : 'z';
  for (let i = 0; i < positions.count; i++) {
    const p = new T.Vector3().fromBufferAttribute(positions, i);
    const u = gauges || thinAxis === 'x' || thinAxis === 'y' ? (p.z - box.min.z) / size.z : (p.x - box.min.x) / size.x;
    const v = gauges || thinAxis !== 'y' ? (p.y - box.min.y) / size.y : (p.x - box.min.x) / size.x;
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new T.BufferAttribute(uv, 2));
}
