import * as T from 'three';
import { AssembledCar } from './assembled-car';

/** Render the actual assembled model onto transparent pixels, without showroom floor or labels. */
export function createCatalogPreview(renderer:T.WebGLRenderer,studio:T.Scene,parts:ConstructorParameters<typeof AssembledCar>[0]){
  const car=new AssembledCar(parts),scene=new T.Scene();scene.environment=studio.environment;scene.environmentIntensity=studio.environmentIntensity;
  scene.add(car.group);for(const child of studio.children)if(child instanceof T.Light)scene.add(child.clone());
  const box=new T.Box3().setFromObject(car.group),center=box.getCenter(new T.Vector3());
  const camera=new T.PerspectiveCamera(30,1024/640,.025,100);
  camera.position.set(5.2,2.5,5.4).add(new T.Vector3(0,center.y-.7,0));camera.lookAt(center);
  const size=renderer.getSize(new T.Vector2()),ratio=renderer.getPixelRatio(),clear=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
  const shadows=renderer.shadowMap.enabled;
  try{
    renderer.setPixelRatio(1);renderer.setSize(1024,640,false);renderer.setClearColor(0x000000,0);renderer.shadowMap.enabled=false;
    renderer.render(scene,camera);
    const capture=document.createElement('canvas');capture.width=1024;capture.height=640;
    const ctx=capture.getContext('2d')!;ctx.drawImage(renderer.domElement,0,0);
    const pixels=ctx.getImageData(0,0,1024,640).data;
    let left=1024,right=0,top=640,bottom=0;
    for(let y=0;y<640;y++)for(let x=0;x<1024;x++)if(pixels[(y*1024+x)*4+3]>8){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<=left)throw Error('No model pixels rendered');
    const output=document.createElement('canvas');output.width=1000;output.height=540;
    const w=right-left+1,h=bottom-top+1,scale=Math.min(920/w,480/h);
    output.getContext('2d')!.drawImage(capture,left,top,w,h,(1000-w*scale)/2,(540-h*scale)/2,w*scale,h*scale);
    return output.toDataURL('image/png');
  }finally{
    renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.setClearColor(clear,alpha);renderer.shadowMap.enabled=shadows;car.dispose();
  }
}
