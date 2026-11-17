#!/usr/bin/env node
// Humo de "Compras ronda 5, Valor en desktop y barra de navegación". Local en Chromium, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-compras5.mjs [--shots <carpeta>]
//   1. en el #001 ningún mes anterior al actual dice "seguimos eligiendo" ni "Estamos eligiendo" (sí el mes en curso, sin compras)
//   2. diciembre 2025 muestra "incluye +$X de noviembre" y su "de $Y" es mayor que el de un mes sin saldo
//   3. septiembre 2026 muestra su presupuesto al dólar de septiembre (distinto del de hoy)
//   4. la barra de abajo tiene 5 ítems, sin "Cargar", y "Valor" lleva a #valor (y la cabecera de desktop tiene "Valor" donde estaba "Cargar")
//   5. a 1200 px, en #valor la franja del ahorro está a la derecha del 48 % y la cuenta a la derecha del gráfico (y en el celular no cambia)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4209, BASE = `http://localhost:${PUERTO}`;
const ID = 'rec7kgfT9LXzYPy6a';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `compras5-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularCompras, calcularValor } = await cargarTs('api/_lib/valor.ts');

// ── Compras: la cava #001 con "Saldo desde" en su primer mes (octubre 2025 en este fixture), cuota USD 350 y el dólar REAL de cada mes ──
const HOY = '2026-11-15', N = 7, CUOTA = 350;
const DOLARES = { '2025-10': 1429.93, '2025-11': 1401.18, '2025-12': 1453.94, '2026-01': 1385.49, '2026-02': 1386.62, '2026-03': 1386.71, '2026-04': 1386.76, '2026-05': 1511.34, '2026-06': 1515.15,
  '2026-07': 1512.56, '2026-08': 1504.63, '2026-09': 1518.69, '2026-10': 1550, '2026-11': 1570 };
const D_HOY = DOLARES['2026-11'];
const bot = (mes, cant, usd) => ({ id: 'z' + mes, origen: 'Compra club', cantidad: cant, enGuarda: cant, fecha: `${mes}-10`, pagado: usd / cant, sugerido: 0, valorEst: 0, gananciaEstiba: 0, icono: false, formato: '750' });
// asignado en USD: octubre 330 (sobran 20) · noviembre 200 (sobran 170 sumados a los 20) · enero 600 (se pasa) · septiembre 348 · febrero, marzo, abril, octubre 2026 y noviembre 2026 sin compras, etc.
const ASIG = { '2025-10': 330, '2025-11': 200, '2026-01': 600, '2026-05': 400, '2026-08': 374, '2026-09': 348 };
const compras = calcularCompras(Object.entries(ASIG).map(([m, u]) => bot(m, 10, u)), HOY, { cuota: CUOTA, saldoInicial: 0, saldoDesde: '2025-10', dolares: DOLARES });
const M = Object.fromEntries(compras.meses.map(m => [m.mes, m]));
const pesosMes = (usd, mes) => '$' + String(Math.round(usd * DOLARES[mes] / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ── Valor: ocho compras del club en cinco años ──
const anios = (d, h) => { const [a1, m1, d1] = d.split('-').map(Number), [a2, m2, d2] = h.split('-').map(Number); let n = a2 - a1; if (m2 < m1 || (m2 === m1 && d2 < d1)) n--; return Math.max(0, n); };
const filasV = [['b1', 'Gran Enemigo', '2016', '2022-04-10', 6, 6, 70, 100], ['b2', 'Cheval des Andes', '2017', '2022-09-05', 4, 4, 55, 80], ['b3', 'Rutini Apartado', '2018', '2023-05-12', 6, 5, 45, 70],
  ['b4', 'Nicasia', '2019', '2023-11-20', 12, 10, 20, 32], ['b5', 'Catena Zapata', '2019', '2024-06-03', 6, 6, 60, 95], ['b6', 'Cobos Bramare', '2020', '2024-10-14', 4, 4, 80, 120]]
  .map(([id, vino, anada, fecha, cantidad, enGuarda, pagado, sugerido]) => { const valorEst = sugerido * Math.pow(1.075, Math.min(anios(fecha, HOY), 10)); return { id, origen: 'Compra club', cantidad, enGuarda, fecha, pagado, sugerido, valorEst, gananciaEstiba: valorEst - sugerido, icono: false, formato: '750', vino, anada }; });
const informe = calcularValor(filasV, [{ botella: 'b3', cantidad: 1, fecha: '2025-12-20', sugeridoHist: 70 }], HOY);
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const MONTOS = {
  dolar: { mes: '2026-11', valor: D_HOY }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...compras, porMes: {}, ultimas: [], club: { botellas: 38, desde: '2025-10', costo: 1, sugerido: 2 }, regalos: [], cuotas: null },
  informe: { ...informe, plan: 'Gran Reserva', topePlan: 40, presupuestoMes: CUOTA, tuParte: { valorCava: Math.round(informe.valorCava / N), compras: Math.round(informe.compras / N) } },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: N }, total: Z, tuParte: Z, porEtiqueta: {},
};
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const API_CAVA = { ...CAVA, compras: [{ mes: '2026-09', botellas: 10, etiquetas: [] }], ultimaCompra: { mes: '2026-09', botellas: 10 } };
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
  const abrir = async (hash, espera, ancho = 390) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID);
    await ctx.route('**/api/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: API_CAVA });
      if (u.pathname === '/api/montos') return r.fulfill({ json: MONTOS });
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector(espera, { timeout: 40000 });
    await p.waitForTimeout(600);
    return { ctx, p };
  };

  // ── 1, 2 y 3 · la tarjeta del mes, de noviembre 2026 hacia atrás ──
  const { ctx: cc, p: pc } = await abrir('#compras', '[data-cm="mes"]');
  const T = {};
  const total = compras.meses.length;
  for (let k = 0; k < total; k++) {
    const t = await pc.evaluate(() => { const c = document.querySelector('[data-cm="mes"]'); return { rot: c.querySelector('.sf-rot').textContent.trim(), txt: c.innerText.replace(/\s*\n\s*/g, ' | '), dolarLinea: document.querySelector('[data-cm="dolar-mes"]')?.textContent }; });
    const mes = compras.meses[total - 1 - k].mes;
    T[mes] = t;
    if (SHOTS && ['2026-11', '2026-09', '2025-12'].includes(mes)) await pc.locator('[data-cm="mes"]').screenshot({ path: join(SHOTS, `mes-${mes}.png`) });
    if (k < total - 1) await pc.locator('[data-cm="prev"]').click();
  }
  for (const m of ['2026-11', '2026-10', '2026-09', '2025-12', '2025-11', '2025-10']) console.log(`    ${m}: ${T[m].txt}`);
  const pasados = Object.keys(T).filter(m => m < '2026-11');
  const eligiendo = pasados.filter(m => /eligiendo/i.test(T[m].txt));
  check('1. en el #001 ningún mes anterior al actual dice "seguimos eligiendo" ni "Estamos eligiendo" (todos "Sobró" o "Se pasó" con su "pasa a"/"se descuenta de"); el mes en curso, sin compras, sí',
    pasados.length === total - 1 && eligiendo.length === 0 && pasados.every(m => /(Sobró|Se pasó) \$[\d.]+ · (pasa a|se descuenta de) /.test(T[m].txt)) && /Estamos eligiendo tus vinos de este mes\./.test(T['2026-11'].txt),
    JSON.stringify({ eligiendo, ejemplo: T['2026-10'].txt }));

  const incl = T['2025-12'].txt.match(/incluye \+\$([\d.]+) de noviembre/);
  const de = t => Number((t.match(/ de \$([\d.]+)/) ?? [])[1]?.replace(/\./g, ''));
  const deDic = de(T['2025-12'].txt), deOct = de(T['2025-10'].txt);
  check('2. diciembre 2025 muestra "incluye +$X de noviembre" (lo que sobró) y su "de $Y" es mayor que el de octubre 2025, un mes sin saldo',
    !!incl && Number(incl[1].replace(/\./g, '')) === Number(pesosMes(M['2025-12'].saldoAnterior, '2025-12').replace(/[$.]/g, '')) && !/incluye/.test(T['2025-10'].txt) && deDic > deOct && deOct === Number(pesosMes(CUOTA, '2025-10').replace(/[$.]/g, '')),
    JSON.stringify({ incl: incl?.[1], saldo: M['2025-12'].saldoAnterior, deDic, deOct, dic: T['2025-12'].txt }));

  const sep = T['2026-09'].txt, deSep = de(sep);
  const esperado = Number(pesosMes(M['2026-09'].disponible, '2026-09').replace(/[$.]/g, '')), conDolarDeHoy = Math.round(M['2026-09'].disponible * D_HOY / 100) * 100;
  check('3. septiembre 2026 muestra su presupuesto al dólar de septiembre (no al de hoy), y la línea "Cada mes, al dólar oficial de ese mes" bajo la tarjeta',
    deSep === esperado && deSep !== conDolarDeHoy && deSep !== 549500 && T['2026-09'].dolarLinea === 'Cada mes, al dólar oficial de ese mes', JSON.stringify({ deSep, esperado, conDolarDeHoy, disponible: M['2026-09'].disponible, sep }));
  await cc.close();

  // ── 4 · la barra de abajo y la cabecera de desktop ──
  const { ctx: cb, p: pb } = await abrir('#compras', '.appbar');
  const barra = await pb.evaluate(() => ({ items: [...document.querySelectorAll('.appbar .appbar-item')].map(e => ({ t: e.textContent.trim(), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width), on: e.classList.contains('on') })),
    cargar: /Cargar/.test(document.querySelector('.appbar').textContent), mas: !!document.querySelector('.appbar-mas-btn'), icoValor: !!document.querySelector('.appbar-item[data-pantalla="valor"] svg.lucide'), trazo: [...document.querySelectorAll('.appbar-item svg')].map(s => s.querySelector('g')?.getAttribute('stroke-width') ?? s.getAttribute('stroke-width')) }));
  await pb.locator('.appbar-item[data-pantalla="valor"]').click();
  await pb.waitForSelector('[data-vi="pie"]', { timeout: 15000 });
  const tras = await pb.evaluate(() => ({ hash: location.hash, activo: document.querySelector('.appbar-item.on')?.textContent.trim() }));
  if (SHOTS) await pb.screenshot({ path: join(SHOTS, 'barra-valor.png') });
  await cb.close();
  const { ctx: cd, p: pd } = await abrir('#compras', '[data-cm="mes"]', 1200);
  const cab = await pd.evaluate(() => ({ nav: [...document.querySelectorAll('.tab-nav .tab-nav-item')].map(e => e.textContent.trim()), cargar: !!document.querySelector('.tab-nav-cargar, [data-cargar-top]'), txt: document.querySelector('.tab-nav').textContent }));
  await cd.close();
  check('4. la barra de abajo tiene 5 ítems (Inicio · Mi cava · Consumos · Compras · Valor) de 48 px o más, sin "Cargar" ni el botón "+"; Valor (con el chanchito de lucide, mismo trazo) lleva a #valor y queda activo; en desktop la cabecera tiene "Valor" donde estaba "Cargar"',
    JSON.stringify(barra.items.map(i => i.t)) === JSON.stringify(['Inicio', 'Mi cava', 'Consumos', 'Compras', 'Valor']) && barra.items.every(i => i.h >= 48 && i.w >= 48) && !barra.cargar && !barra.mas && barra.icoValor
    && tras.hash === '#valor' && tras.activo === 'Valor' && JSON.stringify(cab.nav) === JSON.stringify(['Inicio', 'Mi cava', 'Consumos', 'Compras', 'Valor']) && !cab.cargar && !/Cargar/.test(cab.txt),
    JSON.stringify({ barra, tras, cab }));

  // ── 5 · Valor en desktop (1200 px) y, sin cambios, en el celular ──
  const medir = async ancho => {
    const { ctx, p } = await abrir('#valor', '[data-vi="pie"]', ancho);
    const r = await p.evaluate(() => {
      const R = s => document.querySelector(s)?.getBoundingClientRect();
      const arriba = R('[data-vi="arriba"]'), pct = R('[data-vi="pct"]'), fr = R('[data-vi="franja"]'), plan = R('[data-vi="plan"]'), card = R('.vi-desc');
      const graf = R('.tv-izq'), der = R('.tv-der'), filas = [...document.querySelectorAll('.tv-filas .tv-f')].map(f => { const l = f.querySelector('span').getBoundingClientRect(), m = f.querySelector('b').getBoundingClientRect(); return Math.round(m.left - l.right); }), tv = R('.tv-informe');
      return { pct: [pct.left, pct.right, pct.top, pct.bottom], arribaDer: arriba.right, plan: [plan.left, plan.right], fr: [fr.left, fr.right, fr.top, fr.bottom], card: [card.top, card.bottom, card.right],
        graf: [graf.left, graf.right, graf.top, graf.bottom], der: [der.left, der.right, der.top], huecos: filas, ancho: Math.round(der.width), tv: [tv.left, tv.right], tvAltoDer: Math.round(der.height), desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `valor-${ancho}.png`), fullPage: true });
    await ctx.close();
    return r;
  };
  const w = await medir(1200), m = await medir(390);
  const mismaFila = w.fr[2] <= w.pct[3] && w.fr[3] >= w.pct[2];
  check('5. a 1200 px, en #valor la franja del ahorro está a la derecha del 48 % y a la misma altura (llena la caja), y la cuenta (de ~300 px, sin huecos grandes entre rótulo y monto) está a la derecha del gráfico; en el celular la franja sigue debajo y la cuenta debajo del gráfico',
    w.fr[0] >= w.pct[1] && w.fr[0] >= w.plan[1] && mismaFila && Math.abs(w.fr[2] - w.card[0]) <= 1 && Math.abs(w.fr[3] - w.card[1]) <= 1
    && w.der[0] >= w.graf[1] && Math.abs(w.ancho - 300) <= 2 && w.huecos.every(h => h <= 300) && !w.desborda
    && m.fr[2] >= m.pct[3] && m.der[2] >= m.graf[3] && !m.desborda, JSON.stringify({ w, m }));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
