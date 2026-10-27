import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
const manifestPath = path.join(projectRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const legacyIconSource = path.join(projectRoot, 'assets', 'icon-only.png');
const iconResourcePrefix = 'petrol_expense_launcher_v2';
const adaptiveIconXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/${iconResourcePrefix}_background" />
    <foreground android:drawable="@mipmap/${iconResourcePrefix}_foreground" />
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

  const generatedForegroundPath = path.join(folder, 'ic_launcher_foreground.png');
  const generatedBackgroundPath = path.join(folder, 'ic_launcher_background.png');
  const [generatedForeground, generatedBackground] = await Promise.all([
    readFile(generatedForegroundPath),
    readFile(generatedBackgroundPath)
  ]);
  if (generatedForeground.length === 0 || generatedBackground.length === 0) {
    throw new Error(`Adaptive launcher layers are empty in ${folder}.`);
  }

  await Promise.all([
    writeFile(path.join(folder, `${iconResourcePrefix}.png`), squareIcon),
    writeFile(path.join(folder, `${iconResourcePrefix}_round.png`), roundIcon),
    writeFile(path.join(folder, `${iconResourcePrefix}_foreground.png`), generatedForeground),
    writeFile(path.join(folder, `${iconResourcePrefix}_background.png`), generatedBackground)
  ]);
}

const adaptiveDir = path.join(resourceRoot, 'mipmap-anydpi-v26');
await mkdir(adaptiveDir, { recursive: true });
await Promise.all([
  writeFile(path.join(adaptiveDir, `${iconResourcePrefix}.xml`), adaptiveIconXml, 'utf8'),
  writeFile(path.join(adaptiveDir, `${iconResourcePrefix}_round.xml`), adaptiveIconXml, 'utf8')
]);

let manifest = await readFile(manifestPath, 'utf8');
const appTag = /<application\b/;
if (!appTag.test(manifest)) throw new Error('Android manifest does not contain an application element.');

for (const [attribute, value] of [
  ['icon', `@mipmap/${iconResourcePrefix}`],
  ['roundIcon', `@mipmap/${iconResourcePrefix}_round`]
]) {
  const pattern = new RegExp(`android:${attribute}="[^"]*"`);
  if (pattern.test(manifest)) {
    manifest = manifest.replace(pattern, `android:${attribute}="${value}"`);
  } else {
    manifest = manifest.replace(appTag, `<application android:${attribute}="${value}"`);
  }
}

if (!manifest.includes(`android:icon="@mipmap/${iconResourcePrefix}"`) ||
    !manifest.includes(`android:roundIcon="@mipmap/${iconResourcePrefix}_round"`)) {
  throw new Error('Could not attach both launcher icon resources to the Android manifest.');
}
await writeFile(manifestPath, manifest, 'utf8');
console.log(`Configured ${iconResourcePrefix} adaptive icons and density-specific legacy launcher icons.`);

