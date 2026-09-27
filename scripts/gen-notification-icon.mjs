import sharp from 'sharp';
import { mkdirSync } from 'fs';

const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <path d="M120 256H180L210 140L256 372L300 256H392" stroke="#FFFFFF" stroke-width="52" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <circle cx="392" cy="256" r="26" fill="#FFFFFF" />
</svg>`;

const sizes = {
  'mipmap-mdpi': 24,
  'mipmap-hdpi': 36,
  'mipmap-xhdpi': 48,
  'mipmap-xxhdpi': 72,
  'mipmap-xxxhdpi': 96
};

const base = 'android/app/src/main/res';
for (const [dir, size] of Object.entries(sizes)) {
  const outDir = `${base}/${dir.replace('mipmap', 'drawable')}`;
  mkdirSync(outDir, { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`${outDir}/ic_stat_notify.png`);
  console.log(`Gerado ${outDir}/ic_stat_notify.png (${size}x${size})`);
}
