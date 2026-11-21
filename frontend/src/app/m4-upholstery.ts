import * as T from 'three';
import { addUpholsteryPanelMask, PanelBounds as Bounds } from './upholstery-panels';
/** The M4 export combines upholstery, steering and trim under the same material names. */
function isSeatPanel(bounds: Bounds) {
  const {minX,minY,minZ,maxX,maxY,maxZ}=bounds;
  // Classify the entire connected panel, never clip its fragments at these boundaries.
  const withinCabin=minX>=-1.5 && maxX<=.4 && minY>=.39 && maxY<=1.32 && minZ>=-.69 && maxZ<=.69;
  const rearBench=maxX<=-.45;
  const frontSeat=(minZ>=.1 || maxZ<=-.1) && (maxX<=.05 || maxY<=.66);
  return withinCabin && (rearBench || frontSeat);
}


export function addM4UpholsteryMask(geometry:T.BufferGeometry,materialName:string){
  if(!/interior23|black16/i.test(materialName))return addUpholsteryPanelMask(geometry,isSeatPanel);
  const mask=new Uint8Array(geometry.getAttribute('position').count);if(/interior23/i.test(materialName))mask.fill(255);
  geometry.setAttribute('cabinUpholsteryMask',new T.Uint8BufferAttribute(mask,1,true));return geometry;
}
