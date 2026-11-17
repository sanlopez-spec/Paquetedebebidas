#!/usr/bin/env node
// Humo de "Compras ronda 4 y Valor ronda 3": el selector con flechas común (tarjeta del mes, año de Mes por mes y juntadas de Consumos),
// la tarjeta del mes sin renglones vacíos, un vino por renglón, la cabecera de #valor y la tarjeta de descuento. Local en Chromium, sin Airtable.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-flechas.mjs [--shots <carpeta>]
//   1. los tres selectores usan el mismo componente (SelectorFlechas) y en ninguno el texto está centrado
//   2. las tarjetas del mes de septiembre, octubre y noviembre del #001 tienen el mismo alto (±2 px) y ninguna tiene un renglón vacío
//   3. en Mes por mes y en el top 5 de Valor, ningún vino ocupa más de un renglón a 320 px
//   4. la cabecera de #valor tiene la misma altura que la de #compras (±2 px)
//   5. en #valor no aparecen las píldoras viejas, ni "tu plan:" en el gráfico, ni la nota de regalos
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4208, BASE = `http://localhost:${PUERTO}`;
const ID = 'rec7kgfT9LXzYPy6a';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `flechas-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularCompras, calcularValor } = await cargarTs('api/_lib/valor.ts');

// ── fixture de Compras: la cava #001 (cuota USD 350, dólar $1.570, "Saldo desde" noviembre); agosto USD 374, septiembre 348, octubre y noviembre sin compras ──
const HOY = '2026-11-15', D = 1570, N = 7, CUOTA = 350;
const bot = (mes, cant, usd) => ({ id: 'z' + mes, origen: 'Compra club', cantidad: cant, enGuarda: cant, fecha: `${mes}-10`, pagado: usd / cant, sugerido: 0, valorEst: 0, gananciaEstiba: 0, icono: false, formato: '750' });
const compras = calcularCompras([bot('2026-08', 13, 374), bot('2026-09', 14, 348.04)], HOY, { cuota: CUOTA, saldoInicial: 0, saldoDesde: '2026-11' });

// ── fixture de Valor: ocho compras del club en cinco años y un regalo (para que antes saliera la nota de "sin precio") ──
const anios = (d, h) => { const [a1, m1, d1] = d.split('-').map(Number), [a2, m2, d2] = h.split('-').map(Number); let n = a2 - a1; if (m2 < m1 || (m2 === m1 && d2 < d1)) n--; return Math.max(0, n); };
const COMPRAS = [
  ['b1', 'Superuco Genitori Gualta Cab. Franc - Malbec', '2016', '2022-04-10', 6, 6, 70, 100], ['b2', 'Cheval des Andes', '2017', '2022-09-05', 4, 4, 55, 80],
  ['b3', 'Rutini Apartado', '2018', '2023-05-12', 6, 5, 45, 70], ['b4', 'Nicasia', '2019', '2023-11-20', 12, 10, 20, 32],
  ['b5', 'Catena Zapata', '2019', '2024-06-03', 6, 6, 60, 95], ['b6', 'Cobos Bramare', '2020', '2024-10-14', 4, 4, 80, 120],
  ['b7', 'Superuco Genitori Gualta Cab. Franc - Malbec', '2018', '2025-04-22', 6, 6, 50, 75], ['b8', 'Zuccardi Aluvional', '2021', '2026-03-30', 12, 12, 30, 48],
];
const filas = COMPRAS.map(([id, vino, anada, fecha, cantidad, enGuarda, pagado, sugerido]) => {
  const valorEst = sugerido * Math.pow(1.075, Math.min(anios(fecha, HOY), 10));
  return { id, origen: 'Compra club', cantidad, enGuarda, fecha, pagado, sugerido, valorEst, gananciaEstiba: valorEst - sugerido, icono: false, formato: '750', vino, anada };
});
filas.push({ id: 'r1', origen: 'Regalo', cantidad: 2, enGuarda: 2, fecha: '2025-12-01', pagado: 0, sugerido: 0, valorEst: 0, gananciaEstiba: 0, icono: false, formato: '750', vino: 'Regalo', anada: '2019' });
const informe = calcularValor(filas, [{ botella: 'b3', cantidad: 1, fecha: '2025-12-20', sugeridoHist: 70 }], HOY);
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const montos = (plan, tope) => ({
  dolar: { mes: '2026-11', valor: D }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...compras, porMes: {}, ultimas: [], club: { botellas: 56, desde: '2022-04', costo: 1, sugerido: 2 }, regalos: [], cuotas: null },
  informe: { ...informe, plan, topePlan: tope, presupuestoMes: CUOTA, tuParte: { valorCava: Math.round(informe.valorCava / N), compras: Math.round(informe.compras / N) } },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: N }, total: Z, tuParte: Z, porEtiqueta: {},
});
const GRAN = montos('Gran Reserva', 40);

// ── /api/cava: Mes por mes con nombres largos y las juntadas de Consumos (dos años, para cruzar de 2026 a 2025) ──
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const fila = (vino, anada) => ({ vino, anada, cepa: 'Malbec', tipo: 'tinto', vivino: 4.1, bodega: 'Bodega', pais: 'Argentina', provincia: 'Mendoza', region: 'Valle de Uco', n: 1 });
const JUNTADAS = [['2025-03', 12], ['2025-09', 20], ['2026-02', 7], ['2026-10', 17]].map(([mes, dia]) => ({ clave: 't:' + mes, mes, dia, foto: false, filas: [fila('Gran Enemigo', 2016), fila('Cheval des Andes', 2017)] }));
const API_CAVA = { ...CAVA,
  compras: [{ mes: '2026-09', botellas: 14, etiquetas: [{ vino: 'Gran Enemigo', anada: 2018, bodega: 'Zuccardi', botellas: 4 }, { vino: 'Superuco Genitori Gualta Cab. Franc - Malbec', anada: 2018, bodega: 'Superuco', botellas: 6 }, { vino: 'Sin añada', anada: null, bodega: 'X', botellas: 1 }] }],
  ultimaCompra: { mes: '2026-09', botellas: 14 }, consumos: { juntadas: JUNTADAS } };
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
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID);
    await ctx.route('**/api/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: API_CAVA });
      if (u.pathname === '/api/montos') return r.fulfill({ json: GRAN_O_REAL });
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector(espera, { timeout: 40000 });
    await p.waitForTimeout(600);
    return { ctx, p };
  };
  // un solo /api/montos: la cava #001 con sus compras y su informe de valor
  var GRAN_O_REAL = GRAN;

  // ── 1 y 2 · Compras ──
  const { ctx: cc, p: pc } = await abrir('#compras', '[data-cm="mes"]');
  const R = {};
  for (const mes of ['2026-11', '2026-10', '2026-09']) {
    R[mes] = await pc.evaluate(() => {
      const c = document.querySelector('[data-cm="mes"]'), r = e => e.getBoundingClientRect();
      const lineas = c.innerText.split('\n').map(x => x.trim());
      return { alto: Math.round(r(c).height * 10) / 10, rot: c.querySelector('.sf-rot').textContent.trim(), lineas, vacias: lineas.filter(x => x === '').length, bot: !!c.querySelector('.cm-bot'), incl: !!c.querySelector('[data-cm="incluye"]'),
        texto: c.innerText.replace(/\s*\n\s*/g, ' | ') };
    });
    if (mes !== '2026-09') await pc.locator('[data-cm="prev"]').click();
  }
  for (const [m, r] of Object.entries(R)) console.log(`    #001 ${m}: ${r.texto} (alto ${r.alto})`);
  check('2. las tarjetas del mes de septiembre, octubre y noviembre del #001 tienen el mismo alto (±2 px), ninguna con un renglón vacío ni el renglón de botellas aparte; el rótulo lleva las botellas',
    Math.abs(R['2026-11'].alto - R['2026-09'].alto) <= 2 && Math.abs(R['2026-10'].alto - R['2026-09'].alto) <= 2 && Object.values(R).every(r => r.vacias === 0 && !r.bot && !r.incl)
    && R['2026-09'].rot === 'SEPTIEMBRE 2026 · 14 BOTELLAS' && R['2026-10'].rot === 'OCTUBRE 2026' && R['2026-11'].rot === 'ESTE MES · NOVIEMBRE 2026', JSON.stringify(R));
  if (SHOTS) { await pc.locator('[data-cm="mes"]').screenshot({ path: join(SHOTS, 'tarjeta-mes.png') }); }

  // selector de la tarjeta, del año de Mes por mes
  const sel = async (p, contenedor, izq) => p.evaluate(([c, i]) => {
    const cont = document.querySelector(c), sf = cont.querySelector('.sf'), txt = sf.querySelector('.sf-txt'), r = e => e.getBoundingClientRect();
    const fl = [...sf.querySelectorAll('.sf-flecha')], vis = fl.map(b => r(b.querySelector('i')));
    return { sf: !!sf, variante: sf.dataset.sf, align: getComputedStyle(txt).textAlign, izq: Math.round(r(txt).left * 10) / 10, borde: Math.round(r(document.querySelector(i)).left * 10) / 10,
      derecha: Math.round((r(sf).right - Math.max(...vis.map(v => v.right))) * 10) / 10, zona: fl.map(b => [Math.round(r(b).width), Math.round(r(b).height)]), visible: vis.map(v => [Math.round(v.width), Math.round(v.height)]),
      centrado: Math.abs((r(txt).left + r(txt).width / 2) - (r(sf).left + r(sf).width / 2)) < 3 && r(txt).width < r(sf).width * 0.6 };
  }, [contenedor, izq]);
  const sMes = await sel(pc, '[data-cm="mes"]', '[data-cm="mes"] .cm-barra');
  await pc.locator('[data-cm="mes-por-mes"]').scrollIntoViewIfNeeded();
  const sAnio = await sel(pc, '[data-cm="anual"]', '[data-cm="anual"] .acc');
  const hAnio = await pc.evaluate(() => { const b = document.querySelector('[data-cm="mes-por-mes"]'); return { titulo: Math.round(b.querySelector('h3').getBoundingClientRect().left * 10) / 10, anio: Math.round(b.querySelector('.sf-anio').getBoundingClientRect().left * 10) / 10, dato: b.querySelector('[data-cm="anio-resumen"]').textContent.trim(), alinea: getComputedStyle(b.querySelector('h3')).justifyContent }; });
  if (SHOTS) { await pc.locator('[data-cm="mes-por-mes"]').screenshot({ path: join(SHOTS, 'mes-por-mes.png') }); }
  await cc.close();

  // juntadas (Consumos)
  const { ctx: cj, p: pj } = await abrir('#consumos', '[data-cj="nav"] .sf');
  const sJun = await sel(pj, '[data-cj="nav"]', '[data-cj="nav"]');
  const lee = async () => ({ rot: await pj.locator('[data-cj="titulo"]').innerText(), fecha: await pj.locator('[data-cj="fecha"]').innerText() });
  const j1 = await lee();                                  // la última (2026)
  for (let i = 0; i < 1; i++) await pj.locator('[data-cj="prev"]').click();
  const j2 = await lee();                                  // la primera de 2026
  await pj.locator('[data-cj="prev"]').click();
  const j3 = await lee();                                  // cruza: la última de 2025
  await pj.locator('[data-cj="next"]').click();
  const j4 = await lee();                                  // y vuelve: la primera de 2026
  const filaAparte = await pj.locator('.cj-anio-sel, .cj-anio-fl, [data-cj="anio-btn"]').count();
  if (SHOTS) { await pj.locator('[data-cj="nav"]').screenshot({ path: join(SHOTS, 'juntadas.png') }); }
  await cj.close();
  const igual = x => x.sf && x.align !== 'center' && !x.centrado && Math.abs(x.izq - x.borde) <= 2 && x.zona.every(z => z[0] === 44 && z[1] === 44) && x.visible.every(v => v[0] === 33 && v[1] === 33) && x.derecha <= 1.5;
  const up = t => t.toUpperCase();
  const juntadasOk = up(j1.rot) === '2026 · JUNTADA 2 DE 2' && up(j2.rot) === '2026 · JUNTADA 1 DE 2' && up(j3.rot) === '2025 · JUNTADA 2 DE 2' && up(j4.rot) === '2026 · JUNTADA 1 DE 2' && filaAparte === 0;
  const mismoComponente = igual(sMes) && igual(sAnio) && igual(sJun) && sMes.variante === 'rotulo' && sAnio.variante === 'anio' && sJun.variante === 'rotulo';
  const anioOk = Math.abs(hAnio.titulo - hAnio.anio) <= 2 && /^\d+ botellas? · \$[\d.]+ al costo$/.test(hAnio.dato);
  check('1. los tres selectores (tarjeta del mes, año de Mes por mes y juntadas) usan el mismo componente: texto a la izquierda (no centrado), flechas a la derecha de 33 px con zona de 44 px; las juntadas cruzan el año y no queda la fila "‹ año ›"',
    mismoComponente && anioOk && juntadasOk, JSON.stringify({ sMes, sAnio, sJun, hAnio, j1, j2, j3, j4, filaAparte }));

  // ── 3 · un vino por renglón a 320 px: Mes por mes y top 5 ──
  const { ctx: c3, p: p3 } = await abrir('#compras', '[data-cm="mes-por-mes"]', 320);
  await p3.locator('[data-cm="mes-por-mes"] .acc-btn').first().click();
  const vinos = await p3.locator('[data-cm="mes-por-mes"] .acc-fila').evaluateAll(es => es.map(e => { const v = e.querySelector('.acc-vino'), a = e.querySelector('.acc-anada'), cs = getComputedStyle(e), lh = parseFloat(getComputedStyle(v).lineHeight) || parseFloat(getComputedStyle(v).fontSize) * 1.2;
    return { fila: v.getBoundingClientRect().height, lh, vino: v.textContent, recortado: v.scrollWidth > v.clientWidth, bod: !!e.querySelector('.acc-bod'), anadaAncho: Math.round(a.getBoundingClientRect().width * 10) / 10, anadaCortada: a.scrollWidth > a.clientWidth, nowrap: cs.flexWrap }; }));
  const desb3 = await p3.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (SHOTS) { await p3.locator('[data-cm="mes-por-mes"]').scrollIntoViewIfNeeded(); await p3.screenshot({ path: join(SHOTS, 'mes-por-mes-320.png') }); }
  await c3.close();
  const { ctx: cv, p: pv } = await abrir('#valor', '[data-vi="pie"]', 320);
  const top = await pv.locator('[data-vi="fila"]').evaluateAll(es => es.map(e => { const n = e.querySelector('.vi-nom'), v = e.querySelector('.vi-nom-v'), lh = parseFloat(getComputedStyle(n).lineHeight) || 14 * 1.2, m = e.querySelector('.vi-monto'), c = document.querySelector('[data-tv-fila="compras"] b');
    return { alto: n.getBoundingClientRect().height, lh, recortado: v.scrollWidth > v.clientWidth, anada: !!e.querySelector('.vi-nom-a'), montoFuente: [getComputedStyle(m).fontSize, getComputedStyle(m).fontWeight, getComputedStyle(m).fontFamily], cuentaFuente: [getComputedStyle(c).fontSize, getComputedStyle(c).fontWeight, getComputedStyle(c).fontFamily] }; }));
  if (SHOTS) { await pv.screenshot({ path: join(SHOTS, 'valor-320.png'), fullPage: true }); }
  const desbV = await pv.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await cv.close();
  check('3. a 320 px ningún vino ocupa más de un renglón: en Mes por mes (nombre con "…", añada en columna fija que no se corta, sin bodega) ni en el top 5 de Valor (monto con la tipografía de la cuenta)',
    vinos.length === 3 && vinos.every(v => v.fila <= v.lh * 1.4 && !v.bod && !v.anadaCortada && v.nowrap === 'nowrap' && v.anadaAncho > 20) && vinos.some(v => v.recortado) && !desb3
    && top.length === 5 && top.every(t => t.alto <= t.lh * 1.3 && JSON.stringify(t.montoFuente) === JSON.stringify(t.cuentaFuente)) && top.some(t => t.recortado) && !desbV, JSON.stringify({ vinos, top, desb3, desbV }));

  // ── 4 y 5 · cabecera de #valor y la tarjeta de descuento ──
  const altos = {};
  for (const h of ['#compras', '#valor']) {
    const { ctx, p } = await abrir(h, h === '#valor' ? '[data-vi="pie"]' : '[data-cm="mes"]');
    altos[h] = await p.evaluate(() => { const e = document.querySelector('header.tab-top'), s = document.querySelector('[data-vi="cabecera"]'); return { alto: Math.round(e.getBoundingClientRect().height * 10) / 10, sub: s ? { arriba: s.getBoundingClientRect().top, titulo: e.querySelector('b').getBoundingClientRect().bottom, flecha: e.querySelector('.tab-back').getBoundingClientRect().bottom } : null, txt: s?.textContent }; });
    if (h === '#valor') {
      var v5 = await p.evaluate(() => {
        const d = document.querySelector('[data-vi="descuento"]'), g = document.querySelector('[data-vi="anios"]'), t = document.body.innerText;
        const fr = document.querySelector('[data-vi="franja"]'), verde = (() => { const i = document.createElement('i'); document.body.appendChild(i); i.style.color = '#5E6B3A'; const c = getComputedStyle(i).color; i.remove(); return c; })();
        return { pildoras: d.querySelectorAll('.tv-pill, .vi-pildora, .vi-pildoras').length, planTxt: document.querySelector('[data-vi="plan"]')?.textContent, tuPlanEnGrafico: /tu plan:/i.test(g.innerText), topeTxt: g.querySelector('[data-vi="tope-t"]').textContent, nota: /no tienen precio cargado|regalo o aporte/.test(t),
          franjaBg: getComputedStyle(fr).backgroundColor, verde, ahorroCuenta: getComputedStyle(document.querySelector('[data-tv-fila="ahorro"] b')).color, parcial: /parcial|en curso|hasta hoy/i.test(g.innerText), gutter: getComputedStyle(g.querySelector('.vi-plot')).paddingRight };
      });
      if (SHOTS) { await p.screenshot({ path: join(SHOTS, 'valor-390.png'), fullPage: true }); }
    }
    await ctx.close();
  }
  check('4. la cabecera de #valor tiene la misma altura que la de #compras (±2 px) y "{cava} · plan {plan}" va pegado debajo del título, no debajo de la flecha',
    Math.abs(altos['#valor'].alto - altos['#compras'].alto) <= 2 && altos['#valor'].txt === 'Barraquitas · plan Gran Reserva' && altos['#valor'].sub.arriba - altos['#valor'].sub.titulo <= 4 && altos['#valor'].sub.arriba < altos['#valor'].sub.flecha, JSON.stringify(altos));
  check('5. en #valor no aparecen las píldoras viejas, ni "tu plan:" en el gráfico (solo "40 %"), ni la nota de regalos; la franja y el ahorro club van en el verde de "Al día"; sin columna a la derecha del gráfico',
    v5.pildoras === 0 && v5.planTxt.startsWith('Tu plan: hasta 40 %') && !v5.tuPlanEnGrafico && v5.topeTxt === '40 %' && !v5.nota && v5.franjaBg === v5.verde && v5.ahorroCuenta === v5.verde && !v5.parcial && v5.gutter === '0px', JSON.stringify(v5));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
