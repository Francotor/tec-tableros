// Genera los iconos de la PWA a partir del logo de TEC (único elemento de marca permitido).
// Uso: node scripts/iconos.mjs
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const FONDO = '#FFFFFF'; // el logo lleva letras oscuras: necesita fondo claro
const logo = 'public/logo_tec.png';
mkdirSync('public/icons', { recursive: true });

async function icono(tam, archivo, margen) {
  const interior = Math.round(tam * (1 - 2 * margen));
  const centro = await sharp(logo)
    .resize({ width: interior, height: interior, fit: 'inside' })
    .toBuffer();
  await sharp({ create: { width: tam, height: tam, channels: 4, background: FONDO } })
    .composite([{ input: centro, gravity: 'center' }])
    .png()
    .toFile(archivo);
  console.log('listo', archivo);
}

await icono(192, 'public/icons/icon-192.png', 0.1);
await icono(512, 'public/icons/icon-512.png', 0.1);
// Versión "maskable": el contenido queda dentro del 80 % central.
await icono(512, 'public/icons/icon-maskable-512.png', 0.2);
