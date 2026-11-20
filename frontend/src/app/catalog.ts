export interface Option { id: string; name: string; price: number; hex?: string }
export interface Car { id: string; name: string; subtitle: string; price: number; power: string; acceleration: string; drive: string }
export interface Catalog { models: Car[]; paints: Option[]; wheels: Option[]; interiors: Option[] }
// Illustrative concept data, shared with the server's catalog contract.
export const DEMO_CATALOG: Catalog = {
  models: [
    { id: 'm4', name: 'M4 Competition', subtitle: 'La expresión del carácter.', price: 124500, power: '530', acceleration: '3,5', drive: 'M xDrive' },
    { id: 'e46', name: '330i E46', subtitle: 'El carácter de un clásico.', price: 35000, power: '231', acceleration: '6,5', drive: 'Trasera' },
    { id: 'm2', name: 'M2 G87', subtitle: 'Toda la esencia M. Sin filtros.', price: 96900, power: '460', acceleration: '4,1', drive: 'Trasera' },
    { id: 'e92', name: 'M3 E92', subtitle: 'El pulso de otra generación.', price: 58000, power: '420', acceleration: '4,8', drive: 'Trasera' }
  ],
  paints: [
    { id: 'blue', name: 'Portimao Blue', hex: '#2868b2', price: 0 },
    { id: 'grey', name: 'Brooklyn Grey', hex: '#a2a8a6', price: 1100 },
    { id: 'black', name: 'Sapphire Black', hex: '#202326', price: 1100 },
    { id: 'green', name: 'Isle of Man Green', hex: '#276b5c', price: 1900 },
    { id: 'white', name: 'Alpine White', hex: '#e8e8de', price: 0 },
    { id: 'red', name: 'Rojo Rubí', hex: '#b51f32', price: 1900 },
    { id: 'orange', name: 'Naranja Cobre', hex: '#d26628', price: 1100 },
    { id: 'yellow', name: 'Amarillo Solar', hex: '#e0bd35', price: 1900 },
    { id: 'purple', name: 'Violeta Amatista', hex: '#684091', price: 1900 },
    { id: 'iceblue', name: 'Azul Hielo', hex: '#8bbbd2', price: 1100 },
    { id: 'midnight', name: 'Azul Medianoche', hex: '#182f59', price: 1900 },
    { id: 'silver', name: 'Plata Titanio', hex: '#bfc4cb', price: 1100 }
  ],
  wheels: [ { id: 'sport', name: 'M · Acabado Plata', price: 0 }, { id: 'forged', name: 'M · Acabado Jet Black', price: 2400 } ],
  interiors: [
    { id: 'black', name: 'Merino · Negro', hex: '#252827', price: 0 },
    { id: 'cognac', name: 'Merino · Tartufo', hex: '#9a5730', price: 1800 },
    { id: 'ivory', name: 'Merino · Silverstone', hex: '#c9c5b5', price: 2200 },
    { id: 'burgundy', name: 'Merino · Burdeos', hex: '#8b3046', price: 2200 },
    { id: 'navy', name: 'Merino · Azul Noche', hex: '#315a82', price: 2200 }
  ]
};
