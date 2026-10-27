import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const legacyIconSource = path.join(projectRoot, 'assets', 'icon-only.png');
const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
const densities = [
  { name: 'ldpi', size: 36 },
  { name: 'mdpi', size: 48 },
  { name: 'hdpi', size: 72 },
  { name: 'xhdpi', size: 96 },
  { name: 'xxhdpi', size: 144 },
  { name: 'xxxhdpi', size: 192 }
];

await readFile(manifestPath);
const squareSource = await readFile(legacyIconSource);

for (const density of densities) {
  const folder = path.join(resourceRoot, `mipmap-${density.name}`);
  await mkdir(folder, { recursive: true });

  const squareIcon = await sharp(squareSource)
    .resize(density.size, density.size, { fit: 'fill' })
    .png()
    .toBuffer();
  const circleMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${density.size}" height="${density.size}"><circle cx="${density.size / 2}" cy="${density.size / 2}" r="${density.size / 2}" fill="#fff" /></svg>`
  );
  const roundIcon = await sharp(squareIcon)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  await Promise.all([
    writeFile(path.join(folder, 'ic_launcher.png'), squareIcon),
    writeFile(path.join(folder, 'ic_launcher_round.png'), roundIcon)
  ]);

  for (const filename of ['ic_launcher_foreground.png', 'ic_launcher_background.png']) {
    const generatedPath = path.join(folder, filename);
    if (!(await stat(generatedPath).then(info => info.isFile() && info.size > 0).catch(() => false))) {
      throw new Error(`Adaptive launcher resource was not generated: ${generatedPath}`);
    }
  }
}

const adaptiveDir = path.join(resourceRoot, 'mipmap-anydpi-v26');
await mkdir(adaptiveDir, { recursive: true });
await Promise.all([
  writeFile(path.join(adaptiveDir, 'ic_launcher.xml'), adaptiveIconXml, 'utf8'),
  writeFile(path.join(adaptiveDir, 'ic_launcher_round.xml'), adaptiveIconXml, 'utf8')
]);

let manifest = await readFile(manifestPath, 'utf8');
const appTag = /<application\b/;
if (!appTag.test(manifest)) throw new Error('Android manifest does not contain an application element.');

for (const [attribute, value] of [
  ['icon', '@mipmap/ic_launcher'],
  ['roundIcon', '@mipmap/ic_launcher_round']
]) {
  const pattern = new RegExp(`android:${attribute}="[^"]*"`);
  if (pattern.test(manifest)) {
    manifest = manifest.replace(pattern, `android:${attribute}="${value}"`);
  } else {
    manifest = manifest.replace(appTag, `<application android:${attribute}="${value}"`);
  }
}

if (!manifest.includes('android:icon="@mipmap/ic_launcher"') ||
    !manifest.includes('android:roundIcon="@mipmap/ic_launcher_round"')) {
  throw new Error('Could not attach both launcher icon resources to the Android manifest.');
}
await writeFile(manifestPath, manifest, 'utf8');
console.log('Configured full-bleed adaptive icons and density-specific legacy launcher icons.');
