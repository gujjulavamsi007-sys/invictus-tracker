import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(projectRoot, 'assets');
const markSvg = await readFile(path.join(assetsDir, 'launcher-mark.svg'), 'utf8');
const iconSize = 1024;

const markBuffer = await sharp(Buffer.from(markSvg)).png().toBuffer();
const { data: markPixels, info: markInfo } = await sharp(markBuffer)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let minX = markInfo.width;
let minY = markInfo.height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < markInfo.height; y += 1) {
  for (let x = 0; x < markInfo.width; x += 1) {
    const alpha = markPixels[(y * markInfo.width + x) * markInfo.channels + 3];
    if (alpha === 0) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
}
const safeZoneSize = Math.floor(iconSize * 0.66);
if (maxX < minX || maxY < minY || maxX - minX + 1 > safeZoneSize || maxY - minY + 1 > safeZoneSize) {
  throw new Error('Adaptive icon artwork must stay within Android’s centered 66% safe zone.');
}
const backgroundSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 ${iconSize} ${iconSize}">
  <defs>
    <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0877D1" />
      <stop offset="0.52" stop-color="#00A6AA" />
      <stop offset="1" stop-color="#20C65A" />
    </linearGradient>
  </defs>
  <rect width="${iconSize}" height="${iconSize}" fill="url(#brand)" />
</svg>`);
const backgroundBuffer = await sharp(backgroundSvg).png().toBuffer();

const legacyMarkSvg = markSvg.replace(
  '<g id="mark"',
  '<g id="mark" transform="translate(512 512) scale(1.1) translate(-512 -512)"'
);
const legacyMarkBuffer = await sharp(Buffer.from(legacyMarkSvg)).png().toBuffer();
const legacyIconBuffer = await sharp(backgroundBuffer)
  .composite([{ input: legacyMarkBuffer }])
  .png()
  .toBuffer();

await Promise.all([
  writeFile(path.join(assetsDir, 'icon-foreground.png'), markBuffer),
  writeFile(path.join(assetsDir, 'icon-background.png'), backgroundBuffer),
  writeFile(path.join(assetsDir, 'icon-only.png'), legacyIconBuffer)
]);

console.log('Generated transparent adaptive foreground, full-bleed background, and legacy icon sources.');

