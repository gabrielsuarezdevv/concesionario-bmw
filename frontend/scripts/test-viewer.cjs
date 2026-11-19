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
const { CabinLook, CABIN_FIELD_OF_VIEW }=loadSource('cabin-look.ts');
const { addM4UpholsteryMask }=loadSource('m4-upholstery.ts');
const { CabinMaterials }=loadSource('cabin-materials.ts');
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
test('cabin look turns in place without changing the driver anchor or the default direction',()=>{
  const look=new CabinLook(),anchor=new T.Vector3(.02,1.04,-.36),forward=anchor.clone().add(new T.Vector3(1,0,0)),target=new T.Vector3();
  const originalAnchor=anchor.clone(),originalForward=forward.clone();
  look.rotate(Math.PI/2,0);look.target(anchor,forward,target);
  assert.ok(Math.abs(target.distanceTo(anchor)-1)<1e-9);assert.ok(target.clone().sub(anchor).distanceTo(new T.Vector3(0,0,-1))<1e-9);
  assert.ok(anchor.equals(originalAnchor));assert.ok(forward.equals(originalForward));
  look.reset();look.target(anchor,forward,target);assert.ok(target.clone().sub(anchor).distanceTo(new T.Vector3(1,0,0))<1e-9);
  assert.equal(CABIN_FIELD_OF_VIEW,82);
});
test('cabin look bounds vertical rotation and keeps the horizon upright at extreme input',()=>{
  const look=new CabinLook(),anchor=new T.Vector3(),forward=new T.Vector3(1,0,0),target=new T.Vector3();
  look.rotate(500,1000);look.target(anchor,forward,target);assert.ok(target.y<0 && target.y>-.99);assert.ok(Math.abs(target.length()-1)<1e-9);
  look.rotate(0,-2000);look.target(anchor,forward,target);assert.ok(target.y>0 && target.y<.99);assert.ok(Math.abs(target.length()-1)<1e-9);
});
test('M4 seat cushions and headrests are tinted across the old spatial clipping planes',()=>{
  for(const positions of [
    [0,.55,.12,.32,.55,.12,0,.55,.5],
    [-.44,1.04,.3,-.44,1.29,.3,-.14,1.29,.6],
    [-1.3,.65,-.65,-.6,.65,.65,-1.3,1.15,0]
  ]) {
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
    const original=Array.from(geometry.getAttribute('position').array);
    addM4UpholsteryMask(geometry,'Meshespillars1Mtl');
    const mask=geometry.getAttribute('cabinUpholsteryMask');
    assert.ok([0,1,2].every(i=>mask.getX(i)===1));
    assert.deepEqual(Array.from(geometry.getAttribute('position').array),original);
  }
});
test('M4 shared trim material keeps steering, roof and floor components neutral',()=>{
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([
    0,.55,.12,.32,.55,.12,0,.55,.5,
    .3,.8,-.4,.35,.95,-.4,.3,.8,-.3,
    -.5,1.4,-.5,.5,1.4,-.5,-.5,1.4,.5,
    -.5,.2,-.5,.5,.2,-.5,-.5,.2,.5
  ],3));
  addM4UpholsteryMask(geometry,'Meshesinterior181Mtl');const mask=geometry.getAttribute('cabinUpholsteryMask');
  for(let i=0;i<12;i++)assert.equal(mask.getX(i),i<3?1:0);
});
test('M4 dedicated seat inserts are fully tinted and exterior black trim stays neutral',()=>{
  const positions=[-.2,.414,.3,.14,.47,.3,-.4,1.269,.48];
  for(const [name,value] of [['Meshesinterior231Mtl',1],['Meshesblack161Mtl',0]]){
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
    addM4UpholsteryMask(geometry,name);for(let i=0;i<3;i++)assert.equal(geometry.getAttribute('cabinUpholsteryMask').getX(i),value);
  }
});
test('M4 normalized panel mask survives the indexed-to-flat leather UV conversion',()=>{
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,.55,.12,.32,.55,.12,.32,.55,.5,0,.55,.5],3));
  geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();addM4UpholsteryMask(geometry,'Meshespillars1Mtl');
  // The UV projection is CPU-only; skip the constructor's texture loading in this fixture.
  const projected=Object.create(CabinMaterials.prototype).addDetailUVs(geometry);
  const mask=projected.getAttribute('cabinUpholsteryMask');assert.equal(mask.count,6);assert.equal(mask.normalized,true);
  for(let i=0;i<mask.count;i++)assert.equal(mask.getX(i),1);
});
