#!/usr/bin/env node
// Humo de la ronda de bugs 6: el informe de Consumos con las tarjetas de Mi cava (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs6.mjs [carpeta de capturas]
//
// Corre api/cava en este equipo con los datos reales de la #001 (público, sin sesión) y no escribe nada en ningún lado.
// Chequeos (a 390 px salvo el último): (1) "Juntadas" e "Informe de consumos" miden 26 px de letra; (2) las 5 tarjetas miden 68 px de
// alto, con Ritmo a todo el ancho y las otras en 2×2, sin las 4 cajitas; (3) con Ritmo abierta, las barras de Botellas por año miden
// 36 px o menos y su número 17 px; (4) ningún gráfico se desplaza de costado (scrollWidth = clientWidth), en todas las secciones y
// pestañas; (5) a 1280 px, "Las regiones" se ve en dos columnas. Saca dos capturas: 390 px con Ritmo y 1280 px con Geografía.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4191, BASE = `http://localhost:${PUERTO}`;
const CAPTURAS = process.argv[2] || join(tmpdir(), 'ronda6');
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
  const tmp = join(tmpdir(), `rb6-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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

  // ── a 390 px ──
  const m = await abrir(390, 844);
  const px = (sel, prop) => m.p.evaluate(([s, pr]) => { const e = document.querySelector(s); return e ? getComputedStyle(e)[pr] : null; }, [sel, prop]);
  const tJ = await px('[data-cons="cab-juntadas"] h2', 'fontSize');
  const tI = await px('.ci-banda .ci-head h2', 'fontSize');
  check('1. a 390 px "Juntadas" e "Informe de consumos" tienen 26 px de tamaño de letra', tJ === '26px' && tI === '26px', JSON.stringify({ tJ, tI }));

  const g = await m.p.evaluate(() => {
    const t = [...document.querySelectorAll('.ig-card')].map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.ig, alto: Math.round(r.height), x: Math.round(r.left), w: Math.round(r.width), y: Math.round(r.top) }; });
    return { t, cajas: document.querySelectorAll('.ci-cajas').length };
  });
  const ritmo = g.t[0], resto = g.t.slice(1);
  const grillaOk = g.t.length === 5 && g.t.every(x => x.alto === 68) && ritmo.id === 'ritmo' && ritmo.w > resto[0].w * 1.8
    && resto[0].x === resto[2].x && resto[1].x === resto[3].x && resto[0].x < resto[1].x && resto[0].y === resto[1].y && resto[2].y > resto[0].y && g.cajas === 0;
  check('2. las 5 tarjetas miden 68 px de alto: Ritmo a todo el ancho y las otras en 2×2, sin las 4 cajitas', grillaOk, JSON.stringify(g));

  // 3. Ritmo abierta: barras de Botellas por año
  await m.p.locator('[data-ig="ritmo"]').click();
  await m.p.waitForSelector('.ip-panel .an-bar', { timeout: 10000 });
  await m.p.waitForTimeout(800);
  const b = await m.p.evaluate(() => {
    const barras = [...document.querySelectorAll('.ip-panel .an-bar')].map(e => Math.round(e.getBoundingClientRect().width));
    const n = document.querySelector('.ip-panel .an-n');
    const panel = document.querySelector('.ip-panel').getBoundingClientRect(), ch = document.querySelector('.ip-panel .an-chart').getBoundingClientRect();
    return { barras, num: n ? getComputedStyle(n).fontSize : null, centrado: Math.abs((ch.left + ch.right) / 2 - (panel.left + panel.right) / 2) <= 2 };
  });
  check('3. con Ritmo abierta, las barras de Botellas por año miden 36 px o menos, el número 17 px y el gráfico queda centrado',
    b.barras.length >= 2 && Math.max(...b.barras) <= 36 && Math.min(...b.barras) >= 8 && b.num === '17px' && b.centrado, JSON.stringify(b));
  await m.p.evaluate(() => document.querySelector('[data-cons="grilla"]').scrollIntoView({ block: 'start' }));
  await m.p.waitForTimeout(400);
  await m.p.screenshot({ path: join(CAPTURAS, 'celular-390-ritmo.png') });

  // 4. ninguna sección ni pestaña se desplaza de costado
  const malos = [];
  for (const id of ['ritmo', 'cepas', 'geografia', 'anadas', 'calidad']) {
    if (await m.p.locator(`[data-ig="${id}"]`).count() === 0) continue;
    if ((await m.p.locator(`[data-ig="${id}"]`.concat('.on')).count()) === 0) await m.p.locator(`[data-ig="${id}"]`).click();
    await m.p.waitForTimeout(300);
    const tabs = await m.p.locator('.ip-tab').count();
    for (let k = 0; k < Math.max(1, tabs); k++) {
      if (tabs) await m.p.locator('.ip-tab').nth(k).click();
      await m.p.waitForTimeout(250);
      const r = await m.p.evaluate(() => [...document.querySelectorAll('.ip-panel, .ip-cuerpo, .cc-cuerpo, .ib, .an-chart, .tr-lista')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => `${e.className}:${e.scrollWidth}>${e.clientWidth}`));
      if (r.length) malos.push(`${id}#${k}: ${r.join(', ')}`);
    }
  }
  check('4. a 390 px ningún gráfico tiene desplazamiento de costado (scrollWidth = clientWidth)', malos.length === 0, malos.join(' | '));
  await m.ctx.close();

  // ── a 1280 px ──
  const d = await abrir(1280, 900);
  await d.p.locator('[data-ig="geografia"]').click();
  await d.p.waitForSelector('.ip-panel', { timeout: 10000 });
  await d.p.locator('.ip-tab', { hasText: 'regiones' }).click();
  await d.p.waitForSelector('.ip-panel .tr-fila', { timeout: 10000 });
  await d.p.waitForTimeout(500);
  const col = await d.p.evaluate(() => {
    const f = [...document.querySelectorAll('.ip-panel .tr-fila')];
    const xs = [...new Set(f.map(e => Math.round(e.getBoundingClientRect().left)))];
    return { filas: f.length, columnas: xs.length, porColumna: xs.map(x => f.filter(e => Math.round(e.getBoundingClientRect().left) === x).length) };
  });
  check('5. a 1280 px "Las regiones" se ve en dos columnas', col.columnas === 2 && col.filas > 5 && col.porColumna[0] === 5, JSON.stringify(col));
  await d.p.evaluate(() => document.querySelector('[data-cons="grilla"]').scrollIntoView({ block: 'start' }));
  await d.p.waitForTimeout(400);
  await d.p.screenshot({ path: join(CAPTURAS, 'desktop-1280-geografia.png') });
  await d.ctx.close();
  console.log(`  capturas en ${CAPTURAS}`);
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
