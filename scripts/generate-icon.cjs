const fs = require('fs');
const path = require('path');
const mod = require('png-to-ico');
const pngToIco = mod.default || mod;

const rootDir = path.resolve(__dirname, '..');
const srcPng = path.join(rootDir, 'ico-notas.png');
const outDir = path.join(rootDir, 'build');
const outIco = path.join(outDir, 'icon.ico');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

pngToIco(srcPng)
  .then((buf) => {
    fs.writeFileSync(outIco, buf);
    console.log('Icon.ico generated successfully at:', outIco);
  })
  .catch((err) => {
    console.error('Error generating icon:', err);
    process.exit(1);
  });
