import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, signal } from '@angular/core';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };
@Component({
  selector: 'car-viewer', standalone: true,
  template: `<div #stage class="three-stage" role="img" aria-label="Modelo 3D conceptual del coche. Arrastra para girar; usa las flechas para rotar y más o menos para acercar." tabindex="0" (keydown)="keyboard($event)"></div>
    @if(loading()) { <div class="loading-model">Preparando tu BMW M4…</div> }
    @if (error()) { <div class="viewer-error"><span>El visor 3D necesita WebGL</span><p>Activa la aceleración gráfica de tu navegador para explorar el vehículo.</p></div> }`,
  styles: [':host{display:block;position:absolute;inset:0}.three-stage{width:100%;height:100%;touch-action:none;outline-offset:-4px}.loading-model{position:absolute;bottom:55px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:1px;color:#b8ca9b}.viewer-error{position:absolute;inset:30% 10%;text-align:center;color:#d7ef83}.viewer-error p{font-size:14px;color:#a4aaa1}']
})
export class CarViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('stage') stage!: ElementRef<HTMLDivElement>;
  @Input() paint = '#2868b2';
  @Input() interior = '#252827';
  @Input() wheels = 'sport';
  @Input() model = 'm4';
  @Input() view = 'exterior';
  @Input() exploded = false;
  @Input() activePart = 'paint';
  @Input() autoRotate = false;
  @Input() resetKey = 0;
  error = signal(false);
  loading = signal(true);
  private renderer?: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(30, 1, .025, 100);
  private controls?: OrbitControls;
  private body = new T.MeshPhysicalMaterial({ color: this.paint, metalness: .72, roughness: .23, clearcoat: 1, clearcoatRoughness: .14 });
  private leather = new T.MeshStandardMaterial({ color: this.interior, roughness: .8 });
  private trim = new T.MeshStandardMaterial({ color: '#151919', metalness: .55, roughness: .32 });
  private alloy = new T.MeshStandardMaterial({ color: '#b6bdc2', metalness: .95, roughness: .2 });
  private parts: Part[] = [];
  private car = new T.Group();
  private frame = 0;
  private observer?: ResizeObserver;
  private movingCamera = true;
  private targetPosition = new T.Vector3(5.7, 2.5, 6.1);
  private targetLook = new T.Vector3(0, .65, 0);
  private environment?: T.WebGLRenderTarget;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lastTime = 0;
  private detailed = new T.Group();
  private detailedParts: Part[] = [];
  private detailedPaints: T.MeshStandardMaterial[] = [];
  private detailedSeats: T.MeshStandardMaterial[] = [];
  private detailedRims: T.MeshStandardMaterial[] = [];
  private disposed=false;

  ngAfterViewInit() {
    try {
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = .95;
      this.stage.nativeElement.appendChild(this.renderer.domElement);
      const generator = new T.PMREMGenerator(this.renderer);
      const room = new RoomEnvironment();
      this.environment = generator.fromScene(room, .04);
      this.scene.environment = this.environment.texture;
      generator.dispose(); room.dispose();
      this.scene.add(new T.HemisphereLight('#dbe7f2', '#3c4331', 2.5));
      const key = new T.DirectionalLight('#ebf3ff', 4.2); key.position.set(3, 7, 5); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, {left:-5,right:5,top:5,bottom:-5}); key.shadow.bias=-.001; this.scene.add(key);
      const rim = new T.DirectionalLight('#d9edb7', 3); rim.position.set(-4, 4, -3); this.scene.add(rim);
      const floor = new T.Mesh(new T.CircleGeometry(5.5, 96), new T.ShadowMaterial({ color:'#000000',opacity:.55 }));
      floor.rotation.x = -Math.PI/2; floor.position.y = .015; floor.receiveShadow=true; this.scene.add(floor);
      const ring = new T.Mesh(new T.RingGeometry(3.3,3.31,128),new T.MeshBasicMaterial({color:'#849174',transparent:true,opacity:.2,side:T.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=.025; this.scene.add(ring);
      this.buildCar(); this.scene.add(this.car); this.scene.add(this.detailed); this.loadDetailedCar();
      this.camera.position.copy(this.targetPosition);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(this.targetLook); this.controls.enableDamping=true; this.controls.enablePan=false;
      this.controls.minDistance=4; this.controls.maxDistance=12; this.controls.maxPolarAngle=Math.PI/2-.02;
      this.controls.addEventListener('start', () => this.movingCamera=false);
      this.observer=new ResizeObserver(()=>this.resize()); this.observer.observe(this.stage.nativeElement); this.resize();
      this.applyInputs(); this.animate(0);
    } catch (e) { console.error('WebGL initialization failed', e); this.error.set(true); }
  }
  ngOnChanges(changes: SimpleChanges) { if(this.renderer) { this.applyInputs(); if(changes['view'] || changes['resetKey'] || changes['exploded']) this.moveCamera(); } }
  private applyInputs() {
    this.body.color.set(this.paint); this.leather.color.set(this.interior);
    this.alloy.color.set(this.wheels==='forged'?'#353b3e':'#b6bdc2');
    this.car.scale.set(this.model==='m2'?.94:1, 1, this.model==='i4'?1.02:1);
    this.detailed.visible=this.model==='m4' && this.detailedParts.length>0;
    this.car.visible=!this.detailed.visible;
    this.detailedPaints.forEach(m=>m.color.set(this.paint));
    this.detailedSeats.forEach(m=>m.color.set(this.interior));
    this.detailedRims.forEach(m=>m.color.set(this.wheels==='forged'?'#242a2f':'#c3c9cc'));
    this.parts.filter(p=>p.kind==='roof').forEach(p=>p.group.visible=this.view!=='interior');
    if(this.controls) { this.controls.autoRotate=this.autoRotate && this.view==='exterior' && !this.reducedMotion; this.controls.autoRotateSpeed=.65; }
  }
  private moveCamera() {
    const inside=this.view==='interior';
    this.targetPosition.set(...(inside?[-.30,1.12,-.38]:this.exploded?[7.8,4.2,8.0]:[5.7,2.5,6.1]) as [number,number,number]);
    this.targetLook.set(...(inside?[.68,.85,-.10]:[0,this.exploded?1:.65,0]) as [number,number,number]);
    this.camera.fov=inside?68:30;this.camera.updateProjectionMatrix();
    if(this.controls) { this.controls.minDistance=inside?.05:4; this.controls.maxDistance=inside?2.5:12; this.controls.maxPolarAngle=inside?Math.PI:Math.PI/2-.02; this.controls.enableRotate=!inside; }
    this.movingCamera=true;
  }
  keyboard(e: KeyboardEvent) {
    if(!this.controls || this.view==='interior') return;
    const offset=this.camera.position.clone().sub(this.controls.target);
    if(e.key==='ArrowLeft' || e.key==='ArrowRight') offset.applyAxisAngle(new T.Vector3(0,1,0), e.key==='ArrowLeft'?.16:-.16);
    else if(e.key==='+'||e.key==='=') offset.multiplyScalar(.9);
    else if(e.key==='-') offset.multiplyScalar(1.1); else return;
    e.preventDefault(); offset.clampLength(4,12); this.camera.position.copy(this.controls.target).add(offset); this.movingCamera=false;
  }
  private part(kind: string, offset: T.Vector3) { const group=new T.Group(); this.car.add(group); this.parts.push({group,origin:group.position.clone(),offset,kind}); return group; }
  private box(parent:T.Group, size:number[], pos:number[], mat:T.Material, radius=.035) {
    const mesh=new T.Mesh(new RoundedBoxGeometry(size[0],size[1],size[2],3,radius),mat); mesh.position.set(pos[0],pos[1],pos[2]); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
  }
  private panel(parent:T.Group, vertices:number[], mat:T.Material) {
    const g=new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(vertices,3)); g.setIndex([0,1,2,0,2,3]); g.computeVertexNormals(); const mesh=new T.Mesh(g,mat); mesh.castShadow=true; parent.add(mesh); return mesh;
  }
  private buildCar() {
    const body=this.part('paint',new T.Vector3(0,.38,0));
    const shape=new T.Shape();
    shape.moveTo(-2.35,.43); shape.lineTo(-2.4,.82); shape.quadraticCurveTo(-2.3,1.02,-1.65,1.02);
    shape.lineTo(.75,1.01); shape.quadraticCurveTo(1.8,1.0,2.34,.83); shape.lineTo(2.4,.42); shape.lineTo(1.94,.42);
    shape.absarc(1.43,.49,.515,0,Math.PI,false); shape.lineTo(-.93,.49); shape.absarc(-1.45,.49,.515,0,Math.PI,false); shape.lineTo(-2.35,.43);
    const geometry=new T.ExtrudeGeometry(shape,{depth:1.72,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.055,bevelThickness:.055,curveSegments:24}); geometry.translate(0,0,-.86);
    const shell=new T.Mesh(geometry,this.body); shell.castShadow=true; shell.receiveShadow=true; body.add(shell);
    // Split hood, roof and wheels give the exploded view genuine independent geometry.
    const hood=this.part('paint',new T.Vector3(.30,1.0,0));
    const bonnet=this.box(hood,[1.5,.075,1.66],[1.35,1.02,0],this.body); bonnet.rotation.z=-.075;
    for(const z of [-.44,.44]) { const crease=this.box(hood,[1.35,.012,.016],[1.3,1.071,z],this.body,.005); crease.rotation.z=-.075; }
    const roof=this.part('roof',new T.Vector3(0,1.4,0));
    const glass=new T.MeshPhysicalMaterial({color:'#253a40',metalness:.25,roughness:.13,transparent:true,opacity:.74,side:T.DoubleSide});
    this.box(roof,[1.48,.065,1.25],[-.42,1.60,0],this.trim);
    this.panel(roof,[.30,1.58,-.62,.30,1.58,.62,.88,1.04,.80,.88,1.04,-.80],glass);
    this.panel(roof,[-1.15,1.57,.62,-1.15,1.57,-.62,-1.8,1.06,-.80,-1.8,1.06,.80],glass);
    for(const s of [-1,1]) {
      this.panel(roof,[-1.73,1.06,s*.83,-1.10,1.57,s*.65,.27,1.57,s*.65,.81,1.06,s*.83],glass);
      for(const [x,y,angle,length] of [[.56,1.32,.79,.78],[-1.46,1.3,-.9,.82]] as number[][]) {
        const pillar=this.box(roof,[.055,length,.055],[x,y,s*.73],this.body,.018); pillar.rotation.z=angle;
      }
      this.box(body,[2.3,.04,.035],[-.40,1.065,s*.9],this.trim,.01);
      this.box(body,[.22,.027,.035],[-.55,.95,s*.925],this.alloy,.01);
      this.box(body,[.27,.09,.15],[.68,1.13,s*1.02],this.body);
      this.box(body,[2.6,.11,.10],[-.12,.35,s*.88],this.trim);
      // Door panel seam.
      this.box(body,[.012,.42,.009],[-1.0,.73,s*.918],this.trim,.004);
    }
    const interior=this.part('interior',new T.Vector3(-.3,.8,0));
    this.box(interior,[2.7,.12,1.55],[-.3,.49,0],this.trim);
    for(const x of [-.45,-1.18]) for(const z of [-.43,.43]) {
      this.box(interior,[.57,.16,.54],[x,.70,z],this.leather,.07);
      const seat=this.box(interior,[.14,.57,.52],[x-.21,1.0,z],this.leather,.07); seat.rotation.z=-.14;
      this.box(interior,[.13,.18,.26],[x-.25,1.35,z],this.leather,.04);
      this.box(interior,[.34,.025,.34],[x,.79,z],this.leather,.02);
    }
    this.box(interior,[.3,.25,1.52],[.7,.95,0],this.trim,.045);
    const screen=new T.MeshBasicMaterial({color:'#163c51'});
    this.box(interior,[.045,.20,.94],[.55,1.16,.16],screen,.018);
    for(let i=0;i<6;i++) this.box(interior,[.05,.008,.07],[.52,1.11+i*.016,.25+i*.055],new T.MeshBasicMaterial({color:i<3?'#baf37a':'#5badcb'}),.002);
    this.box(interior,[1.4,.20,.16],[-.1,.77,0],this.trim);
    this.box(interior,[.07,.1,.07],[.28,.92,0],this.alloy,.01);
    const steering=new T.Mesh(new T.TorusGeometry(.18,.023,10,40),this.trim); steering.rotation.y=Math.PI/2-.25; steering.position.set(.35,1.02,.45); interior.add(steering);
    this.box(interior,[.04,.045,.27],[.35,1.02,.45],this.alloy,.01);
    for(const s of [-1,1]) this.box(interior,[1.7,.012,.016],[-.2,.96,s*.78],new T.MeshBasicMaterial({color:'#8cdfff'}),.003);
    // Kidney grille, front air intakes and LED signatures.
    for(const z of [-.25,.25]) {
      this.box(body,[.085,.4,.39],[2.38,.64,z],this.trim,.055);
      for(let i=0;i<5;i++) this.box(body,[.098,.32,.012],[2.43,.64,z-.13+i*.065],this.alloy,.003);
    }
    const led=new T.MeshStandardMaterial({color:'#deefff',emissive:'#bddcff',emissiveIntensity:3});
    const red=new T.MeshStandardMaterial({color:'#af1818',emissive:'#ef1527',emissiveIntensity:2});
    for(const z of [-.69,.69]) {
      this.box(body,[.12,.12,.35],[2.25,.9,z],this.trim,.025);
      for(const dz of [-.10,.06]) this.box(body,[.13,.035,.09],[2.32,.91,z+dz],led,.006);
      this.box(body,[.07,.065,.47],[-2.39,.90,z*.92],red,.015);
      this.box(body,[.10,.12,.29],[2.35,.39,z],this.trim,.02);
      const exhaust=new T.Mesh(new T.CylinderGeometry(.065,.065,.15,20),this.alloy); exhaust.rotation.z=Math.PI/2; exhaust.position.set(-2.4,.34,z); body.add(exhaust);
    }
    this.box(body,[.12,.07,1.4],[-2.22,1.06,0],this.trim,.012);
    this.box(body,[.14,.08,1.60],[2.30,.28,0],this.trim,.015);
    const badge=new T.Mesh(new T.CircleGeometry(.055,24),new T.MeshStandardMaterial({color:'#bad7e5',metalness:.8,roughness:.2})); badge.rotation.x=-Math.PI/2; badge.position.set(2.05,1.01,0); hood.add(badge);
    for(const x of [-1.45,1.43]) for(const z of [-.91,.91]) this.wheel(x,z);
  }
  private wheel(x:number,z:number) {
    const group=this.part('wheels',new T.Vector3(x>0?.18:-.18,.05,Math.sign(z)*.95));
    const rubber=new T.MeshStandardMaterial({color:'#111314',roughness:.92});
    const tire=new T.Mesh(new T.TorusGeometry(.365,.105,20,64),rubber); tire.position.set(x,.48,z); tire.castShadow=true; group.add(tire);
    const disk=new T.Mesh(new T.CylinderGeometry(.32,.32,.11,48),this.trim); disk.rotation.x=Math.PI/2; disk.position.set(x,.48,z); group.add(disk);
    const brake=new T.Mesh(new T.CylinderGeometry(.25,.25,.12,48),new T.MeshStandardMaterial({color:'#626c71',metalness:.85,roughness:.4})); brake.rotation.x=Math.PI/2; brake.position.set(x,.48,z); group.add(brake);
    this.box(group,[.1,.2,.14],[x+.19,.5,z],new T.MeshStandardMaterial({color:'#d2df52',metalness:.5,roughness:.3}),.02);
    for(let i=0;i<10;i++) {
      const angle=i*Math.PI/5;
      const spoke=this.box(group,[.035,.29,.06],[x+Math.sin(angle)*.145,.48+Math.cos(angle)*.145,z+Math.sign(z)*.09],this.alloy,.008); spoke.rotation.z=-angle;
    }
    const hub=new T.Mesh(new T.CylinderGeometry(.07,.07,.18,24),this.alloy); hub.rotation.x=Math.PI/2; hub.position.set(x,.48,z); group.add(hub);
  }
  private resize() { const {clientWidth:w,clientHeight:h}=this.stage.nativeElement; if(!w||!h)return; this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); this.renderer?.setSize(w,h); }
  private loadDetailedCar() {
    new GLTFLoader().load('/models/bmw-m4.glb', gltf=>{
      if(this.disposed)return;
      const source=gltf.scene;
      source.rotation.y=Math.PI/2;source.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(source), center=bounds.getCenter(new T.Vector3());
      const factor=4.9/bounds.getSize(new T.Vector3()).x;
      const normalize=new T.Matrix4().makeScale(factor,factor,factor).multiply(new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
      const meshes:T.Mesh[]=[];source.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});
      for(const mesh of meshes) {
        const original=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
        const name=original.name.toLowerCase();
        const geometry=mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(normalize,mesh.matrixWorld));
        let material=original.clone() as T.MeshStandardMaterial;
        let kind='structure';let offset=new T.Vector3();
        if(name.includes('body15')||name.includes('zx1')||name.includes('livery')) {
          material=new T.MeshPhysicalMaterial({color:this.paint,metalness:.78,roughness:.24,clearcoat:1,clearcoatRoughness:.13});
          this.detailedPaints.push(material);kind='paint';offset.set(0,1.25,0);
        } else if(name.includes('interior18')||name.includes('interior23')) {
          material.map=null;material.color.set(this.interior);material.roughness=.8;material.metalness=0;
          this.detailedSeats.push(material);kind='interior';offset.set(-.1,.7,0);
        } else if(name.includes('m8rim') && !name.includes('001')) {
          material.map=null;material.metalness=.95;material.roughness=.23;this.detailedRims.push(material);kind='wheels';
        } else if(name.includes('windows')) {material.color.set('#597780');material.opacity=.3;material.transparent=true;material.depthWrite=false;kind='glass';offset.set(0,1.5,0);}
        else if(name.includes('redlight')) {material.emissive.set('#d10816');material.emissiveIntensity=.7;}
        else if(name.includes('pillars')) {material.roughness=.55;kind='structure';offset.set(0,.25,0);}
        else {material.roughness=Math.max(material.roughness,.22);}
        if(name.includes('interior7')||name.includes('dash')){kind='interior';offset.set(0,.65,0);}
        // Partition wheel meshes into four spatial groups, keeping tyre and brake geometry together.
        if(name.includes('m8rim')||name.includes('caliper')) {
          const nonIndexed=geometry.index?geometry.toNonIndexed():geometry;
          const buckets:number[][]=[[],[],[],[]];const pos=nonIndexed.getAttribute('position');
          for(let i=0;i<pos.count;i+=3){const x=(pos.getX(i)+pos.getX(i+1)+pos.getX(i+2))/3;const z=(pos.getZ(i)+pos.getZ(i+1)+pos.getZ(i+2))/3;const bucket=(x>0?2:0)+(z>0?1:0);buckets[bucket].push(i,i+1,i+2);}
          for(let b=0;b<4;b++) {
            const indices=buckets[b];if(!indices.length)continue;
            const split=new T.BufferGeometry();
            for(const attrName of Object.keys(nonIndexed.attributes)) {
              const attr=nonIndexed.getAttribute(attrName);const values=new Float32Array(indices.length*attr.itemSize);
              indices.forEach((idx,j)=>{for(let k=0;k<attr.itemSize;k++)values[j*attr.itemSize+k]=attr.getComponent(idx,k);});
              split.setAttribute(attrName,new T.BufferAttribute(values,attr.itemSize));
            }
            const group=new T.Group();const partMesh=new T.Mesh(split,material);partMesh.castShadow=true;partMesh.receiveShadow=true;group.add(partMesh);this.detailed.add(group);
            this.detailedParts.push({group,origin:new T.Vector3(),offset:new T.Vector3(b>=2?.25:-.25,0,b%2?.9:-.9),kind:'wheels'});
          }
          nonIndexed.dispose();geometry.dispose();
        } else {
          const group=new T.Group();const partMesh=new T.Mesh(geometry,material);partMesh.castShadow=true;partMesh.receiveShadow=true;group.add(partMesh);this.detailed.add(group);
          this.detailedParts.push({group,origin:new T.Vector3(),offset,kind});
        }
      }
      source.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});
      this.loading.set(false);this.applyInputs();
    },undefined,()=>{this.loading.set(false);console.warn('Detailed M4 unavailable; using procedural concept.');});
  }
  private animate = (time:number) => {
    this.frame=requestAnimationFrame(this.animate);
    const dt=Math.min((time-this.lastTime)/1000,.05); this.lastTime=time;
    const ease=this.reducedMotion?1:1-Math.exp(-dt*5);
    for(const part of [...this.parts,...this.detailedParts]) {
      const target=part.origin.clone();
      if(this.exploded && this.view!=='interior') target.add(part.offset);
      part.group.position.lerp(target,ease);
    }
    if(this.movingCamera && this.controls) {
      this.camera.position.lerp(this.targetPosition,ease); this.controls.target.lerp(this.targetLook,ease);
      if(this.camera.position.distanceTo(this.targetPosition)<.005) this.movingCamera=false;
    }
    // A restrained emissive accent identifies the material currently being configured.
    this.body.emissive.set(this.exploded && this.activePart==='paint'?this.paint:'#000000'); this.body.emissiveIntensity=.12;
    this.leather.emissive.set(this.exploded && this.activePart==='interior'?'#a6b16f':'#000000'); this.leather.emissiveIntensity=.22;
    this.alloy.emissive.set(this.exploded && this.activePart==='wheels'?'#9ea95e':'#000000'); this.alloy.emissiveIntensity=.22;
    for(const [kind,materials] of [['paint',this.detailedPaints],['interior',this.detailedSeats],['wheels',this.detailedRims]] as const) materials.forEach(m=>{m.emissive.set(this.exploded&&this.activePart===kind?'#60743a':'#000000');m.emissiveIntensity=.12;});
    this.controls?.update(dt); this.renderer?.render(this.scene,this.camera);
  };
  ngOnDestroy() {
    this.disposed=true;
    cancelAnimationFrame(this.frame); this.observer?.disconnect(); this.controls?.dispose();
    const materials=new Set<T.Material>(); this.scene.traverse(o=>{ if(o instanceof T.Mesh) {o.geometry.dispose(); for(const m of (Array.isArray(o.material)?o.material:[o.material])) materials.add(m);}});
    materials.forEach(m=>m.dispose()); this.environment?.dispose(); this.renderer?.dispose();
  }
}
