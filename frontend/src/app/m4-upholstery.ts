import * as T from 'three';

type Bounds = { minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number };

/** The M4 export combines upholstery, steering and trim under the same material names. */
function isSeatPanel(bounds: Bounds) {
  const {minX,minY,minZ,maxX,maxY,maxZ}=bounds;
  // Classify the entire connected panel, never clip its fragments at these boundaries.
  const withinCabin=minX>=-1.5 && maxX<=.4 && minY>=.39 && maxY<=1.32 && minZ>=-.69 && maxZ<=.69;
  const rearBench=maxX<=-.45;
  const frontSeat=(minZ>=.1 || maxZ<=-.1) && (maxX<=.05 || maxY<=.66);
  return withinCabin && (rearBench || frontSeat);
}

/** Bake a constant 0/1 mask per connected panel once, before UV seams are expanded. */
export function addM4UpholsteryMask(geometry: T.BufferGeometry, materialName: string) {
  const position=geometry.getAttribute('position');
  const count=position.count;
  const mask=new Uint8Array(count);
  if(materialName.toLowerCase().includes('interior23')) {
    // This material is dedicated to the seat inserts and headrests in the original export.
    mask.fill(255);
  } else if(!materialName.toLowerCase().includes('black16')) {
    const parent=Int32Array.from({length:count},(_,i)=>i);
    const rank=new Uint8Array(count);
    const find=(vertex:number):number=>{
      while(parent[vertex]!==vertex){parent[vertex]=parent[parent[vertex]];vertex=parent[vertex];}
      return vertex;
    };
    const join=(a:number,b:number)=>{
      a=find(a);b=find(b);if(a===b)return;
      if(rank[a]<rank[b])parent[a]=b;
      else {parent[b]=a;if(rank[a]===rank[b])rank[a]++;}
    };
    // Weld UV/normal splits for connectivity only. Geometry, normals and UVs remain unchanged.
    const welded=new Map<string,number>();
    for(let i=0;i<count;i++) {
      const key=`${Math.round(position.getX(i)*10000)},${Math.round(position.getY(i)*10000)},${Math.round(position.getZ(i)*10000)}`;
      const existing=welded.get(key);
      if(existing===undefined)welded.set(key,i);else join(i,existing);
    }
    const index=geometry.index;
    const length=index?.count??count;
    for(let i=0;i<length;i+=3) {
      const a=index?index.getX(i):i,b=index?index.getX(i+1):i+1,c=index?index.getX(i+2):i+2;
      join(a,b);join(a,c);
    }
    const components=new Map<number,Bounds>();
    for(let i=0;i<count;i++) {
      const root=find(i),x=position.getX(i),y=position.getY(i),z=position.getZ(i);
      let bounds=components.get(root);
      if(!bounds){bounds={minX:x,minY:y,minZ:z,maxX:x,maxY:y,maxZ:z};components.set(root,bounds);}
      else {bounds.minX=Math.min(bounds.minX,x);bounds.minY=Math.min(bounds.minY,y);bounds.minZ=Math.min(bounds.minZ,z);
        bounds.maxX=Math.max(bounds.maxX,x);bounds.maxY=Math.max(bounds.maxY,y);bounds.maxZ=Math.max(bounds.maxZ,z);}
    }
    const selected=new Map([...components].map(([root,bounds])=>[root,isSeatPanel(bounds)]));
    for(let i=0;i<count;i++)if(selected.get(find(i)))mask[i]=255;
  }
  geometry.setAttribute('cabinUpholsteryMask',new T.Uint8BufferAttribute(mask,1,true));
  return geometry;
}
