#!/usr/bin/env node
// Humo de "Compras ronda 9: la cuenta corriente en pesos y la tarjeta azul con flechas en el panel". Local en Chromium, SIN Airtable real:
// la app recibe /api/montos armado con calcularCompras y el panel usa las acciones reales de api/_lib/compras-admin.ts sobre una base en memoria.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-compras9.mjs
//   1. la cadena del #001 (7 socios × $77.400, Saldo desde agosto), al peso: agosto −$1.256 → septiembre −$22.556 → octubre +$519.244 → noviembre $1.061.044
//   2. en la app, el "Sobró / Se pasó $X" de un mes es el "incluye ±$X" del siguiente (siempre en pesos, también con el botón en USD)
//   3. en el panel, de septiembre › va a octubre (sin compras) y después a noviembre; en el primero ‹ apagada y en el último › apagada
//   4. la tarjeta y la tabla muestran el mismo mes y el Comprado de la tarjeta es el "Total del mes" de la tabla; la cuenta del mes cierra
//   5. a 320 y 390 px ningún rótulo ni monto de la tarjeta se parte (ni hay scroll horizontal)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4239, BASE = `http://localhost:${PUERTO}`;
process.env.AIRTABLE_TOKEN = 'pat-de-prueba'; process.env.AIRTABLE_WRITE_TOKEN = 'pat-de-prueba';
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); return ok; };
const resultados = [];
async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `c9-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularCompras, calcularValor } = await cargarTs('api/_lib/valor.ts');
const pesos = n => (n < 0 ? '−' : '') + '$' + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ── 1 · el #001 ──
const HOY = '2026-11-28', MESHOY = HOY.slice(0, 7);
const DOLARES = { '2026-08': 1504.63, '2026-09': 1518.69, '2026-10': 1550, '2026-11': 1570 };
const filasGuarda = Object.fromEntries(['2026-08', '2026-09', '2026-10', '2026-11'].map(m => [m, { mes: m, cuotaSocio: 77400, guarda: 21700 }]));
// agosto 12 botellas por $543.056 y septiembre 15 por $563.100 (Pagado ARS por botella)
const bot = (id, mes, cant, ars) => ({ id, origen: 'Compra club', cantidad: cant, enGuarda: cant, fecha: `${mes}-05`, pagado: ars / DOLARES[mes], sugerido: 0, valorEst: 0, gananciaEstiba: 0, icono: false, formato: '750', pagadoArs: ars });
const B001 = [bot('a1', '2026-08', 11, 45256), bot('a2', '2026-08', 1, 45240), bot('s1', '2026-09', 14, 37540), bot('s2', '2026-09', 1, 37540)];
const C001 = calcularCompras(B001, HOY, { cuota: 350, saldoInicial: 0, saldoDesde: '2026-08', dolares: DOLARES, plan: { filas: filasGuarda, dolares: DOLARES, cuotaUsdSocio: 50 }, socios: 7 });
const M = Object.fromEntries(C001.meses.map(m => [m.mes, m]));
const esp = {
  '2026-08': [541800, null, 0, 541800, 543056, -1256, 12], '2026-09': [541800, -1256, null, 540544, 563100, -22556, 15],
  '2026-10': [541800, -22556, null, 519244, 0, 519244, 0], '2026-11': [541800, 519244, null, 1061044, 0, 1061044, 0],
};
const mal = Object.entries(esp).filter(([mes, [c, sa, si, d, a, q, b]]) => { const x = M[mes]; return !x || x.cuota !== c || x.saldoAnterior !== sa || x.saldoInicial !== si || x.disponible !== d || x.asignado !== a || x.queda !== q || x.botellas !== b; });
resultados.push(check('1. #001 al peso: presupuesto $541.800 · agosto pasa −$1.256 · septiembre (104 %) pasa −$22.556 · octubre pasa +$519.244 · noviembre: para comprar $1.061.044',
  mal.length === 0 && Math.round(M['2026-09'].asignado / M['2026-09'].disponible * 100) === 104, JSON.stringify(mal.map(([m]) => M[m]))));

// ── el Airtable en memoria (panel) ──
const CAVA = 'recCava0000000009';
const T = { botellas: 'tblZIXNa2Ck3DNCwS', cavas: 'tblMlk7zZG5WreEL5', cambio: 'tbl22foumsLmMopOs', guarda: 'tblMLbnBu01srMvaX', membresias: 'tblETY9OBswoLrsxM' };
const F = { vino: 'fldUZflAbSpmIdK20', cava: 'fldekIJ54IKI1gd2R', bodega: 'fldsFEvABrBwU5fBn', anada: 'fldKC7gp51yfg7wtF', cepa: 'fldL0kHShpmW0EHc1', formato: 'fld1BEs0Q3KVb3Na6',
  cantidad: 'fldm87g7J9lHhI8pM', fecha: 'fld9RAJzfNv0du6iW', pagadoArs: 'fld7kmHUsYsQrMPxv', sugeridoArs: 'fldhhYrxkUpjTKEb9', consumidas: 'fldD5WKffD2MD03z8', mesTc: 'fld8zKmDSDftsrf2K',
  tcValor: 'fldhi9rlfEJdnylCY', pagadoUsd: 'fldv4njMaHOaG2yOY', sugeridoUsd: 'fldDzDpsRhlBVetGQ', origen: 'fldA3mlzf0ZkPy3nM', enGuarda: 'fldMTLDQLjYDZQRa2' };
const TC = { '2026-08': 'recTCagosto0000a', '2026-09': 'recTCseptiem0000', '2026-10': 'recTCoctubre0000', '2026-11': 'recTCnoviemb0000' };
const linea = (id, mes, vino, cant, ars, sug) => ({ id, createdTime: '2026-01-01', fields: { [F.vino]: vino, [F.cava]: [CAVA], [F.bodega]: 'Bodega', [F.anada]: 2020, [F.cepa]: 'Malbec', [F.formato]: '750',
  [F.cantidad]: cant, [F.fecha]: `${mes}-01`, [F.origen]: 'Compra club', [F.mesTc]: [TC[mes]], [F.tcValor]: DOLARES[mes], [F.consumidas]: 0, [F.enGuarda]: cant,
  [F.pagadoArs]: ars, [F.sugeridoArs]: sug, [F.pagadoUsd]: ars / DOLARES[mes], [F.sugeridoUsd]: sug / DOLARES[mes] } });
const DB = {
  [T.botellas]: [linea('recL0000000000001', '2026-08', 'Uno de agosto', 2, 40000, 80000), linea('recL0000000000002', '2026-09', 'Uno de septiembre', 1, 70000, 140000)],
  [T.cavas]: [{ id: CAVA, createdTime: '2026-01-01', fields: { fldfcZ0QRQmCQkWYo: 50, fldMPx4VJUx6kHPPr: 0, fldspJQEGYiEkmr8J: '2026-08-01', fldHoennfWz2cEd5t: '2026-08-01' } }],
  [T.cambio]: Object.entries(TC).map(([mes, id], i) => ({ id, createdTime: `2026-01-0${i + 1}`, fields: { fldQqnVlVgkMedg35: mes, fldUQpfvTQ5CzYSDC: DOLARES[mes] } })),
  [T.guarda]: Object.keys(TC).map((mes, i) => ({ id: `recGuarda000000${i}x`, createdTime: '2026-01-01', fields: { fldpQXcs0f3qEM05k: mes, fldPFVgRQ82uVEbhP: [CAVA], fldQozvm5jesvnPvC: 77400, fldrAnishW5P7Px0G: 21700 } })),
  [T.membresias]: [],
};
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== 'api.airtable.com') return fetchReal(url, init);
  if ((init.method ?? 'GET') !== 'GET') return new Response(JSON.stringify({ error: 'modo seco' }), { status: 500 });
  const tabla = u.pathname.split('/')[3], fm = u.searchParams.get('filterByFormula') ?? '';
  const m1 = fm.match(/^RECORD_ID\(\)='(rec\w+)'$/), m2 = fm.match(/^\{Mes\}='([\d-]+)'$/);
  const sel = (DB[tabla] ?? []).filter(r => (m1 ? r.id === m1[1] : m2 ? r.fields.fldQqnVlVgkMedg35 === m2[1] : true));
  return new Response(JSON.stringify({ records: sel }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const A = await cargarTs('api/_lib/compras-admin.ts');

// ── la app (/api/montos armado a mano) ──
const ID = 'rec7kgfT9LXzYPy6a', Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const informe = calcularValor([], [], HOY);
const MONTOS = { dolar: { mes: MESHOY, valor: 1570 }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...C001, porMes: {}, filasMes: {}, ultimas: [], club: { botellas: 27, desde: '2026-08', costo: 1, sugerido: 2 }, regalos: [], cuotas: null },
  informe: { ...informe, plan: 'Gran Reserva', topePlan: 40, presupuestoMes: 350, tuParte: { valorCava: 1, compras: 1 } },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7 }, total: Z, tuParte: Z, porEtiqueta: {} };
const CAVA_PUB = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const SESION = admin => ({ sesion: true, usuario: { nombre: 'Toto', email: 'toto@example.com', admin }, cavas: [{ id: admin ? CAVA : ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'B', avatar: false, puedeAvatar: false }] });
const FICHA = { dolar: { mes: MESHOY, valor: 1570 }, hoy: HOY, mesHoy: MESHOY, usuarios: [], pagos: [],
  cava: { id: CAVA, numero: '#009', nombre: 'Prueba', tipo: 'individual', fundacion: '2026-08-01', plan: 'Reserva', cuotaUsd: 50, socios: [], enGuarda: 3, deuda: { n: 0, ars: 0, meses: 0 }, mesActual: null,
    cuotaSocioUsd: 50, saldoInicial: 0, saldoDesde: '2026-08', cuotasDesde: '2026-08', notas: '', grupoId: null, mesesArs: [], guarda: [] } };

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  try { browser = await chromium.launch({ headless: true }); } catch (e) { if (existsSync('/opt/pw-browsers/chromium')) browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); else throw e; }
  const abrir = async (hash, espera, { admin = false, ancho = 390, usd = false } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(([id, usd]) => { try { localStorage.setItem('edb_cava', id); if (usd) localStorage.setItem('edb-club-moneda', 'USD'); } catch {} }, [admin ? CAVA : ID, usd]);
    await ctx.route('**/api/**', async r => {
      const u = new URL(r.request().url()), a = u.searchParams.get('action');
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION(admin) });
      if (u.pathname === '/api/cava') return r.fulfill({ json: CAVA_PUB });
      if (u.pathname === '/api/montos') return r.fulfill({ json: MONTOS });
      if (u.pathname === '/api/admin-cavas') {
        if (a === 'detail') return r.fulfill({ json: FICHA });
        if (a === 'list') return r.fulfill({ json: { dolar: FICHA.dolar, mesHoy: MESHOY, cavas: [], usuarios: [], totales: { cavas: 0, grupales: 0, individuales: 0, catalogo: 0, socios: 0, cuotaUsd: 0, deudaArs: 0, deudores: 0 } } });
        if (a === 'comprasMes') return r.fulfill({ json: await A.comprasMes(u.searchParams.get('cava'), u.searchParams.get('mes') || undefined) });
      }
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector(espera, { timeout: 40000 });
    await p.waitForTimeout(500);
    return { ctx, p };
  };

  // ── 2 · la app: la cadena de la tarjeta del mes, con el botón en USD ──
  const { ctx, p } = await abrir('#compras', '[data-cm="mes"]', { usd: true });
  const Tx = {};
  for (let k = 0; k < C001.meses.length; k++) {
    const t = await p.evaluate(() => ({ pie: document.querySelector('[data-cm="queda"]').textContent.trim(), num: document.querySelector('[data-cm="mes"] .cm-num').textContent }));
    Tx[C001.meses[C001.meses.length - 1 - k].mes] = t;
    if (k < C001.meses.length - 1) await p.locator('[data-cm="prev"]').click();
  }
  await ctx.close();
  const x = t => (t.match(/(Se pasó|Sobró|Faltan) \$([\d.]+)/) ?? []).slice(1);
  const inc = t => (t.match(/incluye ([−+])\$([\d.]+)/) ?? []).slice(1);
  const cadena = [['2026-08', '2026-09'], ['2026-09', '2026-10'], ['2026-10', '2026-11']].every(([a, b]) => {
    const [que, monto] = x(Tx[a].pie), [signo, m2] = inc(Tx[b].pie);
    return monto && monto === m2 && ((que === 'Se pasó' && signo === '−') || (que === 'Sobró' && signo === '+'));
  });
  resultados.push(check('2. app: "Se pasó $1.300" de agosto = "incluye −$1.300" de septiembre, y así cada mes; la tarjeta va en pesos aunque el botón esté en USD',
    cadena && /^Se pasó \$1\.300 · se descuenta de septiembre$/.test(Tx['2026-08'].pie) && Object.values(Tx).every(t => !/USD/.test(t.pie + t.num)), JSON.stringify(Tx)));

  // ── 3, 4 y 5 · el panel ──
  const sel = '[data-adm="compras-mes"]';
  const { ctx: c2, p: p2 } = await abrir(`#admin/${CAVA}`, `${sel} [data-cc="comprado"]`, { admin: true, ancho: 1200 });
  const leer = () => p2.evaluate(s => {
    const t = document.querySelector(s);
    return { mes: t.dataset.mes, rot: t.querySelector('[data-cm="rot"]').textContent, prev: t.querySelector('[data-cm="prev"]').disabled, next: t.querySelector('[data-cm="next"]').disabled,
      celdas: Object.fromEntries([...t.querySelectorAll('[data-cc]')].map(e => [e.dataset.cc, e.textContent])) };
  }, sel);
  const irA = async (flecha, mesTxt) => { await p2.locator(`${sel} [data-cm="${flecha}"]`).click(); await p2.waitForFunction(([s, m]) => document.querySelector(s + ' [data-cm="rot"]').textContent.startsWith(m) && !/…/.test(document.querySelector(s).textContent), [sel, mesTxt]); await p2.waitForTimeout(200); };
  const nov = await leer();
  await irA('prev', 'OCTUBRE'); await irA('prev', 'SEPTIEMBRE');
  const sep = await leer();
  await irA('next', 'OCTUBRE');
  const oct = await leer();
  await irA('next', 'NOVIEMBRE');
  const nov2 = await leer();
  await irA('prev', 'OCTUBRE'); await irA('prev', 'SEPTIEMBRE'); await irA('prev', 'AGOSTO');
  const ago = await leer();
  resultados.push(check('3. panel: de septiembre › va a octubre (sin compras, "OCTUBRE 2026") y después a noviembre; agosto (el primero) con ‹ apagada y noviembre (el último) con › apagada',
    /^SEPTIEMBRE 2026 · 1 BOTELLA$/.test(sep.rot) && oct.rot === 'OCTUBRE 2026' && oct.celdas.comprado === 'Comprado · 0 %$0' && nov2.rot === 'NOVIEMBRE 2026' && nov.next && !nov.prev && ago.prev && !ago.next && /AGOSTO 2026 · 2 BOTELLAS/.test(ago.rot),
    JSON.stringify({ nov, sep, oct, nov2, ago })));
  // la cuenta de septiembre y su tabla
  await irA('next', 'SEPTIEMBRE');
  await p2.locator(sel).click();
  await p2.waitForSelector('[data-adm="compras-mes-sec"] tfoot');
  const s4 = await p2.evaluate(s => ({ tarjeta: document.querySelector(s).dataset.mes, tabla: document.querySelector('[data-adm="compras-mes-sec"]').dataset.mes,
    comprado: document.querySelector(s + ' [data-cc="comprado"] b').textContent, total: document.querySelector('[data-adm="compras-mes-sec"] [data-fila="total"] td:nth-child(4)').textContent,
    celdas: Object.fromEntries([...document.querySelectorAll(s + ' [data-cc]')].map(e => [e.dataset.cc, e.textContent])), ver: document.querySelector('[data-adm="compras-ver"]').textContent,
    pisados: [...document.querySelectorAll(s + ' .cc-t')].filter(e => [...e.children].some(k => k.scrollWidth > e.clientWidth + 1)).map(e => e.textContent), ancho: Math.round(document.querySelector(s).getBoundingClientRect().width) }), sel);
  // agosto: presupuesto 77.400, compra 80.000 → pasa −2.600; septiembre: 77.400 − 2.600 = 74.800, compra 70.000 → pasa +4.800
  resultados.push(check('4. la tarjeta y la tabla muestran septiembre; Comprado de la tarjeta = Total del mes; cuenta: Presupuesto $77.400 · Saldo de agosto −$2.600 · Para comprar $74.800 · Comprado · 94 % $70.000 · Pasa a octubre +$4.800',
    s4.tarjeta === '2026-09' && s4.tabla === '2026-09' && s4.comprado === s4.total && s4.total === '$70.000' && s4.celdas.presupuesto === 'Presupuesto$77.400' && s4.celdas.saldo === 'Saldo de agosto−$2.600'
      && s4.celdas['para-comprar'] === 'Para comprar$74.800' && s4.celdas.comprado === 'Comprado · 94 %$70.000' && s4.celdas.queda === 'Pasa a octubre+$4.800' && /Ocultar/.test(s4.ver) && !s4.pisados.length && s4.ancho > 900, JSON.stringify(s4)));
  await c2.close();

  const vistas = [];
  for (const w of [320, 390]) {
    const { ctx: c3, p: p3 } = await abrir(`#admin/${CAVA}`, `${sel} [data-cc="comprado"]`, { admin: true, ancho: w });
    await p3.locator(`${sel} [data-cm="prev"]`).click();
    await p3.waitForFunction(s => document.querySelector(s + ' [data-cm="rot"]').textContent.startsWith('OCTUBRE') && !/…/.test(document.querySelector(s).textContent), sel);
    await p3.locator(`${sel} [data-cm="prev"]`).click();
    await p3.waitForFunction(s => document.querySelector(s + ' [data-cm="rot"]').textContent.startsWith('SEPTIEMBRE') && !/…/.test(document.querySelector(s).textContent), sel);
    vistas.push({ w, ...(await p3.evaluate(s => {
      const t = document.querySelector(s);
      const linea = e => { const cs = getComputedStyle(e); return e.getBoundingClientRect().height <= parseFloat(cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.3 : cs.lineHeight) * 1.4 + 2; };
      const piezas = [...t.querySelectorAll('.cc-t span, .cc-t b, .sf-rot, .adm-cm-ver, .adm-cm-aviso')];
      return { partidos: piezas.filter(e => !linea(e)).map(e => e.textContent), scroll: document.documentElement.scrollWidth > innerWidth,
        fuera: piezas.filter(e => e.getBoundingClientRect().right > t.getBoundingClientRect().right + 1).map(e => e.textContent), rot: t.querySelector('.sf-rot').innerText.trim() };
    }, sel)) });
    await c3.close();
  }
  resultados.push(check('5. a 320 y 390 px ningún rótulo ni monto de la tarjeta se parte ni se sale, sin scroll horizontal (a 320 px el rótulo va sin las botellas)',
    vistas.every(v => !v.partidos.length && !v.fuera.length && !v.scroll) && vistas[0].rot === 'SEPTIEMBRE 2026' && /SEPTIEMBRE 2026 · 1 BOTELLA/.test(vistas[1].rot), JSON.stringify(vistas)));
} finally { await browser?.close().catch(() => {}); srv.kill(); }
const ok = resultados.filter(Boolean).length;
console.log(`\n${ok}/5`);
process.exit(ok === 5 ? 0 : 1);
