const fs=require('node:fs');
const path=require('node:path');
const records={
  x6:{author:'Ddiaz Design (https://sketchfab.com/ddiaz-design)',title:'2020 BMW X6 xDrive40i',
    source:'https://sketchfab.com/3d-models/2020-bmw-x6-xdrive40i-43b22440191d48b888f8f267d105b422',license:'CC BY-NC-SA 4.0 — https://creativecommons.org/licenses/by-nc-sa/4.0/',
    additionalCredits:'Based on a BMW model; free_3d_car_models and Henrique Barsa, as credited by Ddiaz Design.'},
  f82:{author:'Black Snow (https://sketchfab.com/BlackSnow02)',title:'BMW M4 f82',
    source:'https://sketchfab.com/3d-models/bmw-m4-f82-8e87379f40fd40dcac0a751e22c1a188',license:'CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/'}
};
for(const [id,credits]of Object.entries(records)){
  const file=path.resolve(__dirname,'../frontend/public/models/bmw-'+id+'.glb');
  if(!fs.existsSync(file))throw Error('Missing asset '+file);
  const bytes=fs.readFileSync(file),n=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+n));
  data.asset.extras={...data.asset.extras,...credits,changes:'FBX to GLB conversion where needed; runtime normalization, paint, wheel finish and upholstery; physical glazing; illustrative assembly separation. Source geometry and textures retained.'};
  const encoded=Buffer.from(JSON.stringify(data)),json=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(json);
  const binary=bytes.subarray(20+n),output=Buffer.alloc(20+json.length+binary.length);
  output.writeUInt32LE(0x46546c67,0);output.writeUInt32LE(2,4);output.writeUInt32LE(output.length,8);
  output.writeUInt32LE(json.length,12);output.writeUInt32LE(0x4e4f534a,16);json.copy(output,20);binary.copy(output,20+json.length);
  fs.writeFileSync(file,output);console.log(id+': attribution embedded');
}
