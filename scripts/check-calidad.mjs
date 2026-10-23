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
  tramos: [['4,5 o más', 40, '11%'], ['4,3 a 4,4', 135, '36%'], ['4,0 a 4,2', 142, '38%'], ['Menos de 4,0', 58, '15%']],
  cajas: ['85%', '40', '4,6'], cajasN: 317, mejorVinos: 7,
  iconos: { n: 124, total: 383, pct: 32, prom: 4.36, resto: 4.11, de45: 38 },
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
const COLORES_TRAMO = ['#5E4512', '#8C6A22', '#B8994E', '#DCC795'];
const COLORES_PODIO = ['#5E4512', '#8C6A22', '#B8994E'];

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
const num = t => Number(String(t).replace(/\./g, '').replace(',', '.'));
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
  return {
    puntuadas: botPunt, sinPuntaje: total - botPunt, promedio: prom(punt),
    con40: tramos.slice(0, 3).reduce((s, t) => s + t.botellas, 0), con45: tramos[0].botellas, porDecima: [],
    tramos, mejor: { vivino: max, vinos: conMax.length },
    iconos: {
      botellas: ico.reduce((s, w) => s + w.botellas, 0), total, pct: Math.round(ico.reduce((s, w) => s + w.botellas, 0) / total * 100),
      puntuadasIconos: icoPunt.reduce((s, w) => s + w.botellas, 0), puntuadasResto: resto.reduce((s, w) => s + w.botellas, 0),
      promedioIconos: prom(icoPunt), promedioResto: prom(resto),
      de45: icoPunt.filter(w => v1(w.vivino) >= 4.5).reduce((s, w) => s + w.botellas, 0), lista: ico.map(fila),
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
  const SEL_LINEA = '.med-prom, .cepa-kpi b, .cepa-kpi span, .tr-rot, .tr-n, .tr-pct, .ic-big b, .ic-big span, .ic-cab span, '
    + '.ic-cmp-rot, .ic-cmp-n, .pd-grande, .pd-bod, .pd-meta span, .pd-pues, .pd-fsub, .pd-der, .det-et-bod, .det-et-n, .det-it, .ic-ver';
  const partidos = [...document.querySelectorAll(SEL_LINEA)].filter(e => txt(e) && lineas(e) > 1).map(e => `${e.className}:"${txt(e)}"`);
  // "bodega · añada" nunca recortado
  const recortados = [...document.querySelectorAll('.pd-bod, .pd-fsub, .det-et-bod')]
    .filter(e => e.scrollWidth > e.clientWidth + 0.5).map(e => `${e.className}:"${txt(e)}"`);
  const pisados = [];
  for (const sel of ['.med-rot', '.cepa-kpi b', '.tr-rot', '.tr-n', '.tr-pct', '.ic-cmp-rot', '.ic-cmp-n', '.pd-grande', '.pd-bod', '.pd-pues', '.pd-der', '.det-et-n', '.det-et-bod']) {
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
    tramos: [...document.querySelectorAll('.tr-fila')].map(e => ({
      t: e.dataset.tramo, rot: txt(e.querySelector('.tr-rot')), n: txt(e.querySelector('.tr-n')), pct: txt(e.querySelector('.tr-pct')),
      bg: e.querySelector('.tr-barra').style.backgroundColor, w: R(e.querySelector('.tr-barra')).width,
      cols: [...e.children].map(c => Math.round(R(c).left)), esBoton: e.tagName === 'BUTTON',
    })),
    hint: txt(document.querySelector('.med-hint')),
    cajas: [...document.querySelectorAll('.cal-sec > .cepa-kpis .cepa-kpi')].map(e => ({ n: txt(e.querySelector('b')), l: txt(e.querySelector('span')) })),
    hayIconos: !!document.querySelector('.ic-big'),
    iconos: {
      n: txt(document.querySelector('.ic-big b')), de: txt(document.querySelector('.ic-big span')),
      cab: [...document.querySelectorAll('.ic-cab span')].map(txt),
      segs: [...document.querySelectorAll('.ic-barra span')].map(s => ({ w: R(s).width, bg: getComputedStyle(s).backgroundColor })),
      barraW: document.querySelector('.ic-barra') ? R(document.querySelector('.ic-barra')).width : 0,
      cmp: [...document.querySelectorAll('.ic-cmp')].map(e => ({
        rot: txt(e.querySelector('.ic-cmp-rot')), n: txt(e.querySelector('.ic-cmp-n')),
        w: R(e.querySelector('.ic-cmp-pista span')).width, pista: R(e.querySelector('.ic-cmp-pista')).width,
        bg: getComputedStyle(e.querySelector('.ic-cmp-pista span')).backgroundColor,
      })),
      linea: txt(document.querySelector('.ic-linea')), ver: txt(document.querySelector('.ic-ver')),
    },
    podio: [...document.querySelectorAll('.pd-col')].map(c => {
      const esc = c.querySelector('.pd-escalon');
      const y = s => { const e = c.querySelector(s); return e ? R(e).top : null; };
      return {
        puesto: Number(c.dataset.puesto), left: R(c).left, vino: txt(c.querySelector('.pd-vino')), bod: txt(c.querySelector('.pd-bod')),
        grande: txt(c.querySelector('.pd-grande')), meta: [...c.querySelectorAll('.pd-meta span')].map(txt),
        esc: txt(esc), escH: Math.round(R(esc).height), escBg: getComputedStyle(esc).backgroundColor,
        escTop: R(esc).top, escBottom: R(esc).bottom, txtBottom: R(c.querySelector('.pd-txt')).bottom,
        orden: [y('.pd-vino'), y('.pd-bod'), y('.pd-grande')],
        grandeColor: getComputedStyle(c.querySelector('.pd-grande')).color,
      };
    }),
    podioBottom: document.querySelector('.pd-podio') ? R(document.querySelector('.pd-podio')).bottom : null,
    hayPodio: !!document.querySelector('.pd-podio'),
    filasPodio: [...document.querySelectorAll('.pd-item')].map(e => ({
      puesto: Number(e.dataset.puesto), pues: txt(e.querySelector('.pd-pues')), vino: txt(e.querySelector('.pd-vino')),
      sub: txt(e.querySelector('.pd-fsub')), der: txt(e.querySelector('.pd-der')), top: R(e).top,
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
    await page.waitForSelector('.tr-fila', { timeout: 10000 });

    const api = await page.evaluate(async () => await (await fetch('/api/cava')).json());
    const Q = api.calidad;
    const v = await page.evaluate(LEER);

    // ── 1. medidor ──────────────────────────────────────────────────
    check(P + '1. el promedio se muestra con 2 decimales y es el de la API',
      v.prom === nf(Q.promedio, 2) && /^\d,\d\d$/.test(v.prom) && v.promData === Q.promedio && Q.promedio === api.stats.vivinoPromedio,
      `${v.prom} vs API ${Q.promedio} (stats ${api.stats.vivinoPromedio})`);
    check(P + '1. título y subtítulo del medidor',
      v.titulos.some(t => t.startsWith('¿Qué tan buena es tu cava?') && t.includes(`Vivino promedio de ${nf(Q.puntuadas)} botellas puntuadas`)),
      v.titulos.join(' | '));
    const gradosDe = x => 180 * (1 - (Math.min(Math.max(x, 3.5), 5) - 3.5) / 1.5);
    check(P + '1. la aguja apunta al promedio (±2°)', !!v.aguja && Math.abs(v.aguja.grados - gradosDe(Q.promedio)) <= 2,
      `${v.aguja?.grados.toFixed(1)}° vs ${gradosDe(Q.promedio).toFixed(1)}°`);
    check(P + '1. la aguja es oscura (#2B2320)', v.aguja?.color === hexRgb('#2B2320'), String(v.aguja?.color));
    check(P + '1. rótulos 3,5 · 4,0 · 4,3 · 4,5 · 5,0, cada uno en su valor (±1°)',
      same(v.rotulos.map(r => r.t), ['3,5', '4,0', '4,3', '4,5', '5,0']) && v.rotulos.every(r => Math.abs(r.grados - gradosDe(r.v)) <= 1),
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

    // ── 2. tramos y cajas ───────────────────────────────────────────
    const tr = Q.tramos.filter(t => t.botellas > 0);
    if (Q.puntuadas >= 10) {
      check(P + '2. las filas de tramos coinciden con la API (rótulo, botellas, %); vacíos sin dibujar',
        same(v.tramos.map(r => [r.rot, r.n, r.pct]), tr.map(t => [t.tramo, nf(t.botellas), `${nf(Math.round(t.botellas / Q.puntuadas * 100))}%`])),
        JSON.stringify(v.tramos.map(r => [r.rot, r.n, r.pct])));
      const maxT = Math.max(...tr.map(t => t.botellas)), wMax = Math.max(...v.tramos.map(r => r.w));
      check(P + '2. ancho de barra proporcional al tramo más grande y color del tramo',
        v.tramos.every((r, i) => Math.abs(r.w / wMax - tr[i].botellas / maxT) < 0.02 && r.bg.replace(/\s/g, '') === hexRgb(tr[i].color).replace(/\s/g, '')),
        v.tramos.map(r => Math.round(r.w) + ' ' + r.bg).join(' | '));
      check(P + '2. los colores de los tramos son los de la especificación',
        tr.every(t => COLORES_TRAMO.includes(t.color)) && same(Q.tramos.map(t => t.color), COLORES_TRAMO), Q.tramos.map(t => t.color).join(' '));
      check(P + '2. columnas de ancho fijo (rótulo, barra, botellas y % alineados)', v.tramos.every(r => same(r.cols, v.tramos[0].cols)),
        JSON.stringify(v.tramos.map(r => r.cols)));
      check(P + '2. las filas se pueden tocar y el texto "Tocá un tramo para ver sus vinos" está', v.tramos.every(r => r.esBoton) && v.hint === 'Tocá un tramo para ver sus vinos', v.hint);
      const mejor = Q.mejor;
      check(P + '2. las tres cajas: % con 4,0 o más · con 4,5 o más · el mejor',
        same(v.cajas, [
          { n: `${nf(Math.round(Q.con40 / Q.puntuadas * 100))}%`, l: 'Con 4,0 o más' },
          { n: nf(Q.con45), l: 'Con 4,5 o más' },
          { n: nf(mejor.vivino, 1), l: `El mejor · ${nf(mejor.vinos)} ${plural(mejor.vinos, 'vino', 'vinos')}` },
        ]), JSON.stringify(v.cajas));
    } else {
      check(P + '2. con menos de 10 puntuadas no hay filas ni cajas', v.tramos.length === 0 && v.cajas.length === 0);
    }
    check(P + '2. los puntajes del podio llevan 1 decimal ("4,6", nunca "4,60")',
      [...v.podio.map(c => c.grande), ...v.filasPodio.map(r => r.der)].every(t => /^\d,\d$/.test(t)),
      [...v.podio.map(c => c.grande), ...v.filasPodio.map(r => r.der)].join(' '));
    check(P + '2. ninguna caja vacía ni panel vacío', v.kpisVacios === 0 && v.panelesVacios === 0, `${v.kpisVacios} cajas, ${v.panelesVacios} paneles`);
    for (const [rot, n, pct] of REF.tramos) {
      const r = v.tramos.find(x => x.rot === rot);
      aviso(P + `ref. tramo ${rot}: ${n} · ${pct}`, !!r && r.n === nf(n) && r.pct === pct, r ? `hoy ${r.n} · ${r.pct}` : 'no está');
    }
    aviso(P + `ref. ${REF.puntuadas} puntuadas · ${REF.sin} sin puntaje · promedio ${nf(REF.promedio, 2)}`,
      Q.puntuadas === REF.puntuadas && Q.sinPuntaje === REF.sin && Q.promedio === REF.promedio, `hoy ${Q.puntuadas} · ${Q.sinPuntaje} · ${Q.promedio}`);
    aviso(P + `ref. cajas ${REF.cajas.join(' · ')}, ${REF.mejorVinos} vinos, ${REF.cajasN} con 4,0 o más`,
      same(v.cajas.map(c => c.n), REF.cajas) && Q.mejor?.vinos === REF.mejorVinos && Q.con40 === REF.cajasN, JSON.stringify(v.cajas.map(c => c.n)));

    // ── 3. panel del tramo más grande ───────────────────────────────
    if (v.tramos.length) {
      const grande = tr.reduce((m, t) => (t.botellas > m.botellas ? t : m), tr[0]);
      const X = esperadoLista(grande.etiquetas, 'iconos');
      const N = `${P}panel ${grande.tramo}: `;
      await page.locator(`.tr-fila[data-tramo="${grande.tramo}"]`).click();
      await page.waitForSelector('.det-panel', { timeout: 8000 });
      await page.waitForTimeout(500);
      const p = await page.evaluate(LEER_PANEL);
      check(N + 'título = el tramo y subtítulo "{n} botellas · {pct}%"',
        p.titulo === grande.tramo && p.sub === `${nf(grande.botellas)} ${plural(grande.botellas, 'botella', 'botellas')} · ${nf(grande.pct)}%`, `"${p.titulo}" "${p.sub}"`);
      check(N + 'cuatro cajas: Botellas · Etiquetas · Cepas · Íconos, con los números de la API',
        same(p.cajas.map(c => c.l), X.etiquetasCajas) && same(p.cajas.map(c => c.n), X.cajas), JSON.stringify(p.cajas));
      check(N + 'la línea de cepas coincide con la API', same(p.lineas, X.linea ? [X.linea] : []), JSON.stringify(p.lineas) + ' vs ' + X.linea);
      check(N + 'el link dice "Ver las {n} etiquetas"', p.mas === `Ver las ${nf(X.ord.length)} etiquetas`, p.mas);
      await page.locator('.det-mas').click();
      const l = await page.evaluate(LEER_PANEL);
      check(N + 'la lista: vino, "bodega · añada", botellas; de más a menos botellas (empate, alfabético)',
        same(l.filas.map(f => [f.vino, f.bod, f.n]), X.filas), l.filas.slice(0, 3).map(f => `${f.vino} ${f.bod} ${f.n}`).join(' | '));
      check(N + 'las botellas de la lista suman las del tramo', l.filas.reduce((s, f) => s + num(f.n), 0) === grande.botellas,
        `${l.filas.reduce((s, f) => s + num(f.n), 0)} vs ${grande.botellas}`);
      check(N + 'el link pasa a "Ocultar etiquetas"', l.mas === 'Ocultar etiquetas', l.mas);
      const vl = await page.evaluate(LEER);
      check(N + 'rótulos, bodega y botellas en una sola línea; nada se pisa ni se recorta',
        vl.partidos.length === 0 && vl.pisados.length === 0 && vl.recortados.length === 0 && vl.scroll.s <= vl.scroll.i,
        [...vl.partidos, ...vl.pisados, ...vl.recortados].slice(0, 4).join(' | '));
      await page.locator('.det-et-fila').first().click();
      check(N + 'tocar una etiqueta abre la ficha de botella', await page.locator('.det-et .wdetail').count() === 1);
      await page.locator('.det-et-fila').first().click();
      await page.locator(`.tr-fila[data-tramo="${grande.tramo}"]`).click();
      check(N + 'tocar la misma fila cierra el panel', await page.locator('.det-panel').count() === 0);
      await page.locator(`.tr-fila[data-tramo="${grande.tramo}"]`).click();
      await page.waitForSelector('.det-panel');
      await page.locator('.det-x').click();
      check(N + 'la ✕ cierra el panel', await page.locator('.det-panel').count() === 0);
    }

    // ── 4. íconos ───────────────────────────────────────────────────
    const ic = Q.iconos;
    if (ic.botellas >= 1) {
      check(P + '4. íconos: número grande y "de {total} botellas · {pct}%"',
        v.iconos.n === nf(ic.botellas) && v.iconos.de === `de ${nf(ic.total)} botellas · ${nf(ic.pct)}%`, `${v.iconos.n} ${v.iconos.de}`);
      check(P + '4. íconos: barra partida "★ Íconos" / "El resto" con su proporción',
        same(v.iconos.cab, ['★ Íconos', 'El resto']) && Math.abs(v.iconos.segs[0].w / v.iconos.barraW - ic.botellas / ic.total) < 0.01
        && v.iconos.segs[0].bg === DORADO && v.iconos.segs[1].bg === hexRgb('#DCD0B4'),
        `${(v.iconos.segs[0].w / v.iconos.barraW * 100).toFixed(1)}% ${v.iconos.segs[0].bg}`);
      const compara = ic.puntuadasIconos >= 5 && ic.puntuadasResto >= 5;
      if (compara) {
        const top = Math.max(ic.promedioIconos, ic.promedioResto);
        check(P + '4. íconos: filas de comparación con el Vivino promedio (2 decimales) y barra ∝ valor − 3,5',
          same(v.iconos.cmp.map(c => [c.rot, c.n]), [['★ Íconos', nf(ic.promedioIconos, 2)], ['El resto', nf(ic.promedioResto, 2)]])
          && v.iconos.cmp.every((c, i) => Math.abs(c.w / c.pista - ([ic.promedioIconos, ic.promedioResto][i] - 3.5) / (top - 3.5)) < 0.015),
          JSON.stringify(v.iconos.cmp.map(c => [c.rot, c.n, Math.round(c.w / c.pista * 100)])));
      } else {
        check(P + '4. íconos: sin 5 puntuadas de cada grupo no hay filas de comparación', v.iconos.cmp.length === 0);
      }
      if (Q.con45 >= 5) {
        check(P + '4. íconos: "{a} de las {b} botellas con 4,5 o más son íconos"',
          v.iconos.linea === `${nf(ic.de45)} de las ${nf(Q.con45)} botellas con 4,5 o más son íconos`, v.iconos.linea);
      } else check(P + '4. íconos: con menos de 5 botellas de 4,5 o más no hay línea', v.iconos.linea === '');
      check(P + '4. íconos: el link dice "Ver los {n} íconos"', v.iconos.ver === `Ver los ${nf(ic.botellas)} ${plural(ic.botellas, 'ícono', 'íconos')}`, v.iconos.ver);
      aviso(P + `ref. íconos ${REF.iconos.n} de ${REF.iconos.total} · ${REF.iconos.pct}% · ${nf(REF.iconos.prom, 2)} / ${nf(REF.iconos.resto, 2)} · ${REF.iconos.de45} de las ${Q.con45}`,
        ic.botellas === REF.iconos.n && ic.total === REF.iconos.total && ic.pct === REF.iconos.pct
        && ic.promedioIconos === REF.iconos.prom && ic.promedioResto === REF.iconos.resto && ic.de45 === REF.iconos.de45,
        `hoy ${ic.botellas} de ${ic.total} · ${ic.pct}% · ${ic.promedioIconos} / ${ic.promedioResto} · ${ic.de45}`);
      await page.locator('.ic-ver').first().click();
      await page.waitForSelector('.det-panel[data-det="iconos"]', { timeout: 8000 });
      await page.waitForTimeout(400);
      const pi = await page.evaluate(LEER_PANEL);
      const Xi = esperadoLista(ic.lista, 'bodegas');
      check(P + '4. "Ver los N íconos" abre el panel con la lista de íconos, que suma las botellas',
        pi.titulo === 'Íconos' && same(pi.filas.map(f => [f.vino, f.bod, f.n]), Xi.filas) && pi.filas.reduce((s, f) => s + num(f.n), 0) === ic.botellas
        && same(pi.cajas.map(c => c.n), Xi.cajas), `${pi.filas.length} filas vs ${Xi.ord.length}`);
      await page.locator('.det-x').click();
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
    const colDe = p => v.podio.find(c => c.puesto === p);
    const valTxt = e => (e.valoraciones > 0 ? `${nf(e.valoraciones)} ${plural(e.valoraciones, 'valoración', 'valoraciones')}` : null);
    if (pod.length >= 3) {
      check(P + '5. podio: columnas en orden 2 · 1 · 3', same([...v.podio].sort((a, b) => a.left - b.left).map(c => c.puesto), [2, 1, 3]),
        v.podio.map(c => c.puesto + '@' + Math.round(c.left)).join(' '));
      check(P + '5. podio: cada columna con vino, "bodega · añada", puntaje y valoraciones (sólo si hay) de la API',
        [1, 2, 3].every(p => {
          const c = colDe(p), e = pod[p - 1], val = valTxt(e);
          return c && c.vino === e.vino && c.bod === `${e.bodega} · ${e.anada}` && c.grande === nf(e.vivino, 1) && same(c.meta, val ? [val] : []);
        }), JSON.stringify(v.podio.map(c => [c.puesto, c.vino, c.bod, c.grande, c.meta])));
      check(P + '5. podio: de arriba abajo vino → bodega · añada → puntaje (dorado serif) → escalón',
        v.podio.every(c => c.orden[0] < c.orden[1] && c.orden[1] < c.orden[2] && c.orden[2] < c.escTop && c.grandeColor === DORADO),
        v.podio.map(c => c.orden.map(Math.round).join('<')).join(' | '));
      check(P + '5. podio: el 1.º está en el medio con el escalón más alto (84 / 62 / 46 px)',
        colDe(1).escH === 84 && colDe(2).escH === 62 && colDe(3).escH === 46 && colDe(1).left > colDe(2).left && colDe(1).left < colDe(3).left,
        v.podio.map(c => `${c.puesto}:${c.escH}`).join(' '));
      check(P + '5. podio: colores de los escalones (#5E4512, #8C6A22, #B8994E) y número del puesto',
        [1, 2, 3].every(p => colDe(p).escBg === hexRgb(COLORES_PODIO[p - 1]) && colDe(p).esc === String(p)), v.podio.map(c => c.escBg).join(' '));
      check(P + '5. podio: los escalones arrancan parejos y los textos apoyan sobre su escalón',
        v.podio.every(c => Math.abs(c.escBottom - v.podio[0].escBottom) <= 1 && Math.abs(c.txtBottom - c.escTop) <= 1),
        v.podio.map(c => `${c.puesto}: base ${Math.round(c.escBottom)}, texto ${Math.round(c.txtBottom)}/${Math.round(c.escTop)}`).join(' | '));
    } else {
      check(P + '5. con 1 o 2 vinos no hay podio, sólo filas', !v.hayPodio);
    }
    const resto = pod.slice(pod.length >= 3 ? 3 : 0);
    check(P + '5. puestos 4 y 5 en filas: puesto · vino con "bodega · añada · valoraciones" · puntaje',
      same(v.filasPodio.map(r => [r.pues, r.vino, r.sub, r.der]),
        resto.map((e, k) => { const val = valTxt(e), base = `${e.bodega} · ${e.anada}`; return [String((pod.length >= 3 ? 4 : 1) + k), e.vino, val ? `${base} · ${val}` : base, nf(e.vivino, 1)]; })),
      JSON.stringify(v.filasPodio.map(r => [r.pues, r.vino, r.sub, r.der])));
    check(P + '5. las filas están debajo del podio y el número de puesto va en dorado',
      v.filasPodio.every(r => (v.podioBottom == null || r.top >= v.podioBottom - 1) && r.puntajeColor === DORADO));
    check(P + '5. el máximo y "Ver los {k} con {máx}" respetan la regla de más de 5 empatados',
      Q.empateMax.length > 5 ? v.verMax.includes(`Ver los ${nf(Q.empateMax.length)} con ${nf(Q.mejor.vivino, 1)}`) && Q.empateMax.every(e => e.vivino === Q.mejor.vivino)
        : v.verMax.every(t => !t.startsWith('Ver los') || t.includes('íconos')) && Q.empateMax.length === 0,
      JSON.stringify(v.verMax) + ' / empate ' + Q.empateMax.length);
    aviso(P + 'ref. podio', same(pod.map(e => `${e.vino} ${e.anada}`), REF.podio) && same(pod.map(e => e.valoraciones), REF.valoraciones),
      pod.map(e => `${e.vino} ${e.anada} (${nf(e.valoraciones)})`).join(' | '));
    if (Q.empateMax.length > 5) {
      const link = page.locator('.cal-sec .tpanel .ic-ver', { hasText: 'Ver los' }).last();
      await link.click();
      await page.waitForSelector('.det-panel[data-det="max"]', { timeout: 8000 });
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
      check(NC + 'el medidor y las filas de tramos se ven', !!vc.aguja && vc.tramos.length === C.tramos.filter(t => t.botellas > 0).length, `${vc.tramos.length} filas`);
      check(NC + 'la aguja apunta al promedio de la fixture (±2°)', Math.abs(vc.aguja.grados - gradosDe(C.promedio)) <= 2, `${vc.aguja.grados.toFixed(1)}° vs ${gradosDe(C.promedio).toFixed(1)}°`);
      check(NC + 'sin filas de comparación de íconos (hay 2 íconos)', vc.hayIconos && vc.iconos.cmp.length === 0 && C.iconos.botellas === 2, `${vc.iconos.cmp.length} filas, ${C.iconos.botellas} íconos`);
      check(NC + 'el podio desempata por botellas y luego alfabético (Alfa 3 · Beta 2 · Gamma 1, Delta antes que Epsilon)',
        same([...v2(vc)].map(x => x.vino), ['Beta Reserva', 'Alfa Reserva', 'Gamma Gran']) && same(vc.filasPodio.map(r => r.vino), ['Delta', 'Epsilon'])
        && same(C.podio.map(e => e.vino), ['Alfa Reserva', 'Beta Reserva', 'Gamma Gran', 'Delta', 'Epsilon']),
        JSON.stringify(vc.podio.map(c => c.vino)) + ' / ' + JSON.stringify(vc.filasPodio.map(r => r.vino)));
      check(NC + 'no hay valoraciones: ningún "valoraciones" en el podio', !vc.podio.some(c => c.meta.length) && !vc.filasPodio.some(r => /valoraci/.test(r.sub)));
      check(NC + 'no quedan cajas ni paneles vacíos', vc.kpisVacios === 0 && vc.panelesVacios === 0, `${vc.kpisVacios} cajas, ${vc.panelesVacios} paneles`);
      check(NC + 'nota "3 botellas sin puntaje Vivino"', vc.nota === `${nf(C.sinPuntaje)} botellas sin puntaje Vivino`, vc.nota);
      check(NC + 'renglones y superposiciones bien', vc.partidos.length === 0 && vc.pisados.length === 0 && vc.scroll.s <= vc.scroll.i,
        [...vc.partidos, ...vc.pisados].slice(0, 3).join(' | '));
      await p2.close();
    }

    if (SHOTS && vp.w < 500) {
      // tres capturas en celular: medidor + cajas, íconos + podio, panel de un tramo abierto
      mkdirSync(SHOTS, { recursive: true });
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.tr-fila');
      await page.waitForTimeout(500);
      await page.locator('.cal-sec').screenshot({ path: join(SHOTS, `${vp.file}-calidad-completa.png`) });
      await page.locator('.cal-sec .tpanel').first().screenshot({ path: join(SHOTS, `${vp.file}-medidor.png`) });
      await page.locator('.tr-fila').nth(1).click();
      await page.waitForSelector('.det-panel');
      await page.locator('.det-mas').click();
      await page.waitForTimeout(600);
      await page.locator('.cal-sec .tpanel').first().screenshot({ path: join(SHOTS, `${vp.file}-tramo-abierto.png`) });
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
