#!/usr/bin/env node
/**
 * Rasterises the PWA icon sources into each app's `public/icons/`.
 *
 * Run by hand (`pnpm icons:generate`) and the output is committed, rather than
 * wired into `turbo build`. Icons change roughly never, and generating them in
 * CI would pull sharp's native binary into every install on a repo whose PR
 * gate is a fast `quality` job. The cost is remembering to re-run this after
 * editing an SVG, which the sources call out.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assets = join(root, 'packages/ui/src/assets');
const apps = ['apps/frontend-admin', 'apps/frontend-pos'];

/** [source svg, output name, pixel size] */
const targets = [
  ['pwa-icon.svg', 'pwa-192x192.png', 192],
  ['pwa-icon.svg', 'pwa-512x512.png', 512],
  ['pwa-icon.svg', 'apple-touch-icon-180x180.png', 180],
  ['pwa-icon.svg', 'favicon-96x96.png', 96],
  ['pwa-icon-maskable.svg', 'maskable-icon-512x512.png', 512],
];

for (const app of apps) {
  const outDir = join(root, app, 'public/icons');
  await mkdir(outDir, { recursive: true });

  for (const [source, name, size] of targets) {
    const png = await sharp(join(assets, source))
      .resize(size, size, { fit: 'contain' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await writeFile(join(outDir, name), png);
    process.stdout.write(`${app}/public/icons/${name} (${size}px)\n`);
  }
}
