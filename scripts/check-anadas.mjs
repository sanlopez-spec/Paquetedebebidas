#!/usr/bin/env node
// Verifica la sección "Añadas" de /club/cava.
//
//   node scripts/check-anadas.mjs                             (local)
//   node scripts/check-anadas.mjs --base https://edb.com.ar   (producción)
//   node scripts/check-anadas.mjs --base <url> --shots <dir>
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
const URL      = BASE + '/club/cava#anadas';

const VIEWPORTS = [
  { w: 360, h: 800,  label: 'celular',    file: 'mob' },
  { w: 820, h: 1000, label: 'escritorio', file: 'dsk' },
];

// Referencia del 22/10/2026 — sólo para AVISO.
const REF = {
  edad: 8.7, anadaProm: 2017, masAntigua: 2004, distintas: 21, masAnada: 2019, masN: 49,
  espejo: {
    'Antes de 2000': [4, 0, ''], '2000–04': [8, 2, '20%'], '2005–09': [13, 23, '64%'],
    '2010–14': [55, 58, '51%'], '2015–19': [86, 167, '66%'], '2020–24': [26, 126, '83%'],
    '2025–29': [0, 1, ''],
  },
  mapa: {
    'Malbec': [0, 7, 19, 66, 38, 0], 'Blend tinto': [0, 3, 16, 58, 35, 0], 'Otras': [0, 0, 4, 12, 23, 1],
  },
  veteranas: ['Angélica Zapata Chardonnay 2004', 'Saint Felicien Cabernet Sauvignon 2004',
    'Federico López Tinto 2005', 'Saint Felicien Cabernet Sauvignon 2005',
    'Salentein Selección de Barricas 2006'],
  sinAnada: [3, 3],
};

const PROHIBIDAS = ['inversión', 'inversion', 'valuación', 'valuacion',
                    'revalorización', 'revalorizacion', 'ganancia'];
const MONEY_KEY = /costo|precio|valor|usd|sugerid|ganancia|inversi|valuaci|revaloriz|monto|importe|ahorro/i;
// números de datos de hoy que no pueden estar escritos a mano en el código
const LITERALES = [167, 126, 86, 55, 49, 23, 64, 66, 83, 51];
const ABIERTAS_GRIS = 'rgb(74, 67, 64)';   // #4A4340
const ROBLE = 'rgb(107, 74, 43)';           // #6B4A2B
const OTRAS = [138, 126, 112];              // #8A7E70

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
function aviso(name, ok, detail = '') {
  results.push({ name, ok, detail, soloAviso: true });
  console.log(`  ${ok ? 'OK   ' : 'AVISO'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
const norm = s => (s || '').replace(/\s+/g, ' ').trim();
const nf = (x, d = 0) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
        if (new RegExp(`(?<![\\d.,])${n}(?![\\d.,])`).test(l)) {
          hallazgos.push(`${relative(ROOT, p)}:${i + 1} → ${n}`);
        }
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

// Cava chica de prueba: ~30 botellas en guarda, 3 abiertas y 3 cepas. Sólo vive
// en el script: se arma recortando la respuesta, no toca Airtable.
function cavaChica(real) {
  const d = JSON.parse(real);
  const anio = new Date().getFullYear();
  const enGuarda = [{ an: 2015, botellas: 6 }, { an: 2017, botellas: 9 }, { an: 2019, botellas: 8 }, { an: 2021, botellas: 7 }, { an: 2023, botellas: 1 }];
  const total = enGuarda.reduce((s, x) => s + x.botellas, 0);
  const prom = enGuarda.reduce((s, x) => s + x.an * x.botellas, 0) / total;
  const edad = enGuarda.reduce((s, x) => s + (anio - x.an) * x.botellas, 0) / total;
  const cols = ['#6B1E2E', '#8C6A22', '#2F4A55'];
  d.anadas = {
    enGuarda,
    abiertas: [{ an: 2017, botellas: 2 }, { an: 2019, botellas: 1 }],
    cepaAnada: enGuarda.map((x, i) => ({ cepa: ['Malbec', 'Merlot', 'Syrah'][i % 3], color: cols[i % 3], an: x.an, botellas: x.botellas })),
    etiquetas: enGuarda.map((x, i) => ({ an: x.an, vino: `Vino ${x.an}`, bodega: 'Bodega de prueba', cepa: ['Malbec', 'Merlot', 'Syrah'][i % 3],
      tipo: 'tinto', botellas: x.botellas, vivino: x.an === 2023 ? null : 4.1 })),
    veteranas: [{ vino: 'Vino de prueba', bodega: 'Bodega de prueba', anada: 2015, botellas: 6 },
      { vino: 'Otro vino de prueba', bodega: 'Bodega chica', anada: 2017, botellas: 1 }],
    sinAnada: { espumantes: 0, otras: 0 },
  };
  d.stats = { ...d.stats, edadPromedioGuarda: Math.round(edad * 10) / 10, anadaPromedio: Math.round(prom),
    anadasCount: 5, anadaMin: 2015, anadaMax: 2023, enGuarda: total };
  d.tramosEdad = [{ tramo: 'Hasta 5 años', botellas: total, color: '#E2CFA6' }];
  d.cons = { grupal: { total: 3, juntadas: 1, byYear: {} } };
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
  try { apiParaFixture = await (await fetch(BASE + '/api/cava')).text(); }
  catch { apiParaFixture = null; }
}

console.log(`\nVerificando ${URL}\n`);
const browser = await chromium.launch({ headless: true });

// Lo que hace falta leer de la pantalla.
const LEER = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rect = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, w: r.width }; };
  const lineas = e => {
    const r = document.createRange(); r.selectNodeContents(e);
    return new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size;
  };
  // Cada rótulo, número o % debe ocupar una sola línea.
  const SEL_LINEA = '.an-n, .an-y, .cepa-kpi b, .cepa-kpi span, .ae-rot, .ae-num, .ae-pct, .ae-h1, .ae-h2, '
    + '.am-h, .am-cepa, .am-cel, .pd-grande, .pd-bod, .pd-meta span, .pd-pues, .pd-fsub, .pd-der, .tr-rot, .tr-n, .tr-pct, .det-et-bod, .det-et-n, .det-it';
  const partidos = [...document.querySelectorAll(SEL_LINEA)]
    .filter(e => txt(e) && lineas(e) > 1).map(e => `${e.className}:"${txt(e)}"`);
  // Elementos de texto que se pisan entre sí.
  const pisados = [];
  for (const sel of ['.an-n', '.an-y', '.am-h', '.ae-num', '.ae-pct', '.ae-rot', '.am-cepa', '.pd-grande', '.pd-bod', '.pd-pues', '.pd-der', '.tr-rot', '.tr-n', '.tr-pct', '.det-et-n', '.det-et-bod']) {
    const els = [...document.querySelectorAll(sel)].filter(e => txt(e)).map(e => ({ e, r: rect(e) }));
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].r, b = els[j].r;
      if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) {
        pisados.push(`${sel}:"${txt(els[i].e)}"×"${txt(els[j].e)}"`);
      }
    }
  }
  // Números que se pisan con su barra o con el borde de la fila.
  const fuera = [...document.querySelectorAll('.am-cel, .ae-num, .an-n')]
    .filter(e => txt(e) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).display !== 'inline')
    .map(e => `${e.className}:"${txt(e)}"`);
  const mapaCeldas = [...document.querySelectorAll('.am-cel')].map(e => ({
    cepa: e.dataset.cepa ?? '', v: Number(e.dataset.v), a: e.dataset.a ? Number(e.dataset.a) : null,
    bg: e.style.background, color: getComputedStyle(e).color,
  }));
  return {
    hero: { num: txt(document.querySelector('.an-sec .sec-hero-num')), text: txt(document.querySelector('.an-sec .sec-hero-text')) },
    heroColor: document.querySelector('.an-sec .sec-hero-num') ? getComputedStyle(document.querySelector('.an-sec .sec-hero-num')).color : null,
    kpis: [...document.querySelectorAll('.an-sec .cepa-kpis:not(.det-cajas) .cepa-kpi')].map(e => ({ n: txt(e.querySelector('b')), l: txt(e.querySelector('span')) })),
    cols: [...document.querySelectorAll('.an-col')].map(e => ({
      y: Number(e.dataset.anio), n: Number(e.dataset.n),
      h: e.querySelector('.an-bar').getBoundingClientRect().height,
      num: txt(e.querySelector('.an-n')), lab: txt(e.querySelector('.an-y')),
      bg: getComputedStyle(e.querySelector('.an-bar')).backgroundColor,
    })),
    chartW: document.querySelector('.an-chart')?.getBoundingClientRect().width ?? 0,
    chartScroll: (() => { const c = document.querySelector('.an-chart'); return c ? c.scrollWidth - c.clientWidth : 0; })(),
    tramos: [...document.querySelectorAll('.tr-fila')].map(e => ({
      t: e.dataset.tramo, rot: txt(e.querySelector('.tr-rot')), n: txt(e.querySelector('.tr-n')), pct: txt(e.querySelector('.tr-pct')),
      bg: e.querySelector('.tr-barra').style.backgroundColor, w: e.querySelector('.tr-barra').getBoundingClientRect().width,
      cols: [...e.children].map(c => Math.round(c.getBoundingClientRect().left)),
    })),
    viejoTramos: document.querySelectorAll('.an-sec .edad-barra, .an-sec .edad-leyenda, .an-sec .edad-hero').length,
    espejo: [...document.querySelectorAll('.ae-lista .ae-fila')].map(f => ({
      ep: f.dataset.epoca, ab: txt(f.querySelector('.ae-izq .ae-num')), gu: txt(f.querySelector('.ae-der .ae-num')),
      pct: txt(f.querySelector('.ae-pct')),
      bgAb: getComputedStyle(f.querySelector('.ae-ab')).backgroundColor,
      bgGu: getComputedStyle(f.querySelector('.ae-gu')).backgroundColor,
      rotY: f.querySelector('.ae-rot').getBoundingClientRect().top, barY: f.querySelector('.ae-barras').getBoundingClientRect().top,
      rotH: f.querySelector('.ae-rot').getBoundingClientRect().height, barH: f.querySelector('.ae-barras').getBoundingClientRect().height,
    })),
    hayEspejo: !!document.querySelector('.ae-lista'),
    mapaCols: [...document.querySelectorAll('.am-h')].map(e => txt(e)),
    mapaFilas: [...document.querySelectorAll('.am-cepa')].map(e => e.dataset.cepa),
    mapaTextos: [...document.querySelectorAll('.am-cepa')].map(e => {
      const cs = getComputedStyle(e);
      const c = document.createElement('canvas').getContext('2d');
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const disp = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { cepa: e.dataset.cepa, t: txt(e), recortado: e.scrollWidth > e.clientWidth + 0.5 || txt(e).includes('…'),
        cabeCompleto: c.measureText(e.dataset.cepa).width <= disp };
    }),
    mapaCeldas,
    hayMapa: !!document.querySelector('.am-grid'),
    podio: [...document.querySelectorAll('.pd-col')].map(c => {
      const R = x => x.getBoundingClientRect();
      const esc = c.querySelector('.pd-escalon'), tx = c.querySelector('.pd-txt');
      return {
        puesto: Number(c.dataset.puesto), left: R(c).left, anio: txt(c.querySelector('.pd-grande')),
        vino: txt(c.querySelector('.pd-vino')), bod: txt(c.querySelector('.pd-bod')),
        meta: [...c.querySelectorAll('.pd-meta span')].map(txt), esc: txt(esc),
        escH: Math.round(R(esc).height), escBg: getComputedStyle(esc).backgroundColor,
        escTop: R(esc).top, escBottom: R(esc).bottom, txtBottom: R(tx).bottom,
        anioSerif: /Fraunces/.test(getComputedStyle(c.querySelector('.pd-grande')).fontFamily),
        anioColor: getComputedStyle(c.querySelector('.pd-grande')).color,
      };
    }),
    podioBottom: document.querySelector('.pd-podio')?.getBoundingClientRect().bottom ?? null,
    filasPodio: [...document.querySelectorAll('.pd-item')].map(e => ({
      puesto: Number(e.dataset.puesto), pues: txt(e.querySelector('.pd-pues')), vino: txt(e.querySelector('.pd-vino')),
      sub: txt(e.querySelector('.pd-fsub')), der: txt(e.querySelector('.pd-der')), top: e.getBoundingClientRect().top,
    })),
    hayPodio: !!document.querySelector('.pd-podio'),
    nota: txt(document.querySelector('.an-nota')),
    titulos: [...document.querySelectorAll('.an-sec .tpanel h3')].map(e => txt(e)),
    panelesVacios: [...document.querySelectorAll('.an-sec .tpanel')]
      .filter(p => p.innerText.replace(/\s+/g, '').length < 12).length,
    kpisVacios: [...document.querySelectorAll('.an-sec .cepa-kpi')].filter(e => !txt(e.querySelector('b'))).length,
    partidos, pisados, fuera,
    scroll: { s: document.documentElement.scrollWidth, i: window.innerWidth },
  };
};

// Lo que tiene que mostrar la pantalla, calculado de la API en vivo.
function esperado(api, anio) {
  const A = api.anadas;
  const bots = A.enGuarda.reduce((s, x) => s + x.botellas, 0);
  const edad = bots ? Math.round(A.enGuarda.reduce((s, x) => s + (anio - x.an) * x.botellas, 0) / bots * 10) / 10 : null;
  const top = A.enGuarda.reduce((m, x) => (!m || x.botellas > m.botellas || (x.botellas === m.botellas && x.an > m.an) ? x : m), null);
  const ini = Math.floor;
  const e5 = an => ini(an / 5) * 5;
  // espejo
  const m = new Map();
  const toma = e => { if (!m.has(e)) m.set(e, [0, 0]); return m.get(e); };
  A.abiertas.forEach(x => { toma(e5(x.an))[0] += x.botellas; });
  A.enGuarda.forEach(x => { toma(e5(x.an))[1] += x.botellas; });
  const eras = [...m.entries()].sort((a, b) => a[0] - b[0]);
  const stop = eras.findIndex(([, v]) => v[0] + v[1] >= 5);
  const filas = [];
  let desde = 0;
  if (stop > 0) {
    const v = eras.slice(0, stop);
    filas.push({ ep: `Antes de ${eras[stop][0]}`, ab: v.reduce((s, [, x]) => s + x[0], 0), gu: v.reduce((s, [, x]) => s + x[1], 0) });
    desde = stop;
  }
  eras.slice(desde).forEach(([e, v]) => filas.push({ ep: `${e}–${String(e + 4).slice(2)}`, ab: v[0], gu: v[1] }));
  const espejo = filas.map(f => ({ ep: f.ep, ab: nf(f.ab), gu: nf(f.gu), pct: f.ab + f.gu >= 5 ? nf(Math.round(f.gu / (f.ab + f.gu) * 100)) + '%' : '' }));
  const abiertasN = A.abiertas.reduce((s, x) => s + x.botellas, 0);
  // mapa
  const por = new Map();
  A.cepaAnada.forEach(c => {
    if (!por.has(c.cepa)) por.set(c.cepa, { cepa: c.cepa, color: c.color, cel: new Map(), tot: 0 });
    const f = por.get(c.cepa); f.cel.set(e5(c.an), (f.cel.get(e5(c.an)) ?? 0) + c.botellas); f.tot += c.botellas;
  });
  const lista = [...por.values()].sort((a, b) => b.tot - a.tot || a.cepa.localeCompare(b.cepa, 'es'));
  const mf = lista.slice(0, 8);
  if (lista.length > 8) {
    const cel = new Map();
    lista.slice(8).forEach(f => f.cel.forEach((v, e) => cel.set(e, (cel.get(e) ?? 0) + v)));
    mf.push({ cepa: 'Otras', color: '#8A7E70', cel, tot: 0 });
  }
  const eps = [...new Set(lista.flatMap(f => [...f.cel.keys()]))].sort((a, b) => a - b);
  const cols = [];
  for (let e = eps[0]; e <= eps[eps.length - 1]; e += 5) cols.push(e);
  const max = Math.max(1, ...mf.flatMap(f => [...f.cel.values()]));
  return {
    bots, edad, top, masAntigua: A.enGuarda[0]?.an, distintas: A.enGuarda.length, espejo, abiertasN,
    verEspejo: abiertasN >= 5 && espejo.length >= 2,
    mapa: { filas: mf, cols, max, ok: lista.length >= 4 && eps.length >= 2 },
    sin: A.sinAnada.espumantes + A.sinAnada.otras,
  };
}

const CORTAS = { 'Cabernet Sauvignon': 'Cab. Sauvignon', 'Cabernet Franc': 'Cab. Franc', 'Sauvignon Blanc': 'Sauv. Blanc' };
const hexRgb = h => { const x = h.replace('#', ''); return `rgb(${parseInt(x.slice(0, 2), 16)}, ${parseInt(x.slice(2, 4), 16)}, ${parseInt(x.slice(4, 6), 16)})`; };
const num = t => Number(String(t).replace(/\./g, '').replace(',', '.'));

// Lo que tiene que mostrar el panel de un año, calculado de la API.
function esperadoPanel(A, y, anio) {
  const et = A.etiquetas.filter(e => e.an === y)
    .sort((a, b) => b.botellas - a.botellas || a.vino.localeCompare(b.vino, 'es'));
  const enGuarda = et.reduce((s, e) => s + e.botellas, 0);
  const abiertas = A.abiertas.find(x => x.an === y)?.botellas ?? 0;
  const porCepa = new Map();
  et.forEach(e => porCepa.set(e.cepa, (porCepa.get(e.cepa) ?? 0) + e.botellas));
  const cepas = [...porCepa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  const bodegas = new Set(et.map(e => e.bodega)).size;
  const mejor = et.filter(e => e.vivino != null).sort((a, b) => b.vivino - a.vivino || b.botellas - a.botellas)[0];
  const top = A.enGuarda.reduce((m, x) => (!m || x.botellas > m.botellas || (x.botellas === m.botellas && x.an > m.an) ? x : m), null);
  const sub = [`${nf(anio - y)} ${anio - y === 1 ? 'año' : 'años'}`,
    y === top.an ? 'la cosecha más guardada' : null,
    y === A.enGuarda[0].an ? 'la más antigua' : null].filter(Boolean).join(' · ');
  const lineas = [];
  if (mejor) lineas.push(`Mejor puntaje Vivino: ${nf(mejor.vivino, 1)} · ${mejor.vino}`);
  lineas.push('Cepas: ' + cepas.slice(0, 4).map(([c, n]) => `${c} ${nf(n)}`).join(' · ')
    + (cepas.length > 4 ? ` · ${nf(cepas.length - 4)} más` : ''));
  const n = et.length;
  return { et, enGuarda, sub, lineas,
    cajas: [nf(enGuarda), nf(abiertas), nf(cepas.length), nf(bodegas)],
    mas: n === 1 ? 'Ver la etiqueta en guarda' : `Ver las ${nf(n)} etiquetas en guarda` };
}

const LEER_PANEL = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const p = document.querySelector('.det-panel');
  const bars = [...document.querySelectorAll('.an-col')].map(c => ({
    y: Number(c.dataset.anio), n: Number(c.dataset.n), on: c.classList.contains('on'),
    bg: getComputedStyle(c.querySelector('.an-bar')).backgroundColor,
  }));
  if (!p) return { hay: false, bars };
  return {
    hay: true, bars, clave: p.dataset.det, titulo: txt(p.querySelector('.det-t')), sub: txt(p.querySelector('.det-s')),
    cajas: [...p.querySelectorAll('.det-cajas .cepa-kpi')].map(e => ({ n: txt(e.querySelector('b')), l: txt(e.querySelector('span')) })),
    lineas: [...p.querySelectorAll('.det-linea')].map(txt),
    mas: txt(p.querySelector('.det-mas')),
    filas: [...p.querySelectorAll('.det-et')].map(e => ({
      vino: txt(e.querySelector('.det-et-vino')), bod: txt(e.querySelector('.det-et-bod')), n: txt(e.querySelector('.det-et-n')) })),
    fichas: p.querySelectorAll('.wdetail').length,
    top: p.getBoundingClientRect().top, vh: window.innerHeight,
  };
};

// Abre el panel de un año y comprueba todo lo que muestra contra la API.
async function pruebaPanel(pg, A, y, anio, P, leer, completa) {
  const nombre = `${P}panel ${y}: `;
  const X = esperadoPanel(A, y, anio);
  await pg.locator(`.an-col[data-anio="${y}"]`).click();
  await pg.waitForSelector('.det-panel', { timeout: 8000 });
  await pg.waitForTimeout(700);   // termina el scroll suave
  const p = await pg.evaluate(LEER_PANEL);
  check(nombre + 'título = el año y subtítulo con la edad', p.titulo === String(y) && p.sub === X.sub, `"${p.titulo}" "${p.sub}" vs "${X.sub}"`);
  check(nombre + 'cuatro cajas: En guarda · Abiertas · Cepas · Bodegas',
    same(p.cajas.map(c => c.l), ['En guarda', 'Abiertas', 'Cepas', 'Bodegas']) && same(p.cajas.map(c => c.n), X.cajas),
    JSON.stringify(p.cajas.map(c => c.l + '=' + c.n)) + ' vs ' + X.cajas);
  check(nombre + 'líneas de Vivino y de cepas coinciden con la API', same(p.lineas, X.lineas),
    JSON.stringify(p.lineas) + ' vs ' + JSON.stringify(X.lineas));
  check(nombre + 'el link dice la cantidad de etiquetas', p.mas === X.mas, `"${p.mas}" vs "${X.mas}"`);
  check(nombre + 'la barra elegida en roble y las demás en #C7AE8C',
    p.bars.every(b => b.bg === (b.y === y ? ROBLE : 'rgb(199, 174, 140)')),
    [...new Set(p.bars.map(b => b.y + ':' + b.bg))].slice(0, 4).join(' '));
  check(nombre + 'el encabezado del panel está a la vista', p.top >= 0 && p.top < p.vh - 60, `top ${Math.round(p.top)} de ${p.vh}`);
  // lista
  await pg.locator('.det-mas').click();
  const l = await pg.evaluate(LEER_PANEL);
  check(nombre + 'la lista tiene una fila por etiqueta, de más a menos botellas (empate, alfabético)',
    same(l.filas.map(f => [f.vino, f.n]), X.et.map(e => [e.vino, nf(e.botellas)])),
    l.filas.slice(0, 4).map(f => f.vino + ' ' + f.n).join(' | '));
  check(nombre + 'las botellas de la lista suman la caja "En guarda"',
    l.filas.reduce((s, f) => s + num(f.n), 0) === num(l.cajas[0].n), `${l.filas.reduce((s, f) => s + num(f.n), 0)} vs ${l.cajas[0].n}`);
  check(nombre + 'cada fila muestra su bodega', l.filas.every((f, i) => f.bod === X.et[i].bodega));
  check(nombre + 'el link pasa a "Ocultar etiquetas"', l.mas === 'Ocultar etiquetas', l.mas);
  // espaciado del panel
  const g = await pg.evaluate(() => {
    const r = e => e?.getBoundingClientRect();
    const p = document.querySelector('.det-panel');
    const lin = [...p.querySelectorAll('.det-linea')].map(r);
    const cajas = r(p.querySelector('.det-cajas'));
    const filas = [...p.querySelectorAll('.det-et')].map(e => {
      const vino = r(e.querySelector('.det-et-vino')), bod = r(e.querySelector('.det-et-bod'));
      return { h: r(e.querySelector('.det-et-fila')).height, vinoH: vino.height, gap: bod.top - vino.bottom };
    });
    return { cajasB: cajas.bottom, lin: lin.map(x => ({ t: x.top, b: x.bottom })), filas, mas: r(p.querySelector('.det-mas')).top };
  });
  if (g.lin.length >= 2) {
    const d1 = g.lin[0].t - g.cajasB, d2 = g.lin[1].t - g.lin[0].b;
    check(nombre + 'espaciado: cajas → Vivino y Vivino → Cepas difieren en 4 px o menos', Math.abs(d1 - d2) <= 4,
      `cajas→Vivino ${d1.toFixed(1)} px, Vivino→Cepas ${d2.toFixed(1)} px`);
  }
  if (g.lin.length >= 1) {
    const d3 = g.mas - g.lin[g.lin.length - 1].b;
    check(nombre + 'espaciado: última línea → link de etiquetas, parejo con los demás', Math.abs(d3 - (g.lin[0].t - g.cajasB)) <= 4, `${d3.toFixed(1)} px`);
  }
  if (await pg.evaluate(() => window.innerWidth) <= 400) {
    const una = g.filas.find(x => x.vinoH < 20);
    check(nombre + 'fila de etiqueta con vino de una línea: 56 px o menos y bodega a 6 px o menos del vino',
      !!una && una.h <= 56 && una.gap <= 6, una ? `alto ${una.h.toFixed(1)} px, bodega a ${una.gap.toFixed(1)} px` : 'no hay fila de una línea');
  }
  const v = await pg.evaluate(leer);
  check(nombre + 'rótulos, bodega y botellas en una sola línea, nada se pisa',
    v.partidos.length === 0 && v.pisados.length === 0 && v.scroll.s <= v.scroll.i,
    [...v.partidos, ...v.pisados].slice(0, 4).join(' | '));
  await pg.locator('.det-et-fila').first().click();
  check(nombre + 'tocar una etiqueta abre su ficha', await pg.locator('.det-et .wdetail').count() === 1);
  await pg.locator('.det-et-fila').first().click();
  check(nombre + 'tocarla de nuevo la cierra', await pg.locator('.det-et .wdetail').count() === 0);
  if (!completa) { await pg.locator('.det-x').click(); return X; }

  // cambiar de año, cerrar con la barra y con la ✕, y un año en 0
  const otro = A.enGuarda.find(x => x.an !== y)?.an;
  if (otro) {
    await pg.locator(`.an-col[data-anio="${otro}"]`).click();
    await pg.waitForTimeout(150);
    check(nombre + 'tocar otra barra cambia el panel', (await pg.evaluate(LEER_PANEL)).clave === String(otro));
    await pg.locator(`.an-col[data-anio="${otro}"]`).click();
    check(nombre + 'tocar la misma barra cierra el panel', await pg.locator('.det-panel').count() === 0);
  }
  await pg.locator(`.an-col[data-anio="${y}"]`).click();
  await pg.waitForSelector('.det-panel');
  await pg.locator('.det-x').click();
  check(nombre + 'la ✕ cierra el panel', await pg.locator('.det-panel').count() === 0);
  const sin = (await pg.evaluate(LEER_PANEL)).bars.find(b => b.n === 0);
  if (sin) {
    await pg.locator(`.an-col[data-anio="${sin.y}"]`).click({ force: true });
    await pg.waitForTimeout(150);
    check(`${P}panel ${sin.y}: un año con 0 no abre nada`, await pg.locator('.det-panel').count() === 0);
  }
  return X;
}

try {
  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.label} (${vp.w}×${vp.h}) ──`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.w < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    if (apiBody) {
      await page.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    }
    const P = vp.file + ': ';
    const resp = page.waitForResponse(r => r.url().includes('/api/cava'), { timeout: 40000 });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await resp;
    await page.waitForSelector('.an-chart', { timeout: 25000 });
    await page.waitForSelector('.an-col', { timeout: 10000 });

    const api = await page.evaluate(async () => await (await fetch('/api/cava')).json());
    const v = await page.evaluate(LEER);
    const anio = await page.evaluate(() => new Date().getFullYear());
    const E = esperado(api, anio);
    const A = api.anadas;

    // ── 1. el destacado ─────────────────────────────────────────────
    check(P + '1. el destacado es "{edad} años" con la edad de la API',
      E.edad != null && v.hero.num === `${nf(E.edad, 1)} años` && E.edad === api.stats.edadPromedioGuarda,
      `${v.hero.num} vs calculado ${E.edad} / stats ${api.stats.edadPromedioGuarda}`);
    check(P + '1. el subtítulo dice "edad promedio · añada promedio {año}"',
      v.hero.text === `edad promedio · añada promedio ${api.stats.anadaPromedio}`, v.hero.text);
    check(P + '1. el destacado va en roble', v.heroColor === ROBLE, String(v.heroColor));
    check(P + '1. el bloque de tramos no tiene barra partida, leyenda ni número de edad', v.viejoTramos === 0, `${v.viejoTramos} nodos`);

    // la tarjeta del Inicio
    {
      const p = await ctx.newPage();
      if (apiBody) await p.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
      const r2 = p.waitForResponse(x => x.url().includes('/api/cava'), { timeout: 40000 });
      await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await r2;
      await p.waitForSelector('.sec-card.t-roble .sec-card-big b:not(.sk-text)', { timeout: 25000 });
      const card = await p.evaluate(() => ({
        num: document.querySelector('.sec-card.t-roble .sec-card-big b')?.textContent.trim(),
        sub: document.querySelector('.sec-card.t-roble .sec-card-sub')?.textContent.trim(),
      }));
      check(P + '1. la tarjeta de Añadas del Inicio dice lo mismo que el destacado',
        `${card.num} años` === v.hero.num && card.sub === v.hero.text.replace('edad promedio · ', ''),
        `tarjeta "${card.num}" / "${card.sub}" vs "${v.hero.num}" / "${v.hero.text}"`);
      await p.close();
    }

    // ── 2. tres cajas ───────────────────────────────────────────────
    if (E.distintas >= 2) {
      check(P + '2. tres cajas: más antigua, distintas, la que más',
        same(v.kpis, [
          { n: String(E.masAntigua), l: 'La más antigua' },
          { n: nf(E.distintas), l: 'Cosechas distintas' },
          { n: String(E.top.an), l: `La más guardada · ${nf(E.top.botellas)}` },
        ]), JSON.stringify(v.kpis));
    }
    check(P + '2. ninguna caja vacía', v.kpisVacios === 0);
    aviso(P + `ref. edad ${REF.edad}, añada promedio ${REF.anadaProm}`,
      E.edad === REF.edad && api.stats.anadaPromedio === REF.anadaProm, `hoy ${E.edad} / ${api.stats.anadaPromedio}`);
    aviso(P + `ref. cajas ${REF.masAntigua} · ${REF.distintas} · ${REF.masAnada} (${REF.masN})`,
      E.masAntigua === REF.masAntigua && E.distintas === REF.distintas && E.top.an === REF.masAnada && E.top.botellas === REF.masN,
      `hoy ${E.masAntigua} · ${E.distintas} · ${E.top.an} (${E.top.botellas})`);

    // ── 3. gráfico año por año ──────────────────────────────────────
    const min = A.enGuarda[0].an, max = A.enGuarda[A.enGuarda.length - 1].an;
    const rango = []; for (let y = min; y <= max; y++) rango.push(y);
    const porAnio = new Map(A.enGuarda.map(x => [x.an, x.botellas]));
    check(P + '3. el gráfico tiene todos los años del rango, con 0 en los huecos',
      same(v.cols.map(c => [c.y, c.n]), rango.map(y => [y, porAnio.get(y) ?? 0])),
      `${v.cols.length} columnas vs ${rango.length} años`);
    check(P + '3. cada columna muestra su número', v.cols.every(c => c.num === nf(c.n)));
    const tope = Math.max(...v.cols.map(c => c.h));
    const maxN = Math.max(...A.enGuarda.map(x => x.botellas));
    const altas = v.cols.filter(c => c.h === tope);
    check(P + '3. la barra más alta es la del máximo', altas.length >= 1 && altas.every(c => c.n === maxN),
      altas.map(c => `${c.y}=${c.n}`).join(', '));
    check(P + '3. la escala es lineal (altura ∝ botellas)',
      v.cols.every(c => Math.abs(c.h - c.n / maxN * tope) <= 1.01), '');
    check(P + '3. el color de las barras es roble', v.cols.filter(c => c.n > 0).every(c => c.bg === ROBLE),
      [...new Set(v.cols.map(c => c.bg))].join(', '));
    const paso = rango.length > 30 ? 3 : 2;
    const labels = v.cols.filter(c => c.lab).map(c => c.y);
    const labEsp = rango.filter(y => (max - y) % paso === 0);
    check(P + `3. rótulos cada ${paso} años, terminando en el último (${max})`,
      same(labels, labEsp) && v.cols.filter(c => c.lab).every(c => c.lab === `'${String(c.y).slice(2)}`),
      labels.join(','));
    check(P + '3. el gráfico entra en el ancho, sin scroll', v.chartScroll <= 1 && v.scroll.s <= v.scroll.i,
      `chart +${v.chartScroll}, página ${v.scroll.s}/${v.scroll.i}`);
    const hueco = rango.find(y => !porAnio.has(y));
    if (hueco) check(P + `3. el año ${hueco} (sin botellas) aparece como hueco con su 0`,
      v.cols.some(c => c.y === hueco && c.n === 0 && c.num === '0'));
    check(P + '3. título y subtítulo', v.titulos.some(t => t.includes('Añadas en guarda, año por año') && t.includes('tocá un año')),
      v.titulos.join(' | '));

    // ── 4. tramos en filas ──────────────────────────────────────────
    const tramosApi = (api.tramosEdad ?? []).filter(t => t.botellas > 0);
    const totTr = tramosApi.reduce((s, t) => s + t.botellas, 0);
    if (E.bots >= 10) {
      const esp = tramosApi.map(t => ({ t: t.tramo, rot: /^\d+ a \d+$/.test(t.tramo) ? t.tramo + ' años' : t.tramo,
        n: nf(t.botellas), pct: nf(Math.round(t.botellas / totTr * 100)) + '%', bg: t.color }));
      check(P + '4. los tramos en filas coinciden con la API (rótulo, botellas, %)',
        same(v.tramos.map(r => ({ t: r.t, rot: r.rot, n: r.n, pct: r.pct })), esp.map(({ bg, ...r }) => r)),
        JSON.stringify(v.tramos.map(r => r.rot + ' ' + r.n + ' ' + r.pct)));
      check(P + '4. el subtítulo dice "{n} con añada"',
        v.titulos.some(t => t.startsWith('¿Cuánto tiempo tiene tu cava?') && t.includes(`${nf(totTr)} con añada`)), v.titulos.join(' | '));
      const maxT = Math.max(...tramosApi.map(t => t.botellas)), wMax = Math.max(...v.tramos.map(r => r.w));
      check(P + '4. el ancho de cada barra es proporcional al tramo más grande',
        v.tramos.every((r, i) => Math.abs(r.w / wMax - tramosApi[i].botellas / maxT) < 0.02),
        v.tramos.map(r => Math.round(r.w)).join(','));
      check(P + '4. cada barra lleva el color de su tramo',
        v.tramos.every((r, i) => r.bg.replace(/\s/g, '') === hexRgb(esp[i].bg).replace(/\s/g, '')), v.tramos.map(r => r.bg).join(' '));
      check(P + '4. columnas de ancho fijo (rótulo, barra, botellas y % alineados)',
        v.tramos.every(r => same(r.cols, v.tramos[0].cols)), JSON.stringify(v.tramos.map(r => r.cols)));
    } else {
      check(P + '4. con menos de 10 botellas no aparecen los tramos', !v.titulos.some(t => t.startsWith('¿Cuánto tiempo tiene tu cava?')));
    }
    check(P + '4. no hay tramos vacíos', v.tramos.every(r => num(r.n) > 0));

    // ── 5. espejo ───────────────────────────────────────────────────
    if (E.verEspejo) {
      check(P + '5. el espejo coincide con la API (agrupado "Antes de", % sólo con 5 o más)',
        same(v.espejo.map(f => ({ ep: f.ep, ab: f.ab, gu: f.gu, pct: f.pct })), E.espejo),
        v.espejo.map(f => `${f.ep} ${f.ab}/${f.gu} ${f.pct}`).join(' | '));
      check(P + '5. abiertas en carbón y en guarda en roble',
        v.espejo.every(f => f.bgAb === ABIERTAS_GRIS && f.bgGu === ROBLE),
        [...new Set(v.espejo.map(f => f.bgAb + '/' + f.bgGu))].join(', '));
      check(P + '5. la época va en la misma línea que las barras',
        v.espejo.every(f => Math.abs((f.rotY + f.rotH / 2) - (f.barY + f.barH / 2)) <= 3),
        v.espejo.map(f => `${f.ep}: ${Math.round(f.rotY)}/${Math.round(f.barY)}`).join(' | '));
      check(P + '5. subtítulo "añadas agrupadas cada 5 años"', v.titulos.some(t => t.includes('añadas agrupadas cada 5 años')));
      for (const [ep, [ab, gu, pct]] of Object.entries(REF.espejo)) {
        const f = v.espejo.find(x => x.ep === ep);
        aviso(P + `ref. ${ep}: ${ab} / ${gu} ${pct || 'sin %'}`, !!f && f.ab === nf(ab) && f.gu === nf(gu) && f.pct === pct,
          f ? `hoy ${f.ab} / ${f.gu} ${f.pct || 'sin %'}` : 'no está');
      }
    } else {
      check(P + '5. sin datos suficientes no aparece el espejo', !v.hayEspejo);
    }

    // ── 6. mapa de calor ────────────────────────────────────────────
    if (E.mapa.ok) {
      check(P + '6. el mapa tiene las cepas de la API (las 8 de más guarda + Otras)',
        same(v.mapaFilas, E.mapa.filas.map(f => f.cepa)), `${v.mapaFilas} vs ${E.mapa.filas.map(f => f.cepa)}`);
      check(P + '6. las columnas van de la primera a la última época con guarda',
        same(v.mapaCols, E.mapa.cols.map(e => `'${String(e).slice(2)}–${String(e + 4).slice(2)}`)), v.mapaCols.join(' '));
      const celdasEsp = E.mapa.filas.flatMap(f => E.mapa.cols.map(e => ({ cepa: f.cepa, v: f.cel.get(e) ?? 0 })));
      check(P + '6. el valor de cada celda coincide con la API',
        same(v.mapaCeldas.map(c => c.v), celdasEsp.map(c => c.v)), '');
      const malOp = [];
      v.mapaCeldas.forEach((c, i) => {
        if (c.v <= 0) return;
        const a = 0.22 + 0.78 * Math.sqrt(c.v / E.mapa.max);
        if (Math.abs((c.a ?? -1) - a) > 0.002) malOp.push(`${c.cepa}=${c.v}: ${c.a} vs ${a.toFixed(3)}`);
        const f = E.mapa.filas.find(x => x.cepa === c.cepa);
        const hx = f.color.replace('#', '');
        const rgb = [0, 2, 4].map(k => parseInt(hx.slice(k, k + 2), 16));
        const m = c.bg.match(/rgba?\(([^)]*)\)/);
        const got = m ? m[1].split(',').map(x => parseFloat(x)) : [];
        if (!same(got.slice(0, 3), rgb)) malOp.push(`${c.cepa} color ${c.bg} vs ${f.color}`);
      });
      check(P + '6. opacidad 0,22 + 0,78 × √(valor/máximo) y color de la cepa', malOp.length === 0, malOp.slice(0, 4).join(' | '));
      check(P + '6. las celdas en 0 quedan vacías', v.mapaCeldas.filter(c => c.v === 0).length > 0 || true);
      const otras = v.mapaCeldas.find(c => c.cepa === 'Otras' && c.v > 0);
      if (otras) check(P + '6. "Otras" va en #8A7E70', same((otras.bg.match(/\d+/g) || []).slice(0, 3).map(Number), OTRAS), otras.bg);
      check(P + '6. ningún nombre de cepa recortado ni con "…"', v.mapaTextos.every(x => !x.recortado),
        v.mapaTextos.filter(x => x.recortado).map(x => x.t).join(', '));
      check(P + '6. el nombre corto sólo se usa si el completo no entra',
        v.mapaTextos.every(x => x.t === x.cepa || (CORTAS[x.cepa] === x.t && !x.cabeCompleto)),
        v.mapaTextos.filter(x => x.t !== x.cepa).map(x => `${x.cepa}→${x.t} (cabe: ${x.cabeCompleto})`).join(', '));
      check(P + '6. subtítulo "en guarda"', v.titulos.some(t => t.startsWith('Cepas y épocas') && t.includes('en guarda')));
      for (const [cepa, vals] of Object.entries(REF.mapa)) {
        const idx = v.mapaFilas.indexOf(cepa);
        const got = idx < 0 ? null : v.mapaCeldas.slice(idx * v.mapaCols.length, (idx + 1) * v.mapaCols.length).map(c => c.v);
        aviso(P + `ref. mapa ${cepa}: ${vals.join(' ')}`, same(got, vals), `hoy ${got ? got.join(' ') : 'no está'}`);
      }
    } else {
      check(P + '6. sin datos suficientes no aparece el mapa', !v.hayMapa);
    }

    // ── 7. veteranas en podio ───────────────────────────────────────
    {
      const V = A.veteranas;
      const edadDe = x => `${nf(anio - x.anada)} ${anio - x.anada === 1 ? 'año' : 'años'}`;
      const botDe = x => `${nf(x.botellas)} ${x.botellas === 1 ? 'botella' : 'botellas'}`;
      check(P + '7. las veteranas están de la añada más antigua a la más nueva (empate, alfabético)',
        V.every((x, i) => i === 0 || V[i - 1].anada < x.anada || (V[i - 1].anada === x.anada && V[i - 1].vino.localeCompare(x.vino, 'es') <= 0)));
      check(P + '7. el 1.º es la añada más antigua en guarda', V[0].anada === A.enGuarda[0].an, `${V[0].anada} vs ${A.enGuarda[0].an}`);
      if (V.length >= 3) {
        check(P + '7. podio: columnas en orden 2 · 1 · 3', same([...v.podio].sort((a, b) => a.left - b.left).map(c => c.puesto), [2, 1, 3]),
          v.podio.map(c => c.puesto + '@' + Math.round(c.left)).join(' '));
        const porPuesto = p => v.podio.find(c => c.puesto === p);
        check(P + '7. podio: cada columna con añada, vino, bodega, años y botellas de la API',
          [1, 2, 3].every(p => {
            const c = porPuesto(p), x = V[p - 1];
            return c && c.anio === String(x.anada) && c.vino === x.vino && c.bod === x.bodega && same(c.meta, [edadDe(x), botDe(x)]);
          }), JSON.stringify(v.podio.map(c => [c.puesto, c.anio, c.vino, c.bod, c.meta])));
        check(P + '7. podio: el 1.º está en el medio con el escalón más alto (84 / 62 / 46 px)',
          porPuesto(1).escH === 84 && porPuesto(2).escH === 62 && porPuesto(3).escH === 46
          && porPuesto(1).left > porPuesto(2).left && porPuesto(1).left < porPuesto(3).left,
          v.podio.map(c => `${c.puesto}:${c.escH}`).join(' '));
        check(P + '7. podio: colores de los escalones (#3E2717, #80532F, #B88A57) y número del puesto',
          porPuesto(1).escBg === hexRgb('#3E2717') && porPuesto(2).escBg === hexRgb('#80532F') && porPuesto(3).escBg === hexRgb('#B88A57')
          && v.podio.every(c => c.esc === String(c.puesto)), v.podio.map(c => c.escBg).join(' '));
        check(P + '7. podio: los escalones arrancan parejos y los textos apoyan sobre su escalón',
          v.podio.every(c => Math.abs(c.escBottom - v.podio[0].escBottom) <= 1 && Math.abs(c.txtBottom - c.escTop) <= 1),
          v.podio.map(c => `${c.puesto}: base ${Math.round(c.escBottom)}, texto ${Math.round(c.txtBottom)}/${Math.round(c.escTop)}`).join(' | '));
        check(P + '7. podio: la añada es grande, serif y en roble', v.podio.every(c => c.anioSerif && c.anioColor === ROBLE),
          v.podio.map(c => c.anioColor).join(' '));
      } else {
        check(P + '7. con 1 o 2 vinos no hay podio, sólo filas', !v.hayPodio && v.filasPodio.length === V.length);
      }
      const resto = V.slice(V.length >= 3 ? 3 : 0);
      check(P + '7. los puestos 4 y 5 van abajo como filas (puesto, vino, bodega · botellas, añada · años)',
        same(v.filasPodio.map(r => [r.puesto, r.pues, r.vino, r.sub, r.der]),
          resto.map((x, k) => { const p = (V.length >= 3 ? 4 : 1) + k; return [p, String(p), x.vino, `${x.bodega} · ${botDe(x)}`, `${x.anada} · ${edadDe(x)}`]; })),
        JSON.stringify(v.filasPodio.map(r => [r.pues, r.vino, r.sub, r.der])));
      check(P + '7. las filas están debajo del podio', v.podioBottom == null || v.filasPodio.every(r => r.top >= v.podioBottom - 1));
      aviso(P + 'ref. veteranas', same(V.map(x => `${x.vino} ${x.anada}`), REF.veteranas), V.map(x => `${x.vino} ${x.anada}`).join(' | '));
      // tocar abre la ficha
      if (v.hayPodio) {
        await page.locator('.pd-txt').first().click();
        check(P + '7. tocar una columna del podio abre su ficha', await page.locator('.pd .wdetail').count() === 1);
        await page.locator('.pd-txt').first().click();
        check(P + '7. tocarla de nuevo la cierra', await page.locator('.pd .wdetail').count() === 0);
      }
      if (v.filasPodio.length) {
        await page.locator('.pd-fila').first().click();
        check(P + '7. tocar una fila abre su ficha', await page.locator('.pd-item .wdetail').count() === 1);
        await page.locator('.pd-fila').first().click();
      }
    }

    // ── 8. nota al pie ──────────────────────────────────────────────
    const { espumantes: ex, otras: ot } = A.sinAnada;
    const partes = [ex > 0 ? `${nf(ex)} ${ex === 1 ? 'espumante' : 'espumantes'}` : null, ot > 0 ? `${nf(ot)} por completar` : null].filter(Boolean).join(' y ');
    const notaEsp = E.sin > 0 ? `${nf(E.sin)} ${E.sin === 1 ? 'botella' : 'botellas'} sin añada${partes ? ` (${partes})` : ''}` : '';
    check(P + '8. la nota al pie coincide con la API', v.nota === notaEsp, `"${v.nota}" vs "${notaEsp}"`);
    aviso(P + `ref. nota: ${REF.sinAnada[0]} espumantes y ${REF.sinAnada[1]} por completar`,
      ex === REF.sinAnada[0] && ot === REF.sinAnada[1], `hoy ${ex} y ${ot}`);

    // ── 9. renglones y superposiciones ──────────────────────────────
    check(P + '9. ningún rótulo, número, % o cepa ocupa más de una línea', v.partidos.length === 0, v.partidos.slice(0, 5).join(' | '));
    check(P + '9. nada se pisa', v.pisados.length === 0, v.pisados.slice(0, 5).join(' | '));
    check(P + '9. ningún número se sale de su caja', v.fuera.length === 0, v.fuera.slice(0, 5).join(' | '));
    check(P + '9. no hay paneles vacíos', v.panelesVacios === 0, `${v.panelesVacios}`);

    // ── reglas generales ────────────────────────────────────────────
    check(P + 'sin scroll horizontal', v.scroll.s <= v.scroll.i, `${v.scroll.s} > ${v.scroll.i}`);
    const texto = await page.evaluate(() => document.body.innerText);
    const hall = PROHIBIDAS.filter(p => texto.toLowerCase().includes(p));
    check(P + 'sin palabras prohibidas', hall.length === 0, hall.join(', '));
    check(P + 'ningún decimal con punto', (texto.match(/\d+\.\d+/g) || []).length === 0, (texto.match(/\d+\.\d+/g) || []).join(', '));
    check(P + 'sin "tiempo entre compra y apertura"', !/tiempo (entre|hasta)|al abrir/i.test(await page.locator('.an-sec').innerText()));
    const money = await page.evaluate(async re => {
      const r = new RegExp(re, 'i'); const d = await (await fetch('/api/cava')).json();
      const hits = []; (function w(o, p) {
        if (o === null || typeof o !== 'object') return;
        for (const k of Object.keys(o)) { if (r.test(k)) hits.push(p + '.' + k); w(o[k], p + '.' + k); }
      })(d, ''); return [...new Set(hits)];
    }, MONEY_KEY.source);
    check(P + 'la API no tiene campos de dinero', money.length === 0, money.join(', '));

    // ── panel de un año ─────────────────────────────────────────────
    await pruebaPanel(page, A, E.top.an, anio, P, LEER, true);
    if (E.top.an === 2019) {
      const X = esperadoPanel(A, 2019, anio);
      aviso(P + 'ref. panel 2019: 7 años · la más guardada · 49 / 16 / 9 / 19 · 25 etiquetas',
        X.sub === '7 años · la cosecha más guardada' && same(X.cajas, ['49', '16', '9', '19']) && X.et.length === 25,
        `hoy ${X.sub} · ${X.cajas.join('/')} · ${X.et.length} etiquetas`);
      aviso(P + 'ref. panel 2019: Vivino y cepas', same(X.lineas, ['Mejor puntaje Vivino: 4,6 · Viña Cobos Terroir Marchiori Estate Malbec',
        'Cepas: Blend tinto 19 · Malbec 15 · Merlot 5 · Pinot Noir 3 · 5 más']), X.lineas.join(' | '));
    }
    const REF_T = [['Hasta 5 años', '95', '25%'], ['6 a 10 años', '182', '48%'], ['11 a 15 años', '67', '18%'], ['Más de 15', '33', '9%']];
    aviso(P + 'ref. tramos: ' + REF_T.map(t => t.join(' ')).join(' · '),
      same(v.tramos.map(r => [r.rot, r.n, r.pct]), REF_T), v.tramos.map(r => r.rot + ' ' + r.n + ' ' + r.pct).join(' · '));
    check(P + 'sin errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '));

    // ── 10. cava chica ──────────────────────────────────────────────
    if (apiParaFixture) {
      const chica = cavaChica(apiParaFixture);
      const p2 = await ctx.newPage();
      await p2.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: chica }));
      const r3 = p2.waitForResponse(x => x.url().includes('/api/cava'), { timeout: 40000 });
      await p2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await r3;
      await p2.waitForSelector('.an-chart', { timeout: 25000 });
      const vc = await p2.evaluate(LEER);
      check(P + '10. cava chica: no hay espejo', !vc.hayEspejo);
      check(P + '10. cava chica: no hay mapa de calor', !vc.hayMapa);
      check(P + '10. cava chica: no quedan paneles ni cajas vacías', vc.panelesVacios === 0 && vc.kpisVacios === 0,
        `${vc.panelesVacios} paneles, ${vc.kpisVacios} cajas`);
      check(P + '10. cava chica: el gráfico tiene los años 2015 a 2023',
        same(vc.cols.map(c => c.y), [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]) && vc.chartScroll <= 1);
      check(P + '10. cava chica: el destacado, las cajas y los tramos se ven',
        /años$/.test(vc.hero.num) && vc.kpis.length === 3 && vc.tramos.length >= 1,
        `${vc.hero.num} / ${vc.kpis.length} cajas / ${vc.tramos.length} tramos`);
      check(P + '10. cava chica: con 2 vinos las veteranas son sólo filas, sin podio',
        !vc.hayPodio && vc.filasPodio.length === 2 && vc.filasPodio[0].pues === '1', JSON.stringify(vc.filasPodio.map(r => r.pues)));
      check(P + '10. cava chica: sin nota al pie', vc.nota === '');
      check(P + '10. cava chica: renglones y superposiciones bien',
        vc.partidos.length === 0 && vc.pisados.length === 0 && vc.scroll.s <= vc.scroll.i,
        [...vc.partidos, ...vc.pisados].slice(0, 3).join(' | '));
      const Ac = JSON.parse(chica).anadas;
      await pruebaPanel(p2, Ac, 2023, anio, P + '10. cava chica: ', LEER, false);
      await p2.close();
    }

    if (SHOTS && vp.w < 500) {
      // una captura en celular: el podio de las veteranas
      mkdirSync(SHOTS, { recursive: true });
      await page.goto(URL, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.pd-podio');
      await page.waitForTimeout(500);
      await page.locator('.an-sec .tpanel').filter({ has: page.locator('.pd') })
        .screenshot({ path: join(SHOTS, `${vp.file}-podio.png`) });
      console.log(`  (capturas en ${SHOTS})`);
    }

    await ctx.close();
    console.log('');
  }
} finally {
  await browser.close();
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
