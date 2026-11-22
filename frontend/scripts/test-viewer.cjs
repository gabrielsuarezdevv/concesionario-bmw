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
const { ImportedCar,IMPORTED_MODELS }=loadSource('imported-car.ts');
const { ViewerEnvironmentRig }=loadSource('viewer-environments.ts');

async function geometryFixture(file){
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const bytes=fs.readFileSync(file),jsonSize=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+jsonSize));
  data.materials=data.materials.map(m=>({name:m.name,alphaMode:m.alphaMode,pbrMetallicRoughness:{baseColorFactor:m.pbrMetallicRoughness?.baseColorFactor??[1,1,1,1]}}));delete data.textures;delete data.images;
  const encoded=Buffer.from(JSON.stringify(data)),json=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(json);
  const binary=bytes.subarray(20+jsonSize),glb=Buffer.alloc(20+json.length+binary.length);
  glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(glb.length,8);glb.writeUInt32LE(json.length,12);glb.writeUInt32LE(0x4e4f534a,16);json.copy(glb,20);binary.copy(glb,20+json.length);
  const {scene}=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');scene.updateMatrixWorld(true);
  const source=new T.Group();let expected=0;
  scene.traverse(n=>{if(n.isMesh){
    expected+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;
    const geometry=new T.BufferGeometry();for(const [name,a]of Object.entries(n.geometry.attributes))geometry.setAttribute(name,new T.BufferAttribute(a.array,a.itemSize,a.normalized));
    if(n.geometry.index)geometry.setIndex(new T.BufferAttribute(n.geometry.index.array,1));
    const material=new T.MeshStandardMaterial({transparent:n.material.transparent,opacity:n.material.opacity});material.name=n.material.name;
    const mesh=new T.Mesh(geometry,material);mesh.name=n.name;mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(n.matrixWorld.elements);
    const group=new T.Group(),names=[];for(let parent=n.parent;parent;parent=parent.parent)names.push(parent.name);group.name=names.join('/');group.add(mesh);source.add(group);
  }});return {source,expected};
}

test('environment changes reuse reflection maps and preserve the configured car and lights',()=>{
  const scene=new T.Scene(),car=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial({color:'#684091'}));
  car.position.set(1,2,3);scene.add(car);
  const renderer={toneMappingExposure:1},created=[];
  const rig=new ViewerEnvironmentRig(scene,renderer,(_,id)=>{created.push(id);return new T.WebGLRenderTarget(4,4);});
  const lights=scene.children.filter(node=>node.isLight);
  assert.equal(lights.length,3);
  rig.apply('day',false);const day=scene.environment;assert.ok(scene.background.isDataTexture);assert.ok(scene.fog);
  rig.apply('night',false);assert.notEqual(scene.environment,day);assert.ok(renderer.toneMappingExposure<1);
  rig.apply('day',false);assert.equal(scene.environment,day);assert.equal(rig.apply('day',false),false);
  assert.deepEqual(created,['day','night']);assert.deepEqual(scene.children.filter(node=>node.isLight),lights);
  assert.deepEqual(car.position.toArray(),[1,2,3]);assert.equal(car.material.color.getHexString(),'684091');
  rig.dispose();assert.deepEqual(scene.children,[car]);car.geometry.dispose();car.material.dispose();
});

test('night cabins remain lit and environment textures are released on disposal',()=>{
  const scene=new T.Scene(),renderer={toneMappingExposure:1},targets=[],skies=[];
  let releasedTargets=0,releasedSkies=0;
  const rig=new ViewerEnvironmentRig(scene,renderer,()=>{const target=new T.WebGLRenderTarget(4,4);target.addEventListener('dispose',()=>releasedTargets++);targets.push(target);return target;});
  rig.apply('night',false);const outside=scene.environmentIntensity,exposure=renderer.toneMappingExposure;skies.push(scene.background);
  rig.apply('night',true);assert.ok(scene.environmentIntensity>outside);assert.ok(renderer.toneMappingExposure>exposure);assert.equal(targets.length,1);
  rig.apply('day',true);skies.push(scene.background);
  assert.ok(scene.background.isDataTexture);assert.equal(renderer.toneMappingExposure,1);
  for(const texture of skies)texture.addEventListener('dispose',()=>releasedSkies++);
  rig.dispose();assert.equal(releasedTargets,2);assert.equal(releasedSkies,2);assert.equal(scene.environment,null);assert.equal(scene.background,null);
});

test('all environments use neutral product tone mapping and achromatic light on paint',()=>{
  const scene=new T.Scene(),renderer={toneMappingExposure:1,toneMapping:T.ACESFilmicToneMapping};
  const rig=new ViewerEnvironmentRig(scene,renderer,()=>new T.WebGLRenderTarget(4,4));
  const neutral=color=>{assert.ok(Math.abs(color.r-color.g)<1e-9);assert.ok(Math.abs(color.g-color.b)<1e-9);};
  for(const environment of ['day','night'])for(const interior of [false,true]) {
    rig.apply(environment,interior);
    assert.equal(renderer.toneMapping,T.NeutralToneMapping);
    assert.ok(renderer.toneMappingExposure<=1.05);
    for(const light of scene.children.filter(node=>node.isLight)){
      neutral(light.color);if(light.isHemisphereLight)neutral(light.groundColor);
    }
  }
  rig.dispose();
});
for(const id of Object.keys(IMPORTED_MODELS)){
  const file=path.resolve(__dirname,'../public/models',IMPORTED_MODELS[id].file);
  test(id+' preserves body/cabin geometry, proportions and both wheel movements',async()=>{
    const {source,expected}=await geometryFixture(file),car=new ImportedCar(source,id,new T.Texture(),1),all=meshes(car.group);
    const triangles=all.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3,0);assert.equal(triangles,expected);
    const box=new T.Box3().setFromObject(car.group),size=box.getSize(new T.Vector3());
    assert.ok(Math.abs(size.x-IMPORTED_MODELS[id].length)<.001);assert.ok(size.y>1&&size.y<2.1);assert.ok(size.z>1.5&&size.z<2.5);assert.ok(Math.abs(box.min.y)<.001);
    assert.ok(car.parts.some(p=>p.kind==='wheels'&&p.offset.z===.85));assert.ok(car.parts.some(p=>p.kind==='wheels'&&p.offset.z===-.85));
    car.update('#684091','forged','#c9c5b5',false,'paint');
    if(id==='f82'){
      // The source reuses its blue upholstery on seats, doors and the dashboard.
      const panels=all.filter(m=>/^ARm4_(color_interior|INTER_tcz)$/.test(m.material.name));
      assert.ok(panels.some(m=>m.material.name==='ARm4_color_interior'));
      assert.ok(panels.some(m=>m.material.name==='ARm4_INTER_tcz'));
      for(const color of ['#252827','#9a5730','#c9c5b5','#8b3046','#315a82']){
        car.update('#684091','forged',color,false,'interior');
        for(const panel of panels)assert.equal(panel.material.color.getHexString(),color.slice(1));
      }
      const carbon=all.find(m=>m.material.name==='ARm4_common_carbon');
      assert.ok(carbon);assert.notEqual(carbon.material.color.getHexString(),'315a82');
    }
  });
}
test('all six catalog previews are PNGs with transparent padding and no opaque background',()=>{
  const {PNG}=require('pngjs');
  for(const id of ['m4','e46','m2','e92','x6','f82']){
    const p=PNG.sync.read(fs.readFileSync(path.resolve(__dirname,'../public/models/previews',id+'.png')));
    assert.equal(p.width,1000);assert.equal(p.height,540);
    let clear=0,solid=0;for(let i=3;i<p.data.length;i+=4){if(p.data[i]===0)clear++;if(p.data[i]===255)solid++;}
    assert.ok(clear>p.width*p.height*.25,id+' must have transparent background');assert.ok(solid>50000,id+' must contain the vehicle');
    for(const [x,y]of [[0,0],[999,0],[0,539],[999,539]])assert.equal(p.data[(y*1000+x)*4+3],0);
  }
});
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
