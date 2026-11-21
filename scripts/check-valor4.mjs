#!/usr/bin/env node
// Humo de "Valor ronda 4": Valor como sección, valor arriba, barras horizontales y el arrastre de Compras. Local en Chromium, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-valor4.mjs [--shots <carpeta>]
//   1. en #valor a 1200 px se ve el menú de la app con "Valor" marcado, y no hay "←" (salvo el "← Volver al club" de la cabecera de la app, igual que en Compras)
//   2. el primer bloque de #valor contiene "VALOR DE LA CAVA" y "$43,5 millones" (#001), antes del gráfico
//   3. "Descuento año por año" del #001 tiene 6 renglones de ≤ 20 px; con un fixture de 1 año, la caja del gráfico mide menos de 80 px
//   4. "Tu parte" aparece una sola vez en #valor
//   5. en Compras del #001, el monto de "Se pasó $X" de agosto 2026 es igual al de "incluye −$X de agosto" de septiembre
// Usa las cuentas reales de api/_lib/valor.ts con un fixture local y contesta la sesión, /api/cava y /api/montos desde el navegador.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4211, BASE = `http://localhost:${PUERTO}`;
const ID = 'rec7kgfT9LXzYPy6a';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `valor4-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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
const informe = { ...calcularValor(filasV, [{ botella: 'b3', cantidad: 1, fecha: '2025-12-20', sugeridoHist: 70 }], HOY), valorCava: 27685 };
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const MONTOS = {
  dolar: { mes: '2026-11', valor: D_HOY }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...compras, porMes: {}, ultimas: [], club: { botellas: 42, desde: '2021-08', costo: 1, sugerido: 2 }, regalos: [], cuotas: null },
  informe: { ...informe, plan: 'Gran Reserva', topePlan: 40, presupuestoMes: CUOTA, tuParte: { valorCava: Math.round(informe.valorCava / N), compras: Math.round(informe.compras / N) } },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: N }, total: Z, tuParte: Z, porEtiqueta: {},
};
const UN_ANIO = { ...MONTOS, informe: { ...MONTOS.informe, descuento: { ...MONTOS.informe.descuento, porAnio: [{ anio: 2026, pct: 38, botellas: 12 }] } } };
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
  const abrir = async (hash, espera, ancho = 390, montos = MONTOS) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); localStorage.removeItem('edb-club-moneda'); } catch {} }, ID);
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

  // ── 1 y 2 · #valor a 1200 px ──
  const { ctx: cw, p: pw } = await abrir('#valor', '[data-vi="pie"]', 1200);
  if (SHOTS) await pw.screenshot({ path: join(SHOTS, 'valor-1200.png'), fullPage: true });
  const w = await pw.evaluate(() => {
    const nav = [...document.querySelectorAll('.tab-nav .tab-nav-item')];
    const visible = e => !!e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none';
    const primero = document.querySelector('[data-banda="1"]');
    const graf = document.querySelector('[data-tv="grafico"]');
    return {
      navVisible: visible(document.querySelector('.tab-nav')), marcado: nav.filter(e => e.classList.contains('on')).map(e => e.textContent.trim()),
      // la cabecera de la app en /club/cava tiene su "← Volver al club" (igual en Compras): esa no cuenta; la de "← Valor de la cava" no tiene que estar
      flecha: [...document.querySelectorAll('button, a')].some(e => visible(e) && e.textContent.trim() === '←' && !e.matches('.tab-top a.tab-back[aria-label="Volver al club"]')),
      volverAlClub: !!document.querySelector('.tab-top a.tab-back[aria-label="Volver al club"]'),
      primero: primero?.innerText.replace(/\s+/g, ' ').trim(),
      antes: !!primero && !!graf && !primero.contains(graf) && !!(primero.compareDocumentPosition(graf) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  });
  await cw.close();
  check('1. en #valor a 1200 px se ve el menú de la app con "Valor" marcado, y no hay "←"',
    w.navVisible && JSON.stringify(w.marcado) === '["Valor"]' && !w.flecha, JSON.stringify(w));
  check('2. el primer bloque de #valor contiene "VALOR DE LA CAVA" y "$43,5 millones", antes del gráfico',
    /VALOR DE LA CAVA/.test(w.primero ?? '') && /\$43,5 millones/.test(w.primero ?? '') && w.antes, JSON.stringify(w));

  // ── 3 y 4 · barras horizontales y "Tu parte" (celular) ──
  const { ctx: cm, p: pm } = await abrir('#valor', '[data-vi="pie"]');
  if (SHOTS) await pm.screenshot({ path: join(SHOTS, 'valor-390.png'), fullPage: true });
  const m = await pm.evaluate(() => ({
    filas: [...document.querySelectorAll('[data-vi="anios"] [data-vi="anio"]')].map(f => Math.round(f.getBoundingClientRect().height * 10) / 10),
    partes: (document.querySelector('[data-vi="pantalla"]').innerText.match(/tu parte/gi) ?? []).length,
  }));
  await cm.close();
  const { ctx: c1, p: p1 } = await abrir('#valor', '[data-vi="pie"]', 390, UN_ANIO);
  if (SHOTS) await p1.locator('[data-vi="anios"]').screenshot({ path: join(SHOTS, 'anios-1.png') });
  const uno = await p1.evaluate(() => ({ filas: document.querySelectorAll('[data-vi="anios"] [data-vi="anio"]').length, alto: Math.round(document.querySelector('[data-vi="anios-caja"]').getBoundingClientRect().height) }));
  await c1.close();
  check('3. "Descuento año por año" tiene 6 renglones de ≤ 20 px; con 1 año, un renglón y la caja del gráfico mide menos de 80 px',
    m.filas.length === 6 && m.filas.every(h => h <= 20) && uno.filas === 1 && uno.alto < 80, JSON.stringify({ filas: m.filas, uno }));
  check('4. "Tu parte" aparece una sola vez en #valor', m.partes === 1, JSON.stringify(m));

  // ── 5 · Compras: el saldo de agosto es el mismo número en agosto y en septiembre ──
  const { ctx: cc, p: pc } = await abrir('#compras', '[data-cm="mes"]');
  const T = {};
  for (let k = compras.meses.length - 1; k >= 0; k--) {
    const mes = compras.meses[k].mes;
    T[mes] = (await pc.locator('[data-cm="mes"]').innerText()).replace(/\s*\n\s*/g, ' | ');
    if (SHOTS && ['2026-08', '2026-09'].includes(mes)) await pc.locator('[data-cm="mes"]').screenshot({ path: join(SHOTS, `mes-${mes}.png`) });
    if (mes === '2026-08') break;
    await pc.locator('[data-cm="prev"]').click();
  }
  await cc.close();
  const ago = (T['2026-08'].match(/Se pasó (\$[\d.]+)/) ?? [])[1], sep = (T['2026-09'].match(/incluye −(\$[\d.]+) de agosto/) ?? [])[1];
  console.log(`    ago 2026: ${T['2026-08']}\n    sep 2026: ${T['2026-09']}`);
  check('5. en Compras, el monto de "Se pasó $X" de agosto 2026 es igual al de "incluye −$X de agosto" de septiembre', !!ago && ago === sep, JSON.stringify({ ago, sep }));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
