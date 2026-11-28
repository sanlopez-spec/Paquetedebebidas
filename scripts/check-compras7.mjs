#!/usr/bin/env node
// Humo de "Compras ronda 7: precio por botella en el detalle del mes y ficha del vino sin costo". Local en Chromium, sin Airtable.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-compras7.mjs
//   1. un mes abierto no tiene las cajas "Al costo" / "A precio sugerido" ni "Ahorro club del mes"; sí la tabla y la franja verde
//   2. suma de costo × cantidad de las filas = "Al costo" del pie (y se informa la diferencia con la cabecera del mes)
//   3. sugerido − costo = ahorro de la franja, y el % es 1 − costo / sugerido
//   4. a 320 px ningún nombre termina en "…", no se desborda y ningún encabezado se parte
//   5. la ficha del vino no muestra "Pagaste" ni "Ahorro club" ni "Valor hoy", y deja "Precio sugerido"
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4217, BASE = `http://localhost:${PUERTO}`, ID = 'rec7kgfT9LXzYPy6a';
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); return ok; };
const resultados = [];

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `compras7-${Date.now()}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularCompras, calcularValor } = await cargarTs('api/_lib/valor.ts');

const HOY = '2026-11-15', DOLAR = 1570;
// agosto 2026 (como el mockup) con un vino a dos precios; septiembre con una compra
const F = (id, mes, vino, anada, cantidad, pagado, sugerido) => ({ id, origen: 'Compra club', cantidad, enGuarda: cantidad, fecha: `${mes}-10`, pagado, sugerido, valorEst: sugerido, gananciaEstiba: 0, icono: false, formato: '750', vino, anada: String(anada), bodega: 'B', cepa: 'C' });
const filas = [
  F('a', '2026-08', 'Kaiken Ultra Cab. Sauv.', 2007, 6, 34.4, 69.3), F('b', '2026-08', 'Casa Yague Chardonnay', 2021, 3, 14.1, 28.7),
  F('c', '2026-08', 'Kaiken Ultra Cab. Sauv.', 2015, 1, 31.8, 63.7), F('d', '2026-08', 'Kaiken Ultra Cab. Sauv.', 2021, 1, 27.3, 54.7),
  F('e', '2026-08', 'Kaiken Ultra Cab. Sauv.', 2010, 1, 33.2, 66.5), F('f', '2026-08', 'Mastrantonio 63 Premium Petit Verdot', 2015, 1, 46.1, 92.2),
  F('g', '2026-08', 'Casa Yague Chardonnay', 2021, 2, 15.3, 28.7),
  F('h', '2026-09', 'Nicasia', 2019, 4, 20, 32),
];
const compras = calcularCompras(filas, HOY, { cuota: 350, saldoInicial: 0, saldoDesde: '2026-08', dolares: { '2026-08': 1504, '2026-09': 1518, '2026-11': DOLAR } });
const informe = calcularValor(filas, [], HOY);
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const MONTOS = {
  dolar: { mes: '2026-11', valor: DOLAR }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...compras, ultimas: [], regalos: [], cuotas: null },
  informe: { ...informe, plan: 'Gran Reserva', topePlan: 40, presupuestoMes: 350, tuParte: { valorCava: 1, compras: 1 } },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7 }, total: Z, tuParte: Z, porEtiqueta: {},
};
const etiq = fs => { const m = new Map(); for (const f of fs) { const k = f.vino + f.anada; m.set(k, { vino: f.vino, anada: Number(f.anada), bodega: 'B', botellas: (m.get(k)?.botellas ?? 0) + f.cantidad }); } return [...m.values()]; };
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const mesPub = mes => { const e = etiq(filas.filter(f => f.fecha.startsWith(mes))); return { mes, botellas: e.reduce((s, x) => s + x.botellas, 0), etiquetas: e }; };
const API_CAVA = { ...CAVA, compras: [mesPub('2026-09'), mesPub('2026-08')], ultimaCompra: { mes: '2026-09', botellas: 4 } };
const SESION = { sesion: true, usuario: { nombre: 'Toto', email: 'toto@example.com', admin: false }, cavas: [{ id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'B', avatar: false, puedeAvatar: false }] };

const num = t => Number(String(t).replace(/[^\d]/g, ''));
const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  try { browser = await chromium.launch({ headless: true }); } catch (e) { if (existsSync('/opt/pw-browsers/chromium')) browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); else throw e; }
  const abrir = async (hash, espera, ancho) => {
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
    await p.waitForTimeout(500);
    return { ctx, p };
  };
  const leer = async ancho => {
    const { ctx, p } = await abrir('#compras', '[data-mes="2026-08"]', ancho);
    await p.locator('[data-mes="2026-08"] .acc-btn').click();
    await p.waitForSelector('[data-mp="2026-08"]');
    const r = await p.evaluate(() => {
      const it = document.querySelector('[data-mes="2026-08"]'), vis = e => !!e && getComputedStyle(e).display !== 'none';
      const filas = [...it.querySelectorAll('.mp-tr')].map(t => { const b = t.querySelector('.v b'); return { n: b.textContent, c: t.querySelector('.c').textContent, p: t.querySelector('.p b').textContent,
        corta: b.scrollWidth > b.clientWidth + 1 || /…/.test(b.textContent) }; });
      const th = it.querySelector('.mp-th'), ths = [...th.children].filter(vis);
      const f = k => it.querySelector(`[data-fila="${k}"]`)?.textContent ?? '';
      return { cab: it.querySelector('.acc-bot').textContent, cajas: it.querySelectorAll('.acc-cajas, .acc-caja').length, suelto: /Ahorro club del mes/.test(it.textContent),
        filas, thHijos: ths.map(e => e.textContent), thPartido: ths.some(e => e.getBoundingClientRect().height > 18),
        sug: f('sugerido'), costo: f('costo'), total: f('total'), aho: f('ahorro'), ahoVis: vis(it.querySelector('[data-fila="ahorro"]')),
        scroll: document.documentElement.scrollWidth > innerWidth };
    });
    await ctx.close();
    return r;
  };
  const m = await leer(390), c = await leer(320);
  resultados.push(check('1. un mes abierto no tiene las cajas "Al costo" / "A precio sugerido" ni "Ahorro club del mes", y sí la tabla y la franja verde',
    m.cajas === 0 && !m.suelto && m.filas.length === 7 && m.ahoVis && /Ahorro club/.test(m.aho), JSON.stringify({ cajas: m.cajas, suelto: m.suelto, filas: m.filas.length })));
  const sumaC = m.filas.reduce((s, f) => s + num(f.c) * num(f.p), 0), costoPie = num(m.costo.replace('Al costo', ''));
  const cabMonto = num(m.cab.split('·')[1] ?? '');
  console.log(`    cabecera del mes: ${cabMonto} · suma de las filas: ${sumaC} · diferencia ${sumaC - cabMonto}`);
  resultados.push(check('2. suma de costo × cantidad de las filas = "Al costo" del pie', sumaC === costoPie, JSON.stringify({ sumaC, costoPie, cabMonto })));
  const sugPie = num(m.sug.replace('A precio sugerido', '')), pct = Number(m.aho.match(/(\d+) %/)?.[1]), ahorro = num(m.aho.split('%')[1]);
  resultados.push(check('3. sugerido − costo = ahorro de la franja, y el % es 1 − costo / sugerido',
    sugPie - costoPie === ahorro && pct === Math.round((1 - costoPie / sugPie) * 100), JSON.stringify({ sugPie, costoPie, ahorro, pct })));
  resultados.push(check('4. a 320 px ningún nombre termina en "…" ni se corta, y ningún encabezado se parte (ni hay scroll horizontal)',
    c.filas.length === 7 && c.filas.every(f => !f.corta) && !c.thPartido && c.thHijos.length === 3 && !c.scroll && !m.thPartido,
    JSON.stringify({ filas: c.filas.filter(f => f.corta), th: c.thHijos, partido: c.thPartido, scroll: c.scroll })));

  const { ctx: cf, p: pf } = await abrir('#catalogo', '.bt-fila', 390);
  await pf.locator('.bt-fila').first().click();
  await pf.waitForSelector('.bt-ficha [data-bloque="valor"]');
  const ficha = await pf.evaluate(() => document.querySelector('.bt-ficha [data-bloque="valor"]').textContent);
  await cf.close();
  resultados.push(check('5. la ficha del vino no muestra "Pagaste", "Ahorro club" ni "Valor hoy", y deja "Precio sugerido"',
    !/Pagaste|Ahorro club|Valor hoy|USD \d+ · hoy/.test(ficha) && /Precio sugerido/.test(ficha), ficha));
} finally { await browser?.close().catch(() => {}); srv.kill(); }
const ok = resultados.filter(Boolean).length;
console.log(`\n${ok}/5`);
process.exit(ok === 5 ? 0 : 1);
