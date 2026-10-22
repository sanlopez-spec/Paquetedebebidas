#!/usr/bin/env node
// Capturas del Inicio de la app: celular y escritorio.
//
//   node scripts/shots-inicio.mjs                             (local, vite preview)
//   node scripts/shots-inicio.mjs https://edb.com.ar          (producción)
//   node scripts/shots-inicio.mjs https://edb.com.ar <dir>
//
// Por defecto guarda en docs/club/capturas/inicio/.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/+$/, '');
const DIR = process.argv[3] || join(ROOT, 'docs', 'club', 'capturas', 'inicio');
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);

async function apiLocal() {
  for (const l of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) process.env[m[1]] ??= m[2];
  }
  const { transform } = await import(pathToFileURL(join(ROOT, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const { code } = await transform(readFileSync(join(ROOT, 'api', 'cava.ts'), 'utf8'), { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `cava-shots-${Date.now()}.mjs`);
  writeFileSync(tmp, code, 'utf8');
  const { default: handler } = await import(pathToFileURL(tmp).href);
  let body = null;
  await handler({}, { setHeader() {}, status() { return this; }, json(b) { body = b; return this; } });
  return JSON.stringify(body);
}
async function esperar(url, ms) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    try { const r = await fetch(url); if (r.ok || r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

let server = null, apiBody = null;
if (IS_LOCAL) {
  apiBody = await apiLocal();
  server = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  if (!await esperar(BASE + '/', 30000)) { console.error('preview no respondió'); process.exit(1); }
}

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const vp of [{ w: 390, h: 844, f: 'mob' }, { w: 1440, h: 900, f: 'dsk' }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.w < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    if (apiBody) await page.route('**/api/cava', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    await page.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.sec-card', { timeout: 25000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(DIR, `${vp.f}-inicio.png`), fullPage: true });
    await page.screenshot({ path: join(DIR, `${vp.f}-inicio-pantalla.png`) });

    await page.locator('.appbar-item[data-pantalla="cava"]').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(DIR, `${vp.f}-mi-cava.png`), fullPage: true });

    await page.locator('.appbar-item[data-pantalla="compras"]').click();
    await page.waitForTimeout(700);
    await page.locator('.acc-btn').first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(DIR, `${vp.f}-compras.png`), fullPage: true });

    await page.locator('.appbar-item[data-pantalla="consumos"]').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(DIR, `${vp.f}-consumos.png`), fullPage: true });

    await page.locator('.appbar-mas-btn').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(DIR, `${vp.f}-cargar.png`) });

    // el segundo gráfico del carrusel
    await page.locator('.cargar-x').click();
    await page.waitForTimeout(600);
    await page.locator('.appbar-item[data-pantalla="inicio"]').click();
    await page.waitForTimeout(800);
    if (await page.locator('.num-dot').count() > 1) {
      await page.locator('.num-dot').nth(1).click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(DIR, `${vp.f}-grafico-edad.png`) });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
console.log('capturas en', DIR);
