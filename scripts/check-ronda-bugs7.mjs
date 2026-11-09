#!/usr/bin/env node
// Humo de la ronda de bugs 7: "Botellas por año" en renglones y Geografía con "Del mundo" (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs7.mjs [carpeta de capturas]
//
// Corre api/cava en este equipo con los datos reales de la #001 (público, sin sesión) y no escribe nada en ningún lado.
// Chequeos: (1) con Ritmo abierta, "Botellas por año" tiene un renglón por año (6 en el #001), el primero es 2026 y muestra "juntadas";
// (2) a 1280 px el dibujo de "De norte a sur" mide 300 px de alto o menos; (3) a 1280 px "Del mundo" está a la derecha de la cordillera
// y tiene 10 países; (4) a 390 px nada desborda de costado, en ninguna sección ni pestaña. Saca dos capturas.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4192, BASE = `http://localhost:${PUERTO}`;
const CAPTURAS = process.argv[2] || join(tmpdir(), 'ronda7');
mkdirSync(CAPTURAS, { recursive: true });
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, op = {}) => {
  if (/airtable\.com/.test(String(url)) && String(op.method ?? 'GET').toUpperCase() !== 'GET') return Promise.reject(new Error('modo seco: escritura cortada'));
  return fetchReal(url, op);
};
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `rb7-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const cava = (await cargar('api/cava.ts')).default;
async function llamarCava(url) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await cava({ method: 'GET', query: q, headers: {} }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  async function abrir(ancho, alto) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.route('**/api/cava*', async r => { const u = new URL(r.request().url()); const { estado, cuerpo } = await llamarCava(u.pathname + u.search); await r.fulfill({ status: estado, json: cuerpo ?? {} }); });
    await p.route('**/api/auth*', r => r.fulfill({ json: { sesion: false } }));
    await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.tab-top', { timeout: 40000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(1000);
    await p.locator(ancho >= 900 ? '.tab-top [data-pantalla-top="consumos"]' : 'nav.appbar [data-pantalla="consumos"]').click();
    await p.waitForSelector('[data-cons="grilla"]', { timeout: 30000 });
    await p.waitForTimeout(1200);
    return { ctx, p };
  }

  // ── a 390 px: Botellas por año en renglones ──
  const m = await abrir(390, 844);
  await m.p.locator('[data-ig="ritmo"]').click();
  await m.p.waitForSelector('.ra-fila', { timeout: 10000 });
  await m.p.waitForTimeout(500);
  const ra = await m.p.evaluate(() => [...document.querySelectorAll('.ra-fila')].map(f => ({ anio: f.dataset.anio, n: f.dataset.n, j: f.dataset.juntadas, jun: f.querySelector('.ra-jun')?.textContent ?? '' })));
  console.log('  juntadas por año (#001): ' + ra.map(r => `${r.anio}: ${r.n} botellas, ${r.j} juntadas`).join(' | '));
  check('1. con Ritmo abierta, "Botellas por año" tiene un renglón por año (6 en el #001), el primero es 2026 y muestra "juntadas"',
    ra.length === 6 && ra[0].anio === '2026' && /juntadas? ·/.test(ra[0].jun), JSON.stringify(ra));
  await m.p.evaluate(() => document.querySelector('[data-cons="grilla"]').scrollIntoView({ block: 'start' }));
  await m.p.waitForTimeout(300);
  await m.p.screenshot({ path: join(CAPTURAS, 'celular-390-ritmo.png') });

  // a 390 px, ninguna sección ni pestaña se desplaza de costado
  const malos = [];
  for (const id of ['ritmo', 'cepas', 'geografia', 'anadas', 'calidad']) {
    if (await m.p.locator(`[data-ig="${id}"]`).count() === 0) continue;
    if ((await m.p.locator(`[data-ig="${id}"].on`).count()) === 0) await m.p.locator(`[data-ig="${id}"]`).click();
    await m.p.waitForTimeout(300);
    const tabs = await m.p.locator('.ip-tab').count();
    for (let k = 0; k < Math.max(1, tabs); k++) {
      if (tabs) await m.p.locator('.ip-tab').nth(k).click();
      await m.p.waitForTimeout(250);
      const r = await m.p.evaluate(() => [document.documentElement, ...document.querySelectorAll('.ip-panel, .ip-cuerpo, .cc-cuerpo, .ib, .an-chart, .tr-lista, .ra, .gm, .dm, .ns-wrap')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => `${e.className || e.tagName}:${e.scrollWidth}>${e.clientWidth}`));
      if (r.length) malos.push(`${id}#${k}: ${r.join(', ')}`);
    }
  }
  await m.p.locator('[data-ig="geografia"].on').count() || await m.p.locator('[data-ig="geografia"]').click();
  check('4. a 390 px nada desborda de costado (scrollWidth = clientWidth) en ninguna sección ni pestaña', malos.length === 0, malos.join(' | '));
  await m.ctx.close();

  // ── a 1280 px: Geografía ──
  const d = await abrir(1280, 900);
  await d.p.locator('[data-ig="geografia"]').click();
  await d.p.waitForSelector('.gm', { timeout: 10000 });
  await d.p.waitForTimeout(600);
  const ns = await d.p.evaluate(() => {
    const w = document.querySelector('.gm .ns-wrap').getBoundingClientRect(), dm = document.querySelector('.gm .dm').getBoundingClientRect();
    const sv = document.querySelector('.gm .ns-svg').getBoundingClientRect();
    return { alto: Math.round(sv.height), ancho: Math.round(sv.width), derecha: dm.left >= w.right - 1, paises: document.querySelectorAll('.gm .dm-fila').length, tab: document.querySelector('.ip-tab.on')?.textContent };
  });
  check('2. a 1280 px el dibujo de "De norte a sur" mide 300 px de alto o menos', ns.alto <= 300 && ns.ancho <= 360, JSON.stringify(ns));
  check('3. a 1280 px "Del mundo" está a la derecha de la cordillera y tiene 10 países', ns.derecha && ns.paises === 10, JSON.stringify(ns));
  await d.p.evaluate(() => document.querySelector('[data-cons="grilla"]').scrollIntoView({ block: 'start' }));
  await d.p.waitForTimeout(400);
  await d.p.screenshot({ path: join(CAPTURAS, 'desktop-1280-geografia.png') });
  await d.ctx.close();
  console.log(`  capturas en ${CAPTURAS}`);
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 4 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
