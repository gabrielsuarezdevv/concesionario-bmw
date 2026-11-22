import * as T from 'three';
import { createStudioEnvironment } from './studio-rendering';
import type { ViewerEnvironment } from './viewer-environment-options';
export type { ViewerEnvironment } from './viewer-environment-options';

/** Day and night lighting rigs. Reflection maps are generated once per selected environment. */
export class ViewerEnvironmentRig {
  private readonly hemisphere=new T.HemisphereLight('#ffffff','#141414',.55);
  private readonly key=new T.DirectionalLight('#ffffff',1.7);
  private readonly rim=new T.DirectionalLight('#ffffff',.8);
  private readonly stage=new T.Group();
  private readonly outdoorFloor=new T.Mesh(new T.CircleGeometry(50,96),new T.MeshStandardMaterial({color:'#c7d5df',roughness:.85,metalness:.05}));
  private readonly ring=new T.Mesh(new T.RingGeometry(3.3,3.307,128),new T.MeshBasicMaterial({color:'#3975ab',transparent:true,opacity:.1,side:T.DoubleSide,toneMapped:false}));
  private readonly nightLines=new T.Group();
  private readonly reflections=new Map<ViewerEnvironment,T.WebGLRenderTarget>();
  private readonly skies=new Map<ViewerEnvironment,T.DataTexture>();
  private applied='';

  constructor(private readonly scene:T.Scene,private readonly renderer:T.WebGLRenderer,
    private readonly makeEnvironment:(renderer:T.WebGLRenderer,id:ViewerEnvironment)=>T.WebGLRenderTarget=createStudioEnvironment) {
    // Product rendering: preserve paint hues instead of the ACES cinematic colour transform.
    this.renderer.toneMapping=T.NeutralToneMapping;
    this.key.position.set(2,5,4);this.key.castShadow=true;
    this.key.shadow.mapSize.set(2048,2048);
    Object.assign(this.key.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:15});
    this.key.shadow.bias=-.0002;this.key.shadow.normalBias=.008;this.key.shadow.camera.updateProjectionMatrix();
    this.rim.position.set(-4,3,-3);
    for(const [mesh,y] of [[this.outdoorFloor,0],[this.ring,.025]] as const){mesh.rotation.x=-Math.PI/2;mesh.position.y=y;}
    this.outdoorFloor.receiveShadow=true;
    const lineMaterial=new T.MeshBasicMaterial({color:'#168cdb',transparent:true,opacity:.65,toneMapped:false});
    const lineGeometry=new T.PlaneGeometry(.035,12);
    for(const x of [-4.4,4.4]){
      const line=new T.Mesh(lineGeometry,lineMaterial);line.rotation.x=-Math.PI/2;line.position.set(x,.018,0);this.nightLines.add(line);
    }
    this.stage.add(this.outdoorFloor,this.ring,this.nightLines);
    this.scene.add(this.hemisphere,this.key,this.rim,this.stage);
  }

  apply(id:ViewerEnvironment,interior:boolean) {
    const key=id+':'+interior;if(this.applied===key)return false;
    this.applied=key;
    let environment=this.reflections.get(id);
    if(!environment){environment=this.makeEnvironment(this.renderer,id);this.reflections.set(id,environment);}
    this.scene.environment=environment.texture;
    this.nightLines.visible=id==='night';
    if(id==='day') {
      this.scene.background=this.sky(id);this.scene.fog=new T.Fog('#d8e5ed',18,60);
      this.scene.environmentIntensity=interior?1.05:.85;this.renderer.toneMappingExposure=1;
      this.hemisphere.color.set('#ffffff');this.hemisphere.groundColor.set('#8e8e8e');this.hemisphere.intensity=.75;
      this.key.color.set('#ffffff');this.key.intensity=1.8;this.key.position.set(-3,6,4);
      this.rim.color.set('#ffffff');this.rim.intensity=.4;
      this.outdoorFloor.material.color.set('#c9d6df');this.outdoorFloor.material.roughness=.88;
      this.ring.material.color.set('#7097af');this.ring.material.opacity=.16;
    } else {
      this.scene.background=this.sky(id);this.scene.fog=new T.Fog('#0b1524',13,45);
      this.scene.environmentIntensity=interior?1.2:.82;this.renderer.toneMappingExposure=interior?1.05:.95;
      this.hemisphere.color.set('#ffffff');this.hemisphere.groundColor.set(interior?'#3a3a3a':'#171717');this.hemisphere.intensity=interior?1.05:.38;
      this.key.color.set('#ffffff');this.key.intensity=interior?1.6:1.3;this.key.position.set(2,5,4);
      this.rim.color.set('#ffffff');this.rim.intensity=.9;
      this.outdoorFloor.material.color.set('#111d30');this.outdoorFloor.material.roughness=.72;
      this.ring.material.color.set('#168cdb');this.ring.material.opacity=.7;
    }
    this.key.updateMatrixWorld();
    return true;
  }

  private sky(id:ViewerEnvironment) {
    const cached=this.skies.get(id);if(cached)return cached;
    const colors=id==='day'?['#e8eef2','#c5dff2','#7bb3e0']:['#182c45','#0b1729','#030915'];
    const stops=colors.map(color=>new T.Color(color)),pixels=new Uint8Array(128*4),color=new T.Color();
    for(let y=0;y<128;y++){
      const t=y/127,first=t<.5?0:1;
      color.lerpColors(stops[first],stops[first+1],t<.5?t*2:(t-.5)*2).convertLinearToSRGB();
      pixels[y*4]=Math.round(color.r*255);pixels[y*4+1]=Math.round(color.g*255);pixels[y*4+2]=Math.round(color.b*255);pixels[y*4+3]=255;
    }
    const texture=new T.DataTexture(pixels,1,128,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;
    texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearFilter;texture.needsUpdate=true;this.skies.set(id,texture);return texture;
  }

  dispose() {
    this.scene.remove(this.hemisphere,this.key,this.rim,this.stage);
    this.scene.environment=null;this.scene.background=null;this.scene.fog=null;
    this.reflections.forEach(target=>target.dispose());this.reflections.clear();
    this.skies.forEach(texture=>texture.dispose());this.skies.clear();
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
    this.stage.traverse(object=>{if(object instanceof T.Mesh){geometries.add(object.geometry);materials.add(object.material);}});
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());this.stage.clear();
    this.key.shadow.dispose();
  }
}
