// Renders the app icons from build/icon.svg (master, with the "lz." signet)
// and build/favicon.svg (pictogram only). Below 48 px the brand icon drops the
// signet, so the small .ico sizes come from favicon.svg.
//
// Usage: `node scripts/gen-icon.mjs`
// Requires the optional `sharp` + `png-to-ico` packages:
//   npm install --no-save sharp png-to-ico
//
// Outputs:
//   build/icon.png              1024, electron-builder mac icon + window icon
//   build/icon.ico              16…256, NSIS installer (rejects PNGs)
//   public/favicon.svg          browser tab
//   public/apple-touch-icon.png 180

import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = (f) => path.join(root, 'build', f);
const pub = (f) => path.join(root, 'public', f);

const gross = await readFile(build('icon.svg'));
const klein = await readFile(build('favicon.svg'));
const png = (svg, size) => sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

await writeFile(build('icon.png'), await png(gross, 1024));
await writeFile(pub('apple-touch-icon.png'), await png(gross, 180));
await copyFile(build('favicon.svg'), pub('favicon.svg'));
const sizes = [16, 24, 32, 48, 64, 128, 256];
await writeFile(build('icon.ico'), await pngToIco(await Promise.all(sizes.map((n) => png(n < 48 ? klein : gross, n)))));
console.log('done.');
