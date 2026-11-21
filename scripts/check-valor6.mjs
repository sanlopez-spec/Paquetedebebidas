#!/usr/bin/env node
// Humo de "Valor ronda 6": "USD" chico en los montos grandes y la línea del plan visible. Local en Chromium, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-valor6.mjs [--shots <carpeta>]
//   1. a 390 px, el bloque de arriba mide lo mismo con $ y con USD (±2 px), y "Tu parte" está a la derecha del valor en los dos
//   2. en USD, el "USD" del valor grande tiene un tamaño de letra menor que el número
//   3. la línea del plan está por encima de las barras (se ve sobre la barra de 2021, que pasa el plan) y su alto cubre todos los renglones
// Usa las cuentas reales de api/_lib/valor.ts con un fixture local y contesta la sesión, /api/cava y /api/montos desde el navegador.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4215, BASE = `http://localhost:${PUERTO}`;
const ID = 'rec7kgfT9LXzYPy6a';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `valor6-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularCompras, calcularValor } = await cargarTs('api/_lib/valor.ts');

// ── Compras de la cava #001: cuota USD 350, el dólar real de cada mes; agosto 2026 se pasa (374 de 350) y septiembre arranca con ese saldo ──
const HOY = '2026-11-15', N = 7, CUOTA = 350;
const DOLARES = { '2025-10': 1429.93, '2025-11': 1401.18, '2025-12': 1453.94, '2026-01': 1385.49, '2026-02': 1386.62, '2026-03': 1386.71, '2026-04': 1386.76, '2026-05': 1511.34, '2026-06': 1515.15,
  '2026-07': 1512.56, '2026-08': 1504.63, '2026-09': 1518.69, '2026-10': 1550, '2026-11': 1570 };
const D_HOY = DOLARES['2026-11'];
const bot = (mes, cant, usd) => ({ id: 'z' + mes, origen: 'Compra club', cantidad: cant, enGuarda: cant, fecha: `${mes}-10`, pagado: usd / cant, sugerido: 0, valorEst: 0, gananciaEstiba: 0, icono: false, formato: '750' });
const ASIG = { '2025-10': 340, '2025-11': 350, '2026-01': 600, '2026-05': 400, '2026-08': 374, '2026-09': 348 };
const compras = calcularCompras(Object.entries(ASIG).map(([m, u]) => bot(m, 10, u)), HOY, { cuota: CUOTA, saldoInicial: 0, saldoDesde: '2025-10', dolares: DOLARES });

// ── Valor: compras del club en seis años (2021 a 2026); el valor de la cava, USD 27.685 (al dólar de hoy, $43,5 millones) ──
const anios = (d, h) => { const [a1, m1, d1] = d.split('-').map(Number), [a2, m2, d2] = h.split('-').map(Number); let n = a2 - a1; if (m2 < m1 || (m2 === m1 && d2 < d1)) n--; return Math.max(0, n); };
const filasV = [['b0', 'Luigi Bosca', '2015', '2021-08-10', 6, 6, 40, 60], ['b1', 'Gran Enemigo', '2016', '2022-04-10', 6, 6, 70, 100], ['b3', 'Rutini Apartado', '2018', '2023-05-12', 6, 5, 45, 70],
  ['b5', 'Catena Zapata', '2019', '2024-06-03', 6, 6, 60, 95], ['b7', 'Trapiche Iscay', '2018', '2025-04-22', 6, 6, 50, 75], ['b8', 'Zuccardi Aluvional', '2021', '2026-03-30', 12, 12, 30, 48]]
  .map(([id, vino, anada, fecha, cantidad, enGuarda, pagado, sugerido]) => { const valorEst = sugerido * Math.pow(1.075, Math.min(anios(fecha, HOY), 10)); return { id, origen: 'Compra club', cantidad, enGuarda, fecha, pagado, sugerido, valorEst, gananciaEstiba: valorEst - sugerido, icono: false, formato: '750', vino, anada }; });
const base = calcularValor(filasV, [{ botella: 'b3', cantidad: 1, fecha: '2025-12-20', sugeridoHist: 70 }], HOY);
const VALOR = 27685, AHORRO = 18860;   // al dólar de hoy: $43,5 M y $29,6 M
const informe = { ...base, valorCava: VALOR, ahorro: AHORRO, compras: VALOR - AHORRO - base.guarda + base.tomado };
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const MONTOS = {
  dolar: { mes: '2026-11', valor: D_HOY }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...compras, porMes: {}, ultimas: [], club: { botellas: 42, desde: '2021-08', costo: 1, sugerido: 2 }, regalos: [], cuotas: null },
  informe: { ...informe, plan: 'Gran Reserva', topePlan: 40, presupuestoMes: CUOTA, tuParte: { valorCava: Math.round(informe.valorCava / N), compras: Math.round(informe.compras / N) } },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: N }, total: Z, tuParte: Z, porEtiqueta: {},
};
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const SESION = { sesion: true, usuario: { nombre: 'Toto', email: 'toto@example.com', admin: false }, cavas: [{ id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: N, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }] };

async function lanzar() {
  try { return await chromium.launch({ headless: true }); }
  catch (e) { if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); throw e; }
}
const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await lanzar();
  const abrir = async (hash, espera, ancho = 390, montos = MONTOS, moneda = 'ARS') => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id.id); localStorage.setItem('edb-club-moneda', id.moneda); } catch {} }, { id: ID, moneda });
    await ctx.route('**/api/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: CAVA });
      if (u.pathname === '/api/montos') return r.fulfill({ json: montos });
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector(espera, { timeout: 40000 });
    await p.waitForTimeout(600);
    return { ctx, p };
  };

  // descuento por año con años que pasan el plan (40 %): 2021 al 48 %
  const PASAN = { ...MONTOS, informe: { ...MONTOS.informe, descuento: { ...MONTOS.informe.descuento,
    porAnio: [2021, 2022, 2023, 2024, 2025, 2026].map((anio, i) => ({ anio, pct: [48, 30, 45, 52, 33, 41][i], botellas: 6 })) } } };
  const medir = async moneda => {
    const { ctx, p } = await abrir('#valor', '[data-vi="pie"]', 390, PASAN, moneda);
    if (SHOTS) await p.locator('[data-banda="1"]').screenshot({ path: join(SHOTS, `arriba-${moneda}.png`) });
    const r = await p.evaluate(() => {
      const R = s => document.querySelector(s)?.getBoundingClientRect();
      const b = R('[data-vi="cava"]'), v = R('[data-vi="valor"]'), t = R('[data-vi="parte-n"]');
      const usd = document.querySelector('[data-vi="valor"] [data-vi="usd"]');
      return { alto: b.height, val: [v.left, v.right, v.top, v.bottom], par: [t.left, t.right, t.top, t.bottom], valor: document.querySelector('[data-vi="valor"]').textContent,
        fUsd: usd ? parseFloat(getComputedStyle(usd).fontSize) : null, fNum: parseFloat(getComputedStyle(document.querySelector('[data-vi="valor"]')).fontSize) };
    });
    return { ctx, p, r };
  };
  const derecha = r => r.par[0] >= r.val[1] && r.par[2] < r.val[3] && r.par[3] > r.val[2];
  const $ = await medir('ARS'); await $.ctx.close();
  const U = await medir('USD');
  check('1. a 390 px, el bloque de arriba mide lo mismo con $ y con USD (±2 px), y "Tu parte" está a la derecha del valor en los dos',
    Math.abs($.r.alto - U.r.alto) <= 2 && derecha($.r) && derecha(U.r), JSON.stringify({ ars: $.r, usd: U.r }));
  check('2. en USD, el "USD" del valor grande tiene un tamaño de letra menor que el número',
    /^USD\s27\.685$/.test(U.r.valor) && U.r.fUsd != null && U.r.fUsd < U.r.fNum, JSON.stringify(U.r));

  // ── 3 · la línea del plan ──
  const p = U.p;
  if (SHOTS) await p.locator('[data-vi="anios"]').screenshot({ path: join(SHOTS, 'anios-linea.png') });
  const L = await p.evaluate(() => {
    const t = document.querySelector('[data-vi="tope"]').getBoundingClientRect();
    const filas = [...document.querySelectorAll('[data-vi="anios"] [data-vi="anio"]')].map(f => f.getBoundingClientRect());
    const b21 = document.querySelector('[data-anio="2021"] .vi-barra').getBoundingClientRect();
    const capa = getComputedStyle(document.querySelector('.vi-h-capa')).zIndex;
    return { x: t.left + t.width / 2, top: t.top, bottom: t.bottom, primera: filas[0].top, ultima: filas[filas.length - 1].bottom, b21: [b21.left, b21.right, b21.top, b21.bottom], capa };
  });
  // los píxeles sobre la barra de 2021: en la columna de la línea tienen que distinguirse del bordó de la barra (a 20 px de la línea)
  const y = Math.round((L.b21[2] + L.b21[3]) / 2) - 1;
  const conLinea = await p.screenshot({ clip: { x: Math.round(L.x) - 2, y, width: 4, height: 3 } });
  const sinLinea = await p.screenshot({ clip: { x: Math.round(L.x) - 24, y, width: 4, height: 3 } });
  await U.ctx.close();
  const sobre2021 = L.b21[1] > L.x + 4 && !conLinea.equals(sinLinea);
  check('3. la línea del plan está por encima de las barras (se ve sobre la barra de 2021) y su alto cubre todos los renglones',
    sobre2021 && Number(L.capa) >= 1 && L.top <= L.primera + 0.5 && L.bottom >= L.ultima - 0.5, JSON.stringify({ L, sobre2021 }));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 3 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
