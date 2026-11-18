export interface Option { id: string; name: string; price: number; hex?: string }
export interface Car { id: string; name: string; subtitle: string; price: number; power: string; acceleration: string; drive: string }
export interface Catalog { models: Car[]; paints: Option[]; wheels: Option[]; interiors: Option[] }
// Illustrative concept data, shared with the server's catalog contract.
export const DEMO_CATALOG: Catalog = {
  models: [
    { id: 'm4', name: 'M4 Competition', subtitle: 'La expresión del carácter.', price: 124500, power: '530', acceleration: '3,5', drive: 'M xDrive' },
    { id: 'm2', name: 'M2 Coupé', subtitle: 'Instinto en estado puro.', price: 94700, power: '480', acceleration: '4,0', drive: 'Propulsión' },
    { id: 'i4', name: 'i4 M50', subtitle: 'La energía de una nueva era.', price: 81900, power: '544', acceleration: '3,9', drive: 'Eléctrico' }
  ],
  paints: [ { id: 'blue', name: 'Portimao Blue', hex: '#2868b2', price: 0 }, { id: 'grey', name: 'Brooklyn Grey', hex: '#a2a8a6', price: 1100 }, { id: 'black', name: 'Sapphire Black', hex: '#202326', price: 1100 }, { id: 'green', name: 'Isle of Man Green', hex: '#276b5c', price: 1900 }, { id: 'white', name: 'Alpine White', hex: '#e8e8de', price: 0 } ],
  wheels: [ { id: 'sport', name: 'M · Acabado Plata', price: 0 }, { id: 'forged', name: 'M · Acabado Jet Black', price: 2400 } ],
  interiors: [ { id: 'black', name: 'Merino · Negro', hex: '#252827', price: 0 }, { id: 'cognac', name: 'Merino · Tartufo', hex: '#9a5730', price: 1800 }, { id: 'ivory', name: 'Merino · Silverstone', hex: '#c9c5b5', price: 2200 } ]
};
