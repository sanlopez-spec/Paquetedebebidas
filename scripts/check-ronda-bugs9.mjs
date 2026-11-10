#!/usr/bin/env node
// Humo de la ronda de bugs 9: Ritmo con tres pestañas, "‹ Volver" en los detalles y listas de lo abierto (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs9.mjs [carpeta de capturas]
//
// Corre api/cava en este equipo con los datos reales de la #001 (público, sin sesión) y no escribe nada. Imprime las cuentas de
// "¿Se toma o se guarda?" y la frase del calendario para cruzarlas con Airtable. Saca dos capturas.
// Chequeos: (1) en Ritmo, tocar 2025 muestra 8 juntadas y "‹ Volver"; ✕ vuelve a los 6 años y el filtro sigue en "Todos los años";
// (2) "¿Se toma o se guarda?" muestra el anillo con un porcentaje y la frase de autonomía; (3) el calendario tiene 6 filas de años y
// 36 puntos de juntada; (4) en Cepas, tocar Malbec muestra la lista de lo abierto y no aparece "En guarda"; (5) "Las veteranas" tiene
// un podio con 1992 en el primer lugar.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4194, BASE = `http://localhost:${PUERTO}`;
const CAPTURAS = process.argv[2] || join(tmpdir(), 'ronda9');
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
  const tmp = join(tmpdir(), `rb9-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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

// las cuentas de la #001, para cruzar con Airtable
const pub = (await llamarCava('/api/cava')).cuerpo;
const compradas = pub.ritmo.compradas;
const juntadasPub = pub.consumos.juntadas;
const abiertasPorAnio = {};
for (const j of juntadasPub) for (const f of j.filas) abiertasPorAnio[j.mes.slice(0, 4)] = (abiertasPorAnio[j.mes.slice(0, 4)] ?? 0) + f.n;
const sumComp = Object.values(compradas).reduce((a, b) => a + b, 0), sumAb = Object.values(abiertasPorAnio).reduce((a, b) => a + b, 0);
console.log(`  #001 compradas por año de ingreso: ${JSON.stringify(compradas)} (total ${sumComp})`);
console.log(`  #001 abiertas por año: ${JSON.stringify(abiertasPorAnio)} (total ${sumAb}) · en guarda: ${pub.ritmo.enGuarda}`);

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
  const aGrilla = p => p.evaluate(() => document.querySelector('[data-cons="grilla"]').scrollIntoView({ block: 'start' })).then(() => p.waitForTimeout(400));

  // ── a 390 px: el detalle de 2025 ──
  const m = await abrir(390, 844);
  await m.p.locator('[data-ig="ritmo"]').click();
  await m.p.waitForSelector('.ra-fila', { timeout: 10000 });
  const filasAntes = await m.p.locator('.ra-fila').count();
  await m.p.locator('.ra-fila[data-anio="2025"]').click();
  await m.p.waitForSelector('[data-cons="volver"]', { timeout: 10000 });
  const det = await m.p.evaluate(() => ({ barra: document.querySelector('[data-cons="detalle-barra"]')?.textContent ?? '', cajas: document.querySelector('[data-cons="cajitas"]')?.textContent ?? '', juntadas: document.querySelectorAll('.pj-fila').length, puntos: document.querySelectorAll('.pj-puntos i').length, filtro: document.querySelector('[data-cons="periodo"]')?.textContent ?? '' }));
  await aGrilla(m.p);
  await m.p.screenshot({ path: join(CAPTURAS, 'celular-390-detalle-2025.png') });
  await m.p.locator('[data-cons="cerrar-detalle"]').click();
  await m.p.waitForTimeout(300);
  const despues = await m.p.evaluate(() => ({ filas: document.querySelectorAll('.ra-fila').length, filtro: document.querySelector('[data-cons="periodo"]')?.textContent ?? '', volver: !!document.querySelector('[data-cons="volver"]') }));
  check('1. en Ritmo, tocar 2025 muestra 8 juntadas y "‹ Volver"; ✕ vuelve a los 6 años y el filtro sigue en "Todos los años"',
    filasAntes === 6 && det.juntadas === 8 && det.barra.includes('Volver') && det.barra.includes('2025') && det.filtro === 'Todos los años' && despues.filas === 6 && despues.filtro === 'Todos los años' && !despues.volver,
    JSON.stringify({ filasAntes, det, despues }));
  await m.ctx.close();

  // ── a 1280 px ──
  const d = await abrir(1280, 900);
  await d.p.locator('[data-ig="ritmo"]').click();
  await d.p.waitForSelector('.ip-tab', { timeout: 10000 });
  const tabsRitmo = await d.p.locator('.ip-tab').allInnerTexts();
  await d.p.locator('.ip-tab', { hasText: '¿Se toma o se guarda?' }).click();
  await d.p.waitForSelector('[data-cons="toma-guarda"]', { timeout: 10000 });
  await d.p.waitForTimeout(400);
  const tg = await d.p.evaluate(() => ({ pct: document.querySelector('.tg-centro b')?.textContent ?? '', leyenda: document.querySelector('.tg-leyenda')?.textContent ?? '', aut: document.querySelector('[data-cons="autonomia"]')?.textContent ?? '', anios: document.querySelectorAll('.tg-fila').length }));
  console.log('  #001 pantalla: ' + JSON.stringify(tg));
  await aGrilla(d.p);
  await d.p.screenshot({ path: join(CAPTURAS, 'desktop-1280-toma-guarda.png') });
  check('2. "¿Se toma o se guarda?" muestra el anillo con un porcentaje y la frase de autonomía (y Ritmo tiene las 3 pestañas)',
    /\d+ %/.test(tg.pct) && /alcanza para \d+ años?/.test(tg.aut) && tabsRitmo.join('|') === 'Por año|¿Se toma o se guarda?|Calendario', JSON.stringify({ tabsRitmo, tg }));

  await d.p.locator('.ip-tab', { hasText: 'Calendario' }).click();
  await d.p.waitForSelector('[data-cons="calendario"]', { timeout: 10000 });
  const cal = await d.p.evaluate(() => ({ filas: document.querySelectorAll('.cal-fila').length, puntos: document.querySelectorAll('[data-cal-punto]').length, frase: document.querySelector('[data-cons="calendario-frase"]')?.textContent ?? '', alto: Math.round(document.querySelector('.cal-grilla').getBoundingClientRect().height) }));
  console.log('  #001 calendario: ' + cal.frase);
  check('3. el calendario tiene 6 filas de años y 36 puntos de juntada (y la grilla mide 280 px o menos)', cal.filas === 6 && cal.puntos === 36 && cal.alto <= 280, JSON.stringify(cal));

  const malbecBotellas = juntadasPub.reduce((a, j) => a + j.filas.filter(f => f.cepa === 'Malbec').reduce((b, f) => b + f.n, 0), 0);
  await d.p.locator('[data-ig="cepas"]').click();
  await d.p.locator('.ip-tab', { hasText: 'cepas de un vistazo' }).click();
  await d.p.waitForSelector('.mosaico', { timeout: 10000 });
  await d.p.waitForTimeout(500);
  await d.p.locator('.ip-panel .mos-rect', { hasText: 'Malbec' }).first().click();
  await d.p.waitForSelector('[data-cons="lista-abiertas"]', { timeout: 10000 });
  const mal = await d.p.evaluate(() => ({ renglones: document.querySelectorAll('.lab-fila').length, titulo: document.querySelector('.dt-t')?.textContent ?? '', panel: document.querySelector('.ip-panel')?.innerText ?? '' }));
  check('4. en Cepas, tocar Malbec muestra la lista de lo abierto y no aparece "En guarda"', mal.titulo === 'Malbec' && mal.renglones === malbecBotellas && !/en guarda/i.test(mal.panel), JSON.stringify({ ...mal, panel: mal.panel.slice(0, 120) }));
  console.log(`  #001 Malbec: ${mal.renglones} renglones`);

  await d.p.locator('[data-ig="anadas"]').click();
  await d.p.waitForSelector('.ip-tab', { timeout: 10000 });
  const tabsAn = await d.p.locator('.ip-tab').allInnerTexts();
  await d.p.locator('.ip-tab', { hasText: 'Las veteranas' }).click();
  await d.p.waitForSelector('.ip-panel .pd-col', { timeout: 10000 });
  const vet = await d.p.evaluate(() => ({ podio: document.querySelectorAll('.ip-panel .pd-col').length, primero: document.querySelector('.ip-panel .pd-col[data-puesto="1"]')?.textContent ?? '', filas: document.querySelectorAll('.ip-panel .pd-item').length }));
  check('5. "Las veteranas" tiene un podio con 1992 en el primer lugar (y Añadas tiene sus 3 pestañas)',
    vet.podio === 3 && vet.primero.includes('1992') && tabsAn.join('|') === 'Cosecha por cosecha|¿A qué edad las abrimos?|Las veteranas', JSON.stringify({ tabsAn, vet }));
  console.log(`  capturas en ${CAPTURAS}`);
  await d.ctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
