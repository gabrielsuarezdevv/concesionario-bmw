// Input: the Merc_TV E46 GLB redistributed in AzizSyed27/MyE46 (CC BY 4.0).
// Usage: node tools/extract-e46-cabin.cjs path/to/e46.glb
const fs = require('node:fs');
const T = require('../frontend/node_modules/three');
const input = process.argv[2];
if (!input) throw Error('Pass the source E46 GLB path.');
const b = fs.readFileSync(input), jsonLength = b.readUInt32LE(12);
const j = JSON.parse(b.toString('utf8', 20, 20 + jsonLength)), binary = 28 + jsonLength;
const parents = new Map();
const objects = j.nodes.map(n => {
  const o = new T.Group();
  if (n.matrix) o.applyMatrix4(new T.Matrix4().fromArray(n.matrix));
  else {
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
  }
  return o;
});
j.nodes.forEach((n, i) => n.children?.forEach(c => { parents.set(c, i); objects[i].add(objects[c]); }));
const root = new T.Group();
j.scenes[j.scene ?? 0].nodes.forEach(i => root.add(objects[i]));
root.rotation.y = Math.PI / 2; root.updateMatrixWorld(true);
const bounds = new T.Box3();
j.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  for (const p of j.meshes[n.mesh].primitives) {
    const a = j.accessors[p.attributes.POSITION];
    bounds.union(new T.Box3(new T.Vector3().fromArray(a.min), new T.Vector3().fromArray(a.max)).applyMatrix4(objects[i].matrixWorld));
  }
});
const c = bounds.getCenter(new T.Vector3()), scale = 4.61 / bounds.getSize(new T.Vector3()).x;
const normalize = new T.Matrix4().makeScale(scale, scale, scale)
  .multiply(new T.Matrix4().makeTranslation(-c.x, -bounds.min.y, -c.z));
// _8 contains the steering wheel, column controls and badge. Exclude the sedan's roof frame.
const groups = new Set(['_8', 'dash', 'front_left_seat', 'front_right_seat', 'front_left_trim',
  'front_right_door_trim', 'rear_left_trim', 'rear_right_trim', 'inner_trim']);
const selected = [];
j.nodes.forEach((n, i) => {
  if (n.mesh === undefined) return;
  let p = i, group;
  while (p !== undefined) { if (groups.has(j.nodes[p].name)) group = j.nodes[p].name; p = parents.get(p); }
  if (group) selected.push({ node: i, group, mesh: structuredClone(j.meshes[n.mesh]) });
});
const usedAccessors = new Set();
for (const s of selected) for (const p of s.mesh.primitives) {
  Object.values(p.attributes).forEach(i => usedAccessors.add(i));
  if (p.indices !== undefined) usedAccessors.add(p.indices);
  if (p.targets) throw Error('Unexpected morph targets.');
}
const accessorMap = new Map([...usedAccessors].map((id, i) => [id, i]));
const accessors = [...usedAccessors].map(id => structuredClone(j.accessors[id]));
if (accessors.some(a => a.sparse)) throw Error('Unexpected sparse accessor.');
const usedViews = new Set(accessors.map(a => a.bufferView));
for (const image of j.images ?? []) usedViews.add(image.bufferView);
const viewMap = new Map(), bufferViews = [], chunks = [];
let offset = 0;
for (const id of usedViews) {
  const v = j.bufferViews[id], pad = (4 - offset % 4) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  viewMap.set(id, bufferViews.length);
  bufferViews.push({ ...v, buffer: 0, byteOffset: offset });
  chunks.push(b.subarray(binary + (v.byteOffset ?? 0), binary + (v.byteOffset ?? 0) + v.byteLength));
  offset += v.byteLength;
}
for (const a of accessors) a.bufferView = viewMap.get(a.bufferView);
for (const s of selected) for (const p of s.mesh.primitives) {
  for (const key of Object.keys(p.attributes)) p.attributes[key] = accessorMap.get(p.attributes[key]);
  if (p.indices !== undefined) p.indices = accessorMap.get(p.indices);
}
const output = {
  asset: { version: '2.0', generator: 'BMW Atelier cabin subset', extras: {
    author: 'Merc_TV (https://sketchfab.com/szymonpasterczyk)', license: 'CC-BY-4.0',
    source: 'https://sketchfab.com/3d-models/bmw-3-series-e46-1998-2006-2e32a3e273ab482b83970603539de06a',
    title: 'BMW E46 cabin subset, normalized and adapted for the GTR viewer'
  } },
  scene: 0, scenes: [{ nodes: selected.map((_, i) => i) }],
  nodes: selected.map((s, i) => ({ name: s.group, mesh: i, matrix: new T.Matrix4().multiplyMatrices(normalize, objects[s.node].matrixWorld).toArray() })),
  meshes: selected.map(s => s.mesh), materials: j.materials, textures: j.textures, samplers: j.samplers,
  images: (j.images ?? []).map(image => ({ ...image, bufferView: viewMap.get(image.bufferView) })),
  accessors, bufferViews, buffers: [{ byteLength: offset }], extensionsUsed: j.extensionsUsed
};
const json = Buffer.from(JSON.stringify(output));
const jsonData = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const data = Buffer.concat([...chunks, Buffer.alloc((4 - offset % 4) % 4)]);
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binaryHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonData.length + data.length, 8);
jsonHeader.writeUInt32LE(jsonData.length); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binaryHeader.writeUInt32LE(data.length); binaryHeader.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync('frontend/public/models/bmw-e46-cabin.glb', Buffer.concat([header, jsonHeader, jsonData, binaryHeader, data]));
console.log(`Extracted ${selected.length} cabin meshes (${28 + jsonData.length + data.length} bytes).`);
