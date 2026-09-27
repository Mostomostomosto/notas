const fs = require('fs');
const path = require('path');
const mod = require('png-to-ico');
const pngToIco = mod.default || mod;

const rootDir = path.resolve(__dirname, '..');
const srcPng = fs.existsSync(path.join(rootDir, 'def-ico.png'))
  ? path.join(rootDir, 'def-ico.png')
  : path.join(rootDir, 'ico-notas.png');

const outDir = path.join(rootDir, 'build');
const outIco = path.join(outDir, 'icon.ico');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Asegurar que public/def-ico.png y root ico-notas.png contengan def-ico.png
try {
  fs.copyFileSync(srcPng, path.join(publicDir, 'def-ico.png'));
  fs.copyFileSync(srcPng, path.join(publicDir, 'ico-notas.png'));
  fs.copyFileSync(srcPng, path.join(rootDir, 'ico-notas.png'));
  if (fs.existsSync(distDir)) {
    fs.copyFileSync(srcPng, path.join(distDir, 'def-ico.png'));
    fs.copyFileSync(srcPng, path.join(distDir, 'ico-notas.png'));
  }
} catch (e) {
  console.warn('Advertencia al copiar archivos png:', e.message);
}

// 2. Generar build/icon.ico y public/favicon.ico
pngToIco(srcPng)
  .then((buf) => {
    fs.writeFileSync(outIco, buf);
    console.log('Icon.ico generated successfully at:', outIco);

    // Escribir favicon.ico en public y dist
    const publicFavicon = path.join(publicDir, 'favicon.ico');
    fs.writeFileSync(publicFavicon, buf);
    console.log('favicon.ico generated at:', publicFavicon);

    if (fs.existsSync(distDir)) {
      const distFavicon = path.join(distDir, 'favicon.ico');
      fs.writeFileSync(distFavicon, buf);
      console.log('favicon.ico generated at:', distFavicon);
    }
  })
  .catch((err) => {
    console.error('Error generating icon:', err);
    process.exit(1);
  });
