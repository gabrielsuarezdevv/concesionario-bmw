export interface TechnicalSpecification {
  reference: string;
  generation: string;
  engine: string;
  displacement: string;
  torque: string;
  transmission: string;
  body: string;
  topSpeed: string;
  sources: {name:string; url:string}[];
}

// Factory reference versions, not measured specifications of the customized 3D assets.
export const TECHNICAL_SPECIFICATIONS: Readonly<Record<string,TechnicalSpecification>> = {
  m4: {
    reference:'M4 Competition M xDrive Coupé · 2024', generation:'G82',
    engine:'6 en línea · biturbo', displacement:'2.993 cm³', torque:'650 Nm',
    transmission:'Automático · 8 marchas', body:'Coupé · 2 puertas', topSpeed:'250 km/h',
    sources:[{name:'BMW España',url:'https://www.bmw.es/content/bmw/marketES/bmw_es/es/all-models/m-series/m4-series/m4-series-coupe-2024-g82-technical-data.html'}]
  },
  e46: {
    reference:'330i Berlina · 2000 · Manual', generation:'E46',
    engine:'6 en línea · atmosférico', displacement:'2.979 cm³', torque:'300 Nm',
    transmission:'Manual · 5 marchas', body:'Berlina · 4 puertas', topSpeed:'250 km/h',
    sources:[
      {name:'BMW Classic',url:'https://www.bmwgroup-classic.com/en/models/bmw-classics/product-description-page.ad-867-1.bmw-330i-e46.content.html'},
      {name:'BMW Press',url:'https://www.press.bmwgroup.com/switzerland/article/detail/T0032511DE/neue-bmw-modelle?language=de'}
    ]
  },
  m2: {
    reference:'M2 Coupé · 2023 · M Steptronic', generation:'G87',
    engine:'6 en línea · biturbo', displacement:'2.993 cm³', torque:'550 Nm',
    transmission:'Automático · 8 marchas', body:'Coupé · 2 puertas', topSpeed:'250 km/h',
    sources:[{name:'BMW · Ficha 2023',url:'https://www.bmw.com.mx/content/dam/bmw/marketMX/bmw_com_mx/Descargas/fichas-tecnicas-2024/enero/Ficha%20T%C3%A9cnica%20BMW%20M2%20Coup%C3%A9%202023%20V2.pdf.asset.1677172073918.pdf'}]
  },
  e92: {
    reference:'M3 Coupé · 2007 · Manual', generation:'E92',
    engine:'V8 · atmosférico', displacement:'3.999 cm³', torque:'400 Nm',
    transmission:'Manual · 6 marchas', body:'Coupé · 2 puertas', topSpeed:'250 km/h',
    sources:[{name:'BMW · Presentación 2007',url:'https://newsroom.bmwgroup.com/global/the-new-bmw-m3'}]
  },
  x6: {
    reference:'X6 xDrive40i · 2020 · Steptronic', generation:'G06',
    engine:'6 en línea · turbo', displacement:'2.998 cm³', torque:'450 Nm',
    transmission:'Automático · 8 marchas', body:'SUV coupé · 5 puertas', topSpeed:'250 km/h',
    sources:[{name:'BMW · Ficha 2020',url:'https://www.bmw.com.ar/content/dam/bmw/marketLATAM/bmw_com_ar/descargas/2020/BMW-X/G06-X6-xDrive40i-MSport-2020.07.pdf.asset.1593442341245.pdf'}]
  },
  f82: {
    reference:'M4 Coupé · 2014 · M DKG', generation:'F82',
    engine:'6 en línea · biturbo', displacement:'2.979 cm³', torque:'550 Nm',
    transmission:'Doble embrague · 7 marchas', body:'Coupé · 2 puertas', topSpeed:'250 km/h',
    sources:[{name:'BMW · Datos 2014',url:'https://www.press.bmwgroup.com/deutschland/article/detail/T0179962DE/technische-daten-der-neuen-bmw-m3-limousine-und-des-neuen-bmw-m4-coup%C3%A9-gueltig-ab-03/2014'}]
  }
};
