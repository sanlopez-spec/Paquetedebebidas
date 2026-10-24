#!/usr/bin/env node
// Verifica la sección "Las botellas" de /club/cava.
//
//   node scripts/check-botellas.mjs                             (local)
//   node scripts/check-botellas.mjs --base https://edb.com.ar   (producción)
//
// Lo que compara contra /api/cava en vivo FALLA. Lo que compara contra los
// valores congelados del 25/10/2026 sale como AVISO: los datos de la cava
// cambian cada vez que se carga algo en Airtable.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';
import { reglaDeLayout, sinInfracciones, textoInfracciones, abrirIphone } from './lib/layout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const BASE = (arg('base', 'http://localhost:4173')).replace(/\/+$/, '');
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const URL = BASE + '/club/cava#botellas';

const VIEWPORTS = [
  { w: 360, h: 800, label: 'celular', esc: false },
  { w: 820, h: 1000, label: 'escritorio', esc: true },
];

// Referencia del 25/10/2026 — sólo para AVISO.
const REF = { etiquetas: 222, botellas: 383, ultima: 150, probadas: 100, iconos: 124, antiguas: 33, vivino45: 40, recien: 25, grandes: 23, filtro: [41, 20], uco: 58 };

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
function aviso(name, ok, detail = '') {
  results.push({ name, ok, detail, soloAviso: true });
  console.log(`  ${ok ? 'OK   ' : 'AVISO'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
const nf = (x, d = 0) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
const num = t => Number(String(t).replace(/\./g, '').replace(',', '.'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ── api/cava.ts en local ──
async function apiLocal() {
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile) && !process.env.AIRTABLE_TOKEN) {
    for (const l of readFileSync(envFile, 'utf8').split('\n')) {
      const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m) process.env[m[1]] ??= m[2];
    }
  }
  if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
  const { transform } = await import('esbuild');
  const { code } = await transform(readFileSync(join(ROOT, 'api', 'cava.ts'), 'utf8'), { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `cava-${Date.now()}.mjs`); writeFileSync(tmp, code, 'utf8');
  const { default: handler } = await import(pathToFileURL(tmp).href);
  let body = null;
  await handler({}, { setHeader() {}, status() { return this; }, json(b) { body = b; return this; } });
  if (!body || body.error) { console.error('api/cava.ts falló:', JSON.stringify(body).slice(0, 200)); process.exit(1); }
  return JSON.stringify(body);
}
async function waitForServer(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.ok || r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

// ── lo que tiene que mostrar la pantalla, calculado de la API ──
const AHORA = new Date();
const MES_ACTUAL = AHORA.getFullYear() * 12 + AHORA.getMonth();
const keyOf = (v, a) => `${v.toLowerCase()}|${a ?? 'nv'}`;
function esperado(api) {
  const W = api.data.grupal;
  const et = new Map();
  for (const w of W) {
    const e = et.get(keyOf(w.vino, w.an)) ?? { qty: 0, cons: 0, start: null, rows: [] };
    e.qty += w.qty; e.cons += w.cons; e.rows.push(w);
    if (w.start) { const s = w.start[0] * 12 + w.start[1]; if (e.start == null || s > e.start) e.start = s; }
    et.set(keyOf(w.vino, w.an), e);
  }
  const suma = f => W.filter(f).reduce((s, w) => s + w.qty, 0);
  const E = (w) => et.get(keyOf(w.vino, w.an));
  const v = {
    todas: suma(() => true),
    ultima: suma(w => E(w).qty === 1),
    probadas: suma(w => E(w).cons > 0),
    iconos: suma(w => w.icono),
    antiguas: suma(w => w.an != null && AHORA.getFullYear() - w.an > 15),
    vivino45: suma(w => w.vivino != null && w.vivino >= 4.5),
    recien: suma(w => E(w).start != null && MES_ACTUAL - E(w).start <= 3),
    grandes: suma(w => w.qty && w.eq / w.qty >= 1.75),
  };
  // las que se abrieron enteras
  const ab = new Map();
  for (const y of Object.values(api.cons.grupal.byYear)) for (const c of y.wines) {
    const k = keyOf(c.vino, c.an);
    if (et.has(k) || !(c.cant > 0)) continue;
    ab.set(k, (ab.get(k) ?? 0) + c.cant);
  }
  return { et, W, v, etiquetas: et.size, botellas: v.todas, abiertas: { etiquetas: ab.size, botellas: [...ab.values()].reduce((s, n) => s + n, 0) } };
}

// ── lectura de la pantalla ──
const LEER = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top + scrollY, b: r.bottom + scrollY, w: r.width, h: r.height, vt: r.top, vb: r.bottom }; };
  const cuenta = document.querySelector('.bt-cuenta');
  const rect = s => { const e = document.querySelector(s); return e ? R(e) : null; };
  return {
    hay: !!document.querySelector('.bt-raiz'),
    enc: txt(document.querySelector('.bt-enc')), cuenta: txt(cuenta), bot: Number(cuenta?.dataset.botellas), et: Number(cuenta?.dataset.etiquetas),
    vistas: [...document.querySelectorAll('.bt-vista')].map(e => ({ id: e.dataset.vista, n: Number(e.dataset.n), on: e.classList.contains('on'), bg: getComputedStyle(e).backgroundColor })),
    activos: [...document.querySelectorAll('.bt-activo .bt-activo-t')].map(e => txt(e)),
    filas: [...document.querySelectorAll('.bt-fila')].map(e => ({ key: e.dataset.key, vino: txt(e.querySelector('.bt-f-vino')), an: txt(e.querySelector('.bt-f-an')),
      viv: e.querySelector('.bt-m-viv') ? txt(e.querySelector('.bt-m-viv')).replace('★ ', '') : '–', primeraMarca: txt(e.querySelector('.bt-marca')),
      bot: txt(e.querySelector('.bt-f-n')), unidad: txt(e.querySelector('.bt-f-u')), colorBot: e.querySelector('.bt-f-n') ? getComputedStyle(e.querySelector('.bt-f-n')).color : null,
      fontBot: e.querySelector('.bt-f-n') ? getComputedStyle(e.querySelector('.bt-f-n')).fontSize : null, ab: txt(e.querySelector('.bt-f-ab')), vivFondo: e.querySelector('.bt-m-viv') ? getComputedStyle(e.querySelector('.bt-m-viv')).backgroundColor : null,
      sub: txt(e.querySelector('.bt-f-txt')), marcas: [...e.querySelectorAll('.bt-marca')].map(txt), anBox: R(e.querySelector('.bt-f-an')), derBox: R(e.querySelector('.bt-f-der')),
      anVisible: R(e.querySelector('.bt-f-an')).r <= innerWidth + 1 && R(e.querySelector('.bt-f-an')).w > 0 })),
    botones: [...document.querySelectorAll('[data-menu-btn]')].map(e => ({ id: e.dataset.menuBtn, txt: txt(e.querySelector('.bt-fbtn-t')), on: e.classList.contains('on'), bg: getComputedStyle(e).backgroundColor, box: R(e), exp: e.getAttribute('aria-expanded') })),
    abiertos: document.querySelectorAll('.bt-pop, .bt-hoja').length,
    panelLateral: document.querySelectorAll('.bt-lado, aside').length, selectViejo: document.querySelectorAll('.bt-orden select, .bt-barra').length,
    verMas: txt(document.querySelector('.bt-ver-mas')),
    viejo: document.querySelectorAll('.tsearch, .chiprow, .countline, .wlist, .factive').length,
    buscador: !!document.querySelector('.bt-buscador input'),
    fila: rect('.bt-filtros-fila'), resumen: rect('.bt-resumen'), lista: rect('.bt-lista'), raiz: rect('.bt-raiz'), cuentaBox: rect('.bt-cuenta'), buscadorBox: rect('.bt-buscador'), vistasBox: rect('.bt-vistas-wrap'),
    sw: document.querySelector('.bt-resumen .bt-switch') ? { box: R(document.querySelector('.bt-resumen .bt-switch')), txt: txt(document.querySelector('.bt-resumen .bt-switch')), dentro: !!document.querySelector('.bt-resumen .bt-switch input') } : null,
    vh: innerHeight, hash: location.hash, scroll: { s: document.documentElement.scrollWidth, i: innerWidth },
  };
};
const LEER_OPS = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const m = {};
  for (const e of document.querySelectorAll('.bt-op')) m[`${e.dataset.grupo}:${e.dataset.valor}`] = { n: Number(String(txt(e.querySelector('.bt-op-n'))).replace(/\./g, '')), off: e.disabled, on: e.classList.contains('on') };
  return m;
};
const LEER_FICHA = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const f = document.querySelector('.bt-ficha'); if (!f) return null;
  const r = f.getBoundingClientRect(); const velo = document.querySelector('[data-velo]');
  return { titulo: txt(f.querySelector('.bt-ficha-t')), sub: txt(f.querySelector('.bt-ficha-s')), marcas: [...f.querySelectorAll('.bt-marcas .bt-marca')].map(txt),
    cajas: [...f.querySelectorAll('.bt-caja')].map(e => ({ n: txt(e.querySelector('b')), l: txt(e.querySelector('span')), f: txt(e.querySelector('small')), top: Math.round(e.getBoundingClientRect().top) })),
    cepa1: txt(f.querySelector('.bt-cepa-1')), cepa2: txt(f.querySelector('.bt-cepa-2')), cepaDl: txt(f.querySelector('.bt-cepa .bt-dl')), cepaVerMas: txt(f.querySelector('.bt-cepa .bt-mas')),
    bloques: [...f.querySelectorAll('.bt-bloque')].map(e => ({ id: e.dataset.bloque, t: txt(e.querySelector('.bt-bloque-t')), n: e.querySelectorAll('.bt-rel').length, mas: txt(e.querySelector('.bt-rel-mas')) })),
    borde: getComputedStyle(f).borderTopColor, bordeIzq: getComputedStyle(f).borderLeftColor, velo: velo ? getComputedStyle(velo).backgroundColor : null,
    box: { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }, vw: innerWidth, vh: innerHeight };
};

const SEL_LINEA = '.bt-enc b, .bt-cuenta b, .bt-vista-t, .bt-vista-n, .bt-f-an, .bt-f-n, .bt-f-u, .bt-marca, .bt-op-t, .bt-op-n, .bt-activo-t, .bt-fbtn-t, .bt-caja b, .bt-caja span, .bt-rel b, .bt-switch-t';
const OPC_LAYOUT = {
  enUnaLinea: SEL_LINEA,
  sinRecortar: '.bt-f-an, .bt-marca, .bt-f-n, .bt-f-u, .bt-vista, .bt-caja b, .bt-switch-t',
  sinPisar: ['.bt-f-an', '.bt-f-n', '.bt-f-u', '.bt-marca', '.bt-vista', '.bt-op-n', '.bt-fbtn'],
};

// ── los menús de filtro: en escritorio un cuadro flotante, en celular una hoja con solo ese grupo ──
const MENU_DE = { tipo: 'tipo', cepa: 'cepa', region: 'region', anada: 'anada', vivino: 'vivino', icono: 'mas', formato: 'mas', bodega: 'mas', pais: 'mas' };
async function abrirMenu(pg, esc, id) {
  if (esc) {
    if (await pg.locator(`.bt-fb[data-menu="${id}"] .bt-pop`).count() === 0) { await pg.locator(`[data-menu-btn="${id}"]`).click(); await pg.waitForSelector(`.bt-fb[data-menu="${id}"] .bt-pop`); }
  } else if (await pg.locator(`.bt-hoja[data-menu-hoja="${id}"]`).count() === 0) {
    if (await pg.locator('.bt-hoja').count()) await cerrarMenu(pg, esc);
    await pg.locator(`[data-menu-btn="${id}"]`).click(); await pg.waitForSelector(`.bt-hoja[data-menu-hoja="${id}"]`);
  }
  await pg.waitForTimeout(120);
}
async function cerrarMenu(pg, esc) {
  if (esc) { if (await pg.locator('.bt-pop').count()) await pg.keyboard.press('Escape'); }
  else if (await pg.locator('.bt-hoja').count()) { const b = pg.locator('.bt-hoja .bt-hoja-pie .bt-btn-pri'); if (await b.count()) await b.click(); else await pg.locator('.bt-hoja .bt-x').click(); }
  await pg.waitForTimeout(120);
}
async function opcion(pg, esc, g, v) {
  await abrirMenu(pg, esc, MENU_DE[g]);
  if (MENU_DE[g] === 'mas' && await pg.locator(`.bt-grupo[data-grupo="${g}"] .bt-grupo-t[aria-expanded="true"]`).count() === 0) await pg.locator(`.bt-grupo[data-grupo="${g}"] .bt-grupo-t`).click();
  const l = pg.locator(`.bt-op[data-grupo="${g}"][data-valor="${v}"]`);
  if (await l.count() === 0) { const mas = pg.locator(`.bt-grupo[data-grupo="${g}"] .bt-mas`); if (await mas.count()) await mas.first().click(); }
  await pg.locator(`.bt-op[data-grupo="${g}"][data-valor="${v}"]`).click();
  await pg.waitForTimeout(120);
}
async function ordenar(pg, esc, id) {
  await abrirMenu(pg, esc, 'orden');
  await pg.locator(`.bt-orden-op[data-orden="${id}"]`).click(); await pg.waitForTimeout(200);
}

// ── corrida ──
let server = null, apiBody = null;
if (IS_LOCAL) {
  console.log('Corriendo api/cava.ts contra Airtable…');
  apiBody = await apiLocal();
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  console.log('Levantando vite preview en 4173…');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  if (!await waitForServer(BASE + '/', 30000)) { console.error('preview no respondió'); server.kill(); process.exit(1); }
}
const apiTxt = apiBody ?? await (await fetch(BASE + '/api/cava')).text();
const api = JSON.parse(apiTxt);
const X = esperado(api);

console.log('── totales de /api/cava ──');
check('222 etiquetas y 383 botellas contra la API (vino + añada)', X.etiquetas === api.stats.etiquetas && X.botellas === api.stats.enGuarda, `${X.etiquetas}/${api.stats.etiquetas} · ${X.botellas}/${api.stats.enGuarda}`);
check('Íconos = los de Calidad', X.v.iconos === api.calidad.iconos.botellas, `${X.v.iconos} vs ${api.calidad.iconos.botellas}`);
check('los registros traen cepa normalizada y provincia', api.data.grupal.every(w => 'cf' in w && 'prov' in w));
check('la API no trae precios ni valores', !JSON.stringify(Object.keys(api.data.grupal[0])).match(/precio|costo|usd/i));
const cepaFichas = (api.cepas?.lista ?? []).filter(c => c.ficha);
check('las cepas traen ficha (intensidad, taninos, aromas, maridajes, temperatura)', cepaFichas.length > 0 && cepaFichas.every(c => ['intensidad', 'taninos', 'aromas', 'maridajes', 'temperatura'].every(k => k in c.ficha)));
console.log('');

const FILTRO_HASH = '#botellas?tipo=tinto&cepa=Malbec&region=Luj%C3%A1n+de+Cuyo';
const tintoMalbecLuj = X.W.filter(w => w.tipo === 'tinto' && w.cepa === 'Malbec' && w.reg === 'Luján de Cuyo');
const esperaFiltro = [tintoMalbecLuj.reduce((s, w) => s + w.qty, 0), new Set(tintoMalbecLuj.map(w => keyOf(w.vino, w.an))).size];
const ucoFiltro = X.W.filter(w => w.tipo === 'tinto' && w.cepa === 'Malbec' && w.reg === 'Valle de Uco').reduce((s, w) => s + w.qty, 0);
// una bodega con muchas etiquetas, para probar "y N más" de la ficha
const porBod = new Map();
for (const e of X.et.values()) { const b = e.rows[0].bod; porBod.set(b, [...(porBod.get(b) ?? []), e]); }
const bodGrande = [...porBod.entries()].sort((a, b) => b[1].length - a[1].length)[0];

const browser = await chromium.launch({ headless: true });
let wk = null;
try {
  for (const vp of VIEWPORTS) {
    const P = `[${vp.label} ${vp.w}] `;
    console.log(`── ${vp.label} ${vp.w} px ──`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    if (apiBody) await page.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.bt-fila', { timeout: 30000 });
    await page.waitForTimeout(700);
    let v = await page.evaluate(LEER);

    check(P + '1. encabezado "222 etiquetas · 383 botellas" en un renglón y nada del bloque viejo', v.enc === `${nf(X.etiquetas)} etiquetas · ${nf(X.botellas)} botellas` && v.viejo === 0, `${v.enc} · viejos ${v.viejo}`);
    check(P + 'B1. ya no existe el panel lateral ni el selector de Ordenar viejo', v.panelLateral === 0 && v.selectViejo === 0, `lado ${v.panelLateral} · select ${v.selectViejo}`);
    check(P + 'B1. botones: Tipo · Cepa · Región · Añada · Vivino · Más y al final Ordenar', same(v.botones.map(b => b.id), ['tipo', 'cepa', 'region', 'anada', 'vivino', 'mas', 'orden']), v.botones.map(b => b.id).join(','));
    check(P + 'B1. al cargar no hay ningún cuadro ni hoja abiertos ni botones con fondo bordó', v.abiertos === 0 && v.botones.every(b => !b.on && b.exp === 'false'));
    check(P + 'B1. orden de la pantalla: título · buscador · vistas · filtros · contador · lista',
      v.enc && v.buscadorBox.t < v.vistasBox.t && v.vistasBox.t < v.fila.t && v.fila.t < v.resumen.t && v.resumen.t < v.lista.t, JSON.stringify({ b: v.buscadorBox.t, v: v.vistasBox.t, f: v.fila.t, r: v.resumen.t, l: v.lista.t }));
    check(P + 'B2. "Incluir abiertas" a la derecha del contador, visible sin hacer scroll', !!v.sw && v.sw.dentro && v.sw.txt === 'Incluir abiertas' && v.sw.box.l > v.cuentaBox.l && Math.abs((v.sw.box.t) - (v.cuentaBox.t)) < 30 && v.sw.box.vb <= v.vh, JSON.stringify(v.sw?.box));
    check(P + 'B3. ningún control tapado por otro (botones de filtro, contador y switch no se superponen)', (() => {
      const cajas = [...v.botones.map(b => b.box), v.cuentaBox, v.sw.box];
      for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) { const a = cajas[i], b = cajas[j]; if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) return false; }
      return v.fila.b <= v.resumen.t + 1;
    })());
    if (vp.esc) check(P + 'B1. escritorio: la lista ocupa todo el ancho del contenido', v.lista.w >= v.raiz.w - 2, `${v.lista.w} vs ${v.raiz.w}`);
    // 3. vistas
    const vistasEsp = Object.entries(X.v).filter(([k, n]) => k === 'todas' || (n > 0 && n !== X.v.todas)).map(([k]) => k);
    check(P + '3. vistas: sólo las que tienen datos y no son iguales a Todas', same(v.vistas.map(x => x.id).sort(), vistasEsp.sort()), v.vistas.map(x => x.id).join(','));
    check(P + '3. cada vista dice sus botellas', v.vistas.every(x => x.n === X.v[x.id]), v.vistas.map(x => `${x.id}=${x.n}/${X.v[x.id]}`).join(' '));
    check(P + '3. "Todas" arranca activa y las demás no', v.vistas.find(x => x.id === 'todas').on && v.vistas.filter(x => x.on).length === 1);
    check(P + '4. contador "N botellas · M etiquetas" = totales', v.bot === X.botellas && v.et === X.etiquetas, `${v.bot}/${v.et}`);
    check(P + '5. orden por defecto: añada, de la más vieja a la más nueva, "s/a" al final', (() => {
      const ans = v.filas.map(f => f.an === 's/a' ? Infinity : Number(f.an));
      return v.botones.find(b => b.id === 'orden').txt === 'Ordenar: Añada' && ans.every((a, i) => i === 0 || ans[i - 1] <= a);
    })(), v.filas.slice(0, 6).map(f => f.an).join(','));
    check(P + '6. se muestran 40 filas y "Ver 40 más"', v.filas.length === 40 && v.verMas === 'Ver 40 más', `${v.filas.length} · ${v.verMas}`);
    check(P + 'B6. a la derecha, sólo las botellas en guarda: número serif bordó de 18 px y debajo "bot." ("botella" si es 1)',
      v.filas.every(f => /^\d+$/.test(f.bot) && f.colorBot === 'rgb(107, 30, 46)' && f.fontBot === '18px' && f.unidad === (f.bot === '1' ? 'botella' : 'bot.')), JSON.stringify(v.filas[0]));
    const conViv = v.filas.filter(f => f.viv !== '–');
    check(P + 'B6. el Vivino es una marca "★ 4,2" (fondo #EADFBF), la primera de todas; sin puntaje no va',
      conViv.length > 0 && conViv.every(f => /^\d,\d$/.test(f.viv) && f.primeraMarca.startsWith('★') && f.vivFondo === 'rgb(234, 223, 191)') && v.filas.filter(f => f.viv === '–').every(f => !f.marcas.some(m => m.startsWith('★'))), JSON.stringify(conViv[0]));
    check(P + 'B6. orden de las marcas: ★ Vivino · ÍCONO · formato · ÚLTIMA · PROBADA', v.filas.every(f => {
      const idx = m => f.marcas.findIndex(x => m(x)); const orden = [idx(x => x.startsWith('★')), idx(x => x === 'Ícono'), idx(x => /^(Magnum|Jeroboam|Imperial|Matusalén|Salmanazar|Balthazar|[\d,]+ L)$/.test(x)), idx(x => x === 'Última'), idx(x => x === 'Probada')].filter(i => i >= 0);
      return orden.every((i, k) => k === 0 || orden[k - 1] < i);
    }));
    check(P + '6. cada fila: nombre y añada visible', v.filas.every(f => f.vino && f.an && f.anVisible));
    check(P + '6. marcas ÍCONO / ÚLTIMA / PROBADA sólo cuando aplican', v.filas.every(f => {
      const e = X.et.get(f.key); if (!e) return false;
      return f.marcas.includes('Ícono') === e.rows.some(w => w.icono) && f.marcas.includes('Última') === (e.qty === 1) && f.marcas.includes('Probada') === (e.cons > 0);
    }));
    await page.locator('.bt-ver-mas').click();
    check(P + '6. "Ver 40 más" suma 40 filas', (await page.locator('.bt-fila').count()) === 80);
    await page.evaluate(() => scrollTo(0, 0));

    // B1: un solo menú abierto a la vez
    await page.locator('[data-menu-btn="tipo"]').click(); await page.waitForTimeout(150);
    check(P + 'B1. al tocar un botón se abre su grupo', vp.esc ? await page.locator('.bt-fb[data-menu="tipo"] .bt-pop').count() === 1 : await page.locator('.bt-hoja[data-menu-hoja="tipo"]').count() === 1);
    if (vp.esc) {
      const pop = await page.evaluate(() => { const p = document.querySelector('.bt-pop'); const b = document.querySelector('[data-menu-btn="tipo"]').getBoundingClientRect(); const r = p.getBoundingClientRect(); return { w: r.width, top: r.top - b.bottom, left: r.left - b.left, maxH: parseFloat(getComputedStyle(p).maxHeight), over: getComputedStyle(p).overflowY }; });
      check(P + 'B1. escritorio: cuadro flotante debajo del botón, 280 px de ancho, alto máx. 360 con scroll interno', Math.round(pop.w) === 280 && pop.top >= 0 && pop.top < 12 && pop.maxH === 360 && pop.over === 'auto', JSON.stringify(pop));
      await page.locator('[data-menu-btn="cepa"]').click(); await page.waitForTimeout(150);
      check(P + 'B1. abrir otro botón cierra el anterior (nunca dos abiertos)', await page.locator('.bt-pop').count() === 1 && await page.locator('.bt-fb[data-menu="cepa"] .bt-pop').count() === 1);
      await page.mouse.click(5, 5); await page.waitForTimeout(150);
      check(P + 'B1. se cierra tocando afuera', await page.locator('.bt-pop').count() === 0);
      await page.locator('[data-menu-btn="vivino"]').click(); await page.waitForTimeout(100);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      check(P + 'B1. se cierra con Esc', await page.locator('.bt-pop').count() === 0);
      await page.locator('[data-menu-btn="mas"]').click(); await page.waitForTimeout(150);
      const mas = await page.evaluate(() => ({ grupos: [...document.querySelectorAll('.bt-pop .bt-grupo')].map(g => g.dataset.grupo), abiertos: document.querySelectorAll('.bt-pop .bt-grupo-t[aria-expanded="true"]').length, ops: document.querySelectorAll('.bt-pop .bt-op').length }));
      check(P + 'B1. "Más": Ícono, Formato, Bodega y País aparecen cerrados (acordeón)', same(mas.grupos, ['icono', 'formato', 'bodega', 'pais']) && mas.abiertos === 0 && mas.ops === 0, JSON.stringify(mas));
      await page.locator('.bt-pop .bt-grupo[data-grupo="formato"] .bt-grupo-t').click(); await page.waitForTimeout(100);
      check(P + 'B1. "Más": se abre sólo el grupo que se toca', await page.locator('.bt-pop .bt-grupo-t[aria-expanded="true"]').count() === 1 && await page.locator('.bt-pop .bt-op[data-grupo="formato"]').count() >= 2);
      await page.keyboard.press('Escape');
    } else {
      const h = await page.evaluate(() => ({ grupos: [...document.querySelectorAll('.bt-hoja .bt-grupo')].map(g => g.dataset.grupo), pie: document.querySelector('.bt-hoja-pie .bt-btn-pri')?.textContent.trim() }));
      check(P + 'B1. celular: la hoja trae sólo ese grupo y "Ver N botellas" al pie', same(h.grupos, ['tipo']) && h.pie === `Ver ${nf(X.botellas)} botellas`, JSON.stringify(h));
      await cerrarMenu(page, false);
      await page.locator('[data-menu-btn="mas"]').click(); await page.waitForSelector('.bt-hoja'); await page.waitForTimeout(120);
      check(P + 'B1. celular: "Más" abre Ícono, Formato, Bodega y País cerrados', await page.locator('.bt-hoja .bt-grupo-t[aria-expanded="true"]').count() === 0 && await page.locator('.bt-hoja .bt-grupo').count() === 4);
      await cerrarMenu(page, false);
    }

    // 7. buscador y sugerencias
    const caja = page.locator('.bt-buscador input');
    await caja.click(); await caja.fill('lujan'); await page.waitForTimeout(250);
    check(P + '7. "lujan" sugiere la región Luján de Cuyo, con sus botellas', await page.locator('.bt-sug[data-grupo="region"][data-valor="Luján de Cuyo"]').count() === 1
      && (await page.locator('.bt-sug[data-grupo="region"][data-valor="Luján de Cuyo"] .bt-sug-b').textContent()).includes('bot.'));
    await caja.fill('2012'); await page.waitForTimeout(250);
    check(P + '7. "2012" sugiere la añada 2012', await page.locator('.bt-sug[data-grupo="anada"][data-valor="2012"]').count() === 1);
    await caja.fill('septima'); await page.waitForTimeout(250);
    check(P + '7. un vino se sugiere en VINOS (hasta 5)', (await page.locator('.bt-sug[data-grupo="vinos"]').count()) >= 1 && (await page.locator('.bt-sug[data-grupo="vinos"]').count()) <= 5);
    await caja.fill('lujan'); await page.waitForTimeout(250);
    await page.locator('.bt-sug[data-grupo="region"][data-valor="Luján de Cuyo"]').dispatchEvent('mousedown');
    await page.waitForTimeout(250);
    v = await page.evaluate(LEER);
    check(P + '7. tocar la región la convierte en filtro (chip), limpia el texto y el botón Región queda bordó', v.activos.includes('Luján de Cuyo') && (await caja.inputValue()) === '' && v.botones.find(b => b.id === 'region').on && v.botones.find(b => b.id === 'region').txt.includes('Luján de Cuyo'), JSON.stringify(v.botones.find(b => b.id === 'region')));
    check(P + '7. el contador de Luján de Cuyo = 99 botellas', v.bot === X.W.filter(w => w.reg === 'Luján de Cuyo').reduce((s, w) => s + w.qty, 0), `${v.bot}`);
    check(P + '7. el hash recuerda el filtro', /region=Luj/.test(decodeURIComponent(v.hash)), v.hash);
    await page.locator('.bt-limpiar').first().click(); await page.waitForTimeout(200);
    await caja.fill('malbec'); await caja.press('Enter'); await page.waitForTimeout(250);
    v = await page.evaluate(LEER);
    check(P + '7. Enter filtra por el texto', v.activos.length === 1 && v.bot > 0 && v.bot < X.botellas, JSON.stringify(v.activos) + ' ' + v.bot);
    await page.locator('.bt-limpiar').first().click(); await page.waitForTimeout(200);

    // 8. filtros con contadores, desde los botones
    await opcion(page, vp.esc, 'cepa', 'Malbec');
    v = await page.evaluate(LEER);
    check(P + 'B1. el botón muestra lo elegido ("Cepa: Malbec") y se pone bordó', v.botones.find(b => b.id === 'cepa').txt === 'Cepa: Malbec' && v.botones.find(b => b.id === 'cepa').on && v.botones.find(b => b.id === 'cepa').bg === 'rgb(107, 30, 46)', JSON.stringify(v.botones.find(b => b.id === 'cepa')));
    await opcion(page, vp.esc, 'tipo', 'tinto');
    await opcion(page, vp.esc, 'region', 'Luján de Cuyo');
    await page.waitForTimeout(250);
    v = await page.evaluate(LEER);
    const ops = await page.evaluate(LEER_OPS);
    check(P + '8. Tinto + Malbec + Luján de Cuyo → 41 botellas · 20 etiquetas (de la API)', v.bot === esperaFiltro[0] && v.et === esperaFiltro[1], `${v.bot} · ${v.et} vs ${esperaFiltro}`);
    aviso(P + '8. ref. 41 botellas · 20 etiquetas', v.bot === REF.filtro[0] && v.et === REF.filtro[1], `hoy ${v.bot} · ${v.et}`);
    check(P + '8. el contador de Valle de Uco en ese estado = lo que quedaría (Tinto + Malbec)', ops['region:Valle de Uco']?.n === ucoFiltro, `${ops['region:Valle de Uco']?.n} vs ${ucoFiltro}`);
    aviso(P + '8. ref. Valle de Uco 58', ops['region:Valle de Uco']?.n === REF.uco, `hoy ${ops['region:Valle de Uco']?.n}`);
    const ceros = Object.entries(ops).filter(([, o]) => o.n === 0 && !o.on);
    check(P + '8. las opciones con 0 están en gris y no se pueden tocar', ceros.length > 0 && ceros.every(([, o]) => o.off), `${ceros.length} con 0`);
    check(P + '8. Región agrupada por provincia (rótulos MENDOZA, SALTA, PATAGONIA, DEL MUNDO…)', (await page.locator('.bt-grupo[data-grupo="region"] .bt-gr').count()) >= 1);
    await cerrarMenu(page, vp.esc);
    await abrirMenu(page, vp.esc, 'cepa');
    check(P + '8. Cepa: 8 primeras y "+N"', (await page.locator('.bt-grupo[data-grupo="cepa"] .bt-op').count()) <= 9 + 3 && (await page.locator('.bt-grupo[data-grupo="cepa"] .bt-mas').count()) === 1);
    await cerrarMenu(page, vp.esc);
    await abrirMenu(page, vp.esc, 'anada');
    check(P + '8. Añada: histograma con dos manijas y "desde · hasta"', (await page.locator('.bt-grupo[data-grupo="anada"] .bt-hist-b').count()) > 5 && (await page.locator('.bt-grupo[data-grupo="anada"] input[type=range]').count()) === 2 && /^desde \d{4} · hasta \d{4}$/.test((await page.locator('.bt-rango-t').textContent()).trim()));
    await page.locator('.bt-grupo[data-grupo="anada"] input[data-manija="desde"]').evaluate((el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }, String(Number(await page.locator('.bt-grupo[data-grupo="anada"] input[data-manija="desde"]').getAttribute('min')) + 1));
    await page.waitForTimeout(200);
    v = await page.evaluate(LEER);
    check(P + '8. mover una manija de añada agrega el chip "Añada a–b" y el botón lo muestra', v.activos.some(a => /^Añada \d{4}–\d{4}$/.test(a)) && /^Añada: \d{4}–\d{4}$/.test(v.botones.find(b => b.id === 'anada').txt), JSON.stringify(v.activos));
    if (!vp.esc) {
      const btn = (await page.locator('.bt-hoja-pie .bt-btn-pri').textContent()).trim();
      check(P + '8. celular: la hoja sube desde abajo (alto máx. 85%) con "Ver N botellas" al pie', /^Ver [\d.]+ botellas?$/.test(btn) && await page.evaluate(() => { const r = document.querySelector('.bt-hoja').getBoundingClientRect(); return r.height <= innerHeight * 0.85 + 1 && Math.abs(r.bottom - innerHeight) < 2; }), btn);
      const lay0 = await reglaDeLayout(page, OPC_LAYOUT);
      check(P + '8. regla de layout con la hoja abierta', sinInfracciones(lay0), textoInfracciones(lay0));
    }
    await cerrarMenu(page, vp.esc);
    await page.locator('.bt-limpiar').first().click(); await page.waitForTimeout(200);
    v = await page.evaluate(LEER);
    check(P + '8. "Limpiar" vuelve a todo y los botones a su color', v.bot === X.botellas && v.activos.length === 0 && v.botones.every(b => !b.on));

    // vistas
    await page.locator('.bt-vista[data-vista="ultima"]').click(); await page.waitForTimeout(200);
    v = await page.evaluate(LEER);
    check(P + '3. "Última botella": botellas = etiquetas', v.bot === X.v.ultima && v.et === X.v.ultima, `${v.bot}/${v.et}`);
    aviso(P + '3. ref. Última 150', v.bot === REF.ultima, `hoy ${v.bot}`);
    check(P + '3. la vista activa se marca en bordó', v.vistas.find(x => x.id === 'ultima').bg === 'rgb(107, 30, 46)');
    await page.locator('.bt-vista[data-vista="vivino45"]').click(); await page.waitForTimeout(200);
    v = await page.evaluate(LEER);
    check(P + '3. una sola vista a la vez', v.vistas.filter(x => x.on).length === 1 && v.bot === X.v.vivino45, `${v.bot}/${X.v.vivino45}`);
    await page.locator('.bt-vista[data-vista="todas"]').click();
    for (const [id, aviN] of [['probadas', REF.probadas], ['iconos', REF.iconos], ['antiguas', REF.antiguas], ['vivino45', REF.vivino45], ['recien', REF.recien], ['grandes', REF.grandes]]) {
      const c = v.vistas.find(x => x.id === id);
      aviso(P + `3. ref. ${id} ${aviN}`, !!c && c.n === aviN, c ? `hoy ${c.n}` : 'no está');
    }
    // orden, desde el botón
    await ordenar(page, vp.esc, 'vivino');
    v = await page.evaluate(LEER);
    const vivs = v.filas.map(f => f.viv === '–' ? -1 : num(f.viv));
    check(P + '5. orden por Vivino: mayor primero (el puntaje se ve en la marca)', vivs.every((x, i) => i === 0 || vivs[i - 1] >= x) && v.botones.find(b => b.id === 'orden').txt === 'Ordenar: Vivino', vivs.slice(0, 8).join(','));
    check(P + '5. el orden queda en el hash', /orden=vivino/.test(v.hash), v.hash);
    await ordenar(page, vp.esc, 'nombre');
    v = await page.evaluate(LEER);
    const nombres = v.filas.filter(f => f.an !== 's/a').map(f => f.vino);
    check(P + '5. orden por nombre A–Z', nombres.every((x, i) => i === 0 || nombres[i - 1].localeCompare(x, 'es') <= 0));
    await ordenar(page, vp.esc, 'anada');

    // 9. ficha
    await page.locator('.bt-buscador input').fill('septima gran'); await page.locator('.bt-buscador input').press('Enter'); await page.waitForTimeout(250);
    await page.locator('.bt-fila[data-key="septima gran malbec|2019"]').click(); await page.waitForTimeout(400);
    const fi = await page.evaluate(LEER_FICHA);
    const sep = X.et.get('septima gran malbec|2019');
    check(P + 'B4. ficha: hoja con velo rgba(43,35,32,.35) sobre el resto', fi && fi.velo === 'rgba(43, 35, 32, 0.35)', fi?.velo);
    check(P + (vp.esc ? 'B4. escritorio: hoja desde la derecha de 380 px' : 'B4. celular: hoja desde abajo, alto máx. 85%'),
      vp.esc ? Math.round(fi.box.w) === 380 && Math.abs(fi.box.r - fi.vw) < 2 : (Math.abs(fi.box.b - fi.vh) < 2 && fi.box.b - fi.box.t <= fi.vh * 0.85 + 1), JSON.stringify(fi.box));
    check(P + '9. ficha: título, bodega · región · cepa y borde bordó', fi && fi.titulo.startsWith('Septima Gran Malbec') && fi.titulo.includes('2019') && fi.sub.includes('Luján de Cuyo') && (vp.esc ? fi.bordeIzq : fi.borde) === 'rgb(107, 30, 46)', JSON.stringify(fi && { t: fi.titulo, s: fi.sub }));
    check(P + 'B5. cajas chicas en una fila de 4: En guarda 3 · Vivino 4,5 · Edad · Abiertas 1 con "abr 2025" abajo',
      fi.cajas.length === 4 && new Set(fi.cajas.map(c => c.top)).size === 1 && fi.cajas.find(c => c.l === 'En guarda')?.n === nf(sep.qty) && fi.cajas.find(c => c.l === 'Vivino')?.n === '4,5' && /años?$/.test(fi.cajas.find(c => c.l === 'Edad')?.n ?? '') && fi.cajas.find(c => /^Abierta/.test(c.l))?.n === '1' && fi.cajas.find(c => /^Abierta/.test(c.l))?.f === 'abr 2025',
      JSON.stringify(fi.cajas));
    check(P + 'B5. la cepa en dos renglones: "Malbec · intensidad … · … °C" y debajo los aromas; "Ver más de la cepa" despliega taninos, acidez y maridajes',
      /^Malbec/.test(fi.cepa1) && /intensidad/.test(fi.cepa1) && fi.cepa2.length > 3 && fi.cepaVerMas === 'Ver más de la cepa' && fi.cepaDl === '', JSON.stringify({ a: fi.cepa1, b: fi.cepa2, c: fi.cepaVerMas }));
    await page.locator('.bt-ficha .bt-cepa .bt-mas').click(); await page.waitForTimeout(100);
    const dl = await page.evaluate(() => document.querySelector('.bt-ficha .bt-cepa .bt-dl')?.textContent ?? '');
    check(P + 'B5. "Ver más de la cepa" muestra Taninos / Acidez / Maridajes', /Taninos|Acidez|Maridajes/.test(dl), dl.slice(0, 80));
    check(P + 'B5. "Más de esta bodega": hasta 3 filas', fi.bloques.every(b => b.n <= 3) && fi.bloques.some(b => b.id === 'bodega'), JSON.stringify(fi.bloques));
    check(P + '9. ficha: sin precios, valores ni tiempos entre compra y apertura', !/USD|\$|precio|costo|valor/i.test(JSON.stringify(fi)));
    const lay1 = await reglaDeLayout(page, OPC_LAYOUT);
    check(P + '9. ficha abierta: regla de layout', sinInfracciones(lay1), textoInfracciones(lay1));
    if (await page.locator('.bt-ficha .bt-rel').count()) {
      await page.locator('.bt-ficha .bt-rel').first().click(); await page.waitForTimeout(250);
      check(P + '9. tocar una relacionada abre su ficha', (await page.evaluate(LEER_FICHA)).titulo !== fi.titulo);
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    check(P + 'B4. Esc cierra la ficha', await page.locator('.bt-ficha').count() === 0);
    await page.locator('.bt-fila[data-key="septima gran malbec|2019"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-velo]').click({ position: { x: 5, y: 5 } }); await page.waitForTimeout(150);
    check(P + 'B4. tocar el velo cierra la ficha', await page.locator('.bt-ficha').count() === 0);
    await page.locator('.bt-fila[data-key="septima gran malbec|2019"]').click(); await page.waitForTimeout(300);
    await page.locator('.bt-ficha .bt-x').click(); await page.waitForTimeout(150);
    check(P + 'B4. la × cierra la ficha', await page.locator('.bt-ficha').count() === 0);
    // "y N más": aplica el filtro de la bodega y cierra la ficha
    if (bodGrande && bodGrande[1].length > 4) {
      const e0 = bodGrande[1][0]; const w0 = e0.rows[0];
      await page.locator('.bt-limpiar').first().click(); await page.waitForTimeout(150);
      await page.locator('.bt-buscador input').fill(w0.vino); await page.locator('.bt-buscador input').press('Enter'); await page.waitForTimeout(250);
      await page.locator(`.bt-fila[data-key="${keyOf(w0.vino, w0.an)}"]`).first().click(); await page.waitForTimeout(300);
      const fb = await page.evaluate(LEER_FICHA);
      const bl = fb.bloques.find(b => b.id === 'bodega');
      check(P + 'B5. "Más de esta bodega": 3 filas y "y N más" si hay más', !!bl && bl.n === 3 && /^y \d+ más$/.test(bl.mas), JSON.stringify(bl));
      await page.locator('.bt-ficha [data-bloque="bodega"] .bt-rel-mas').click(); await page.waitForTimeout(300);
      const vb = await page.evaluate(LEER);
      check(P + 'B5. tocar "y N más" aplica el filtro de la bodega y cierra la ficha', await page.locator('.bt-ficha').count() === 0 && vb.activos.includes(w0.bod) && vb.bot === X.W.filter(w => w.bod === w0.bod).reduce((s, w) => s + w.qty, 0), JSON.stringify(vb.activos) + ' ' + vb.bot);
    }
    await page.locator('.bt-limpiar').first().click(); await page.waitForTimeout(200);

    // 10. incluir abiertas
    await page.locator('.bt-resumen .bt-switch input').evaluate(el => el.click());
    await page.waitForTimeout(300);
    v = await page.evaluate(LEER);
    check(P + '10. incluir abiertas suma las etiquetas sin botellas en guarda (de Consumos)', v.bot === X.botellas + X.abiertas.botellas && v.et === X.etiquetas + X.abiertas.etiquetas, `${v.bot}/${v.et} vs ${X.botellas + X.abiertas.botellas}/${X.etiquetas + X.abiertas.etiquetas}`);
    check(P + '10. el interruptor queda en el hash', /abiertas=1/.test(v.hash), v.hash);
    await page.locator('.bt-buscador input').fill('zzzz'); await page.locator('.bt-buscador input').press('Enter'); await page.waitForTimeout(200);
    check(P + '6. sin resultados: "No hay botellas con estos filtros · Limpiar"', (await page.locator('.bt-sin').textContent()).includes('No hay botellas con estos filtros'));
    await page.locator('.bt-sin .bt-limpiar').click(); await page.waitForTimeout(200);
    if (X.abiertas.etiquetas > 0) {
      await ordenar(page, vp.esc, 'nombre');
      const hayAb = await page.locator('.bt-fila.ab').count();
      check(P + '10. hay filas de abiertas', hayAb > 0, `${hayAb}`);
      if (hayAb) {
        const pg2 = await page.locator('.bt-fila.ab').first().evaluate(e => ({ sub: e.querySelector('.bt-f-txt').textContent, ab: e.querySelector('.bt-f-ab')?.textContent, n: e.querySelector('.bt-f-n')?.textContent ?? null }));
        check(P + '10. las abiertas: "Abierta · mes año" en el renglón 2 y "abierta" en vez de botellas', /^Abierta · [a-z]{3} \d{4}/.test(pg2.sub) && pg2.ab === 'abierta' && pg2.n === null, JSON.stringify(pg2));
      }
    }
    check(P + '0. la página no tira errores', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();

    // hash aplicado al cargar
    const ctx2 = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p2 = await ctx2.newPage();
    if (apiBody) await p2.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    await p2.goto(BASE + '/club/cava' + FILTRO_HASH, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p2.waitForSelector('.bt-fila', { timeout: 30000 }); await p2.waitForTimeout(500);
    const vh = await p2.evaluate(LEER);
    check(P + '11. cargar con #botellas?tipo=tinto&cepa=Malbec&region=Luján de Cuyo deja el filtro aplicado', vh.bot === esperaFiltro[0] && vh.et === esperaFiltro[1] && vh.activos.length === 3 && vh.abiertos === 0, `${vh.bot}/${vh.et} ${JSON.stringify(vh.activos)}`);
    await p2.goto(BASE + '/club/cava#botellas?orden=vivino&vista=iconos', { waitUntil: 'domcontentloaded' });
    await p2.reload({ waitUntil: 'domcontentloaded' }); await p2.waitForSelector('.bt-fila'); await p2.waitForTimeout(400);
    const vh2 = await p2.evaluate(LEER);
    check(P + '11. el hash recupera también la vista y el orden', vh2.botones.find(b => b.id === 'orden').txt === 'Ordenar: Vivino' && vh2.vistas.find(x => x.id === 'iconos')?.on && vh2.bot === X.v.iconos, `${vh2.botones.find(b => b.id === 'orden').txt} ${vh2.bot}`);
    await ctx2.close();

    // regla de layout general
    const ctx3 = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p3 = await ctx3.newPage();
    if (apiBody) await p3.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    await p3.goto(URL, { waitUntil: 'domcontentloaded' }); await p3.waitForSelector('.bt-fila'); await p3.waitForTimeout(500);
    const lay = await reglaDeLayout(p3, OPC_LAYOUT);
    check(P + '12. regla de layout: ningún nombre, número ni marca en dos renglones ni superpuesto; sin scroll horizontal', sinInfracciones(lay), textoInfracciones(lay));
    const an = await p3.evaluate(LEER);
    check(P + '12. la añada siempre visible y sin pisar la columna de botellas', an.filas.every(f => f.anVisible && f.anBox.r <= f.derBox.l + 1), an.filas.filter(f => !f.anVisible || f.anBox.r > f.derBox.l + 1).slice(0, 3).map(f => f.vino).join(' | '));
    await ctx3.close();
    console.log('');
  }

  // ── cava chica: 5 etiquetas ──
  console.log('── cava chica (5 etiquetas) ──');
  const d = JSON.parse(apiTxt);
  const elegidas = [];
  const vistos = new Set();
  for (const w of d.data.grupal) { const k = keyOf(w.vino, w.an); if (!vistos.has(k) && elegidas.length < 5) { vistos.add(k); elegidas.push(w); } }
  d.data.grupal = elegidas;
  d.cons = { grupal: { total: 0, juntadas: 0, byYear: {} } };
  const chica = JSON.stringify(d);
  const Xc = esperado(d);
  for (const vp of VIEWPORTS) {
    const P = `[cava chica ${vp.w}] `;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: chica }));
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForSelector('.bt-fila', { timeout: 30000 }); await pg.waitForTimeout(500);
    const v = await pg.evaluate(LEER);
    check(P + 'buscador, filtros, contador y lista siempre; 5 etiquetas', v.buscador && !!v.fila && !!v.resumen && v.filas.length === 5 && v.enc === `5 etiquetas · ${nf(Xc.botellas)} botellas`, `${v.filas.length} ${v.enc}`);
    const vEsp = Object.entries(Xc.v).filter(([k, n]) => k === 'todas' || (n > 0 && n !== Xc.v.todas)).map(([k]) => k).sort();
    check(P + 'vistas: sólo las que tienen datos', same(v.vistas.map(x => x.id).sort(), vEsp), `${v.vistas.map(x => x.id)} vs ${vEsp}`);
    const distintos = (f) => new Set(elegidas.map(f)).size;
    const esperadosM = [['tipo', distintos(w => w.tipo) >= 2], ['cepa', distintos(w => w.cepa) >= 2], ['region', distintos(w => w.reg) >= 2],
      ['anada', new Set(elegidas.map(w => w.an).filter(Boolean)).size >= 2], ['vivino', true],
      ['mas', distintos(w => w.bod) >= 2 || distintos(w => w.pais) >= 2 || new Set(elegidas.map(w => !!w.icono)).size >= 2]].filter(x => x[1]).map(x => x[0]);
    const ids = v.botones.map(b => b.id).filter(i => i !== 'orden');
    check(P + 'filtros: un botón sólo si su grupo tiene 2 opciones o más (Ordenar siempre)', v.botones.some(b => b.id === 'orden') && esperadosM.filter(i => i !== 'vivino').every(i => ids.includes(i)) && ids.every(i => esperadosM.includes(i) || i === 'vivino'), `${ids} vs ${esperadosM}`);
    const lay = await reglaDeLayout(pg, OPC_LAYOUT);
    check(P + 'regla de layout', sinInfracciones(lay), textoInfracciones(lay));
    check(P + 'la página no tira errores', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  console.log('');

  // ── Safari de iPhone 13 (WebKit, 390 px) ──
  console.log('── WebKit · iPhone 13 · 390 px ──');
  {
    const P = '[webkit 390] ';
    const { browser: b2, ctx } = await abrirIphone();
    wk = b2;
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    if (apiBody) await pg.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForSelector('.bt-fila', { timeout: 30000 }); await pg.waitForTimeout(900);
    const lay = await reglaDeLayout(pg, OPC_LAYOUT);
    check(P + 'regla de layout en la lista', sinInfracciones(lay), textoInfracciones(lay));
    const v = await pg.evaluate(LEER);
    check(P + 'la añada siempre visible', v.filas.every(f => f.anVisible && f.anBox.r <= f.derBox.l + 1));
    check(P + '"Incluir abiertas" visible sin hacer scroll', !!v.sw && v.sw.box.vb <= v.vh, JSON.stringify(v.sw?.box));
    await pg.locator('[data-menu-btn="tipo"]').tap(); await pg.waitForSelector('.bt-hoja'); await pg.waitForTimeout(200);
    await pg.locator('.bt-op[data-grupo="tipo"][data-valor="tinto"]').tap(); await pg.waitForTimeout(150);
    await pg.locator('.bt-hoja-pie .bt-btn-pri').tap(); await pg.waitForTimeout(200);
    await pg.locator('[data-menu-btn="cepa"]').tap(); await pg.waitForSelector('.bt-hoja'); await pg.waitForTimeout(200);
    await pg.locator('.bt-op[data-grupo="cepa"][data-valor="Malbec"]').tap(); await pg.waitForTimeout(150);
    await pg.locator('.bt-hoja-pie .bt-btn-pri').tap(); await pg.waitForTimeout(200);
    await pg.locator('[data-menu-btn="region"]').tap(); await pg.waitForSelector('.bt-hoja'); await pg.waitForTimeout(200);
    await pg.locator('.bt-op[data-grupo="region"][data-valor="Luján de Cuyo"]').tap(); await pg.waitForTimeout(250);
    const lay2 = await reglaDeLayout(pg, OPC_LAYOUT);
    check(P + 'regla de layout con la hoja de filtros', sinInfracciones(lay2), textoInfracciones(lay2));
    const btn = (await pg.locator('.bt-hoja-pie .bt-btn-pri').textContent()).trim();
    check(P + 'filtros en Safari: "Ver 41 botellas"', btn === `Ver ${nf(esperaFiltro[0])} botellas`, btn);
    await pg.locator('.bt-hoja-pie .bt-btn-pri').tap(); await pg.waitForTimeout(300);
    await pg.locator('.bt-fila').first().tap(); await pg.waitForTimeout(400);
    const fi = await pg.evaluate(LEER_FICHA);
    const lay3 = await reglaDeLayout(pg, { ...OPC_LAYOUT, sinPisar: [...OPC_LAYOUT.sinPisar, '.bt-caja b'] });
    check(P + 'ficha: abre con velo y cumple la regla de layout', !!fi && fi.velo === 'rgba(43, 35, 32, 0.35)' && sinInfracciones(lay3), textoInfracciones(lay3));
    check(P + 'la página no tira errores', errs.length === 0, errs.slice(0, 2).join(' | '));
    console.log('');
  }
  aviso('ref. 222 etiquetas · 383 botellas', X.etiquetas === REF.etiquetas && X.botellas === REF.botellas, `hoy ${X.etiquetas} · ${X.botellas}`);
} finally {
  await browser.close();
  if (wk) await wk.close();
  if (server) server.kill();
}

const avisos = results.filter(r => !r.ok && r.soloAviso);
const fallas = results.filter(r => !r.ok && !r.soloAviso);
console.log('═'.repeat(64));
console.log(`${results.length - fallas.length - avisos.length}/${results.length} chequeos OK`);
if (avisos.length) {
  console.log(`\n${avisos.length} AVISO(S) — cambiaron datos de la cava:`);
  avisos.forEach(a => console.log(`  ! ${a.name}${a.detail ? '  →  ' + a.detail : ''}`));
}
if (fallas.length) {
  console.log(`\n${fallas.length} FALLA(S):`);
  fallas.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? '  →  ' + f.detail : ''}`));
  process.exit(1);
}
console.log('TODO OK ✓');
