// Gera os ícones do app (iOS/Android/web) e a splash a partir de um SVG de marca, usando o Chromium do Playwright.
//   node scripts/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');
fs.mkdirSync(out, { recursive: true });

const GRADIENT = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF9A3D"/><stop offset="0.55" stop-color="#FF3D77"/><stop offset="1" stop-color="#7A5CFF"/></linearGradient></defs>`;
// seta de navegação (a mesma ideia do ícone "navigate") + pino pequeno
const arrow = (fill, scale = 1) =>
  `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)"><path d="M512 190 L742 780 L512 662 L282 780 Z" fill="${fill}" stroke="${fill}" stroke-width="44" stroke-linejoin="round"/></g>`;

const svgs = {
  'icon.png': { size: 1024, bg: true, body: `<rect width="1024" height="1024" fill="url(#g)"/>${arrow('#FFFFFF')}` },
  'android-icon-background.png': { size: 1024, bg: true, body: `<rect width="1024" height="1024" fill="url(#g)"/>` },
  'android-icon-foreground.png': { size: 1024, bg: false, body: arrow('#FFFFFF', 0.72) },
  'android-icon-monochrome.png': { size: 1024, bg: false, body: arrow('#FFFFFF', 0.72) },
  'splash-icon.png': { size: 512, bg: false, viewBox: '0 0 1024 1024', body: `<rect x="112" y="112" width="800" height="800" rx="220" fill="url(#g)"/>${arrow('#FFFFFF', 0.7)}` },
  'favicon.png': { size: 96, bg: true, viewBox: '0 0 1024 1024', body: `<rect width="1024" height="1024" rx="230" fill="url(#g)"/>${arrow('#FFFFFF', 0.9)}` },
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
for (const [name, { size, viewBox, body, bg }] of Object.entries(svgs)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox ?? '0 0 1024 1024'}">${GRADIENT}${body}</svg></body>`);
  await page.screenshot({ path: path.join(out, name), omitBackground: !bg });
  await page.close();
  console.log('✓', name);
}
await browser.close();
