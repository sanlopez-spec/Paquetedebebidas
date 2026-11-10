#!/usr/bin/env node
// Humo de la ronda de bugs 10: la ficha de lo abierto se lee bien (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs10.mjs
//
// Con la ficha de lo abierto abierta, el fondo de la ventana es el mismo que el de las demás hojas (--parchment-2), el fondo de atrás es oscuro
// semitransparente y todos sus textos tienen contraste de 4,5:1 o más.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4195, BASE = `http://localhost:${PUERTO}`;
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

  const m = await abrir(1280, 900);
  await m.p.locator('[data-ig="calidad"]').click();
  await m.p.locator('.ip-tab', { hasText: 'Lo mejor' }).click();
  await m.p.waitForSelector('.pd-col', { timeout: 10000 });
  await m.p.locator('.ip-panel .pd-col .pd-txt').first().click();
  await m.p.waitForSelector('.fab-hoja [data-cons="ficha-abierta"]', { timeout: 10000 });
  await m.p.waitForTimeout(400);
  const r = await m.p.evaluate(() => {
    const rgb = c => { const x = c.match(/[\d.]+/g).map(Number); return { r: x[0], g: x[1], b: x[2], a: x[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const hoja = document.querySelector('.fab-hoja');
    const bg = getComputedStyle(hoja).backgroundColor;
    const patron = document.createElement('div'); patron.style.background = 'var(--parchment-2)'; document.querySelector('.club-root').appendChild(patron);
    const esperado = getComputedStyle(patron).backgroundColor; patron.remove();
    const fondo = rgb(bg);
    const sel = ['.ses-t', '.fab-sub', '.fab-abierta', '.fab-abierta .ses-link', '.fab-datos b', '.fab-datos span'];
    const cajita = rgb(getComputedStyle(document.querySelector('.fab-datos div')).backgroundColor);
    const contrastes = Object.fromEntries(sel.map(s => { const e = hoja.querySelector(s); if (!e) return [s, null]; const base = s.startsWith('.fab-datos') ? cajita : fondo; return [s, Math.round(ratio(rgb(getComputedStyle(e).color), base) * 100) / 100]; }));
    const atras = getComputedStyle(document.querySelector('.jt-back')).backgroundColor;
    return { bg, esperado, contrastes, atras, nombre: hoja.querySelector('.ses-t')?.textContent };
  });
  const minimo = Math.min(...Object.values(r.contrastes).filter(x => x != null));
  const a = r.atras.match(/[\d.]+/g).map(Number);
  check('1. la ficha de lo abierto usa el fondo de las demás hojas (--parchment-2), el fondo de atrás es oscuro semitransparente y todos sus textos tienen contraste de 4,5:1 o más',
    r.bg === r.esperado && a.length === 4 && a[3] < 1 && a[0] < 80 && minimo >= 4.5, JSON.stringify(r));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 1 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
