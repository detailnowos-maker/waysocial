// Utilidades compartilhadas pelos scripts de e2e (Playwright + Chromium em viewport de celular).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

export const BASE_URL = process.env.WAYSOCIAL_URL ?? 'http://localhost:8081';
const here = path.dirname(fileURLToPath(import.meta.url));
export const SHOTS = path.join(here, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

export async function launch({ geolocation = { latitude: -26.4858, longitude: -49.0665 }, width = 390, height = 844 } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    geolocation,
    permissions: geolocation ? ['geolocation'] : [],
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  return { browser, context, page, logs };
}

export async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
