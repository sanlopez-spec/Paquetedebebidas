#!/usr/bin/env node
// Verifica la sección "Calidad" de /club/cava y la tarjeta de Calidad del Inicio.
//
//   node scripts/check-calidad.mjs                             (local)
//   node scripts/check-calidad.mjs --base https://edb.com.ar   (producción)
//   node scripts/check-calidad.mjs --base <url> --shots <dir>
//
// Lo que compara contra /api/cava en vivo FALLA. Lo que compara contra los
// valores congelados del 22/10/2026 sale como AVISO: los datos de la cava
// cambian cada vez que se carga algo en Airtable.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, relative, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const BASE     = (arg('base', 'http://localhost:4173')).replace(/\/+$/, '');
const SHOTS    = arg('shots', null);
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const URL      = BASE + '/club/cava#calidad';

const VIEWPORTS = [
  { w: 360, h: 800,  label: 'celular',    file: 'mob' },
  { w: 820, h: 1000, label: 'escritorio', file: 'dsk' },
];

// Referencia del 22/10/2026 — sólo para AVISO.
const REF = {
  puntuadas: 375, sin: 8, promedio: 4.19,
  barras: [['≤3,5', 8], ['3,6', 1], ['3,7', 17], ['3,8', 6], ['3,9', 27], ['4,0', 16], ['4,1', 61], ['4,2', 65], ['4,3', 81], ['4,4', 54], ['4,5', 31], ['4,6', 9]],
  b45: { botellas: 31, vinos: 22, primero: 'Finca Ambrosia Grand Cru Blend', primeroBot: 4 },
  cajas: ['85%', '40', '4,6'], cajasN: 317, mejorVinos: 7,
  iconos: { n: 124, total: 383, pct: 32, dibujadas: 38, doradas: 12,
    primeros: ['Nicola Catena Parcela Bonarda', 'El Gran Enemigo Gualtallary Cab. Franc', 'Nico By Luca Malbec'] },
  podio: ['Nicola Catena Parcela Bonarda 2018', 'El Gran Enemigo Gualtallary Cab. Franc 2018', 'Nico By Luca Malbec 2017',
    'Viña Cobos Marchiori Estate Malbec 2019', 'Luigi Bosca Icono Cabernet - Malbec 2018'],
  valoraciones: [5025, 4409, 470, 293, 286],
  inicio: ['4,19', '317 con 4,0 o más'],
};

const PROHIBIDAS = ['inversión', 'inversion', 'valuación', 'valuacion',
                    'revalorización', 'revalorizacion', 'ganancia'];
const MONEY_KEY = /costo|precio|valor(?!aciones)|usd|sugerid|ganancia|inversi|valuaci|revaloriz|monto|importe|ahorro/i;
// números de datos de hoy que no pueden estar escritos a mano en el código
const LITERALES = [375, 317, 142, 135, 5025, 4409, 293, 286, 383, 124, 254, 121];
const DORADO = 'rgb(140, 106, 34)';           // #8C6A22
const COLORES_PODIO = ['#5E4512', '#8C6A22', '#B8994E'];
const COLOR_BARRA = 'rgb(210, 190, 142)';     // #D2BE8E
const MEDALLAS = ['#F1D27A', '#E6E6E6', '#E2A46B'];   // oro · plata · bronce
const botellasPorDibujo = total => (total <= 40 ? 1 : total <= 200 ? 5 : 10);
// misma regla que el gráfico: de la décima mínima a la máxima, con ceros; lo que está en 3,5 o menos, en "≤3,5"
function barrasEsperadas(porDecima) {
  if (!porDecima.length) return [];
  const dec = v => Math.round(v * 10);
  const bajos = porDecima.filter(d => dec(d.vivino) <= 35);
  const orden = (a, b) => b.botellas - a.botellas || (b.valoraciones ?? 0) - (a.valoraciones ?? 0) || a.vino.localeCompare(b.vino, 'es');
  const out = [];
  let desde = dec(porDecima[0].vivino);
  if (bajos.length) {
    out.push({ label: '≤3,5', botellas: bajos.reduce((s, d) => s + d.botellas, 0), vinos: bajos.flatMap(d => d.vinos).sort(orden) });
    desde = 36;
  }
  const hasta = dec(porDecima[porDecima.length - 1].vivino);
  for (let t = desde; t <= hasta; t++) {
    const d = porDecima.find(x => dec(x.vivino) === t);
    out.push({ label: nf(t / 10, 1), botellas: d?.botellas ?? 0, vinos: d?.vinos ?? [] });
  }
  return out;
}

// Tope de 4 minutos: si se pasa, corta e informa.
const TOPE_MS = 4 * 60 * 1000;
const tope = setTimeout(() => {
  console.log(`\nCORTADO: el script pasó el tope de ${TOPE_MS / 60000} minutos.`);
  process.exit(2);
}, TOPE_MS);
tope.unref?.();

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const num = t => Number(String(t).replace(/[^\d,]/g, '').replace(',', '.'));
const hexRgb = h => { const x = h.replace('#', ''); return `rgb(${parseInt(x.slice(0, 2), 16)}, ${parseInt(x.slice(2, 4), 16)}, ${parseInt(x.slice(4, 6), 16)})`; };
const plural = (n, a, b) => (n === 1 ? a : b);

// ── chequeos de archivos ──────────────────────────────────────────
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(p))) out.push(p);
  }
  return out;
}
function sinDibujo(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
    .replace(/\b(viewBox|d|points|transform|cx|cy|r|rx|ry|x|y|x1|x2|y1|y2|width|height|strokeWidth|strokeDasharray|offset|stdDeviation)\s*=\s*(".*?"|'.*?'|\{[^}]*\})/gs, ' ')
    .replace(/#[0-9a-fA-F]{3,8}\b/g, ' ')
    .replace(/\b(rgba?|hsla?)\([^)]*\)/g, ' ');
}
function chequeosDeArchivos() {
  console.log('── archivos ──');
  const archivos = walk(join(ROOT, 'src', 'club'), ['.ts', '.tsx'])
    .filter(p => !relative(ROOT, p).split(sep).includes('data'));
  const hallazgos = [];
  for (const p of archivos) {
    sinDibujo(readFileSync(p, 'utf8')).split('\n').forEach((l, i) => {
      for (const n of LITERALES) {
        if (new RegExp(`(?<![\\d.,])${n}(?![\\d.,])`).test(l)) hallazgos.push(`${relative(ROOT, p)}:${i + 1} → ${n}`);
      }
    });
  }
  check('sin números de la cava escritos a mano en src/club', hallazgos.length === 0, hallazgos.join(' | '));
  console.log('');
}

// ── api/cava.ts en local ──────────────────────────────────────────
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

// Cava chica de prueba: unas 30 botellas, 2 íconos, sin valoraciones cargadas.
// Sólo vive en el script: no toca Airtable ni producción. El bloque `calidad` se
// arma con la misma regla que la API, a partir de esta lista.
const VINOS_CHICA = [
  ['Alfa Reserva', 'Bodega Uno', 2018, 'Malbec', 3, 4.5, false],
  ['Beta Reserva', 'Bodega Dos', 2019, 'Malbec', 2, 4.5, true],
  ['Gamma Gran', 'Bodega Tres', 2017, 'Merlot', 1, 4.5, false],
  ['Delta', 'Bodega Uno', 2018, 'Merlot', 2, 4.4, false],
  ['Epsilon', 'Bodega Dos', 2016, 'Syrah', 2, 4.4, false],
  ['Zeta', 'Bodega Tres', 2020, 'Malbec', 4, 4.2, false],
  ['Eta', 'Bodega Uno', 2021, 'Syrah', 3, 4.1, false],
  ['Theta', 'Bodega Dos', 2019, 'Malbec', 4, 4.0, false],
  ['Iota', 'Bodega Tres', 2022, 'Merlot', 3, 3.9, false],
  ['Kappa', 'Bodega Uno', 2020, 'Syrah', 3, 3.8, false],
  ['Lambda', 'Bodega Dos', 2021, 'Malbec', 3, null, false],
].map(([vino, bodega, anada, cepa, botellas, vivino, icono]) => ({ vino, bodega, anada, cepa, tipo: 'tinto', botellas, vivino, icono, val: null }));

function construirCalidad(wines) {
  const v1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  const TR = [['4,5 o más', 4.5, '#5E4512'], ['4,3 a 4,4', 4.3, '#8C6A22'], ['4,0 a 4,2', 4.0, '#B8994E'], ['Menos de 4,0', -Infinity, '#DCC795']];
  const total = wines.reduce((s, w) => s + w.botellas, 0);
  const punt = wines.filter(w => w.vivino != null);
  const botPunt = punt.reduce((s, w) => s + w.botellas, 0);
  const prom = ws => { const n = ws.reduce((s, w) => s + w.botellas, 0); return n ? r2(ws.reduce((s, w) => s + w.vivino * w.botellas, 0) / n) : null; };
  const fila = w => ({ ...w, vivino: w.vivino == null ? null : v1(w.vivino) });
  const tramos = TR.map(([tramo, desde, color]) => {
    const ws = punt.filter(w => TR.findIndex(t => v1(w.vivino) >= t[1]) === TR.findIndex(t => t[0] === tramo));
    const botellas = ws.reduce((s, w) => s + w.botellas, 0);
    return { tramo, color, botellas, pct: Math.round(botellas / botPunt * 100), etiquetas: ws.map(fila) };
  });
  const ico = wines.filter(w => w.icono), icoPunt = ico.filter(w => w.vivino != null), resto = punt.filter(w => !w.icono);
  const ranking = punt.map(fila).sort((a, b) => b.vivino - a.vivino || (b.val ?? 0) - (a.val ?? 0) || b.botellas - a.botellas || a.vino.localeCompare(b.vino, 'es'));
  const max = ranking[0].vivino, conMax = ranking.filter(e => e.vivino === max);
  const pod = e => ({ vino: e.vino, bodega: e.bodega, anada: e.anada, cepa: e.cepa, tipo: e.tipo, icono: e.icono,
    vivino: e.vivino, valoraciones: e.val, botellas: e.botellas });
  const porDecima = [...new Set(punt.map(w => v1(w.vivino)))].sort((a, b) => a - b).map(vivino => {
    const ws = punt.filter(w => v1(w.vivino) === vivino);
    return {
      vivino, botellas: ws.reduce((s, w) => s + w.botellas, 0),
      vinos: ws.map(fila).sort((a, b) => b.botellas - a.botellas || (b.val ?? 0) - (a.val ?? 0) || a.vino.localeCompare(b.vino, 'es'))
        .map(e => ({ vino: e.vino, anada: e.anada, botellas: e.botellas, valoraciones: e.val, icono: e.icono })),
    };
  });
  return {
    puntuadas: botPunt, sinPuntaje: total - botPunt, promedio: prom(punt),
    con40: tramos.slice(0, 3).reduce((s, t) => s + t.botellas, 0), con45: tramos[0].botellas, porDecima,
    tramos, mejor: { vivino: max, vinos: conMax.length },
    iconos: {
      botellas: ico.reduce((s, w) => s + w.botellas, 0), total, pct: Math.round(ico.reduce((s, w) => s + w.botellas, 0) / total * 100),
      puntuadasIconos: icoPunt.reduce((s, w) => s + w.botellas, 0), puntuadasResto: resto.reduce((s, w) => s + w.botellas, 0),
      promedioIconos: prom(icoPunt), promedioResto: prom(resto),
      de45: icoPunt.filter(w => v1(w.vivino) >= 4.5).reduce((s, w) => s + w.botellas, 0),
      lista: ico.map(fila).sort((a, b) => (b.vivino ?? -1) - (a.vivino ?? -1) || (b.val ?? 0) - (a.val ?? 0) || b.botellas - a.botellas || a.vino.localeCompare(b.vino, 'es')),
    },
    podio: ranking.slice(0, 5).map(pod), empateMax: conMax.length > 5 ? conMax.map(pod) : [],
  };
}

function cavaChica(real) {
  const d = JSON.parse(real);
  d.calidad = construirCalidad(VINOS_CHICA);
  d.stats = { ...d.stats, vivinoPromedio: d.calidad.promedio, enGuarda: VINOS_CHICA.reduce((s, w) => s + w.botellas, 0) };
  return JSON.stringify(d);
}

chequeosDeArchivos();

let server = null, apiBody = null;
if (IS_LOCAL) {
  console.log('Corriendo api/cava.ts contra Airtable…');
  apiBody = await apiLocal();
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteBin)) { console.error('No encuentro vite.'); process.exit(1); }
  console.log('Levantando vite preview en 4173…');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  if (!await waitForServer(BASE + '/', 30000)) { console.error('preview no respondió'); server.kill(); process.exit(1); }
}

let apiParaFixture = apiBody;
if (!apiParaFixture) {
  try { apiParaFixture = await (await fetch(BASE + '/api/cava')).text(); } catch { apiParaFixture = null; }
}

console.log(`\nVerificando ${URL}\n`);
const browser = await chromium.launch({ headless: true });

// Lo que hace falta leer de la pantalla.
const LEER = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const R = e => e.getBoundingClientRect();
  const lineas = e => {
    const r = document.createRange(); r.selectNodeContents(e);
    return new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size;
  };
  // Cada rótulo, número o % debe ocupar una sola línea (el nombre del vino puede ocupar más).
  const SEL_LINEA = '.med-prom, .cepa-kpi b, .cepa-kpi span, .ic-big b, .ic-big span, .an-n, .an-y, .pb-t, .pb-s, '
    + '.lc-an, .lc-dato, .lc-ver, .ib-nota, .pd-grande, .pd-bod, .pd-an, .pd-meta span, .pd-pues, .pd-der, '
    + '.det-et-bod, .det-et-n, .det-it, .ic-ver';
  const partidos = [...document.querySelectorAll(SEL_LINEA)].filter(e => txt(e) && lineas(e) > 1).map(e => `${e.className}:"${txt(e)}"`);
  // la leyenda de las botellas lleva un puntito: se mide por altura de renglón
  partidos.push(...[...document.querySelectorAll('.ib-leyenda span')]
    .filter(e => R(e).height > parseFloat(getComputedStyle(e).fontSize) * 1.8).map(e => `leyenda:"${txt(e)}"`));
  // la añada nunca recortada
  const recortados = [...document.querySelectorAll('.pd-bod, .lc-an, .det-et-bod')]
    .filter(e => e.scrollWidth > e.clientWidth + 0.5).map(e => `${e.className}:"${txt(e)}"`);
  const pisados = [];
  for (const sel of ['.med-rot', '.cepa-kpi b', '.an-n', '.an-y', '.lc-dato', '.pd-grande', '.pd-bod', '.pd-pues', '.pd-der', '.det-et-n', '.det-et-bod']) {
    const els = [...document.querySelectorAll(sel)].filter(e => txt(e)).map(e => ({ e, r: R(e) }));
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].r, b = els[j].r;
      if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) {
        pisados.push(`${sel}:"${txt(els[i].e)}"×"${txt(els[j].e)}"`);
      }
    }
  }
  const aguja = document.querySelector('.med-aguja');
  const gx = aguja ? Number(aguja.getAttribute('x1')) : 0, gy = aguja ? Number(aguja.getAttribute('y1')) : 0;
  const gr = (x, y) => Math.atan2(gy - y, x - gx) * 180 / Math.PI;
  const arco = [...document.querySelectorAll('.med-arco path')].map(p => p.getAttribute('stroke'));
  return {
    titulos: [...document.querySelectorAll('.cal-sec .tpanel h3')].map(e => txt(e)),
    prom: txt(document.querySelector('.med-prom')), promData: Number(document.querySelector('.med-prom')?.dataset.prom ?? NaN),
    promColor: document.querySelector('.med-prom') ? getComputedStyle(document.querySelector('.med-prom')).color : null,
    aguja: aguja ? {
      v: Number(aguja.dataset.v), grados: gr(Number(aguja.getAttribute('x2')), Number(aguja.getAttribute('y2'))),
      color: getComputedStyle(aguja).stroke,
    } : null,
    rotulos: [...document.querySelectorAll('.med-rot')].map(t => ({
      t: txt(t), v: Number(t.dataset.v), grados: gr(Number(t.getAttribute('x')), Number(t.getAttribute('y'))),
    })),
    marcas: document.querySelectorAll('.med-marcas line').length,
    arco: { n: arco.length, primero: arco[0], ultimo: arco[arco.length - 1], medio: arco[Math.round(arco.length * 0.55)], colores: arco },
    // medidor
    filasTramo: document.querySelectorAll('.tr-fila').length, hint: txt(document.querySelector('.med-hint')),
    arcoGrosor: Number(document.querySelector('.med-arco')?.getAttribute('stroke-width')),
    arcoRadio: Number((document.querySelector('.med-arco path')?.getAttribute('d') ?? '').match(/A(\d+(?:\.\d+)?)/)?.[1]),
    viewBoxW: Number((document.querySelector('.med-svg')?.getAttribute('viewBox') ?? '').split(/\s+/)[2]),
    logo: (() => {
      const card = document.querySelector('.med-card'), l = card?.querySelector('.med-logo');
      if (!card || !l) return null;
      const rl = R(l), rc = R(card);
      return {
        tag: l.tagName, src: l.getAttribute('src'), alt: l.getAttribute('alt'), h: rl.height, op: Number(getComputedStyle(l).opacity),
        cargado: l.tagName === 'IMG' ? l.complete && l.naturalWidth > 0 : false, texto: txt(l),
        derecha: rc.right - rl.right, arriba: rl.top - rc.top,
      };
    })(),
    cajas: [...document.querySelectorAll('.cal-sec > .cepa-kpis .cepa-kpi')].map(e => ({ n: txt(e.querySelector('b')), l: txt(e.querySelector('span')) })),
    // puntaje por puntaje
    hayBarras: !!document.querySelector('.pb-chart'),
    barras: [...document.querySelectorAll('.pb-chart .an-col')].map(e => ({
      key: e.dataset.pb, n: txt(e.querySelector('.an-n')), y: txt(e.querySelector('.an-y')), boton: e.tagName === 'BUTTON', on: e.classList.contains('on'),
      h: R(e.querySelector('.an-bar')).height, bg: getComputedStyle(e.querySelector('.an-bar')).backgroundColor,
      yColor: getComputedStyle(e.querySelector('.an-y')).color, yPeso: Number(getComputedStyle(e.querySelector('.an-y')).fontWeight),
      nColor: getComputedStyle(e.querySelector('.an-n')).color, nPeso: Number(getComputedStyle(e.querySelector('.an-n')).fontWeight),
    })),
    chartScroll: document.querySelector('.pb-chart') ? document.querySelector('.pb-chart').scrollWidth - document.querySelector('.pb-chart').clientWidth : 0,
    pbPanel: (() => {
      const p = document.querySelector('.pb-panel');
      if (!p) return null;
      return {
        key: p.dataset.pbPanel, t: txt(p.querySelector('.pb-t')), s: txt(p.querySelector('.pb-s')), x: !!p.querySelector('.det-x'),
        tColor: getComputedStyle(p.querySelector('.pb-t')).color, filas: [...p.querySelectorAll('.lc-item')].map(f => ({
          vino: txt(f.querySelector('.lc-vino')), an: txt(f.querySelector('.lc-an')), dato: txt(f.querySelector('.lc-dato')) })),
        ver: txt(p.querySelector('.lc-ver')),
      };
    })(),
    // íconos
    hayIconos: !!document.querySelector('.ic-big'),
    iconos: {
      n: txt(document.querySelector('.ic-big b')), de: txt(document.querySelector('.ic-big span')),
      filasVivino: document.querySelectorAll('.ic-cmp, .ic-linea, .ic-barra').length,
      botellas: [...document.querySelectorAll('.ib-bot')].map(b => ({
        oro: b.classList.contains('oro'), fill: b.querySelector('path')?.getAttribute('fill'), top: Math.round(R(b).top),
      })),
      leyenda: [...document.querySelectorAll('.ib-leyenda span')].map(txt), nota: txt(document.querySelector('.ib-nota')),
      caja: txt(document.querySelector('.ic-caja-t')),
      filas: [...document.querySelectorAll('.ic-caja .lc-item')].map(f => ({
        vino: txt(f.querySelector('.lc-vino')), an: txt(f.querySelector('.lc-an')), dato: txt(f.querySelector('.lc-dato')) })),
      ver: txt(document.querySelector('.ic-caja .lc-ver')),
    },
    titulos2: [...document.querySelectorAll('.cal-sec .tpanel h3')].map(txt),
    podio: [...document.querySelectorAll('.pd-col')].map(c => {
      const esc = c.querySelector('.pd-escalon');
      const y = s => { const e = c.querySelector(s); return e ? R(e).top : null; };
      const med = c.querySelector('.pd-medalla'), rm = med ? R(med) : null, re = R(esc);
      return {
        puesto: Number(c.dataset.puesto), left: R(c).left, vino: txt(c.querySelector('.pd-vino')), bod: txt(c.querySelector('.pd-bod')),
        grande: txt(c.querySelector('.pd-grande')), meta: [...c.querySelectorAll('.pd-meta span')].map(txt), todo: txt(c),
        esc: txt(esc), escH: Math.round(re.height), escBg: getComputedStyle(esc).backgroundColor, escImg: getComputedStyle(esc).backgroundImage,
        escTop: re.top, escBottom: re.bottom, txtBottom: R(c.querySelector('.pd-txt')).bottom,
        orden: [y('.pd-vino'), y('.pd-bod'), y('.pd-grande')],
        grandeColor: getComputedStyle(c.querySelector('.pd-grande')).color,
        medalla: med ? {
          n: Number(med.dataset.medalla), relleno: med.dataset.relleno, w: rm.width, h: rm.height,
          dx: (rm.left + rm.width / 2) - (re.left + re.width / 2), dy: rm.top - re.top, dentro: esc.contains(med),
          disco: med.querySelector('circle')?.getAttribute('fill'),
        } : null,
      };
    }),
    podioBottom: document.querySelector('.pd-podio') ? R(document.querySelector('.pd-podio')).bottom : null,
    hayPodio: !!document.querySelector('.pd-podio'),
    filasPodio: [...document.querySelectorAll('.pd-item')].map(e => ({
      puesto: Number(e.dataset.puesto), pues: txt(e.querySelector('.pd-pues')), todo: txt(e.querySelector('.pd-vino')),
      vino: [...e.querySelector('.pd-vino').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(),
      an: txt(e.querySelector('.pd-an')), sub: txt(e.querySelector('.pd-fsub')), der: txt(e.querySelector('.pd-der')), top: R(e).top,
      puntajeColor: getComputedStyle(e.querySelector('.pd-pues')).color,
    })),
    verMax: [...document.querySelectorAll('.cal-sec .tpanel .ic-ver')].map(txt),
    nota: txt(document.querySelector('.an-nota')),
    panelesVacios: [...document.querySelectorAll('.cal-sec .tpanel')].filter(p => p.innerText.replace(/\s+/g, '').length < 12).length,
    kpisVacios: [...document.querySelectorAll('.cal-sec .cepa-kpi')].filter(e => !txt(e.querySelector('b'))).length,
    partidos, recortados, pisados,
    scroll: { s: document.documentElement.scrollWidth, i: window.innerWidth },
  };
};

const LEER_PANEL = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const p = document.querySelector('.det-panel');
  if (!p) return { hay: false };
  return {
    hay: true, clave: p.dataset.det, titulo: txt(p.querySelector('.det-t')), sub: txt(p.querySelector('.det-s')),
    cajas: [...p.querySelectorAll('.det-cajas .cepa-kpi')].map(e => ({ n: txt(e.querySelector('b')), l: txt(e.querySelector('span')) })),
    lineas: [...p.querySelectorAll('.det-linea')].map(txt), mas: txt(p.querySelector('.det-mas')),
    filas: [...p.querySelectorAll('.det-et')].map(e => ({
      vino: txt(e.querySelector('.det-et-vino')), bod: txt(e.querySelector('.det-et-bod')), n: txt(e.querySelector('.det-et-n')) })),
  };
};

// Lo que tiene que mostrar un panel de detalle para una lista de etiquetas.
function esperadoLista(lista, cuarta) {
  const ord = [...lista].sort((a, b) => b.botellas - a.botellas || a.vino.localeCompare(b.vino, 'es'));
  const porCepa = new Map();
  ord.forEach(e => porCepa.set(e.cepa, (porCepa.get(e.cepa) ?? 0) + e.botellas));
  const cepas = [...porCepa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const bot = ord.reduce((s, e) => s + e.botellas, 0);
  return {
    ord, bot,
    cajas: [nf(bot), nf(ord.length), nf(cepas.length),
      cuarta === 'iconos' ? nf(ord.filter(e => e.icono).reduce((s, e) => s + e.botellas, 0)) : nf(new Set(ord.map(e => e.bodega)).size)],
    etiquetasCajas: ['Botellas', 'Etiquetas', 'Cepas', cuarta === 'iconos' ? 'Íconos' : 'Bodegas'],
    linea: cepas.length ? 'Cepas: ' + cepas.slice(0, 4).map(([c, n]) => `${c} ${nf(n)}`).join(' · ') + (cepas.length > 4 ? ` · ${nf(cepas.length - 4)} más` : '') : null,
    filas: ord.map(e => [e.vino, `${e.bodega} · ${e.anada ?? 'N/V'}`, nf(e.botellas)]),
  };
}

try {
  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.label} (${vp.w}×${vp.h}) ──`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.w < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    if (apiBody) await page.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    const P = vp.file + ': ';
    const resp = page.waitForResponse(r => r.url().includes('/api/cava'), { timeout: 40000 });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await resp;
    await page.waitForSelector('.med-svg', { timeout: 25000 });
    await page.waitForSelector('.pb-chart', { timeout: 10000 });

    const api = await page.evaluate(async () => await (await fetch('/api/cava')).json());
    const Q = api.calidad;
    const v = await page.evaluate(LEER);

    // ── 1. medidor ──────────────────────────────────────────────────
    check(P + '1. el promedio se muestra con 2 decimales y es el de la API',
      v.prom === nf(Q.promedio, 2) && /^\d,\d\d$/.test(v.prom) && v.promData === Q.promedio && Q.promedio === api.stats.vivinoPromedio,
      `${v.prom} vs API ${Q.promedio} (stats ${api.stats.vivinoPromedio})`);
    check(P + '1. título y subtítulo del medidor, sin la palabra Vivino',
      v.titulos.some(t => t.startsWith('¿Qué tan buena es tu cava?') && t.endsWith(`Promedio de ${nf(Q.puntuadas)} botellas puntuadas`) && !/vivino/i.test(t)),
      v.titulos.join(' | '));
    check(P + '1. el arco mide 40 ± 2 de grosor (radio externo 136) en un viewBox de 320',
      v.viewBoxW === 320 && Math.abs(v.arcoGrosor - 40) <= 2 && Math.abs(v.arcoRadio + v.arcoGrosor / 2 - 136) <= 2,
      `viewBox ${v.viewBoxW}, grosor ${v.arcoGrosor}, radio externo ${v.arcoRadio + v.arcoGrosor / 2}`);
    check(P + '1. sin filas de tramos ni el texto "Tocá un tramo…"', v.filasTramo === 0 && v.hint === '', `${v.filasTramo} filas, "${v.hint}"`);
    check(P + '1. logo de Vivino arriba a la derecha (img cargada, alt "Vivino", 28 px, opacidad 0,9)',
      !!v.logo && v.logo.tag === 'IMG' && v.logo.cargado && /\/club\/vivino-logo\.(svg|png)$/.test(v.logo.src) && v.logo.alt === 'Vivino'
      && v.logo.h >= 27 && v.logo.h <= 29 && Math.abs(v.logo.op - 0.9) < 0.02 && v.logo.derecha <= 24 && v.logo.arriba <= 24 && v.logo.derecha >= 0,
      JSON.stringify(v.logo));
    const gradosDe = x => 180 * (1 - (Math.min(Math.max(x, 3.5), 5) - 3.5) / 1.5);
    check(P + '1. la aguja apunta al promedio (±2°)', !!v.aguja && Math.abs(v.aguja.grados - gradosDe(Q.promedio)) <= 2,
      `${v.aguja?.grados.toFixed(1)}° vs ${gradosDe(Q.promedio).toFixed(1)}°`);
    check(P + '1. la aguja es oscura (#2B2320)', v.aguja?.color === hexRgb('#2B2320'), String(v.aguja?.color));
    check(P + '1. rótulos 3,5 · 4,0 · 4,3 · 4,5 · 5,0, cada uno en su valor (±1°)',
      same(v.rotulos.map(r => r.t), ['3,5', '4,0', '4,3', '4,5', '5,0']) && v.rotulos.every(r => Math.abs(((r.grados - gradosDe(r.v) + 540) % 360) - 180) <= ([3.5, 5].includes(r.v) ? 8 : 1)),   // los extremos van abajo del arco
      v.rotulos.map(r => `${r.t}@${r.grados.toFixed(1)}°`).join(' '));
    check(P + '1. rayitas finas cada 0,1 (16 de 3,5 a 5,0)', v.marcas === 16, String(v.marcas));
    const lum = c => { const m = (c || '').match(/#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i); return m ? 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16) : NaN; };
    const dif = (a, b) => { const x = a.match(/[0-9a-f]{2}/gi).map(h => parseInt(h, 16)), y = b.match(/[0-9a-f]{2}/gi).map(h => parseInt(h, 16)); return Math.max(...x.map((q, i) => Math.abs(q - y[i]))); };
    check(P + '1. el arco es un degradé continuo #E9DCB4 → #B8994E (al 55%) → #4E390E, sin cortes',
      v.arco.n >= 100 && dif(v.arco.primero, '#E9DCB4') <= 6 && dif(v.arco.ultimo, '#4E390E') <= 6 && dif(v.arco.medio, '#B8994E') <= 8
      && v.arco.colores.every((c, i, a) => i === 0 || lum(c) <= lum(a[i - 1]) + 0.5)
      && v.arco.colores.every((c, i, a) => i === 0 || dif(c, a[i - 1]) <= 8),
      `${v.arco.n} tramos; ${v.arco.primero} … ${v.arco.medio} … ${v.arco.ultimo}`);
    check(P + '1. el promedio va en dorado serif', v.promColor === DORADO, String(v.promColor));

    // la tarjeta del Inicio
    {
      const p = await ctx.newPage();
      if (apiBody) await p.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
      const r2 = p.waitForResponse(x => x.url().includes('/api/cava'), { timeout: 40000 });
      await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await r2;
      await p.waitForSelector('.sec-card.t-dorado .sec-card-big b:not(.sk-text)', { timeout: 25000 });
      const card = await p.evaluate(() => ({
        num: document.querySelector('.sec-card.t-dorado .sec-card-big b')?.textContent.trim(),
        palabra: document.querySelector('.sec-card.t-dorado .sec-card-big span')?.textContent.trim(),
        sub: document.querySelector('.sec-card.t-dorado .sec-card-sub')?.textContent.trim(),
      }));
      check(P + '1. la tarjeta de Calidad del Inicio: "{promedio} en Vivino" y "{n} con 4,0 o más", igual que el medidor',
        card.num === v.prom && card.palabra === 'en Vivino' && card.sub === `${nf(Q.con40)} con 4,0 o más`,
        `"${card.num}" "${card.palabra}" "${card.sub}" vs medidor ${v.prom} y API ${Q.con40}`);
      aviso(P + `ref. Inicio: ${REF.inicio.join(' · ')}`, card.num === REF.inicio[0] && card.sub === REF.inicio[1], `hoy ${card.num} · ${card.sub}`);
      await p.close();
    }

    // ── 2. tres cajas ───────────────────────────────────────────────
    if (Q.puntuadas >= 10) {
      const mejor = Q.mejor;
      check(P + '2. las tres cajas: % con 4,0 o más · con 4,5 o más · el mejor',
        same(v.cajas, [
          { n: `${nf(Math.round(Q.con40 / Q.puntuadas * 100))}%`, l: 'Con 4,0 o más' },
          { n: nf(Q.con45), l: 'Con 4,5 o más' },
          { n: nf(mejor.vivino, 1), l: `El mejor · ${nf(mejor.vinos)} ${plural(mejor.vinos, 'vino', 'vinos')}` },
        ]), JSON.stringify(v.cajas));
    } else {
      check(P + '2. con menos de 10 puntuadas no hay cajas ni barras', v.cajas.length === 0 && !v.hayBarras);
    }
    check(P + '2. los puntajes del podio llevan 1 decimal ("4,6", nunca "4,60")',
      [...v.podio.map(c => c.grande), ...v.filasPodio.map(r => r.der)].every(t => /^\d,\d$/.test(t)),
      [...v.podio.map(c => c.grande), ...v.filasPodio.map(r => r.der)].join(' '));
    check(P + '2. ninguna caja vacía ni panel vacío', v.kpisVacios === 0 && v.panelesVacios === 0, `${v.kpisVacios} cajas, ${v.panelesVacios} paneles`);
    aviso(P + `ref. ${REF.puntuadas} puntuadas · ${REF.sin} sin puntaje · promedio ${nf(REF.promedio, 2)}`,
      Q.puntuadas === REF.puntuadas && Q.sinPuntaje === REF.sin && Q.promedio === REF.promedio, `hoy ${Q.puntuadas} · ${Q.sinPuntaje} · ${Q.promedio}`);
    aviso(P + `ref. cajas ${REF.cajas.join(' · ')}, ${REF.mejorVinos} vinos, ${REF.cajasN} con 4,0 o más`,
      same(v.cajas.map(c => c.n), REF.cajas) && Q.mejor?.vinos === REF.mejorVinos && Q.con40 === REF.cajasN, JSON.stringify(v.cajas.map(c => c.n)));

    // ── 3. puntaje por puntaje ──────────────────────────────────────
    const BE = barrasEsperadas(Q.porDecima);
    if (Q.puntuadas >= 10) {
      check(P + '3. una barra por décima (con "≤3,5" agrupando lo de abajo), con los números de la API',
        v.barras.length === BE.length && v.barras.every((b, i) => b.n === nf(BE[i].botellas) && (BE.length > 20 || b.y === BE[i].label)),
        JSON.stringify(v.barras.map(b => [b.y, b.n])) + ' vs ' + JSON.stringify(BE.map(b => [b.label, b.botellas])));
      check(P + '3. la suma de las barras es la de botellas puntuadas', BE.reduce((s, b) => s + b.botellas, 0) === Q.puntuadas,
        `${BE.reduce((s, b) => s + b.botellas, 0)} vs ${Q.puntuadas}`);
      const maxB = Math.max(...BE.map(b => b.botellas)), hMax = Math.max(...v.barras.map(b => b.h));
      check(P + '3. escala lineal sin tope (altura ∝ botellas) y color #D2BE8E',
        v.barras.every((b, i) => Math.abs(b.h / hMax - BE[i].botellas / maxB) < 0.03 && (BE[i].botellas === 0 || b.bg === COLOR_BARRA)),
        v.barras.map(b => `${b.n}:${Math.round(b.h)}:${b.bg}`).join(' | '));
      check(P + '3. todo entra en el ancho, sin scroll en el gráfico', v.chartScroll <= 1, String(v.chartScroll));
      aviso(P + '3. ref. barras de hoy', same(v.barras.map(b => [b.y, b.n]), REF.barras.map(([l, n]) => [l, nf(n)])),
        JSON.stringify(v.barras.map(b => [b.y, b.n])));

      // tocar la barra más alta
      const iMax = BE.reduce((m, b, i) => (b.botellas > BE[m].botellas ? i : m), 0), B = BE[iMax];
      const colMax = page.locator('.pb-chart .an-col').nth(iMax);
      await colMax.click();
      await page.waitForSelector('.pb-panel', { timeout: 8000 });
      await page.waitForTimeout(300);
      const pa = await page.evaluate(LEER), pp = pa.pbPanel;
      const N3 = `${P}barra ${B.label}: `;
      check(N3 + 'la barra tocada pasa a #8C6A22 y su rótulo y número en negrita dorada',
        pa.barras[iMax].on && pa.barras[iMax].bg === DORADO && pa.barras[iMax].yColor === DORADO && pa.barras[iMax].nColor === DORADO
        && pa.barras[iMax].yPeso >= 600 && pa.barras[iMax].nPeso >= 600,
        JSON.stringify([pa.barras[iMax].bg, pa.barras[iMax].yColor, pa.barras[iMax].yPeso, pa.barras[iMax].nColor, pa.barras[iMax].nPeso]));
      check(N3 + 'título en serif dorado y "{b} botellas · {v} vinos" con la ✕',
        pp.t === B.label && pp.tColor === DORADO && pp.x && pp.s === `${nf(B.botellas)} ${plural(B.botellas, 'botella', 'botellas')} · ${nf(B.vinos.length)} ${plural(B.vinos.length, 'vino', 'vinos')}`,
        JSON.stringify([pp.t, pp.s, pp.tColor]));
      check(N3 + 'la lista muestra 8 filas como máximo', pp.filas.length === Math.min(8, B.vinos.length), String(pp.filas.length));
      check(N3 + 'el link dice "Ver los {v} vinos" (sólo si hay más de 8)',
        B.vinos.length > 8 ? pp.ver === `Ver los ${nf(B.vinos.length)} vinos` : pp.ver === '', pp.ver);
      await page.waitForTimeout(100);
      if (B.vinos.length > 8) {
        await page.locator('.pb-panel .lc-ver').click();
        await page.waitForTimeout(200);
      }
      const pl = (await page.evaluate(LEER)).pbPanel;
      check(N3 + 'la lista completa: vino, añada y "{n} bot.", en orden botellas ↓ → valoraciones ↓ → alfabético',
        same(pl.filas.map(f => [f.vino, f.an, f.dato]), B.vinos.map(e => [e.vino, String(e.anada ?? 'N/V'), `${nf(e.botellas)} bot.`])),
        pl.filas.slice(0, 3).map(f => `${f.vino} ${f.an} ${f.dato}`).join(' | '));
      check(N3 + 'las botellas de la lista suman las de la barra', pl.filas.reduce((s, f) => s + num(f.dato), 0) === B.botellas,
        `${pl.filas.reduce((s, f) => s + num(f.dato), 0)} vs ${B.botellas}`);
      check(N3 + 'el link pasa a "Ver menos"', B.vinos.length > 8 ? pl.ver === 'Ver menos' : true, pl.ver);
      const vl = await page.evaluate(LEER);
      check(N3 + 'rótulos, números y añadas en una sola línea; nada se pisa ni se recorta',
        vl.partidos.length === 0 && vl.pisados.length === 0 && vl.recortados.length === 0 && vl.scroll.s <= vl.scroll.i,
        [...vl.partidos, ...vl.pisados, ...vl.recortados].slice(0, 4).join(' | '));
      await page.locator('.pb-panel .lc-fila').first().click();
      check(N3 + 'tocar una fila abre la ficha de la botella', await page.locator('.pb-panel .wdetail').count() === 1);
      await page.locator('.pb-panel .lc-fila').first().click();
      await colMax.click();
      check(N3 + 'tocar la misma barra cierra el recuadro', await page.locator('.pb-panel').count() === 0);
      await colMax.click();
      await page.waitForSelector('.pb-panel');
      await page.locator('.pb-panel .det-x').click();
      check(N3 + 'la ✕ cierra el recuadro', await page.locator('.pb-panel').count() === 0);
      const hueco = v.barras.findIndex(b => b.n === '0');
      if (hueco >= 0) {
        await page.locator('.pb-chart .an-col').nth(hueco).click({ force: true });
        check(P + '3. una décima en 0 no se puede tocar', !v.barras[hueco].boton && await page.locator('.pb-panel').count() === 0);
      }
    }

    // ── 4. íconos ───────────────────────────────────────────────────
    const ic = Q.iconos;
    if (ic.botellas >= 1) {
      const X = botellasPorDibujo(ic.total), dor = Math.round(ic.botellas / X), cla = Math.round((ic.total - ic.botellas) / X);
      check(P + '4. íconos: número grande y "de {total} botellas · {pct}%"',
        v.iconos.n === nf(ic.botellas) && v.iconos.de === `de ${nf(ic.total)} botellas · ${nf(ic.pct)}%`, `${v.iconos.n} ${v.iconos.de}`);
      check(P + '4. íconos: sin las filas de Vivino ni la barra partida ni la línea de "4,5 o más"', v.iconos.filasVivino === 0, String(v.iconos.filasVivino));
      const bots = v.iconos.botellas, oro = bots.filter(b => b.oro);
      check(P + `4. íconos: botellas dibujadas por la regla (1 cada ${X}): ${dor} doradas + ${cla} claras`,
        oro.length === dor && bots.length - oro.length === cla, `${oro.length} doradas + ${bots.length - oro.length} claras`);
      check(P + '4. íconos: primero las doradas (#8C6A22) y después las claras (#DCD0B4)',
        bots.every((b, i) => (i < dor ? b.oro && b.fill.toLowerCase() === '#8c6a22' : !b.oro && b.fill.toLowerCase() === '#dcd0b4')),
        bots.map(b => (b.oro ? 'O' : 'c')).join(''));
      const tops = [...new Set(bots.map(b => b.top))];
      check(P + '4. íconos: 19 botellas por fila',
        tops.length === Math.ceil(bots.length / 19) && bots.filter(b => b.top === tops[0]).length === Math.min(19, bots.length),
        `${tops.length} filas, ${bots.filter(b => b.top === tops[0]).length} en la primera`);
      check(P + '4. íconos: leyenda "Íconos · {n}" y "El resto · {n}"',
        same(v.iconos.leyenda, [`Íconos · ${nf(ic.botellas)}`, `El resto · ${nf(ic.total - ic.botellas)}`]), JSON.stringify(v.iconos.leyenda));
      check(P + '4. íconos: "Cada botella dibujada son {X} de tu cava" (sólo si X > 1)',
        v.iconos.nota === (X > 1 ? `Cada botella dibujada son ${nf(X)} de tu cava` : ''), v.iconos.nota);
      aviso(P + `ref. íconos ${REF.iconos.n} de ${REF.iconos.total} · ${REF.iconos.pct}% · ${REF.iconos.dibujadas} dibujadas, ${REF.iconos.doradas} doradas`,
        ic.botellas === REF.iconos.n && ic.total === REF.iconos.total && ic.pct === REF.iconos.pct && bots.length === REF.iconos.dibujadas && oro.length === REF.iconos.doradas,
        `hoy ${ic.botellas} de ${ic.total} · ${ic.pct}% · ${bots.length} dibujadas, ${oro.length} doradas`);
      // la lista de íconos, de mayor a menor puntaje
      const L = ic.lista;
      const antesI = (a, b) => ((b.vivino ?? -1) - (a.vivino ?? -1)) || ((b.val ?? 0) - (a.val ?? 0)) || (b.botellas - a.botellas) || a.vino.localeCompare(b.vino, 'es');
      check(P + '4. íconos: la lista de la API respeta el orden (Vivino ↓ → valoraciones ↓ → botellas ↓ → alfabético)',
        L.every((e, i) => i === 0 || antesI(L[i - 1], e) <= 0), L.slice(0, 3).map(e => `${e.vino} ${e.vivino}`).join(' | '));
      check(P + '4. íconos: recuadro "Los íconos · de mayor a menor puntaje"', v.iconos.caja.startsWith('Los íconos') && v.iconos.caja.includes('de mayor a menor puntaje'), v.iconos.caja);
      check(P + '4. íconos: la lista muestra 8 filas (vino, añada y puntaje a la derecha), en ese orden',
        same(v.iconos.filas.map(f => [f.vino, f.an, f.dato]),
          L.slice(0, 8).map(e => [e.vino, String(e.anada ?? 'N/V'), e.vivino != null ? nf(e.vivino, 1) : '—'])),
        v.iconos.filas.slice(0, 3).map(f => `${f.vino} ${f.an} ${f.dato}`).join(' | '));
      check(P + '4. íconos: el link dice "Ver los {n} íconos" (sólo si hay más de 8)',
        v.iconos.ver === (L.length > 8 ? `Ver los ${nf(L.length)} ${plural(L.length, 'ícono', 'íconos')}` : ''), v.iconos.ver);
      aviso(P + 'ref. primeros íconos', same(L.slice(0, 3).map(e => `${e.vino} ${e.anada}`), REF.iconos.primeros.map((n, i) => `${n} ${['2018', '2018', '2017'][i]}`)),
        L.slice(0, 3).map(e => `${e.vino} ${e.anada}`).join(' | '));
      if (L.length > 8) {
        await page.locator('.ic-caja .lc-ver').click();
        await page.waitForTimeout(200);
        const fa = await page.evaluate(() => document.querySelectorAll('.ic-caja .lc-item').length);
        check(P + '4. "Ver los N íconos" despliega todos', fa === L.length, `${fa} vs ${L.length}`);
        await page.locator('.ic-caja .lc-ver').click();
      }
    } else {
      check(P + '4. sin íconos no aparece el bloque', !v.hayIconos);
    }

    // ── 5. podio ────────────────────────────────────────────────────
    const pod = Q.podio;
    // cada vino va antes que el siguiente según la regla: Vivino ↓, valoraciones ↓ (vacío = 0), botellas ↓, alfabético
    const antes = (x, y) => (y.vivino - x.vivino) || ((y.valoraciones ?? 0) - (x.valoraciones ?? 0)) || (y.botellas - x.botellas) || x.vino.localeCompare(y.vino, 'es');
    check(P + '5. el orden del podio respeta la regla (Vivino → valoraciones → botellas → alfabético)',
      pod.every((e, i) => i === 0 || antes(pod[i - 1], e) <= 0) && Q.empateMax.every((e, i, a) => i === 0 || antes(a[i - 1], e) <= 0),
      pod.map(e => `${e.vino} ${e.vivino}/${e.valoraciones}/${e.botellas}`).join(' | '));
    check(P + '5. subtítulo "los mejor puntuados en guarda", sin lo del desempate',
      v.titulos2.some(t => t.startsWith('El podio') && t.endsWith('los mejor puntuados en guarda') && !/desempate|valoraci/i.test(t)), v.titulos2.join(' | '));
    const colDe = p => v.podio.find(c => c.puesto === p);
    if (pod.length >= 3) {
      check(P + '5. podio: columnas en orden 2 · 1 · 3', same([...v.podio].sort((a, b) => a.left - b.left).map(c => c.puesto), [2, 1, 3]),
        v.podio.map(c => c.puesto + '@' + Math.round(c.left)).join(' '));
      check(P + '5. podio: cada columna con vino, añada y puntaje de la API; sin bodega ni "valoraciones"',
        [1, 2, 3].every(p => {
          const c = colDe(p), e = pod[p - 1];
          return c && c.vino === e.vino && c.bod === String(e.anada ?? 'N/V') && c.grande === nf(e.vivino, 1) && c.meta.length === 0
            && !/valoraci/i.test(c.todo);
        }), JSON.stringify(v.podio.map(c => [c.puesto, c.vino, c.bod, c.grande, c.meta])));
      check(P + '5. podio: de arriba abajo vino → añada → puntaje (dorado serif) → escalón',
        v.podio.every(c => c.orden[0] < c.orden[1] && c.orden[1] < c.orden[2] && c.orden[2] < c.escTop && c.grandeColor === DORADO),
        v.podio.map(c => c.orden.map(Math.round).join('<')).join(' | '));
      check(P + '5. podio: el 1.º está en el medio con el escalón más alto (84 / 62 / 46 px)',
        colDe(1).escH === 84 && colDe(2).escH === 62 && colDe(3).escH === 46 && colDe(1).left > colDe(2).left && colDe(1).left < colDe(3).left,
        v.podio.map(c => `${c.puesto}:${c.escH}`).join(' '));
      check(P + '5. podio: degradé suave desde el color de cada escalón (#5E4512, #8C6A22, #B8994E)',
        [1, 2, 3].every(p => colDe(p).escImg.includes('linear-gradient') && colDe(p).escImg.replace(/\s/g, '').includes(hexRgb(COLORES_PODIO[p - 1]).replace(/\s/g, ''))),
        v.podio.map(c => c.escImg.slice(0, 60)).join(' | '));
      check(P + '5. podio: 3 medallas (oro en la columna del medio, plata y bronce), sin número en el escalón',
        v.podio.length === 3 && [1, 2, 3].every(p => colDe(p).medalla?.n === p && colDe(p).medalla.relleno === MEDALLAS[p - 1] && colDe(p).medalla.disco === MEDALLAS[p - 1] && colDe(p).esc === '')
        && await page.locator('.pd-medalla').count() === 3,
        JSON.stringify(v.podio.map(c => [c.puesto, c.medalla?.n, c.medalla?.relleno, c.esc])));
      check(P + '5. podio: medalla de unos 22 px de ancho, arriba y al centro del escalón',
        [1, 2, 3].every(p => { const m = colDe(p).medalla; return m && m.dentro && m.w >= 20 && m.w <= 24 && Math.abs(m.dx) <= 2 && m.dy >= -1 && m.dy <= 12; }),
        JSON.stringify(v.podio.map(c => c.medalla && [Math.round(c.medalla.w), Math.round(c.medalla.dx), Math.round(c.medalla.dy)])));
      check(P + '5. podio: los escalones arrancan parejos y los textos apoyan sobre su escalón',
        v.podio.every(c => Math.abs(c.escBottom - v.podio[0].escBottom) <= 1 && Math.abs(c.txtBottom - c.escTop) <= 1),
        v.podio.map(c => `${c.puesto}: base ${Math.round(c.escBottom)}, texto ${Math.round(c.txtBottom)}/${Math.round(c.escTop)}`).join(' | '));
    } else {
      check(P + '5. con 1 o 2 vinos no hay podio, sólo filas', !v.hayPodio);
    }
    const resto = pod.slice(pod.length >= 3 ? 3 : 0);
    check(P + '5. puestos 4 y 5 en filas: número del puesto · vino con la añada al lado · puntaje a la derecha',
      same(v.filasPodio.map(r => [r.pues, r.vino, r.an, r.sub, r.der]),
        resto.map((e, k) => [String((pod.length >= 3 ? 4 : 1) + k), e.vino, String(e.anada ?? 'N/V'), '', nf(e.vivino, 1)])),
      JSON.stringify(v.filasPodio.map(r => [r.pues, r.vino, r.an, r.sub, r.der])));
    check(P + '5. las filas están debajo del podio y el número de puesto va en dorado',
      v.filasPodio.every(r => (v.podioBottom == null || r.top >= v.podioBottom - 1) && r.puntajeColor === DORADO));
    check(P + '5. el máximo y "Ver los {k} con {máx}" respetan la regla de más de 5 empatados',
      Q.empateMax.length > 5 ? v.verMax.includes(`Ver los ${nf(Q.empateMax.length)} con ${nf(Q.mejor.vivino, 1)}`) && Q.empateMax.every(e => e.vivino === Q.mejor.vivino)
        : v.verMax.length === 0 && Q.empateMax.length === 0,
      JSON.stringify(v.verMax) + ' / empate ' + Q.empateMax.length);
    aviso(P + 'ref. podio', same(pod.map(e => `${e.vino} ${e.anada}`), REF.podio) && same(pod.map(e => e.valoraciones), REF.valoraciones),
      pod.map(e => `${e.vino} ${e.anada} (${nf(e.valoraciones)})`).join(' | '));
    if (Q.empateMax.length > 5) {
      const link = page.locator('.cal-sec .tpanel .ic-ver', { hasText: 'Ver los' }).last();
      await link.click();
      await page.waitForSelector('.det-panel[data-det="max"] .det-et', { timeout: 5000 });
      await page.waitForTimeout(300);
      const pm = await page.evaluate(LEER_PANEL);
      check(P + '5. "Ver los {k} con {máx}" abre la lista de los empatados',
        pm.filas.length === Q.empateMax.length && pm.titulo === `Con ${nf(Q.mejor.vivino, 1)}`, `${pm.filas.length} filas, "${pm.titulo}"`);
      await page.locator('.det-x').click();
    }
    if (v.hayPodio) {
      await page.locator('.pd-txt').first().click();
      check(P + '5. tocar un vino del podio abre su ficha de botella', await page.locator('.pd .wdetail').count() === 1);
      await page.locator('.pd-txt').first().click();
    }

    // ── 7. nota al pie ──────────────────────────────────────────────
    check(P + '7. nota al pie "{n} botellas sin puntaje Vivino"',
      v.nota === (Q.sinPuntaje > 0 ? `${nf(Q.sinPuntaje)} ${plural(Q.sinPuntaje, 'botella', 'botellas')} sin puntaje Vivino` : ''), v.nota);

    // ── 6. renglones y superposiciones ──────────────────────────────
    const vf = await page.evaluate(LEER);
    check(P + '6. ningún rótulo, número, % ni "bodega · añada" ocupa más de una línea', vf.partidos.length === 0, vf.partidos.slice(0, 5).join(' | '));
    check(P + '6. "bodega · añada" no queda recortada', vf.recortados.length === 0, vf.recortados.slice(0, 5).join(' | '));
    check(P + '6. nada se pisa (rótulos del medidor, cajas, filas, podio)', vf.pisados.length === 0, vf.pisados.slice(0, 5).join(' | '));
    check(P + '6. sin scroll horizontal', vf.scroll.s <= vf.scroll.i, `${vf.scroll.s} > ${vf.scroll.i}`);

    // ── reglas generales ────────────────────────────────────────────
    const texto = await page.evaluate(() => document.body.innerText);
    const hall = PROHIBIDAS.filter(p => texto.toLowerCase().includes(p));
    check(P + 'sin palabras prohibidas', hall.length === 0, hall.join(', '));
    // 5.025 es un miles en es-AR, no un decimal con punto
    const conPunto = (texto.match(/\d+\.\d+/g) || []).filter(t => !/^\d{1,3}(\.\d{3})+$/.test(t));
    check(P + 'ningún decimal con punto', conPunto.length === 0, conPunto.join(', '));
    check(P + 'sin "tiempo entre compra y apertura"', !/tiempo (entre|hasta)|al abrir/i.test(await page.locator('.cal-sec').innerText()));
    const money = await page.evaluate(async re => {
      const r = new RegExp(re, 'i'); const d = await (await fetch('/api/cava')).json();
      const hits = []; (function w(o, p) {
        if (o === null || typeof o !== 'object') return;
        for (const k of Object.keys(o)) { if (r.test(k)) hits.push(p + '.' + k); w(o[k], p + '.' + k); }
      })(d.calidad, 'calidad'); return [...new Set(hits)];
    }, MONEY_KEY.source);
    check(P + 'el bloque calidad de la API no tiene campos de dinero', money.length === 0, money.join(', '));
    check(P + 'sin errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '));

    // ── 7. cava chica ───────────────────────────────────────────────
    if (apiParaFixture) {
      const chica = cavaChica(apiParaFixture);
      const C = JSON.parse(chica).calidad;
      const p2 = await ctx.newPage();
      await p2.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: chica }));
      const r3 = p2.waitForResponse(x => x.url().includes('/api/cava'), { timeout: 40000 });
      await p2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await r3;
      await p2.waitForSelector('.med-svg', { timeout: 25000 });
      await p2.waitForTimeout(400);
      const vc = await p2.evaluate(LEER);
      const NC = P + '7. cava chica: ';
      check(NC + 'el medidor se ve y no hay filas de tramos', !!vc.aguja && vc.filasTramo === 0);
      check(NC + 'la aguja apunta al promedio de la fixture (±2°)', Math.abs(vc.aguja.grados - gradosDe(C.promedio)) <= 2, `${vc.aguja.grados.toFixed(1)}° vs ${gradosDe(C.promedio).toFixed(1)}°`);
      const BC = barrasEsperadas(C.porDecima), hueco = BC.findIndex(b => b.botellas === 0);
      check(NC + 'barras por puntaje: una por décima, con la décima en 0 incluida',
        hueco >= 0 && vc.barras.length === BC.length && vc.barras.every((b, i) => b.n === nf(BC[i].botellas) && b.y === BC[i].label),
        JSON.stringify(vc.barras.map(b => [b.y, b.n])));
      check(NC + 'la décima en 0 no se puede tocar', hueco >= 0 && !vc.barras[hueco].boton);
      const bd = Math.round(C.iconos.botellas / 1), bl = Math.round((C.iconos.total - C.iconos.botellas) / 1);
      check(NC + 'íconos: X = 1, tantas botellas dibujadas como botellas, doradas primero y sin leyenda de escala',
        vc.hayIconos && C.iconos.botellas === 2 && vc.iconos.botellas.length === bd + bl && vc.iconos.botellas.filter(b => b.oro).length === bd
        && vc.iconos.botellas.slice(0, bd).every(b => b.oro) && vc.iconos.nota === '' && vc.iconos.filasVivino === 0,
        `${vc.iconos.botellas.length} botellas, ${vc.iconos.botellas.filter(b => b.oro).length} doradas, nota "${vc.iconos.nota}"`);
      check(NC + 'el podio desempata por botellas y luego alfabético (Alfa 3 · Beta 2 · Gamma 1, Delta antes que Epsilon)',
        same([...v2(vc)].map(x => x.vino), ['Beta Reserva', 'Alfa Reserva', 'Gamma Gran']) && same(vc.filasPodio.map(r => r.vino), ['Delta', 'Epsilon'])
        && same(C.podio.map(e => e.vino), ['Alfa Reserva', 'Beta Reserva', 'Gamma Gran', 'Delta', 'Epsilon']),
        JSON.stringify(vc.podio.map(c => c.vino)) + ' / ' + JSON.stringify(vc.filasPodio.map(r => r.vino)));
      check(NC + 'ningún "valoraciones" en el podio', !vc.podio.some(c => c.meta.length || /valoraci/.test(c.todo)) && !vc.filasPodio.some(r => /valoraci/.test(r.todo + r.sub)));
      check(NC + 'no quedan cajas ni paneles vacíos', vc.kpisVacios === 0 && vc.panelesVacios === 0, `${vc.kpisVacios} cajas, ${vc.panelesVacios} paneles`);
      check(NC + 'nota "3 botellas sin puntaje Vivino"', vc.nota === `${nf(C.sinPuntaje)} botellas sin puntaje Vivino`, vc.nota);
      check(NC + 'renglones y superposiciones bien', vc.partidos.length === 0 && vc.pisados.length === 0 && vc.scroll.s <= vc.scroll.i,
        [...vc.partidos, ...vc.pisados].slice(0, 3).join(' | '));
      await p2.close();
    }

    if (SHOTS && vp.w < 500) {
      // tres capturas en celular: medidor + cajas, barras con un puntaje abierto, íconos + podio
      mkdirSync(SHOTS, { recursive: true });
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.pb-chart');
      await page.waitForTimeout(500);
      const entre = async (a, b, file) => {
        const clip = await page.evaluate(([sa, sb]) => {
          const ra = document.querySelector(sa).getBoundingClientRect(), rb = document.querySelector(sb).getBoundingClientRect();
          return { x: 0, y: Math.max(0, ra.top + scrollY - 8), width: innerWidth, height: rb.bottom - ra.top + 16 };
        }, [a, b]);
        await page.screenshot({ path: join(SHOTS, file), fullPage: true, clip });
      };
      await entre('.med-card', '.cal-sec > .cepa-kpis', `${vp.file}-1-medidor-cajas.png`);
      const colsB = await page.evaluate(() => [...document.querySelectorAll('.pb-chart .an-col')].map(e => Number(e.dataset.n)));
      await page.locator('.pb-chart .an-col').nth(colsB.indexOf(Math.max(...colsB))).click();
      await page.waitForSelector('.pb-panel');
      await page.waitForTimeout(400);
      await page.locator('.cal-sec .tpanel:has(.pb-chart)').screenshot({ path: join(SHOTS, `${vp.file}-2-barras-abierta.png`) });
      await page.locator('.pb-panel .det-x').click();
      await entre('.cal-sec .tpanel:has(.ib)', '.cal-sec .tpanel:has(.pd)', `${vp.file}-3-iconos-podio.png`);
      console.log(`  (capturas en ${SHOTS})`);
    }

    await ctx.close();
    console.log('');
  }
} finally {
  await browser.close();
  if (server) server.kill();
}

// columnas del podio de izquierda a derecha (2.º · 1.º · 3.º)
function v2(vc) { return [...vc.podio].sort((a, b) => a.left - b.left); }

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
