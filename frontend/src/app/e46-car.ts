import * as T from 'three';
import { CabinMaterials } from './cabin-materials';

type Part = { group: T.Group; origin: T.Vector3; offset: T.Vector3; kind: string };

/** Adapter for Dave Love SketchFab's CC BY 2001 M3 GTR, independently of the M4 asset. */
export class E46Car {
  readonly group = new T.Group();
  readonly parts: Part[] = [];
  readonly paints: T.MeshStandardMaterial[] = [];
  readonly rims: T.MeshStandardMaterial[] = [];
  readonly seats: T.MeshStandardMaterial[] = [];

  constructor(source: T.Group, cabin: CabinMaterials, paintNormal: T.Texture, anisotropy: number) {
    // The source includes several levels of detail at the same coordinates. Keep the best per assembly.
    const lodPattern = /^(BASE|KIT00_[A-Z_]+)_([A-E])(?:\.\d+)?_\d+_\d+$/;
    const best = new Map<string, string>();
    source.traverse(node => {
      const match = node.name.match(lodPattern);
      if (match && match[2] > (best.get(match[1]) ?? '')) best.set(match[1], match[2]);
    });
    source.traverse(node => {
      const match = node.name.match(lodPattern);
      if (match && match[2] !== best.get(match[1])) node.visible = false;
    });
    source.updateMatrixWorld(true);
    const meshes: T.Mesh[] = [];
    source.traverseVisible(node => { if (node instanceof T.Mesh) meshes.push(node); });
    const materialOf = (mesh: T.Mesh) => (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as T.MeshStandardMaterial;
    const boundsOf = () => {
      const bounds = new T.Box3();
      for (const mesh of meshes) {
        mesh.geometry.computeBoundingBox();
        bounds.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
      }
      return bounds;
    };
    let bounds = boundsOf();
    const tail = meshes.find(mesh => materialOf(mesh).name.includes('BRAKELIGHT_BRAKELIGHT'));
    const rear = tail ? new T.Box3().setFromObject(tail).getCenter(new T.Vector3()) : bounds.min.clone();
    const centre = bounds.getCenter(new T.Vector3());
    const size = bounds.getSize(new T.Vector3());
    // Front always points +X in our viewer, regardless of the author's axes.
    source.rotation.y += size.z > size.x ? (rear.z < centre.z ? Math.PI / 2 : -Math.PI / 2) : (rear.x > centre.x ? Math.PI : 0);
    source.updateMatrixWorld(true);
    bounds = boundsOf();
    const factor = 4.61 / bounds.getSize(new T.Vector3()).x;
    const center = bounds.getCenter(new T.Vector3());
    const normalize = new T.Matrix4().makeScale(factor, factor, factor)
      .multiply(new T.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const cache = new Map<T.Material, T.MeshStandardMaterial>();

    for (const mesh of meshes) {
      const original = materialOf(mesh);
      const name = original.name.toUpperCase();
      let geometry = mesh.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(normalize, mesh.matrixWorld));
      let material = cache.get(original);
      if (!material) {
        material = original.clone();
        if (name === 'CARSKIN_LOGO' || name === 'ALUMINUM_SKIN3') {
          material = new T.MeshPhysicalMaterial({ color: '#2868b2', metalness: .65, roughness: .28,
            clearcoat: 1, clearcoatRoughness: .13, normalMap: paintNormal, normalScale: new T.Vector2(.018, .018) });
          this.paints.push(material);
        } else if (name.endsWith('_RIM')) {
          material = new T.MeshPhysicalMaterial({ color: '#e2e6eb', map: original.map,
            metalness: .85, roughness: .3, clearcoat: .35, clearcoatRoughness: .3 });
          this.rims.push(material);
        } else if (name.startsWith('WINDSHIELD')) {
          material = new T.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: .035,
            transmission: 1, thickness: .008, ior: 1.5, side: T.DoubleSide, envMapIntensity: .5 });
        } else if (name === 'INTERIOR_INTERIOR') {
          material = cabin.leather('#ffffff');
          material.map = original.map;
          this.seats.push(material);
        } else if (name.startsWith('RUBBER')) {
          material.color.set('#929292'); material.metalness = 0; material.roughness = .95;
          material.bumpMap = original.map; material.bumpScale = .0015;
        } else if (name.startsWith('HEADLIGHTGLASS')) {
          material = new T.MeshPhysicalMaterial({ color: name.endsWith('NEON') ? '#a81920' : '#d9e2ed',
            metalness: 0, roughness: .08, transparent: true, opacity: name.endsWith('NEON') ? .55 : .22,
            depthWrite: false, side: T.DoubleSide });
        } else if (name.startsWith('CALIPER_SKIN')) {
          material.color.set('#0066b1'); material.metalness = .45; material.roughness = .4;
        } else if (name.startsWith('BRAKEDISC') || name.startsWith('CHROME') || name.startsWith('ALUMINUM')) {
          material.color.set('#979ea5'); material.metalness = .8; material.roughness = .35;
        } else if (name.startsWith('BRAKELIGHT_')) {
          material.metalness = 0; material.roughness = .4;
        } else {
          material.metalness = 0; material.roughness = Math.max(.6, material.roughness);
          if (name.startsWith('GRILL') || name.startsWith('DULLPLASTIC')) {
            material.color.set('#181b20'); material.transparent = false; material.opacity = 1;
          }
        }
        for (const texture of [material.map, material.normalMap, material.roughnessMap, material.bumpMap]) {
          if (texture) texture.anisotropy = anisotropy;
        }
        cache.set(original, material);
      }
      if (name === 'INTERIOR_INTERIOR') geometry = cabin.addDetailUVs(geometry);
      const bounds = new T.Box3().setFromBufferAttribute(geometry.getAttribute('position') as T.BufferAttribute);
      const center = bounds.getCenter(new T.Vector3());
      let ancestor = mesh.parent;
      let assembly = mesh.name;
      while (ancestor && ancestor !== source) { assembly += ' ' + ancestor.name; ancestor = ancestor.parent; }
      const wheel = /KIT00_FRONT_(TIRE|BRAKE)_/.test(assembly);
      const glass = name.startsWith('WINDSHIELD') || name.startsWith('WINDOWMASK');
      const paint = this.paints.includes(material) || (name === 'DECAL_BADGING' && !wheel);
      const kind = wheel ? 'wheels' : glass ? 'glass' : paint ? 'paint' : name === 'INTERIOR_INTERIOR' || /KIT00_INTERIOR/.test(assembly) ? 'interior' : 'structure';
      const offset = wheel ? new T.Vector3(center.x > 0 ? .2 : -.2, 0, center.z > 0 ? .9 : -.9)
        : glass ? new T.Vector3(0, 1.4, 0) : paint ? new T.Vector3(0, 1.1, 0)
        : kind === 'interior' ? new T.Vector3(-.15, .6, 0) : new T.Vector3();
      const part = new T.Group();
      const visual = new T.Mesh(geometry, material);
      visual.castShadow = !glass && !material.transparent;
      visual.receiveShadow = true;
      visual.layers.enable(1);
      if (!glass && !material.transparent) visual.layers.enable(2);
      part.add(visual);
      this.group.add(part);
      this.parts.push({ group: part, origin: new T.Vector3(), offset, kind });
    }
    source.traverse(node => {
      if (node instanceof T.Mesh) {
        node.geometry.dispose();
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
      }
    });
  }

  /** Adapt a more detailed E46 cabin while retaining the separate GTR exterior. */
  addCabin(source: T.Group, cabin: CabinMaterials) {
    for (const part of this.parts) if (part.kind === 'interior') part.group.visible = false;
    source.updateMatrixWorld(true);
    const materials = new Map<T.Material, T.MeshStandardMaterial>();
    source.traverse(node => {
      if (!(node instanceof T.Mesh)) return;
      const original = (Array.isArray(node.material) ? node.material[0] : node.material) as T.MeshStandardMaterial;
      const name = original.name.toLowerCase();
      let material = materials.get(original);
      let geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      if (/carpetik/.test(name)) {
        const flat=geometry.index?geometry.toNonIndexed():geometry;
        if(flat!==geometry)geometry.dispose();geometry=flat;
        const position=geometry.getAttribute('position'),indices:number[]=[];
        for(let i=0;i<position.count;i+=3)if(Math.max(position.getY(i),position.getY(i+1),position.getY(i+2))<.72)indices.push(i,i+1,i+2);
        geometry.setIndex(indices);
      }
      if (!material) {
        if (/seats_f/.test(name)) {
          material = cabin.leather('#111418', true);
          this.seats.push(material);
        } else if (/dash|panels/.test(name)) {
          material = cabin.leather('#202328');
        } else {
          material = original.clone(); material.metalness = 0; material.roughness = .75;
          material.color.set(/signal|podsvitka/.test(name) ? '#c5ced6' : /metall/.test(name) ? '#7d8791' : '#171b20');
          if (/gauges/.test(name)) material.color.set('#090c10');
          if (/metall/.test(name)) { material.metalness = .65; material.roughness = .4; }
          if (/carpet/.test(name)) material.roughness = .98;
        }
        materials.set(original, material);
      }
      if (/seats_f|dash|panels/.test(name)) geometry = cabin.addDetailUVs(geometry);
      const part = new T.Group();
      const mesh = new T.Mesh(geometry, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.layers.enable(1); mesh.layers.enable(2);
      part.add(mesh); this.group.add(part);
      this.parts.push({group:part,origin:new T.Vector3(),offset:new T.Vector3(-.15,.6,0),kind:'interior'});
    });
    source.traverse(node => {if(node instanceof T.Mesh){node.geometry.dispose();for(const material of Array.isArray(node.material)?node.material:[node.material])material.dispose();}});
    const instruments = new T.Group();
    const badgeTexture=new T.TextureLoader().load('/brand/bmw-logo.svg');badgeTexture.colorSpace=T.SRGBColorSpace;
    const badge=new T.Mesh(new T.CircleGeometry(.022,32),new T.MeshStandardMaterial({map:badgeTexture,roughness:.4,metalness:.15}));
    badge.rotation.y=-Math.PI/2;badge.position.set(.44,.86,-.36);instruments.add(badge);
    for (const [z, radius, maximum, label] of [[-.482,.023,120,'°C'],[-.406,.044,300,'km/h'],[-.272,.044,8,'×1000'],[-.193,.023,100,'%']] as const) {
      const canvas = document.createElement('canvas'); canvas.width=canvas.height=512;
      const ctx=canvas.getContext('2d')!;
      ctx.fillStyle='#101319';ctx.fillRect(0,0,512,512);ctx.translate(256,256);
      const divisions=maximum===8?8:12;
      for(let i=0;i<=divisions*5;i++) {
        const angle=(-220+i/(divisions*5)*260)*Math.PI/180;
        const major=i%5===0;
        ctx.strokeStyle=maximum===8&&i>30?'#d8443b':'#e3e8ec';ctx.lineWidth=major?4:2;
        ctx.beginPath();ctx.moveTo(Math.cos(angle)*(major?178:190),Math.sin(angle)*(major?178:190));ctx.lineTo(Math.cos(angle)*208,Math.sin(angle)*208);ctx.stroke();
        if(major){ctx.fillStyle='#e3e8ec';ctx.font='28px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(Math.round(i/(divisions*5)*maximum)),Math.cos(angle)*146,Math.sin(angle)*146);}
      }
      ctx.fillStyle='#aab4bd';ctx.font='24px Arial';ctx.textAlign='center';ctx.fillText(label,0,85);
      ctx.strokeStyle='#e64b3e';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(12,10);ctx.lineTo(-120,100);ctx.stroke();
      ctx.fillStyle='#343a42';ctx.beginPath();ctx.arc(0,0,17,0,Math.PI*2);ctx.fill();
      const texture = new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
      const dial=new T.Mesh(new T.CircleGeometry(radius,48),new T.MeshBasicMaterial({map:texture,toneMapped:false}));
      dial.rotation.y=-Math.PI/2;dial.position.set(.681,.935,z);instruments.add(dial);
    }
    this.group.add(instruments);
    this.parts.push({group:instruments,origin:new T.Vector3(),offset:new T.Vector3(-.15,.6,0),kind:'interior'});
  }

  update(paint: string, wheels: string, exploded: boolean, activePart: string) {
    for (const material of this.paints) {
      material.color.set(paint);
      material.metalness = paint === '#e8e8de' ? .08 : paint === '#a2a8a6' ? .24 : .65;
      material.roughness = paint === '#e8e8de' ? .32 : .28;
    }
    for (const material of this.rims) {
      material.color.set(wheels === 'forged' ? '#505965' : '#e2e6eb');
      material.metalness = wheels === 'forged' ? .85 : .65;
    }
    for (const [kind, materials] of [['paint', this.paints], ['wheels', this.rims], ['interior', this.seats]] as const) {
      for (const material of materials) {
        material.emissive.set(exploded && activePart === kind ? '#0066b1' : '#000000');
        material.emissiveIntensity = .12;
      }
    }
  }
}
