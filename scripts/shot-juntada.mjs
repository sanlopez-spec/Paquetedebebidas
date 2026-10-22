#!/usr/bin/env node
// Captura de la tarjeta "Última juntada" del Inicio (celular, 390 px).
//   node scripts/shot-juntada.mjs [base] [salida.png] [ancho=390]
import { chromium } from 'playwright';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || 'https://edb.com.ar').replace(/\/+$/, '');
const ancho = Number(process.argv[4] || 390);
const out = process.argv[3] || join(ROOT, 'docs', 'club', 'capturas', 'inicio', 'mob-inicio-juntada.png');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho > 700 ? 900 : 844 }, deviceScaleFactor: ancho > 700 ? 1 : 2 });
const page = await ctx.newPage();
await page.goto(base + '/club/cava', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.junta', { timeout: 30000 });
await page.locator('.junta').scrollIntoViewIfNeeded();
await page.waitForFunction(() => { const i = document.querySelector('.junta img'); return !i || (i.complete && i.naturalWidth > 0); }, null, { timeout: 20000 });
await page.waitForTimeout(500);
await page.locator('.junta').screenshot({ path: out });
await browser.close();
console.log('captura en', out);
