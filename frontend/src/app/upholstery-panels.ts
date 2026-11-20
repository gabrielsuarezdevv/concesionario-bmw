import * as T from 'three';
export type PanelBounds={minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number};
/** Select whole connected panels without clipping upholstery at individual fragment positions. */
export function addUpholsteryPanelMask(geometry:T.BufferGeometry,select:(bounds:PanelBounds)=>boolean){
  const position=geometry.getAttribute('position'),count=position.count,mask=new Uint8Array(count);
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
  const components=new Map<number,PanelBounds>();
  for(let i=0;i<count;i++) {
    const root=find(i),x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    let bounds=components.get(root);
    if(!bounds){bounds={minX:x,minY:y,minZ:z,maxX:x,maxY:y,maxZ:z};components.set(root,bounds);}
    else {bounds.minX=Math.min(bounds.minX,x);bounds.minY=Math.min(bounds.minY,y);bounds.minZ=Math.min(bounds.minZ,z);
      bounds.maxX=Math.max(bounds.maxX,x);bounds.maxY=Math.max(bounds.maxY,y);bounds.maxZ=Math.max(bounds.maxZ,z);}
  }
  const selected=new Map([...components].map(([root,bounds])=>[root,select(bounds)]));
  for(let i=0;i<count;i++)if(selected.get(find(i)))mask[i]=255;

  geometry.setAttribute('cabinUpholsteryMask',new T.Uint8BufferAttribute(mask,1,true));return geometry;
}
/** The 1M atlas also covers the dashboard, doors and steering wheel. */
export function is1MSeatPanel(b:PanelBounds){
  if(b.minY<.35||b.maxY>1.22||b.minZ<-.65||b.maxZ>.65)return false;
  return b.maxX<-.45||(b.minX>-.6&&b.maxX<=.3&&(b.minZ>=.08||b.maxZ<=-.08));
}
