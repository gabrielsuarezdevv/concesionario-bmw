// Exercise geometry and quality decisions without needing a WebGL context.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const T = require('three');
const loaded = new Map();
function loadSource(file) {
  file=path.resolve(__dirname,'../src/app',file);
  if(loaded.has(file))return loaded.get(file).exports;
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  const entry=new Module(file,module);entry.filename=file;entry.paths=module.paths;loaded.set(file,entry);
  const nativeRequire=Module.createRequire(file);
  entry.require=name=>name.startsWith('.')?loadSource(path.resolve(path.dirname(file),name+'.ts')):nativeRequire(name);
  entry._compile(compiled,file);return entry.exports;
}
const { batchCarParts }=loadSource('batch-car-parts.ts');
const { AssembledCar }=loadSource('assembled-car.ts');
const { ViewerQuality }=loadSource('viewer-quality.ts');
const { ViewerFrameClock }=loadSource('viewer-frame-clock.ts');
function part(material, x=0, displacement=1) {
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([x,0,0,x+1,0,0,x,1,0],3));
  const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.layers.enable(2);
  const group=new T.Group();group.add(mesh);
  return {group,origin:new T.Vector3(),offset:new T.Vector3(0,displacement,0),kind:'paint'};
}
function meshes(root) { const result=[];root.traverseVisible(node=>{if(node instanceof T.Mesh)result.push(node);});return result; }
function vertices(root) { return meshes(root).reduce((sum,mesh)=>sum+mesh.geometry.getAttribute('position').count,0); }

test('batches identical material and movement without dropping vertices, layers or shadows',()=>{
  const material=new T.MeshStandardMaterial(),root=new T.Group(),parts=[part(material,0),part(material,2)];
  root.add(...parts.map(p=>p.group));batchCarParts(root,parts);
  assert.equal(meshes(root).length,1);assert.equal(vertices(root),6);
  const mesh=meshes(root)[0];assert.equal(mesh.material,material);assert.equal(mesh.castShadow,true);assert.ok(mesh.layers.isEnabled(2));
  mesh.geometry.computeBoundingBox();assert.equal(mesh.geometry.boundingBox.max.x,3);
});
test('different exploded movements, materials and attribute layouts stay separate',()=>{
  const material=new T.MeshStandardMaterial(),root=new T.Group();
  const parts=[part(material,0,1),part(material,2,2),part(new T.MeshStandardMaterial(),4,1),part(material,6,1)];
  parts[3].group.children[0].geometry.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1],2));
  root.add(...parts.map(p=>p.group));batchCarParts(root,parts);
  assert.equal(meshes(root).length,4);assert.equal(vertices(root),12);
});
test('assembled view merges across movement boundaries and keeps source meshes and material edits intact',()=>{
  const material=new T.MeshStandardMaterial(),parts=[part(material,0,1),part(material,2,2)];
  let sourceDisposals=0;for(const p of parts)p.group.children[0].geometry.addEventListener('dispose',()=>sourceDisposals++);
  const assembled=new AssembledCar(parts);assert.equal(meshes(assembled.group).length,1);assert.equal(vertices(assembled.group),6);
  material.color.set('#0066b1');assert.equal(meshes(assembled.group)[0].material,material);
  assert.equal(parts.length,2);assert.equal(parts[1].offset.y,2);assert.equal(parts[0].group.children.length,1);
  let mergedDisposals=0;meshes(assembled.group)[0].geometry.addEventListener('dispose',()=>mergedDisposals++);
  assembled.dispose();assert.equal(sourceDisposals,0);assert.equal(mergedDisposals,1);
});
test('wheel variants retain their visibility controls and hidden wheels are excluded from assembled views',()=>{
  const material=new T.MeshStandardMaterial(),root=new T.Group(),parts=[part(material),part(material,10)];
  const stock=parts[0].group,alternative=parts[1].group;
  root.add(stock,alternative);batchCarParts(root,parts,new Set([stock,alternative]));
  assert.equal(parts[0].group,stock);alternative.visible=false;
  const assembled=new AssembledCar(parts);assert.equal(vertices(assembled.group),3);
  assert.equal(alternative.parent,root);assert.equal(stock.parent,root);
});
test('transparent surfaces preserve separate meshes for depth sorting',()=>{
  const material=new T.MeshPhysicalMaterial({transparent:true,opacity:.3,side:T.DoubleSide});
  const parts=[part(material),part(material,2)],assembled=new AssembledCar(parts);
  assert.equal(meshes(assembled.group).length,2);assert.equal(vertices(assembled.group),6);
});
test('resolution is bounded on high DPI and full resolution returns after motion',()=>{
  const quality=new ViewerQuality();quality.resize(1400,650,3);
  assert.ok(quality.maximum<=1.5);assert.ok(1400*650*quality.maximum**2<=1200001);
  const maximum=quality.maximum;assert.equal(quality.beginMotion(),true);assert.ok(quality.ratio<maximum);
  const movingRatio=quality.ratio;assert.equal(quality.beginMotion(),false);assert.equal(quality.ratio,movingRatio);
  quality.restore();assert.equal(quality.ratio,maximum);assert.equal(quality.moving,false);
});
test('sustained slow frames lower quality, fast frames and idle gaps do not',()=>{
  const quality=new ViewerQuality();quality.resize(800,450,1);quality.beginMotion();
  for(let i=0;i<100;i++)quality.observe(16.67);assert.equal(quality.ratio,.85);
  for(let i=0;i<40;i++)quality.observe(32);assert.equal(quality.ratio,.75);
  quality.restore();for(let i=0;i<30;i++)quality.observe(2000);assert.equal(quality.ratio,1);
});
test('frame pacing caps high refresh displays at 60 FPS without duplicate boundary frames',()=>{
  for(const refresh of [30,60,75,120,144,165,240]) {
    const clock=new ViewerFrameClock();let frames=0;
    for(let i=0;i<=refresh*2;i++)if(clock.take(i*1000/refresh))frames++;
    assert.equal(frames,Math.min(refresh,60)*2+1,`${refresh} Hz`);
    clock.reset();assert.equal(clock.take(100000),true);assert.equal(clock.take(100001),false);
  }
});
