import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, isDevMode, signal } from '@angular/core';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FlakesTexture } from 'three/addons/textures/FlakesTexture.js';
import { ContactShadow, createStudioEnvironment } from './studio-rendering';
import { CabinMaterials } from './cabin-materials';
import { CabinRendering } from './cabin-rendering';
import { E46Car } from './e46-car';
import { M2Car } from './m2-car';
import { StreetCar } from './street-car';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ViewerQuality } from './viewer-quality';
import { AssembledCar } from './assembled-car';
import { ViewerFrameClock } from './viewer-frame-clock';
import { CabinLook, CABIN_FIELD_OF_VIEW } from './cabin-look';
import { addM4UpholsteryMask } from './m4-upholstery';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };
@Component({
  selector: 'car-viewer', standalone: true,
  template: `<div #stage class="three-stage" [style.cursor]="view==='interior'?'grab':null" role="img" [attr.aria-label]="'Modelo 3D BMW '+modelName+(view==='interior'?'. Interior: arrastra o usa las cuatro flechas para mirar alrededor; más y menos ajustan el ángulo.':'. Arrastra para girar; usa las flechas para rotar y más o menos para acercar.')" tabindex="0" (keydown)="keyboard($event)"></div>
    @if(modelLoading()) { <div class="loading-model">Preparando tu BMW {{modelName}}…</div> }
    @if(modelLoadError()) { <div class="viewer-error"><span>No se ha podido cargar el {{modelName}}.</span><p>Recarga la página para volver a intentarlo.</p></div> }
    @if (error()) { <div class="viewer-error"><span>El visor 3D necesita WebGL</span><p>Activa la aceleración gráfica de tu navegador para explorar el vehículo.</p></div> }
    @if(showStats) { <output class="viewer-stats" aria-label="Rendimiento del visor">{{stats()}}</output> }`,
  styles: [':host{display:block;position:absolute;inset:0}.three-stage{width:100%;height:100%;touch-action:none;outline-offset:-4px}.loading-model{position:absolute;bottom:55px;left:0;right:0;text-align:center;font-size:10px;letter-spacing:1px;color:var(--muted)}.viewer-error{position:absolute;inset:30% 10%;text-align:center;color:var(--accent)}.viewer-error p{font-size:14px;color:var(--muted)}.viewer-stats{position:absolute;bottom:49px;left:20px;z-index:3;pointer-events:none;background:#ffffffed;border:1px solid #dce1e7;padding:6px 9px;font:11px monospace;color:#3d4957}']
})
export class CarViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly showStats=isDevMode() && new URLSearchParams(location.search).get('viewerStats')==='1';
  readonly stats=signal('Midiendo rendimiento…');
  private statsFrames=0;
  private statsStart=0;
  private totalFrames=0;
  private readonly quality=new ViewerQuality();
  private readonly partTarget=new T.Vector3();
  private visibilityObserver?:IntersectionObserver;
  private inViewport=true;
  private rendering=false;
  private readonly frameClock=new ViewerFrameClock();
  private geometryWasMoving=false;
  private m4Requested=false;
  private assembled?:AssembledCar;
  private assembledKey='';
  private readonly cabinLook=new CabinLook();
  private lookPointer?:{id:number;x:number;y:number};
  private lookMotionUntil=0;
  @ViewChild('stage') stage!: ElementRef<HTMLDivElement>;
  @Input() paint = '#2868b2';
  @Input() interior = '#252827';
  @Input() wheels = 'sport';
  @Input() model = 'm4';
  @Input() modelName = 'M4 Competition';
  @Input() view = 'exterior';
  @Input() exploded = false;
  @Input() activePart = 'paint';
  @Input() autoRotate = false;
  @Input() resetKey = 0;
  error = signal(false);
  loading = signal(true);
  m2Loading = signal(false);
  m2LoadError = signal(false);
  e46Loading = signal(false);
  e46LoadError = signal(false);
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
  private targetPosition = new T.Vector3(5.2, 2.1, 5.4);
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
  private contactShadow?: ContactShadow;
  private shadowDirty=true;
  private lastShadowUpdate=0;
  private paintNormal?: T.CanvasTexture;
  private narrowViewport=false;
  private cabinMaterials?: CabinMaterials;
  private cabinRendering?: CabinRendering;
  private e46?: E46Car;
  private m2?: M2Car;
  private streetCars = new Map<string, StreetCar>();
  streetLoading = signal<Record<string, boolean>>({});
  streetErrors = signal<Record<string, boolean>>({});
  modelLoading() { return this.model==='e46'?this.e46Loading():this.model==='m2'?this.m2Loading():this.model==='m4'?this.loading():!!this.streetLoading()[this.model]; }
  modelLoadError() { return this.model==='e46'?this.e46LoadError():this.model==='m2'?this.m2LoadError():!!this.streetErrors()[this.model]; }

  ngAfterViewInit() {
    try {
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.stage.nativeElement.appendChild(this.renderer.domElement);
      this.environment = createStudioEnvironment(this.renderer);
      this.scene.environment = this.environment.texture;
      this.scene.environmentIntensity = 1.15;
      this.scene.add(new T.HemisphereLight('#e1e9f4', '#141820', .55));
      const key = new T.DirectionalLight('#ffffff', 1.7); key.position.set(2, 5, 4); key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, {left:-4,right:4,top:4,bottom:-4,near:.1,far:15});
      key.shadow.bias=-.0002; key.shadow.normalBias=.008; key.shadow.camera.updateProjectionMatrix(); this.scene.add(key);
      const rim = new T.DirectionalLight('#dceaff', .8); rim.position.set(-4, 3, -3); this.scene.add(rim);
      const floor = new T.Mesh(new T.CircleGeometry(5.5, 96), new T.ShadowMaterial({ color:'#000000',opacity:.20 }));
      floor.rotation.x = -Math.PI/2; floor.position.y = .015; floor.receiveShadow=true; this.scene.add(floor);
      this.contactShadow = new ContactShadow(); this.scene.add(this.contactShadow.mesh);
      const ring = new T.Mesh(new T.RingGeometry(3.3,3.307,128),new T.MeshBasicMaterial({color:'#3975ab',transparent:true,opacity:.1,side:T.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=.025; this.scene.add(ring);
      this.paintNormal = new T.CanvasTexture(new FlakesTexture(128, 128));
      this.paintNormal.wrapS=this.paintNormal.wrapT=T.RepeatWrapping; this.paintNormal.repeat.set(100,100);
      this.paintNormal.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
      this.cabinMaterials=new CabinMaterials(Math.min(8,this.renderer.capabilities.getMaxAnisotropy()),this.requestRender);
      this.body.normalMap=this.paintNormal; this.body.normalScale.set(.018,.018); this.body.clearcoatRoughness=.13;
      this.scene.add(this.car); this.scene.add(this.detailed);
      if(this.model==='m4')this.loadDetailedCar();
      if(this.model==='e46')this.loadE46();
      if(this.model==='m2')this.loadM2();
      this.loadStreetCar();
      this.car.traverse(object=>{if(object instanceof T.Mesh)object.layers.enable(1);});
      this.camera.position.copy(this.targetPosition);
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(this.targetLook); this.controls.enableDamping=true; this.controls.enablePan=false;
      this.controls.minDistance=4; this.controls.maxDistance=12; this.controls.maxPolarAngle=Math.PI/2-.02;
      this.controls.addEventListener('start', () => {this.movingCamera=false;this.requestRender();});
      this.controls.addEventListener('change',this.requestRender);
      this.renderer.domElement.addEventListener('pointerdown',this.beginInteriorLook);
      this.renderer.domElement.addEventListener('pointermove',this.dragInteriorLook);
      this.renderer.domElement.addEventListener('pointerup',this.endInteriorLook);
      this.renderer.domElement.addEventListener('pointercancel',this.endInteriorLook);
      this.renderer.domElement.addEventListener('lostpointercapture',this.endInteriorLook);
      this.observer=new ResizeObserver(()=>this.resize()); this.observer.observe(this.stage.nativeElement); this.resize();
      this.visibilityObserver=new IntersectionObserver(entries=>{
        this.inViewport=entries[0].isIntersecting;this.visibilityChanged();
      });
      this.visibilityObserver.observe(this.stage.nativeElement);
      document.addEventListener('visibilitychange',this.visibilityChanged);
      this.applyInputs(); this.requestRender();
    } catch (e) { console.error('WebGL initialization failed', e); this.error.set(true); }
  }
  ngOnChanges(changes: SimpleChanges) {
    if(this.renderer) {
      if(changes['model'] && this.model==='m4')this.loadDetailedCar();
      if(changes['model'] && this.model==='e46')this.loadE46();
      if(changes['model'] && this.model==='m2')this.loadM2();
      if(changes['model'])this.loadStreetCar();
      this.applyInputs();
      if(changes['model'] || changes['exploded'] || changes['view'] || changes['wheels'])this.shadowDirty=true;
      if(changes['model'] || changes['view'] || changes['resetKey'] || changes['exploded'])this.moveCamera();
      this.requestRender();
    }
  }
  private applyInputs() {
    if(this.assembled)this.assembled.group.visible=false;
    this.scene.background=this.view==='interior'?new T.Color('#8b929b'):null;
    this.cabinMaterials?.setUpholsteryColor(this.interior);
    this.body.color.set(this.paint); this.leather.color.set(this.interior);
    this.alloy.color.set(this.wheels==='forged'?'#353b3e':'#b6bdc2');
    this.detailed.visible=this.model==='m4' && this.detailedParts.length>0;
    this.car.visible=this.model==='m4' && !this.detailed.visible;
    if(this.e46){this.e46.group.visible=this.model==='e46';if(this.e46.group.visible)this.e46.update(this.paint,this.wheels,this.exploded,this.activePart);}
    if(this.m2){this.m2.group.visible=this.model==='m2';if(this.m2.group.visible)this.m2.update(this.paint,this.wheels,this.interior,this.exploded,this.activePart);}
    for(const [id, car] of this.streetCars) {
      car.group.visible=this.model===id;if(car.group.visible)car.update(this.paint,this.wheels,this.interior,this.exploded,this.activePart);
    }
    for(const material of [this.body,...this.detailedPaints]) {
      material.color.set(this.paint);
      material.metalness=this.paint==='#e8e8de'?.08:this.paint==='#a2a8a6'?.24:.65;
      material.roughness=this.paint==='#e8e8de'?.32:.28;
    }
    this.detailedRims.forEach(m=>{m.color.set(this.wheels==='forged'?'#505965':'#e2e6eb');m.metalness=this.wheels==='forged'?.85:.65;m.roughness=.32;});
    this.parts.filter(p=>p.kind==='roof').forEach(p=>p.group.visible=this.view!=='interior');
    if(this.controls) { this.controls.autoRotate=this.autoRotate && this.view==='exterior' && !this.reducedMotion; this.controls.autoRotateSpeed=.65; }
    this.body.emissive.set(this.exploded && this.activePart==='paint'?this.paint:'#000000');this.body.emissiveIntensity=.12;
    this.leather.emissive.set(this.exploded && this.activePart==='interior'?'#0066b1':'#000000');this.leather.emissiveIntensity=.22;
    this.alloy.emissive.set(this.exploded && this.activePart==='wheels'?'#0066b1':'#000000');this.alloy.emissiveIntensity=.22;
    for(const [kind,materials] of [['paint',this.detailedPaints],['interior',this.detailedSeats],['wheels',this.detailedRims]] as const)
      for(const material of materials){material.emissive.set(this.exploded && this.activePart===kind?'#0066b1':'#000000');material.emissiveIntensity=.12;}
    this.requestRender();
  }
  private moveCamera() {
    const inside=this.view==='interior';
    this.releaseInteriorLook();this.cabinLook.reset();this.lookMotionUntil=0;
    this.targetPosition.set(...(inside?(this.model==='e46'?[.10,1.12,-.36]:this.model==='m2'?[-.22,1.08,-.38]:this.model==='e36'?[.02,1.04,-.36]:this.model==='e92'?[.02,1.06,-.38]:[-.30,1.12,-.38]):this.exploded?[7.8,4.2,8.0]:this.narrowViewport?[5.8,2.3,6.0]:[5.2,2.1,5.4]) as [number,number,number]);
    this.targetLook.set(...(inside?(this.model==='e46'?[1,.72,-.12]:this.model==='m2'?[.8,.88,-.18]:this.model==='e36'?[.95,.81,-.12]:this.model==='e92'?[1,.83,-.12]:[.68,.85,-.10]):[0,this.exploded?1:.65,0]) as [number,number,number]);
    this.camera.fov=inside?CABIN_FIELD_OF_VIEW:30;this.camera.updateProjectionMatrix();
    if(this.controls) { this.controls.enabled=!inside;this.controls.minDistance=inside?.05:4; this.controls.maxDistance=inside?2.5:12; this.controls.maxPolarAngle=inside?Math.PI:Math.PI/2-.02; this.controls.enableRotate=!inside; }
    this.movingCamera=true;
  }
  keyboard(e: KeyboardEvent) {
    if(!this.controls || e.ctrlKey || e.metaKey || e.altKey)return;
    if(this.view==='interior') {
      if(e.key==='ArrowLeft')this.cabinLook.rotate(.12,0);
      else if(e.key==='ArrowRight')this.cabinLook.rotate(-.12,0);
      else if(e.key==='ArrowUp')this.cabinLook.rotate(0,-.1);
      else if(e.key==='ArrowDown')this.cabinLook.rotate(0,.1);
      else if(e.key==='+' || e.key==='=')this.camera.fov=Math.max(60,this.camera.fov-3);
      else if(e.key==='-')this.camera.fov=Math.min(95,this.camera.fov+3);
      else if(e.key==='Home'){this.cabinLook.reset();this.camera.fov=CABIN_FIELD_OF_VIEW;}
      else return;
      e.preventDefault();this.camera.updateProjectionMatrix();this.orientInterior();return;
    }
    const offset=this.camera.position.clone().sub(this.controls.target);
    if(e.key==='ArrowLeft' || e.key==='ArrowRight') offset.applyAxisAngle(new T.Vector3(0,1,0), e.key==='ArrowLeft'?.16:-.16);
    else if(e.key==='+'||e.key==='=') offset.multiplyScalar(.9);
    else if(e.key==='-') offset.multiplyScalar(1.1); else return;
    e.preventDefault(); offset.clampLength(4,12); this.camera.position.copy(this.controls.target).add(offset); this.movingCamera=false;
    this.requestRender();
  }
  private orientInterior() {
    if(!this.controls)return;
    this.movingCamera=false;this.camera.position.copy(this.targetPosition);
    this.cabinLook.target(this.targetPosition,this.targetLook,this.controls.target);
    this.camera.lookAt(this.controls.target);this.lookMotionUntil=performance.now()+120;this.requestRender();
  }
  private beginInteriorLook=(event:PointerEvent)=>{
    if(this.view!=='interior' || event.button!==0 || this.lookPointer)return;
    event.preventDefault();this.stage.nativeElement.focus({preventScroll:true});
    this.lookPointer={id:event.pointerId,x:event.clientX,y:event.clientY};
    this.renderer?.domElement.setPointerCapture(event.pointerId);this.orientInterior();
  };
  private dragInteriorLook=(event:PointerEvent)=>{
    const pointer=this.lookPointer;if(!pointer || pointer.id!==event.pointerId || this.view!=='interior')return;
    this.cabinLook.rotate(-(event.clientX-pointer.x)*.004,(event.clientY-pointer.y)*.003);
    pointer.x=event.clientX;pointer.y=event.clientY;this.orientInterior();
  };
  private endInteriorLook=(event:PointerEvent)=>{
    if(this.lookPointer?.id===event.pointerId){this.releaseInteriorLook();this.requestRender();}
  };
  private releaseInteriorLook() {
    const pointer=this.lookPointer;this.lookPointer=undefined;
    if(pointer && this.renderer?.domElement.hasPointerCapture(pointer.id))this.renderer.domElement.releasePointerCapture(pointer.id);
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
    for(let i=0;i<6;i++) this.box(interior,[.05,.008,.07],[.52,1.11+i*.016,.25+i*.055],new T.MeshBasicMaterial({color:i<3?'#69b3ff':'#5badcb'}),.002);
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
    this.box(group,[.1,.2,.14],[x+.19,.5,z],new T.MeshStandardMaterial({color:'#0066b1',metalness:.5,roughness:.3}),.02);
    for(let i=0;i<10;i++) {
      const angle=i*Math.PI/5;
      const spoke=this.box(group,[.035,.29,.06],[x+Math.sin(angle)*.145,.48+Math.cos(angle)*.145,z+Math.sign(z)*.09],this.alloy,.008); spoke.rotation.z=-angle;
    }
    const hub=new T.Mesh(new T.CylinderGeometry(.07,.07,.18,24),this.alloy); hub.rotation.x=Math.PI/2; hub.position.set(x,.48,z); group.add(hub);
  }
  private resize() {
    const {clientWidth:w,clientHeight:h}=this.stage.nativeElement; if(!w||!h)return;
    this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
    this.quality.resize(w,h,devicePixelRatio);
    this.applyResolution();
    if(this.narrowViewport!==(w<520)) {
      this.narrowViewport=w<520;
      if(this.view==='exterior'&&!this.exploded)this.moveCamera();
    }
    this.requestRender();
  }
  private applyResolution() {
    if(!this.renderer)return;
    const {clientWidth:w,clientHeight:h}=this.stage.nativeElement;
    this.renderer.setPixelRatio(this.quality.ratio);
    this.renderer.transmissionResolutionScale=this.quality.moving?.35:.5;
    this.renderer.setSize(w,h);
    this.cabinRendering?.resize(w,h,this.quality.ratio);
  }
  private loadDetailedCar() {
    if(this.m4Requested)return;
    this.m4Requested=true;this.buildCar();
    this.car.traverse(object=>{if(object instanceof T.Mesh)object.layers.enable(1);});
    new GLTFLoader().load('/models/bmw-m4.glb', gltf=>{
      if(this.disposed)return;
      const source=gltf.scene;
      source.rotation.y=Math.PI/2;source.updateMatrixWorld(true);
      const bounds=new T.Box3().setFromObject(source), center=bounds.getCenter(new T.Vector3());
      const factor=4.9/bounds.getSize(new T.Vector3()).x;
      const normalize=new T.Matrix4().makeScale(factor,factor,factor).multiply(new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
      const meshes:T.Mesh[]=[];source.traverse(o=>{if(o instanceof T.Mesh)meshes.push(o);});
      for(const mesh of meshes) {
        const original=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material) as T.MeshStandardMaterial;
        const name=original.name.toLowerCase();
        let geometry=mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(normalize,mesh.matrixWorld));
        let material=original.clone() as T.MeshStandardMaterial;
        let kind='structure';let offset=new T.Vector3();
        if(name.includes('zx1')||name.includes('livery')) {
          material=new T.MeshPhysicalMaterial({
            color:this.paint,metalness:.65,roughness:.28,clearcoat:1,clearcoatRoughness:.13,
            normalMap:this.paintNormal,normalScale:new T.Vector2(.018,.018),envMapIntensity:1
          });
          this.detailedPaints.push(material);kind='paint';offset.set(0,1.25,0);
        } else if(name.includes('body15')) {
          material=new T.MeshPhysicalMaterial({
            map:original.map,color:'#b3b3b3',metalness:.25,roughness:.38,
            clearcoat:.7,clearcoatRoughness:.25,bumpMap:original.map,bumpScale:.0015,envMapIntensity:.7
          });
          kind='structure';offset.set(0,1.25,0);
        } else if(name.includes('interior18')||name.includes('interior23')||name.includes('pillars')||name.includes('black16')) {
          material=this.cabinMaterials!.leather(name.includes('interior18')?'#30343a':'#111418');
          addM4UpholsteryMask(geometry,name);
          geometry=this.cabinMaterials!.addDetailUVs(geometry);
          if(name.includes('interior')){this.detailedSeats.push(material);kind='interior';offset.set(-.1,.7,0);}
        } else if(name.includes('interior7')) {
          material=this.cabinMaterials!.dashboard(original);
          geometry=this.cabinMaterials!.addDetailUVs(geometry);
          kind='interior';offset.set(0,.65,0);
        } else if(name.includes('dash')) {
          material.metalness=0;material.roughness=.4;material.envMapIntensity=.2;
          material.emissiveMap=original.map;material.emissive.set('#ffffff');material.emissiveIntensity=.22;
          kind='interior';offset.set(0,.65,0);
        } else if(name.includes('m8rim') && !name.includes('001')) {
          material.metalness=.95;material.roughness=.24;this.detailedRims.push(material);kind='wheels';
          material.onBeforeCompile=shader=>{
            shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', `
              #ifdef USE_MAP
                vec4 wheelTexel = texture2D(map, vMapUv);
                // Refinish only the original wheel-paint swatches; retain brake and badge artwork.
                if(vMapUv.x > 0.875 && vMapUv.y > 0.125 && vMapUv.y < 0.25) {
                  wheelTexel.rgb = mix(wheelTexel.rgb, vec3(0.8), 0.85);
                }
                diffuseColor *= wheelTexel;
              #endif
            `);
          };
        } else if(name.includes('m8rim001')) {
          material.color.set('#bfc1c5');material.metalness=0;material.roughness=.94;
          material.bumpMap=material.map;material.bumpScale=.003;
        } else if(name.includes('windows')) {
          const glass=new T.MeshPhysicalMaterial({
            color:'#ffffff',metalness:0,roughness:.025,transmission:1,thickness:.008,
            ior:1.52,attenuationColor:'#8395a7',attenuationDistance:.3,side:T.DoubleSide,
            envMapIntensity:.6
          });
          material=glass;kind='glass';offset.set(0,1.5,0);
        }
        else if(name.includes('redlight')) {material.emissive.set('#d10816');material.emissiveIntensity=.7;}
        else if(name.includes('headlight5')) {material.color.set('#aebdcd');material.opacity=.28;material.transparent=true;material.depthWrite=false;material.roughness=.08;material.envMapIntensity=1.3;}
        else if(name.includes('chrome5')||name.includes('white4')) {material.color.set('#92989f');material.metalness=.7;material.roughness=.38;}
        else if(name.includes('caliper')) {material.color.set('#0066b1');material.metalness=.5;material.roughness=.36;}
        else if(name.includes('piggrill')||name.includes('ff4')||name.includes('tail7')) {material.color.set('#161b22');material.metalness=.35;material.roughness=.34;}
        else if(name.includes('engine')||name.includes('black15')||name.includes('raidiator')) {material.color.set(name.includes('engine')?'#555b63':'#21272f');material.metalness=.15;material.roughness=.65;}
        else if(name.includes('light5')) {material.metalness=.75;material.roughness=.18;}
        else {material.roughness=Math.max(material.roughness,.22);}
        const anisotropy=Math.min(8,this.renderer!.capabilities.getMaxAnisotropy());
        for(const texture of [material.map,material.normalMap,material.bumpMap,material.roughnessMap])if(texture)texture.anisotropy=anisotropy;
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
            const group=new T.Group();const partMesh=new T.Mesh(split,material);partMesh.castShadow=true;partMesh.receiveShadow=true;partMesh.layers.enable(1);partMesh.layers.enable(2);group.add(partMesh);this.detailed.add(group);
            this.detailedParts.push({group,origin:new T.Vector3(),offset:new T.Vector3(b>=2?.25:-.25,0,b%2?.9:-.9),kind:'wheels'});
          }
          nonIndexed.dispose();geometry.dispose();
        } else {
          const group=new T.Group();const partMesh=new T.Mesh(geometry,material);partMesh.castShadow=!name.includes('windows')&&!name.includes('headlight5');partMesh.receiveShadow=true;partMesh.layers.enable(1);group.add(partMesh);this.detailed.add(group);
          if(!material.transparent && !(material instanceof T.MeshPhysicalMaterial && material.transmission>0))partMesh.layers.enable(2);
          this.detailedParts.push({group,origin:new T.Vector3(),offset,kind});
        }
      }
      source.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});
      this.loading.set(false);this.applyInputs();this.shadowDirty=true;this.requestRender();
    },undefined,()=>{this.loading.set(false);this.requestRender();console.warn('Detailed M4 unavailable; using procedural concept.');});
  }
  private loadStreetCar() {
    const id=this.model;
    if(id!=='e36' && id!=='e92')return;
    if(this.streetCars.has(id) || this.streetLoading()[id] || this.streetErrors()[id])return;
    this.streetLoading.update(state=>({...state,[id]:true}));
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load('/models/'+(id==='e36'?'bmw-e36-street.glb':'bmw-m3-e92.glb'),gltf=>{
      if(this.disposed)return;
      try {
        const car=new StreetCar(gltf.scene,id,this.paintNormal!,Math.min(8,this.renderer!.capabilities.getMaxAnisotropy()));
        this.streetCars.set(id,car);this.scene.add(car.group);this.applyInputs();this.shadowDirty=true;this.requestRender();
      } catch(error) { console.error('BMW model adaptation failed',error);this.streetErrors.update(state=>({...state,[id]:true})); }
      this.streetLoading.update(state=>({...state,[id]:false}));
    },undefined,()=>{this.streetLoading.update(state=>({...state,[id]:false}));this.streetErrors.update(state=>({...state,[id]:true}));});
  }
  private loadM2() {
    if(this.m2 || this.m2Loading() || this.m2LoadError())return;
    this.m2Loading.set(true);
    new GLTFLoader().load('/models/bmw-m2-g87.glb',gltf=>{
      if(this.disposed)return;
      this.m2=new M2Car(gltf.scene,this.paintNormal!,Math.min(8,this.renderer!.capabilities.getMaxAnisotropy()));
      this.scene.add(this.m2.group);this.m2Loading.set(false);this.applyInputs();this.shadowDirty=true;this.requestRender();
    },undefined,()=>{this.m2Loading.set(false);this.m2LoadError.set(true);});
  }
  private loadE46() {
    if(this.e46 || this.e46Loading() || this.e46LoadError())return;
    this.e46Loading.set(true);
    new GLTFLoader().load('/models/bmw-e46-sedan.glb',gltf=>{
      if(this.disposed)return;
      this.e46=new E46Car(gltf.scene,this.cabinMaterials!,this.paintNormal!,Math.min(8,this.renderer!.capabilities.getMaxAnisotropy()));
      this.scene.add(this.e46.group);this.e46Loading.set(false);this.applyInputs();this.shadowDirty=true;this.requestRender();
    },undefined,()=>{this.e46Loading.set(false);this.e46LoadError.set(true);});
  }
  private requestRender = () => {
    if(this.disposed || !this.renderer || this.frame || document.hidden || !this.inViewport)return;
    if(!this.rendering){this.lastTime=0;this.frameClock.reset();this.statsStart=performance.now();this.statsFrames=0;}
    this.frame=requestAnimationFrame(this.animate);
  };
  private visibilityChanged = () => {
    if(document.hidden || !this.inViewport){cancelAnimationFrame(this.frame);this.frame=0;this.lastTime=0;}
    else this.requestRender();
  };
  private activeParts():Part[] {
    if(this.model==='e46')return this.e46?.parts??[];
    if(this.model==='m2')return this.m2?.parts??[];
    if(this.model==='e36'||this.model==='e92')return this.streetCars.get(this.model)?.parts??[];
    return this.detailedParts.length?this.detailedParts:this.parts;
  }
  private updateRepresentation(geometryMoving:boolean) {
    const source=this.model==='m4'?(this.detailedParts.length?this.detailed:this.car)
      :this.model==='e46'?this.e46?.group:this.model==='m2'?this.m2?.group:this.streetCars.get(this.model)?.group;
    if(!source)return;
    const key=this.model+(this.model==='e46'?':'+this.wheels:'');
    if(this.assembled && this.assembledKey!==key) {
      this.scene.remove(this.assembled.group);this.assembled.dispose();this.assembled=undefined;
    }
    const assembled=this.view==='exterior' && !this.exploded && !geometryMoving && !this.modelLoading() && source!==this.car;
    if(assembled && !this.assembled) {
      this.assembled=new AssembledCar(this.activeParts());this.assembledKey=key;this.scene.add(this.assembled.group);
    }
    source.visible=!assembled;
    if(this.assembled)this.assembled.group.visible=assembled;
  }
  private animate = (time:number) => {
    this.frame=0;
    if(this.disposed || document.hidden || !this.inViewport)return;
    this.rendering=true;
    // Rendering at the monitor's 144/165 Hz needlessly starves the rest of the page.
    if(!this.frameClock.take(time)){this.requestRender();this.rendering=false;return;}
    const interval=this.lastTime?time-this.lastTime:0;
    const dt=interval?Math.min(interval/1000,.05):1/60;this.lastTime=time;
    const ease=this.reducedMotion?1:1-Math.exp(-dt*5);
    let geometryMoving=false;
    for(const part of this.activeParts()) {
      this.partTarget.copy(part.origin);
      if(this.exploded && this.view!=='interior')this.partTarget.add(part.offset);
      if(part.group.position.distanceToSquared(this.partTarget)>.000001) {
        geometryMoving=true;part.group.position.lerp(this.partTarget,ease);
      } else part.group.position.copy(this.partTarget);
    }
    if(this.geometryWasMoving && !geometryMoving)this.shadowDirty=true;
    this.geometryWasMoving=geometryMoving;
    this.updateRepresentation(geometryMoving);
    if(this.renderer && (this.shadowDirty || geometryMoving && time-this.lastShadowUpdate>66)) {
      this.contactShadow?.update(this.renderer,this.scene);
      this.renderer.shadowMap.needsUpdate=true;
      this.lastShadowUpdate=time;this.shadowDirty=false;
    }
    if(this.movingCamera && this.controls) {
      this.camera.position.lerp(this.targetPosition,ease); this.controls.target.lerp(this.targetLook,ease);
      if(this.camera.position.distanceTo(this.targetPosition)<.005 && this.controls.target.distanceTo(this.targetLook)<.005) {
        this.camera.position.copy(this.targetPosition);this.controls.target.copy(this.targetLook);this.movingCamera=false;
      }
    }
    const autoRotate=!!this.controls?.autoRotate;
    if(this.controls)this.controls.autoRotate=autoRotate && !this.movingCamera;
    let controlsChanged=false;
    if(this.view==='interior' && this.controls)this.camera.lookAt(this.controls.target);
    else controlsChanged=this.controls?.update(dt)??false;
    if(this.controls)this.controls.autoRotate=autoRotate;
    const continuous=geometryMoving || this.movingCamera || controlsChanged || autoRotate || !!this.lookPointer || time<this.lookMotionUntil;
    if(continuous && this.quality.beginMotion())this.applyResolution();
    if(continuous && !this.modelLoading() && this.quality.observe(interval))this.applyResolution();
    if(!continuous && this.quality.ratio!==this.quality.maximum){this.quality.restore();this.applyResolution();}
    if(this.renderer && this.view==='interior' && (this.detailed.visible || this.e46?.group.visible || this.m2?.group.visible || this.streetCars.get(this.model)?.group.visible)) {
      if(!this.cabinRendering) {
        this.cabinRendering=new CabinRendering(this.renderer,this.scene,this.camera);
        const {clientWidth:w,clientHeight:h}=this.stage.nativeElement;
        this.cabinRendering.resize(w,h,this.renderer.getPixelRatio());
      }
      this.cabinRendering.render(dt,continuous);
    } else this.renderer?.render(this.scene,this.camera);
    if(this.showStats && this.renderer) {
      this.totalFrames++;
      this.statsFrames++;
      if(time-this.statsStart>=1500) {
        this.stats.set(`${Math.round(this.statsFrames*1000/(time-this.statsStart))} FPS · ${this.renderer.info.render.calls} llamadas · DPR ${this.renderer.getPixelRatio().toFixed(2)} · ${this.totalFrames} fotogramas`);
        this.statsFrames=0;this.statsStart=time;
      }
      if(!continuous)this.stats.set(`En reposo · ${this.renderer.info.render.calls} llamadas · DPR ${this.renderer.getPixelRatio().toFixed(2)} · ${this.totalFrames} fotogramas`);
    }
    if(continuous)this.requestRender();
    this.rendering=false;
  };
  ngOnDestroy() {
    this.disposed=true;
    this.releaseInteriorLook();
    const canvas=this.renderer?.domElement;
    canvas?.removeEventListener('pointerdown',this.beginInteriorLook);canvas?.removeEventListener('pointermove',this.dragInteriorLook);
    canvas?.removeEventListener('pointerup',this.endInteriorLook);canvas?.removeEventListener('pointercancel',this.endInteriorLook);canvas?.removeEventListener('lostpointercapture',this.endInteriorLook);
    cancelAnimationFrame(this.frame); this.observer?.disconnect();this.visibilityObserver?.disconnect();
    document.removeEventListener('visibilitychange',this.visibilityChanged);this.controls?.removeEventListener('change',this.requestRender);this.controls?.dispose();
    if(this.assembled){this.scene.remove(this.assembled.group);this.assembled.dispose();}
    const materials=new Set<T.Material>(); this.scene.traverse(o=>{ if(o instanceof T.Mesh) {o.geometry.dispose(); for(const m of (Array.isArray(o.material)?o.material:[o.material])) materials.add(m);}});
    const textures=new Set<T.Texture>();
    materials.forEach(m=>{for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);m.dispose();});
    textures.forEach(t=>t.dispose());this.cabinMaterials?.dispose();this.cabinRendering?.dispose();this.paintNormal?.dispose();this.contactShadow?.dispose();this.environment?.dispose();this.renderer?.dispose();
  }
}
