// Development-only: NODE_PATH may point to an existing sharp installation.
const sharp = require('sharp');
const fs = require('node:fs');
(async () => {
 const sizes=[16,24,32,48,64,128,256];
 const images=await Promise.all(sizes.map(n=>sharp('ui/public/wiffer.svg').resize(n,n).png().toBuffer()));
 const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
 let offset=header.length;
 images.forEach((data,i)=>{const p=6+i*16;header[p]=header[p+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(data.length,p+8);header.writeUInt32LE(offset,p+12);offset+=data.length;});
 fs.writeFileSync('ui/public/wiffer.ico',Buffer.concat([header,...images]));
 await sharp('ui/public/wiffer.svg').resize(512,512).png().toFile('ui/public/wiffer.png');
})();
