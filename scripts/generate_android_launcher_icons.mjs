import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(projectRoot, 'assets');
const markSvg = await readFile(path.join(assetsDir, 'launcher-mark.svg'), 'utf8');
const backgroundColor = '#F2F8FB';
const iconSize = 1024;

const markBuffer = await sharp(Buffer.from(markSvg)).png().toBuffer();
const backgroundBuffer = await sharp({
  create: {
    width: iconSize,
    height: iconSize,
    channels: 4,
    background: backgroundColor
  }
}).png().toBuffer();

const legacyMarkSvg = markSvg.replace(
  '<g id="mark"',
  '<g id="mark" transform="translate(512 512) scale(1.42) translate(-512 -512)"'
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
