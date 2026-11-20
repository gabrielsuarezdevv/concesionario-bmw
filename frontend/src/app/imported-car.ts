import * as T from 'three';
import { batchCarParts } from './batch-car-parts';

export type ImportedModel = 'x6' | 'f82';
export const IMPORTED_MODELS:Record<ImportedModel,{file:string;length:number;eye:[number,number,number];look:[number,number,number]}>={
  x6:{file:'bmw-x6.glb',length:4.935,eye:[.12,1.36,-.4],look:[1.1,1.08,-.12]},
  f82:{file:'bmw-f82.glb',length:4.671,eye:[.02,1.07,-.37],look:[1,.83,-.12]}
};
export function isImportedModel(id:string):id is ImportedModel{return id in IMPORTED_MODELS;}
type Part={group:T.Group;origin:T.Vector3;offset:T.Vector3;kind:string};

/** Each imported vehicle keeps its complete body and its own cabin in one coordinate system. */
export class ImportedCar {
  readonly group=new T.Group();
  readonly parts:Part[]=[];
  private paints:T.MeshStandardMaterial[]=[];
  private rims:T.MeshStandardMaterial[]=[];
  private upholstery:T.MeshStandardMaterial[]=[];

  constructor(source:T.Group,id:ImportedModel,paintNormal:T.Texture,anisotropy:number){
    source.rotation.y+=Math.PI/2;source.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(source,true),center=bounds.getCenter(new T.Vector3());
    const scale=IMPORTED_MODELS[id].length/bounds.getSize(new T.Vector3()).x;
    const normalize=new T.Matrix4().makeScale(scale,scale,scale).multiply(new T.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z));
    const cache=new Map<string,T.MeshStandardMaterial>();
    source.traverseVisible(node=>{
      if(!(node instanceof T.Mesh))return;
      const ancestors:string[]=[];for(let parent:T.Object3D|null=node;parent;parent=parent.parent)ancestors.push(parent.name);
      const assembly=ancestors.join('/');
      const wheelAssembly=/WHEEL_[RL][FR]|ARm4_vt_wheel/.test(assembly);
      const originals=(Array.isArray(node.material)?node.material:[node.material]) as T.MeshStandardMaterial[];
      const wheelMaterial=(name:string)=>id==='x6'?/Koleso_|_baked_tires/.test(name)
        :name==='Scene_-_Root.002';
      const wheel=wheelAssembly||originals.some(m=>wheelMaterial(m.name));
      const seatMesh=/seat/i.test(assembly);
      const materials=originals.map(original=>{
        const key=original.uuid+':'+wheel+':'+seatMesh;
        if(cache.has(key))return cache.get(key)!;
        const name=original.name;
        const rim=wheel&&(id==='x6'?name==='Koleso_mat_2':name==='ARm4_main');
        const paint=!wheel&&/^(CarPaint|ARm4_main)$/.test(name);
        const glass=id==='x6'?/^(Windows_glass|Panarama_glass)$/.test(name)
          :/^ARm4_glass(?:_tinted)?$/.test(name);
        const upholstery=id==='x6'?/_baked_(?:front_seats|baked_back_seats)/.test(name)
          :/^ARm4_(color_interior|INTER_tcz)$/.test(name)||(seatMesh&&name==='ARm4_alcnt');
        let material=original.clone();
        if(paint){
          material=new T.MeshPhysicalMaterial({name,color:'#2868b2',metalness:.5,roughness:.3,clearcoat:1,
            clearcoatRoughness:.18,normalMap:paintNormal,normalScale:new T.Vector2(.018,.018)});
          this.paints.push(material);
        }else if(glass){
          material=new T.MeshPhysicalMaterial({name,color:'#bacbd7',metalness:0,roughness:.06,
            transparent:true,opacity:.2,depthWrite:false,side:T.DoubleSide,envMapIntensity:.2,specularIntensity:.25});
          material.userData['glazing']=true;
        }else if(rim){
          material.map=null;material.transparent=false;material.opacity=1;material.metalness=.8;material.roughness=.28;this.rims.push(material);
        }else if(upholstery){
          material.color.set('#ffffff');material.metalness=0;material.roughness=.82;
          if(material.map){
            material.onBeforeCompile=shader=>{
              shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',
                '#include <map_fragment>\n#ifdef USE_MAP\nfloat grain = clamp(dot(sampledDiffuseColor.rgb, vec3(.2126,.7152,.0722)) * 8.0, .5, 1.2);\n'+
                'diffuseColor.rgb = diffuse * grain;'+'\n#endif');
            };material.customProgramCacheKey=()=> 'imported-seat-panels-v2-'+id;
          }
          this.upholstery.push(material);
        }else{
          // FBX's shininess is not a metalness value. Preserve cabin atlases as dielectric surfaces.
          if(/INT_|interior|baked_|plastic|rubber|cloth|leather|Stoffa|Gomma|Velluto/i.test(name)){
            material.metalness=0;material.roughness=Math.max(.55,material.roughness);
          }
          if(/TIRE|tyre|Battistrada|baked_tires|Scene_-_Root/.test(name)){material.metalness=0;material.roughness=.9;}
          if(/chrome|metal|cromato/i.test(name)){material.metalness=.75;material.roughness=Math.max(.18,material.roughness);}
          if(/gauge_emissive|INT_Display|ARm4_INT_Decals/.test(name)&&material.map){material.emissiveMap=material.map;material.emissive.set('#ffffff');material.emissiveIntensity=.12;}
        }
        // These FBX/DDS alpha channels encode gloss, not holes in leather or dashboard panels.
        const opaqueCabin=id==='x6'&&/^_baked_/.test(name);
        if(opaqueCabin){material.transparent=false;material.opacity=1;material.alphaTest=0;material.depthWrite=true;}
        for(const value of Object.values(material))if(value instanceof T.Texture)value.anisotropy=anisotropy;
        cache.set(key,material);return material;
      });
      const geometry=node.geometry.clone();
      for(const name of ['position','normal','tangent']){
        const attr=geometry.getAttribute(name);if(!attr||attr.array instanceof Float32Array)continue;
        const values=new Float32Array(attr.count*attr.itemSize);
        for(let i=0;i<attr.count;i++)for(let k=0;k<attr.itemSize;k++)values[i*attr.itemSize+k]=attr.getComponent(i,k);
        geometry.setAttribute(name,new T.Float32BufferAttribute(values,attr.itemSize));
      }
      geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(normalize,node.matrixWorld));
      const box=new T.Box3().setFromBufferAttribute(geometry.getAttribute('position') as T.BufferAttribute),middle=box.getCenter(new T.Vector3());
      const glass=materials.some(m=>m.userData['glazing']);
      const paint=materials.some(m=>this.paints.includes(m));
      const interior=materials.some(m=>this.upholstery.includes(m))||/cockpit|interior|seat|Torpeda|steering|baked_dveri/i.test(assembly);
      const kind=wheel?'wheels':interior?'interior':glass?'glass':paint?'paint':'structure';
      const add=(g:T.BufferGeometry,offset:T.Vector3)=>{
        const group=new T.Group(),visual=new T.Mesh(g,Array.isArray(node.material)?materials:materials[0]);
        visual.castShadow=!glass;visual.receiveShadow=true;visual.layers.enable(1);
        if(!glass&&!materials.some(m=>m.transparent))visual.layers.enable(2);
        group.add(visual);this.group.add(group);this.parts.push({group,origin:new T.Vector3(),offset,kind});
      };
      if(wheel){
        // Split exports that combine multiple wheels, never cut a triangle or drop UVs.
        const flat=geometry.index?geometry.toNonIndexed():geometry,pos=flat.getAttribute('position'),buckets:number[][]=[[],[],[],[]];
        for(let i=0;i<pos.count;i+=3){const x=pos.getX(i)+pos.getX(i+1)+pos.getX(i+2),z=pos.getZ(i)+pos.getZ(i+1)+pos.getZ(i+2);buckets[(x>0?2:0)+(z>0?1:0)].push(i,i+1,i+2);}
        buckets.forEach((indices,b)=>{
          if(!indices.length)return;const split=new T.BufferGeometry();
          for(const name of Object.keys(flat.attributes)){
            const attr=flat.getAttribute(name),values=new Float32Array(indices.length*attr.itemSize);
            indices.forEach((i,j)=>{for(let k=0;k<attr.itemSize;k++)values[j*attr.itemSize+k]=attr.getComponent(i,k);});
            split.setAttribute(name,new T.Float32BufferAttribute(values,attr.itemSize));
          }add(split,new T.Vector3(0,0,b%2?.85:-.85));
        });if(flat!==geometry)flat.dispose();geometry.dispose();
      }else add(geometry,/door/i.test(assembly)?new T.Vector3(0,.1,Math.sign(middle.z)*1.05)
        :glass?new T.Vector3(0,1.35,0):paint?new T.Vector3(0,1,0):interior?new T.Vector3(0,.5,0):new T.Vector3());
    });
    batchCarParts(this.group,this.parts);
    source.traverse(node=>{if(node instanceof T.Mesh){node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])m.dispose();}});
  }
  update(paint:string,wheels:string,interior:string,exploded:boolean,activePart:string){
    for(const m of this.paints)m.color.set(paint);
    for(const m of this.rims)m.color.set(wheels==='forged'?'#414954':'#bdc5cd');
    for(const m of this.upholstery)m.color.set(interior);
    for(const [kind,materials]of [['paint',this.paints],['wheels',this.rims],['interior',this.upholstery]]as const)
      for(const m of materials){m.emissive.set(exploded&&activePart===kind?'#0066b1':'#000000');m.emissiveIntensity=.12;}
  }
}
