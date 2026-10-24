#!/usr/bin/env node
// Verifica la sección "Geografía" de /club/cava.
//
//   node scripts/check-geografia.mjs                             (local)
//   node scripts/check-geografia.mjs --base https://edb.com.ar   (producción)
//   node scripts/check-geografia.mjs --base <url> --shots <dir>
//
// Lo que compara contra /api/cava en vivo FALLA. Lo que compara contra los
// valores congelados del 24/10/2026 sale como AVISO: los datos de la cava
// cambian cada vez que se carga algo en Airtable.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, relative, sep } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';
import { reglaDeLayout, sinInfracciones, textoInfracciones, abrirIphone } from './lib/layout.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const BASE     = (arg('base', 'http://localhost:4173')).replace(/\/+$/, '');
const SHOTS    = arg('shots', null);
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const URL      = BASE + '/club/cava#geografia';

const VIEWPORTS = [
  { w: 360, h: 800,  label: 'celular',    file: 'mob', esc: false },
  { w: 820, h: 1000, label: 'escritorio', file: 'dsk', esc: true },
];

// Referencia del 24/10/2026 — sólo para AVISO.
const REF = {
  hero: ['24 regiones', '83 bodegas en 383 botellas'],
  cajas: ['4', '11', 'Valle de Uco'],
  provincias: { Salta: 22, Catamarca: 2, 'San Juan': 2, Mendoza: 308, 'Río Negro': 20, Chubut: 14 },
  grises: ['La Rioja', 'Neuquén'],
  guarda: [['España', 11], ['EEUU', 3], ['Chile', 1]],
  probados: [['Francia', 10], ['España', 9], ['EEUU', 6], ['Chile', 5], ['Italia', 5], ['Otros', 5]],
  uco: ['129', '36', '53', '4,28'],
  espejo: { 'Valle de Uco': [66, 129, '66%'], 'Luján de Cuyo': [42, 99, '70%'], Agrelo: [16, 56, '78%'], Importados: [40, 15, '27%'] },
};

const ABIERTAS_GRIS = 'rgb(74, 67, 64)';   // #4A4340
const OLIVA = 'rgb(94, 107, 58)';          // #5E6B3A
const GRIS_PUNTO = 'rgb(207, 198, 176)';   // #CFC6B0
const CORDILLERA = 'rgb(185, 174, 147)';   // #B9AE93
const FONDO_ON = 'rgb(230, 220, 196)';     // #E6DCC4
const LAT = {
  'Jujuy': 23.5, 'Salta': 25.2, 'Tucumán': 26.8, 'Catamarca': 28, 'La Rioja': 29.4, 'San Juan': 31.4, 'Córdoba': 31.4,
  'San Luis': 33.3, 'Mendoza': 33.6, 'La Pampa': 36.6, 'Buenos Aires': 37.5, 'Neuquén': 38.3, 'Río Negro': 39.7, 'Chubut': 43.4,
};
const PROVS_AR = new Set(['Mendoza', 'Salta', 'San Juan', 'Río Negro', 'Rio Negro', 'Neuquén', 'Neuquen', 'Chubut', 'La Rioja',
  'Catamarca', 'Jujuy', 'Tucumán', 'Córdoba', 'San Luis', 'La Pampa', 'Buenos Aires', 'Patagonia', 'Argentina']);

// una palabra de 1 o 2 letras que no sea un conector es una palabra cortada ("Vi talba")
const cortada = n => n.replace(/[()+\d]/g, '').split(' ').filter(Boolean).some(t => t.length <= 2 && !/^(de|del|la|el|y|e|a|o|do|da|los|las)$/i.test(t));

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
const pl = (n, u, v) => (n === 1 ? u : v);

// ── archivos: ni mapas ni geodatos ────────────────────────────────
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(p))) out.push(p);
  }
  return out;
}
function chequeosDeArchivos() {
  console.log('── archivos ──');
  const fuentes = [...walk(join(ROOT, 'src'), ['.ts', '.tsx', '.css']), ...walk(join(ROOT, 'api'), ['.ts'])];
  const malos = [];
  for (const p of fuentes) {
    const src = readFileSync(p, 'utf8');
    for (const re of [/d3-geo/, /topojson/, /\.geojson/, /['"`]\/geo\//, /geoPath|geoMercator|geoNaturalEarth/]) {
      if (re.test(src)) malos.push(`${relative(ROOT, p)} → ${re}`);
    }
  }
  check('ningún mapa ni geodato en src/ ni api/', malos.length === 0, malos.join(' | '));
  check('no queda public/geo', !existsSync(join(ROOT, 'public', 'geo')));
  const css = readFileSync(join(ROOT, 'src', 'club', 'tablero.css'), 'utf8');
  check('no quedan estilos de los mapas ni del acordeón', !/\.geo-(svg|map-wrap|tabs|tooltip|list)\b|\.reg-(list|grupo|region)\b/.test(css));
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

// Cava chica de prueba: 1 región, 1 bodega, sin importados ni abiertas. Se arma
// recortando la respuesta; no toca Airtable.
function cavaChica(real) {
  const d = JSON.parse(real);
  const bot = 12;
  d.geografia = {
    regiones: [{ region: 'Valle de Uco', pais: 'Argentina', provincia: 'Mendoza', botellas: bot, pct: 100,
      bodegas: [{ bodega: 'Bodega de prueba', botellas: bot }], iconos: 0, vivino: null }],
    bodegas: [{ bodega: 'Bodega de prueba', region: 'Valle de Uco', otrasRegiones: 0, regiones: ['Valle de Uco'], botellas: bot,
      etiquetas: [{ vino: 'Vino de prueba', anada: 2019, botellas: 7, vivino: null, icono: false, val: null },
        { vino: 'Vino de prueba', anada: 2020, botellas: 5, vivino: null, icono: false, val: null }], iconos: 0, vivino: null }],
    provincias: [{ provincia: 'Mendoza', enGuarda: bot, abiertas: 0, pct: 100,
      bodegas: [{ bodega: 'Bodega de prueba', botellas: bot }], iconos: 0, vivino: null }],
    paises: [], paisesEnGuarda: 1, paisesProbados: 1, abiertasTotal: 0,
    espejo: { regiones: [], importados: { gu: 0, ab: 0 } },
  };
  d.stats = { ...d.stats, enGuarda: bot, regionesCount: 1, bodegasCount: 1, paisesCount: 1 };
  return JSON.stringify(d);
}

// ── lo que tiene que mostrar la pantalla, calculado de la API ─────
function esperado(api) {
  const G = api.geografia, W = api.data.grupal, total = api.stats.enGuarda;
  const regs = G.regiones, bods = G.bodegas;
  const filasReg = regs.filter(r => r.botellas >= 3).slice(0, 10);
  const resto = regs.filter(r => !filasReg.includes(r));
  const impGuarda = G.paises.filter(p => p.enGuarda > 0);
  const impAb = G.paises.filter(p => p.abiertas > 0).sort((a, b) => b.abiertas - a.abiertas || a.pais.localeCompare(b.pais, 'es'));
  const abImp = impAb.reduce((s, p) => s + p.abiertas, 0);
  const top5 = impAb.slice(0, 5), otros = impAb.slice(5);
  const probados = otros.length ? [...top5.map(p => [p.pais, p.abiertas]), ['Otros', otros.reduce((s, p) => s + p.abiertas, 0)]] : top5.map(p => [p.pais, p.abiertas]);
  const grupoDe = r => r.pais !== 'Argentina' ? 'DEL MUNDO' : ['Neuquén', 'Río Negro', 'Chubut'].includes(r.provincia) ? 'PATAGONIA' : r.provincia.toUpperCase();
  return { G, W, total, regs, bods, filasReg, resto, impGuarda, impAb, abImp, probados, otros, grupoDe,
    hayAbiertas: G.abiertasTotal > 0,
    verGuarda: impGuarda.length >= 1, verProbados: abImp >= 5, verBodegas: bods.length >= 3,
    verEspejo: G.abiertasTotal >= 5 && G.espejo.regiones.length >= 2,
    mas: regs[0] };
}

function chequeosDeApi(api) {
  console.log('── totales de /api/cava ──');
  const G = api.geografia, W = api.data.grupal, S = api.stats;
  check('la API trae el bloque geografia y ya no trae geo ni regiones', !!G && api.geo === undefined && api.regiones === undefined);
  const regsRaw = new Set(W.filter(w => w.reg).map(w => `${w.pais}|${w.reg}`));
  check('regiones = distintas en guarda, ya normalizadas', G.regiones.length === regsRaw.size && S.regionesCount === regsRaw.size,
    `${G.regiones.length} / ${S.regionesCount} vs ${regsRaw.size}`);
  check('bodegas = distintas en guarda', G.bodegas.length === new Set(W.map(w => w.bod)).size && S.bodegasCount === G.bodegas.length);
  check('países en guarda = distintos en guarda', G.paisesEnGuarda === new Set(W.map(w => w.pais)).size && S.paisesCount === G.paisesEnGuarda);
  const sinReg = W.filter(w => !w.reg).reduce((s, w) => s + w.qty, 0);
  const nombres = [...G.regiones.map(r => r.region), ...G.bodegas.flatMap(b => b.regiones), ...W.map(w => w.reg)];
  check('ninguna región con espacios dobles, espacio al final o palabras cortadas', nombres.every(n => n === n.trim() && !/\s{2,}/.test(n) && !cortada(n)), nombres.filter(n => n !== n.trim() || /\s{2,}/.test(n)).join(' | '));
  check('existen "Vistalba", "Costa Central", "Molinos" y "Valles Calchaquíes", bien escritas',
    ['Vistalba', 'Costa Central', 'Molinos', 'Valles Calchaquíes'].every(n => G.regiones.some(r => r.region === n)), G.regiones.map(r => r.region).join(' | '));
  check('las regiones con tilde de la lista salen con tilde y las demás tal cual',
    ['Luján de Cuyo', 'Maipú', 'Animaná', 'Hualfín', 'Mainqué'].every(n => !G.regiones.some(r => r.region.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === n.normalize('NFD').replace(/[\u0300-\u036f]/g, '') && r.region !== n)));
  check('la suma de las regiones = botellas en guarda', G.regiones.reduce((s, r) => s + r.botellas, 0) === S.enGuarda && sinReg === 0,
    `${G.regiones.reduce((s, r) => s + r.botellas, 0)} vs ${S.enGuarda} (${sinReg} sin región)`);
  check('la suma de las bodegas = botellas en guarda', G.bodegas.reduce((s, b) => s + b.botellas, 0) === S.enGuarda);
  const arGuarda = W.filter(w => w.pais === 'Argentina').reduce((s, w) => s + w.qty, 0);
  check('provincias: la suma en guarda = botellas argentinas', G.provincias.reduce((s, p) => s + p.enGuarda, 0) === arGuarda);
  check('provincias: ninguna aparece dos veces ni con variantes de Río Negro',
    new Set(G.provincias.map(p => p.provincia)).size === G.provincias.length && !G.provincias.some(p => /^(rio negro|patagonia)$/i.test(p.provincia) && p.provincia !== 'Río Negro'),
    G.provincias.map(p => p.provincia).join(', '));
  const impGuarda = W.filter(w => w.pais !== 'Argentina').reduce((s, w) => s + w.qty, 0);
  check('Importados (guarda) = botellas no argentinas', G.espejo.importados.gu === impGuarda && G.paises.reduce((s, p) => s + p.enGuarda, 0) === impGuarda);
  let abImp = 0, abTot = 0; const paisesCons = new Set();
  for (const y of Object.values(api.cons.grupal.byYear)) for (const c of y.wines) {
    abTot += c.cant;
    paisesCons.add(PROVS_AR.has(c.pais) ? 'Argentina' : c.pais);
    if (!PROVS_AR.has(c.pais)) abImp += c.cant;
  }
  check('Importados (abiertas) = consumos no argentinos', G.espejo.importados.ab === abImp && G.paises.reduce((s, p) => s + p.abiertas, 0) === abImp,
    `${G.espejo.importados.ab} vs ${abImp}`);
  check('abiertas totales = consumos', G.abiertasTotal === abTot, `${G.abiertasTotal} vs ${abTot}`);
  const probados = new Set([...W.map(w => w.pais), ...paisesCons]);
  check('países probados = guarda + abiertas', G.paisesProbados === probados.size, `${G.paisesProbados} vs ${probados.size}`);
  check('cada región trae provincia o país, botellas, %, bodegas, íconos',
    G.regiones.every(r => r.provincia !== undefined && r.pais && r.pct === Math.round(r.botellas / S.enGuarda * 100)
      && r.bodegas.reduce((s, b) => s + b.botellas, 0) === r.botellas && typeof r.iconos === 'number'));
  check('el Vivino promedio sale con 2 decimales', G.regiones.every(r => r.vivino == null || Math.abs(r.vivino * 100 - Math.round(r.vivino * 100)) < 1e-6));
  check('cada bodega trae región principal, etiquetas e íconos',
    G.bodegas.every(b => b.region && b.etiquetas.length > 0 && b.etiquetas.reduce((s, e) => s + e.botellas, 0) === b.botellas && typeof b.iconos === 'number'));
  check('el espejo: regiones argentinas de 10+ (guarda + abiertas), máx. 8, ordenadas por guarda',
    G.espejo.regiones.length <= 8 && G.espejo.regiones.every(r => r.gu + r.ab >= 10)
    && G.espejo.regiones.every((r, i, a) => i === 0 || a[i - 1].gu >= r.gu));
  console.log('');
}

// ── lectura de la pantalla ────────────────────────────────────────
const LEER = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top + scrollY, b: r.bottom + scrollY, w: r.width, h: r.height }; };
  const lineas = e => {
    const r = document.createRange(); r.selectNodeContents(e);
    return new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size;
  };
  const SEL_LINEA = '.geo-sec .cepa-kpi b, .geo-sec .cepa-kpi span, .geo-sec .sec-hero-num, .geo-sec .tr-rot, .geo-sec .tr-n, .geo-sec .tr-pct, '
    + '.geo-sec .gm-rot, .geo-sec .gm-t, .geo-sec .gr-grupo, .geo-sec .gb-reg, .geo-sec .ae-rot, .geo-sec .ae-num, .geo-sec .ae-pct, '
    + '.geo-sec .ae-h1, .geo-sec .ae-h2, .geo-sec .det-t, .geo-sec .lc-vino, .geo-sec .lc-dato, .geo-sec .lc-an, .geo-sec .det-et-n';
  const partidos = [...document.querySelectorAll(SEL_LINEA)]
    .filter(e => txt(e) && lineas(e) > 1).map(e => `${e.className}:"${txt(e)}"`);
  const recortados = [...document.querySelectorAll('.geo-sec .tr-rot, .geo-sec .gm-rot, .geo-sec .gb-reg, .geo-sec .ae-rot, .geo-sec .cepa-kpi b, .geo-sec .gm-t')]
    .filter(e => txt(e) && e.scrollWidth > e.clientWidth + 1).map(e => `${e.className}:"${txt(e)}"`);
  // textos que se pisan entre sí
  const pisados = [];
  for (const sel of ['.geo-sec .tr-rot', '.geo-sec .tr-n', '.geo-sec .tr-pct', '.geo-sec .gm-rot', '.geo-sec .ae-rot', '.geo-sec .ae-num', '.geo-sec .ae-pct',
    '.geo-sec .cepa-kpi b', '.geo-sec .gb-reg', '.geo-sec .lc-vino', '.geo-sec .lc-dato']) {
    const els = [...document.querySelectorAll(sel)].filter(e => txt(e)).map(e => ({ e, r: R(e) }));
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].r, b = els[j].r;
      if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) pisados.push(`${sel}:"${txt(els[i].e)}"×"${txt(els[j].e)}"`);
    }
  }
  // la cordillera: rótulos de provincia entre sí, y los de latitud contra círculos
  const svg = document.querySelector('.ns-svg');
  const cordillera = { rotulos: [], marcas: [], pisos: [] };
  if (svg) {
    const rot = [...document.querySelectorAll('.ns-wrap .ns-rot, .ns-wrap .ns-n')].map(e => ({ n: txt(e), r: R(e) }));
    const marcas = [...svg.querySelectorAll('.ns-marca text')].map(e => ({ n: txt(e), r: R(e) }));
    const circ = [...svg.querySelectorAll('circle')].map(e => ({ r: R(e), p: e.closest('.ns-prov')?.dataset.prov }));
    const choca = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
    for (let i = 0; i < rot.length; i++) for (let j = i + 1; j < rot.length; j++) if (choca(rot[i].r, rot[j].r)) cordillera.pisos.push(`${rot[i].n}×${rot[j].n}`);
    for (const m of marcas) {
      for (const r of rot) if (choca(m.r, r.r)) cordillera.pisos.push(`${m.n}×${r.n}`);
      for (const c of circ) if (choca(m.r, c.r)) cordillera.pisos.push(`${m.n}×círculo ${c.p}`);
    }
    cordillera.rotulos = rot.map(r => r.n);
    cordillera.marcas = marcas.map(m => m.n);
  }
  const linea = svg?.querySelector(':scope > line');
  const cs = e => getComputedStyle(e);
  return {
    hay: !!document.querySelector('.geo-sec'),
    hero: { num: txt(document.querySelector('.geo-sec .sec-hero-num')), text: txt(document.querySelector('.geo-sec .sec-hero-text')),
      color: cs(document.querySelector('.geo-sec .sec-hero-num')).color },
    heroCard: (() => {
      const h = document.querySelector('.geo-hero'); if (!h) return null;
      const bs = cs(h);
      return { borde: bs.borderTopWidth, cajasX: [...h.querySelectorAll('.cepa-kpi')].map(e => Math.round(R(e).l)), cajasY: [...h.querySelectorAll('.cepa-kpi')].map(e => Math.round(R(e).t)),
        heroR: R(h.querySelector('.sec-hero')).r, kpisL: R(h.querySelector('.cepa-kpis')).l, heroB: R(h.querySelector('.sec-hero')).b, kpisT: R(h.querySelector('.cepa-kpis')).t,
        rayas: [...h.querySelectorAll('.cepa-kpi')].map(e => cs(e).borderTopWidth) };
    })(),
    cajas: [...document.querySelectorAll('.geo-hero .cepa-kpi')].map(e => ({
      id: e.dataset.caja, n: txt(e.querySelector('b')), l: txt(e.querySelector('span')), color: cs(e.querySelector('b')).color,
      font: cs(e.querySelector('b')).fontFamily, size: parseFloat(cs(e.querySelector('b')).fontSize), titleSize: 0, wrap: cs(e.querySelector('b')).whiteSpace })),
    heroNumSize: parseFloat(cs(document.querySelector('.geo-sec .sec-hero-num')).fontSize),
    ns: svg ? {
      vb: svg.getAttribute('viewBox'), n: linea ? { x1: linea.getAttribute('x1'), stroke: cs(linea).stroke, sw: cs(linea).strokeWidth } : null,
      provs: [...svg.querySelectorAll('.ns-prov')].map(g => {
        const c = g.querySelector('circle');
        const fila = document.querySelector(`.ns-wrap .ns-fila[data-prov="${g.dataset.prov}"]`);
        const rot = fila.querySelector('.ns-rot'), nn = fila.querySelector('.ns-n');
        const wr = R(document.querySelector('.ns-wrap'));
        return { p: g.dataset.prov, gris: g.classList.contains('ns-gris'), r: Number(c.getAttribute('r')), cy: Number(c.getAttribute('cy')),
          fill: cs(c).fill, num: txt(nn), n: g.dataset.bot ? Number(g.dataset.bot) : null, rotulo: txt(rot),
          rotFill: cs(rot).color, nFill: nn ? cs(nn).color : null, nFont: nn ? cs(nn).fontFamily : null, boton: fila.tagName === 'BUTTON',
          nombreL: R(rot).l, nombreW: R(rot).w, nombreH: R(rot).h, nombreCy: (R(rot).t + R(rot).b) / 2,
          numR: nn ? R(nn).r : null, numW: nn ? R(nn).w : null, numCy: nn ? (R(nn).t + R(nn).b) / 2 : null,
          rayita: cs(g.querySelector('line')).stroke, wrapT: wr.t, wrapH: wr.b - wr.t,
          enPantalla: R(rot).r <= innerWidth + 1 && R(rot).l >= 0, esHtml: !rot.closest('svg') };
      }),
      textosSvg: [...svg.querySelectorAll('text')].filter(t => !t.closest('.ns-marca')).length,
      marcasX: [...svg.querySelectorAll('.ns-marca text')].map(e => Number(e.getAttribute('x'))),
      marcas: [...svg.querySelectorAll('.ns-marca')].map(g => ({ t: txt(g.querySelector('text')), y: Number(g.querySelector('line').getAttribute('y1')), x: Number(g.querySelector('line').getAttribute('x2')) })),
      ancho: R(svg).w,
    } : null,
    cordillera,
    barras: (() => {
      const c = document.querySelector('.geo-regiones'); if (!c) return null;
      const pistas = [...c.querySelectorAll('.tr-fila .tr-pista')];
      return { card: R(c).w, pistas: pistas.map(p => ({ w: R(p).w, h: R(p).h, bg: cs(p).backgroundColor, rad: cs(p.querySelector('.tr-barra')).borderTopLeftRadius, bh: R(p.querySelector('.tr-barra')).h, bw: R(p.querySelector('.tr-barra')).w })),
        filas: [...c.querySelectorAll('.tr-fila')].map(f => ({ rot: R(f.querySelector('.tr-rot')).t, pista: R(f.querySelector('.tr-pista')).t, rotL: R(f.querySelector('.tr-rot')).l, pistaL: R(f.querySelector('.tr-pista')).l, pistaR: R(f.querySelector('.tr-pista')).r, fR: R(f).r, fL: R(f).l })) };
    })(),
    barrasBod: (() => {
      const c = document.querySelector('.geo-bodegas'); if (!c) return null;
      return { pie: { resto: c.querySelector('.gr-resto') ? R(c.querySelector('.gr-resto')).b : null, verT: c.querySelector('.gb-ver') ? R(c.querySelector('.gb-ver')).t : null, restoLineas: c.querySelector('.gr-resto') ? lineas(c.querySelector('.gr-resto')) : 0 } };
    })(),
    mundoFilas: [],
    regionesTodas: [...document.querySelectorAll('.geo-regiones .tr-rot, .geo-sec .gb-reg, .geo-sec .ae-rot')].map(e => txt(e)),
    mundo: (() => {
      const m = document.querySelector('.geo-mundo'); if (!m) return null;
      const bloque = k => {
        const b = m.querySelector(`.gm-bloque[data-bloque="${k}"]`); if (!b) return null;
        return { t: txt(b.querySelector('.gm-t')), items: [...b.querySelectorAll('.gm-it')].map(i => ({ p: i.dataset.pais, n: txt(i.querySelector('.gm-n')), color: cs(i.querySelector('.gm-n')).color, serif: /Fraunces/.test(cs(i.querySelector('.gm-n')).fontFamily), lin: i.getClientRects().length })),
          resto: txt(b.querySelector('.gm-resto')), barras: b.querySelectorAll('.tr-barra, .tr-pista').length };
      };
      return { guarda: bloque('guarda'), probados: bloque('probados'), r: R(m) };
    })(),
    norteR: R(document.querySelector('.geo-norte')),
    regiones: (() => {
      const c = document.querySelector('.geo-regiones'); if (!c) return null;
      return { r: R(c), titulo: txt(c.querySelector('h3')),
        items: [...c.querySelectorAll('.tr-lista > *')].map(e => e.classList.contains('gr-grupo')
          ? { grupo: txt(e) }
          : { region: e.dataset.region, rot: txt(e.querySelector('.tr-rot')), n: txt(e.querySelector('.tr-n')), pct: txt(e.querySelector('.tr-pct')), bg: cs(e.querySelector('.tr-barra')).backgroundColor, on: e.classList.contains('on'), fondo: cs(e).backgroundColor }),
        resto: txt(c.querySelector('.gr-resto')) };
    })(),
    bodegas: (() => {
      const c = document.querySelector('.geo-bodegas'); if (!c) return null;
      return { r: R(c), titulo: txt(c.querySelector('h3')),
        filas: [...c.querySelectorAll('.gb-fila')].map(e => ({ b: e.dataset.bodega, reg: txt(e.querySelector('.gb-reg')), n: txt(e.querySelector('.gb-bot')), pos: txt(e.querySelector('.gb-pos')), barras: e.querySelectorAll('.tr-barra, .tr-pista').length,
          regY: e.querySelector('.gb-reg') ? R(e.querySelector('.gb-reg')).t : null, nomY: R(e.querySelector('.gb-n')).b, regColor: e.querySelector('.gb-reg') ? cs(e.querySelector('.gb-reg')).color : null, on: e.classList.contains('on'), fondo: cs(e).backgroundColor })),
        resto: txt(c.querySelector('.gr-resto')), ver: txt(c.querySelector('.gb-ver')) };
    })(),
    espejo: (() => {
      const e = document.querySelector('.geo-sec .ae'); if (!e) return null;
      return { titulo: txt(e.closest('.tpanel').querySelector('h3')), w: R(e.closest('.tpanel')).w, wrap: R(document.querySelector('.geo-sec')).w,
        filas: [...e.querySelectorAll('.ae-lista .ae-fila')].map(f => ({ r: txt(f.querySelector('.ae-rot')), ab: txt(f.querySelector('.ae-izq .ae-num')), gu: txt(f.querySelector('.ae-der .ae-num')), pct: txt(f.querySelector('.ae-pct')),
          negrita: Number(cs(f.querySelector('.ae-rot')).fontWeight) >= 600, raya: cs(f).borderTopWidth, bgAb: cs(f.querySelector('.ae-ab')).backgroundColor, bgGu: cs(f.querySelector('.ae-gu')).backgroundColor })) };
    })(),
    titulos: [...document.querySelectorAll('.geo-sec .tpanel h3')].map(e => txt(e)),
    partidos, recortados, pisados,
    scroll: { s: document.documentElement.scrollWidth, i: window.innerWidth },
    kpisVacios: [...document.querySelectorAll('.geo-sec .cepa-kpi')].filter(e => !txt(e.querySelector('b'))).length,
  };
};

const LEER_PANEL = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top + scrollY, b: r.bottom + scrollY, w: r.width }; };
  const p = document.querySelector('.det-panel');
  if (!p) return { hay: false };
  const cs = e => getComputedStyle(e);
  const items = [...p.querySelectorAll('.lc-item')];
  return {
    hay: true, titulo: txt(p.querySelector('.det-t')), sub: txt(p.querySelector('.det-s')), tFont: cs(p.querySelector('.det-t')).fontFamily, tColor: cs(p.querySelector('.det-t')).color,
    borde: cs(p).borderTopColor, gris: cs(p.querySelector('.det-s')).color,
    cajas: [...p.querySelectorAll('.det-cajas .cepa-kpi')].map(e => ({ n: txt(e.querySelector('b')), l: txt(e.querySelector('span')), y: Math.round(R(e).t), x: Math.round(R(e).l) })),
    filas: items.map(e => ({ v: txt(e.querySelector('.lc-vino')), an: txt(e.querySelector('.lc-an')), d: txt(e.querySelector('.lc-dato')), x: Math.round(R(e).l), y: Math.round(R(e).t) })),
    ver: txt(p.querySelector('.lc-ver')), r: R(p), x: !!p.querySelector('.det-x'),
    columnas: new Set(items.map(e => Math.round(R(e).l))).size,
    dp: p.parentElement.className, vh: window.innerHeight,
  };
};

async function esperaPanel(pg) {
  await pg.waitForSelector('.det-panel', { timeout: 8000 });
  await pg.waitForTimeout(700);   // termina el scroll suave
}

// ── corrida ────────────────────────────────────────────────────────
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
let apiTxt = apiBody;
if (!apiTxt) apiTxt = await (await fetch(BASE + '/api/cava')).text();
const api = JSON.parse(apiTxt);
chequeosDeApi(api);
const E = esperado(api);

console.log(`Verificando ${URL}\n`);
const browser = await chromium.launch({ headless: true });
try {
  for (const vp of VIEWPORTS) {
    const P = `[${vp.label} ${vp.w}] `;
    console.log(`── ${vp.label} ${vp.w} px ──`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    if (apiBody) await page.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.geo-sec', { timeout: 30000 });
    await page.waitForTimeout(900);
    const v = await page.evaluate(LEER);

    // 0. nada de mapas
    check(P + '0. no hay mapas, chips de provincias ni acordeón', await page.locator('.geo-svg, .geo-tabs, .geo-list, .reg-list, .geo-panel').count() === 0);
    check(P + '0. la página no tira errores', errs.length === 0, errs.slice(0, 2).join(' | '));

    // 1. destacado + cajas
    check(P + '1. destacado "N regiones" en oliva', v.hero.num === `${nf(E.regs.length)} ${pl(E.regs.length, 'región', 'regiones')}` && v.hero.color === OLIVA, `${v.hero.num} ${v.hero.color}`);
    check(P + '1. subtítulo "N bodegas en M botellas"', v.hero.text === `${nf(E.bods.length)} bodegas en ${nf(E.total)} botellas`, v.hero.text);
    const ids = v.cajas.map(c => c.id);
    check(P + `1. cajas: Países en guarda${E.hayAbiertas ? ' · Países probados' : ''} · la región que más`,
      same(ids, E.hayAbiertas ? ['paises-guarda', 'paises-probados', 'region-top'] : ['paises-guarda', 'region-top']), ids.join(','));
    const c0 = v.cajas.find(c => c.id === 'paises-guarda'), c1 = v.cajas.find(c => c.id === 'paises-probados'), c2 = v.cajas.find(c => c.id === 'region-top');
    check(P + '1. Países en guarda coincide con la API', c0 && c0.n === nf(E.G.paisesEnGuarda) && /^Países? en guarda$/.test(c0.l), JSON.stringify(c0));
    check(P + '1. Países probados (guarda + abiertas) coincide con la API', !E.hayAbiertas || (c1 && c1.n === nf(E.G.paisesProbados)), JSON.stringify(c1));
    check(P + '1. la región que más: nombre y "La que más · N"', c2 && c2.n === E.mas.region && c2.l === `La que más · ${nf(E.mas.botellas)}`, JSON.stringify(c2));
    check(P + '1. la tercera caja: nombre en serif oliva, más chico que los números, en un renglón (nowrap)',
      c2 && /Fraunces/.test(c2.font) && c2.color === OLIVA && c2.wrap === 'nowrap' && c2.size < (c0?.size ?? 99), c2 ? `${c2.font} ${c2.color} ${c2.wrap} ${c2.size}px vs ${c0?.size}px` : '');
    if (vp.esc) {
      const h = v.heroCard;
      check(P + '1. escritorio: una tarjeta con borde y las cajas apiladas a la derecha, con raya entre cada una',
        h && h.borde !== '0px' && new Set(h.cajasX).size === 1 && h.cajasX[0] >= h.heroR - 1 && h.cajasY.every((y, i, a) => i === 0 || y > a[i - 1])
        && h.rayas.slice(1).every(x => x !== '0px'), JSON.stringify(h));
    } else {
      const h = v.heroCard;
      check(P + '1. celular: las tres cajas van debajo del destacado, en fila', h && h.kpisT >= h.heroB - 1 && new Set(h.cajasY).size === 1, JSON.stringify(h));
    }

    // 2a. De norte a sur
    const ns = v.ns;
    check(P + '2. De norte a sur: viewBox 330×330 y cordillera gris #B9AE93 de 3 px en x=120', ns && ns.vb === '0 0 330 330' && ns.n && ns.n.x1 === '120' && ns.n.stroke === CORDILLERA && ns.n.sw === '3px', JSON.stringify(ns?.n));
    check(P + '2. marcas 25°S · 30°S · 35°S · 40°S a la izquierda de la línea, en su latitud (y = 22 + (lat − 24) × 14)',
      ns && same(ns.marcas.map(m => m.t), ['25°S', '30°S', '35°S', '40°S']) && ns.marcas.every(m => Math.abs(m.y - (22 + (Number(m.t.slice(0, 2)) - 24) * 14)) < 0.01 && m.x === 120) && ns.marcasX.every(x => x === 90), JSON.stringify(ns?.marcas));
    const conGuarda = E.G.provincias.filter(p => p.enGuarda > 0 && LAT[p.provincia]);
    const soloAb = E.G.provincias.filter(p => p.enGuarda === 0 && p.abiertas > 0 && LAT[p.provincia]);
    check(P + '2. una provincia por cada una con botellas en guarda o abiertas, ninguna vacía',
      same(ns.provs.map(p => p.p).sort(), [...conGuarda, ...soloAb].map(p => p.provincia).sort()), ns.provs.map(p => p.p).join(', '));
    check(P + '2. círculo oliva de radio 3 + 1,1 × √botellas, en la línea y a su latitud',
      conGuarda.every(p => { const g = ns.provs.find(x => x.p === p.provincia); return g && !g.gris && g.fill === OLIVA && Math.abs(g.r - (3 + 1.1 * Math.sqrt(p.enGuarda))) < 0.01 && Math.abs(g.cy - (22 + (LAT[p.provincia] - 24) * 14)) < 0.01; }),
      ns.provs.map(g => `${g.p} r${g.r} cy${g.cy}`).join(' | '));
    check(P + '2. Mendoza ≈ 22 de radio', (() => { const m = ns.provs.find(x => x.p === 'Mendoza'); return !m || Math.abs(m.r - 22.3) < 0.5; })());
    check(P + '2. los rótulos son HTML (ningún <text> de provincia en el SVG) y están en pantalla',
      ns.textosSvg === 0 && ns.provs.every(g => g.esHtml && g.enPantalla), `svg text: ${ns.textosSvg}`);
    check(P + '2. rótulos en columna: nombres alineados a la izquierda, números a la derecha, mismo renglón',
      (() => { const a = ns.provs; const lefts = a.map(g => Math.round(g.nombreL)); const rights = a.filter(g => g.numR != null).map(g => Math.round(g.numR));
        return new Set(lefts).size === 1 && new Set(rights).size === 1 && a.filter(g => g.numCy != null).every(g => Math.abs(g.nombreCy - g.numCy) < 2.5); })(),
      ns.provs.map(g => `${g.p} ${Math.round(g.nombreL)}/${Math.round(g.numR ?? 0)}`).join(' · '));
    check(P + '2. rótulo "Provincia N" con nombre y número de cada provincia con botellas',
      conGuarda.every(p => { const g = ns.provs.find(x => x.p === p.provincia); return g && g.rotulo === p.provincia && g.num === nf(p.enGuarda) && g.boton; }), ns.provs.map(g => `${g.rotulo}|${g.num}`).join(' · '));
    check(P + '2. posición vertical = 22 + (latitud − 24) × 14 escalada al alto real (con corrimiento de 20 unidades entre rótulos)',
      (() => { const k = ns.provs[0].wrapH / 330; const orden = [...ns.provs].sort((a, b) => LAT[a.p] - LAT[b.p]); let prev = -Infinity;
        return orden.every(g => { const y = 22 + (LAT[g.p] - 24) * 14; const ly = Math.max(y, prev + 20); prev = ly; return Math.abs((g.nombreCy - g.wrapT) - ly * k) < 2.5; }); })(),
      ns.provs.map(g => `${g.p} ${Math.round(g.nombreCy - g.wrapT)}`).join(' · '));
    check(P + '2. nombre y número visibles (con ancho) en cada provincia con botellas; número en serif oliva',
      conGuarda.every(p => { const g = ns.provs.find(x => x.p === p.provincia); return g && g.nombreW > 8 && g.nombreH > 6 && g.numW > 4 && g.nFill === OLIVA && /Fraunces/.test(g.nFont); }),
      ns.provs.map(g => `${g.p} ${Math.round(g.nombreW)}/${Math.round(g.numW ?? 0)}`).join(' · '));
    check(P + '2. del círculo al rótulo, una rayita fina #CDBF9F', ns.provs.every(g => g.rayita === 'rgb(205, 191, 159)'), ns.provs.map(g => g.rayita).join(','));
    check(P + '2. provincias sólo con abiertas: punto gris #CFC6B0 de radio 3,5 y nombre en gris',
      soloAb.every(p => { const g = ns.provs.find(x => x.p === p.provincia); return g && g.gris && g.r === 3.5 && g.fill === GRIS_PUNTO && g.rotulo === p.provincia && g.rotFill !== OLIVA && !g.boton && g.num === ''; }),
      ns.provs.filter(g => g.gris).map(g => `${g.p} ${g.fill}`).join(' | '));
    check(P + '2. la cordillera: ningún rótulo pisado (provincias, latitudes y círculos)', v.cordillera.pisos.length === 0, v.cordillera.pisos.join(' | '));
    if (vp.esc) check(P + '2. escritorio: "De norte a sur" y "Del mundo" lado a lado (50/50)', !E.verGuarda && !E.verProbados ? true : (v.mundo && Math.abs(v.norteR.t - v.mundo.r.t) < 2 && Math.abs(v.norteR.w - v.mundo.r.w) < 3 && v.mundo.r.l >= v.norteR.r),
      JSON.stringify({ n: v.norteR, m: v.mundo?.r }));
    else check(P + '2. celular: apiladas', !v.mundo || v.mundo.r.t >= v.norteR.b - 1, JSON.stringify({ n: v.norteR.b, m: v.mundo?.r.t }));

    // 2b. Del mundo
    if (E.verGuarda || E.verProbados) {
      check(P + '2. Del mundo: bloque "En guarda" sólo con 1+ importada', !!v.mundo.guarda === E.verGuarda);
      check(P + '2. Del mundo: sin barras ni pistas', [v.mundo.guarda, v.mundo.probados].filter(Boolean).every(b => b.barras === 0));
      if (E.verGuarda) {
        const g = v.mundo.guarda;
        check(P + '2. En guarda: "EN GUARDA · n" y debajo "País n" en serif oliva', g.t === `En guarda · ${nf(E.impGuarda.reduce((s, p) => s + p.enGuarda, 0))}`
          && same(g.items.map(f => [f.p, f.n]), E.impGuarda.map(p => [p.pais, nf(p.enGuarda)])) && g.items.every(f => f.color === OLIVA && f.serif), JSON.stringify(g.items.map(f => f.p + f.n)));
        check(P + '2. En guarda: cada "País n" en un solo renglón', g.items.every(f => f.lin === 1));
      }
      check(P + '2. Del mundo: bloque "Probados" sólo con 5+ importadas abiertas', !!v.mundo.probados === E.verProbados);
      if (E.verProbados) {
        const p = v.mundo.probados;
        const top5 = E.impAb.slice(0, 5).map(x => [x.pais, nf(x.abiertas)]);
        check(P + '2. Probados: título con abiertas y países, top 5 en serif carbón',
          p.t === `Probados · ${nf(E.abImp)} ${pl(E.abImp, 'abierta', 'abiertas')} de ${nf(E.impAb.length)} países` && same(p.items.map(f => [f.p, f.n]), top5) && p.items.every(f => f.color === ABIERTAS_GRIS && f.serif), `${p.t} | ${p.items.map(f => f.p + f.n).join(', ')}`);
        check(P + '2. Probados: "y N países más con K (nombres)"', E.otros.length === 0 ? !p.resto : (/^y \d+ países? más/.test(p.resto) && E.otros.every(o => p.resto.includes(o.pais))), p.resto);
        check(P + '2. Probados: cada "País n" en un solo renglón (el renglón sólo se corta entre países)', p.items.every(f => f.lin === 1));
      }
    } else check(P + '2. sin importados no aparece "Del mundo"', !v.mundo);

    // 3a. Las regiones
    const R = v.regiones;
    check(P + '3. Las regiones: filas = hasta 10 con 3+ botellas (agrupadas), nombre · barra oliva · botellas · %',
      same(R.items.filter(i => i.region).map(i => [i.region, i.n, i.pct]).sort(), E.filasReg.map(r => [r.region, nf(r.botellas), pctTxtN(r.botellas, E.total)]).sort()) && R.items.filter(i => i.region).every(i => i.bg === OLIVA),
      R.items.filter(i => i.region).map(i => `${i.rot} ${i.n} ${i.pct}`).join(' | '));
    const grupos = R.items.filter(i => i.grupo).map(i => i.grupo);
    if (E.regs.length >= 3) {
      const esperadoG = []; for (const r of E.filasReg) { const g = E.grupoDe(r); if (!esperadoG.includes(g)) esperadoG.push(g); }
      check(P + '3. agrupadas por provincia (rótulo en mayúsculas), Patagonia junta Neuquén/Río Negro/Chubut, DEL MUNDO al final',
        same([...grupos].sort(), [...esperadoG].sort()) && (!grupos.includes('DEL MUNDO') || grupos[grupos.length - 1] === 'DEL MUNDO'), grupos.join(' | '));
      check(P + '3. cada región cae en el grupo de su provincia', (() => {
        let g = null; const ok = [];
        for (const i of R.items) { if (i.grupo) g = i.grupo; else { const r = E.regs.find(x => x.region === i.region); ok.push(E.grupoDe(r) === g); } }
        return ok.every(Boolean);
      })());
    } else check(P + '3. con menos de 3 regiones, sin rótulos de grupo', grupos.length === 0, grupos.join(','));
    check(P + '3. regiones de otros países con el país entre paréntesis', E.filasReg.filter(r => r.pais !== 'Argentina').every(r => R.items.some(i => i.rot === `${r.region} (${r.pais})`)));
    const restoB = E.resto.reduce((s, r) => s + r.botellas, 0);
    check(P + '3. cierre "y N regiones más · B botellas"', E.resto.length === 0 ? !R.resto : R.resto === `y ${nf(E.resto.length)} ${pl(E.resto.length, 'región más', 'regiones más')} · ${nf(restoB)} ${pl(restoB, 'botella', 'botellas')}`, R.resto);

    // 3b. Las bodegas
    if (E.verBodegas) {
      const B = v.bodegas;
      const nombreReg = b => { const r = E.regs.find(x => x.region === b.region && x.bodegas.some(y => y.bodega === b.bodega)) ?? E.regs.find(x => x.region === b.region); return r && r.pais !== 'Argentina' ? `${r.region} (${r.pais})` : b.region; };
      const subE = b => (b.region ? `${nombreReg(b)}${b.otrasRegiones ? ` +${nf(b.otrasRegiones)}` : ''}` : '');
      check(P + '3. Las bodegas: top 10 numerado (sin barras): puesto · nombre y debajo su región · botellas',
        same(B.filas.map(f => [f.pos, f.b, f.reg, f.n]), E.bods.slice(0, 10).map((b, i) => [nf(i + 1), b.bodega, subE(b), nf(b.botellas)])) && B.filas.every(f => f.barras === 0),
        B.filas.map(f => `${f.pos} ${f.b} / ${f.reg} / ${f.n}`).slice(0, 3).join(' | '));
      const extB = E.bods.slice(0, 10).filter(b => E.regs.some(r => r.region === b.region && r.pais !== 'Argentina' && r.bodegas.some(y => y.bodega === b.bodega)));
      check(P + '3. toda región fuera de Argentina sale con su país en las dos tarjetas ("Rioja (España)")',
        extB.every(b => B.filas.find(f => f.b === b.bodega).reg.startsWith(nombreReg(b)) && /(.+)/.test(nombreReg(b))) && E.regs.filter(r => r.pais !== 'Argentina').slice(0, 3).every(r => !E.filasReg.includes(r) || v.regiones.items.some(i => i.rot === `${r.region} (${r.pais})`)),
        extB.map(b => B.filas.find(f => f.b === b.bodega).reg).join(' | '));
      check(P + '3. la región va debajo del nombre, en gris chico (celular y escritorio)', B.filas.every(f => f.regY == null || f.regY >= f.nomY - 3) && B.filas.every(f => f.regColor === 'rgb(138, 111, 99)'));
      check(P + '3. subtítulo "N en guarda · tocá una para ver sus etiquetas"', B.titulo.includes(`${nf(E.bods.length)} en guarda`) && B.titulo.includes('tocá una para ver sus etiquetas'), B.titulo);
      const rest = E.bods.slice(10), una = rest.filter(b => b.botellas === 1).length;
      const esp = rest.length ? `${nf(rest.length)} ${pl(rest.length, 'bodega más', 'bodegas más')}${una ? ` · ${nf(una)} con una sola botella` : ''}` : '';
      check(P + '3. cierre "N bodegas más · K con una sola botella" y, debajo, "Ver las T"', B.resto === esp && (rest.length === 0 || B.ver === `Ver las ${nf(E.bods.length)}`), `"${B.resto}" / "${B.ver}" vs "${esp}"`);
    } else check(P + '3. con menos de 3 bodegas no aparece Las bodegas', !v.bodegas);
    if (vp.esc && v.regiones && v.bodegas) check(P + '3. escritorio: regiones y bodegas lado a lado (50/50) y del mismo alto (±2 px)', Math.abs(v.regiones.r.t - v.bodegas.r.t) < 2 && Math.abs(v.regiones.r.w - v.bodegas.r.w) < 3 && v.bodegas.r.l >= v.regiones.r.r && Math.abs(v.regiones.r.h - v.bodegas.r.h) <= 2, `${v.regiones.r.h} vs ${v.bodegas.r.h}`);
    if (!vp.esc && v.regiones && v.bodegas) check(P + '3. celular: apiladas', v.bodegas.r.t >= v.regiones.r.b - 1);

    // 4. espejo
    check(P + '4. el espejo sólo aparece con 5+ abiertas y 2+ filas', !!v.espejo === E.verEspejo);
    if (v.espejo) {
      const esperadoE = E.G.espejo.regiones.map(r => [r.region, nf(r.ab), nf(r.gu), `${nf(Math.round(r.gu / (r.gu + r.ab) * 100))}%`]);
      const imp = E.G.espejo.importados;
      if (imp.gu + imp.ab > 0) esperadoE.push(['Importados', nf(imp.ab), nf(imp.gu), `${nf(Math.round(imp.gu / (imp.gu + imp.ab) * 100))}%`]);
      check(P + '4. filas = regiones argentinas de 10+ (máx. 8) e Importados al final, con % en todas', same(v.espejo.filas.map(f => [f.r, f.ab, f.gu, f.pct]), esperadoE), v.espejo.filas.map(f => `${f.r} ${f.ab}/${f.gu} ${f.pct}`).join(' | '));
      const ult = v.espejo.filas[v.espejo.filas.length - 1];
      check(P + '4. Importados en negrita y separado con raya', ult.r === 'Importados' ? ult.negrita && ult.raya !== '0px' : true);
      check(P + '4. abiertas en carbón, guarda en oliva', v.espejo.filas.every(f => f.bgAb === ABIERTAS_GRIS && f.bgGu === OLIVA));
      check(P + '4. a todo el ancho', v.espejo.w >= v.espejo.wrap - 2, `${v.espejo.w} vs ${v.espejo.wrap}`);
      check(P + '4. título "¿Se guarda o se toma?" · por región', v.espejo.titulo.startsWith('¿Se guarda o se toma?') && v.espejo.titulo.includes('por región'), v.espejo.titulo);
    }

    // 5. reglas de layout
    check(P + '5. ningún rótulo, número o % en dos renglones', v.partidos.length === 0, v.partidos.slice(0, 5).join(' | '));
    check(P + '5. ningún texto recortado con "…"', v.recortados.length === 0, v.recortados.slice(0, 5).join(' | '));
    check(P + '5. nada superpuesto y sin scroll horizontal', v.pisados.length === 0 && v.scroll.s <= v.scroll.i, v.pisados.slice(0, 4).join(' | ') + ` scroll ${v.scroll.s}/${v.scroll.i}`);
    check(P + '5. ninguna caja vacía', v.kpisVacios === 0);

    if (!vp.esc && v.barras) {
      const mx = Math.max(...v.barras.pistas.map(p => p.bw));
      check(P + '3. celular: la barra más larga de regiones ocupa ≥ 85% de la tarjeta', mx / v.barras.card >= 0.85, `${Math.round(mx)} de ${Math.round(v.barras.card)} (${Math.round(mx / v.barras.card * 100)}%)`);
      check(P + '3. celular: pista de 12 px de alto con radio 3 y color #E6DCC4', v.barras.pistas.every(p => Math.round(p.h) === 12 && Math.round(p.bh) === 12 && p.rad === '3px' && p.bg === FONDO_ON), JSON.stringify(v.barras.pistas[0]));
      check(P + '3. celular: cada fila en dos renglones (nombre arriba, barra debajo, a todo el ancho de la fila)', v.barras.filas.every(r => r.pista > r.rot + 8 && Math.abs(r.pistaL - r.fL - 6) < 8 || Math.abs(r.pistaR - r.fR) < 8), JSON.stringify(v.barras.filas[0]));
    }
    if (vp.esc && v.barras) check(P + '3. escritorio: las barras de regiones tienen pista de fondo #E6DCC4', v.barras.pistas.length > 0 && v.barras.pistas.every(p => p.bg === FONDO_ON), JSON.stringify(v.barras.pistas[0]));
    if (vp.esc && v.mundo) check(P + '2. escritorio: "De norte a sur" y "Del mundo" del mismo alto (±2 px)', Math.abs(v.norteR.h - v.mundo.r.h) <= 2, `${v.norteR.h} vs ${v.mundo.r.h}`);
    if (v.barrasBod?.pie?.verT != null) check(P + '4. pie: "N bodegas más · K con una sola botella" en un renglón y "Ver las T…" en uno propio debajo', v.barrasBod.pie.restoLineas === 1 && v.barrasBod.pie.verT >= v.barrasBod.pie.resto - 1, JSON.stringify(v.barrasBod.pie));
    check(P + '1. ninguna región con espacios dobles ni palabras cortadas en pantalla', v.regionesTodas.every(n => !/\s{2,}/.test(n) && n === n.trim() && !cortada(n)), v.regionesTodas.filter(n => /\s{2,}/.test(n) || n !== n.trim() || cortada(n)).join(' | ') + ' · ' + [...new Set(v.regionesTodas)].join(' | '));
    // 6. tocar una región filtra "Las bodegas" (no hay panel de región)
    const LEER_BOD = () => {
      const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const c = document.querySelector('.geo-bodegas');
      const r = e => e.getBoundingClientRect();
      return {
        filtro: c.dataset.filtro, titulo: txt(c.querySelector('h3')), sub: txt(c.querySelector('.gb-sub')),
        x: !!c.querySelector('.geo-x'), filas: [...c.querySelectorAll('.gb-fila')].map(f => ({ b: f.dataset.bodega, n: txt(f.querySelector('.gb-bot')), reg: txt(f.querySelector('.gb-reg')), barras: f.querySelectorAll('.tr-barra, .tr-pista').length })),
        resto: txt(c.querySelector('.gr-resto')), ver: txt(c.querySelector('.gb-ver')),
        hRegiones: r(document.querySelector('.geo-regiones')).height, hBodegas: r(c).height,
        paneles: document.querySelectorAll('.det-panel').length, lista: !!document.querySelector('.geo-lista'),
        top: r(c).top, vh: innerHeight,
      };
    };
    const LEER_LISTA = () => {
      const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const l = document.querySelector('.geo-lista'); if (!l) return null;
      const r = e => e.getBoundingClientRect();
      const items = [...l.querySelectorAll('.lc-item')];
      return { titulo: txt(l.querySelector('h3')), n: items.length, cols: new Set(items.map(e => Math.round(r(e).left))).size, barras: l.querySelectorAll('.tr-barra').length,
        filas: items.map(e => [txt(e.querySelector('.lc-vino')), txt(e.querySelector('.lc-dato'))]), w: r(l).width, t: r(l).top + scrollY, b: r(l).bottom + scrollY,
        x: !!l.querySelector('.geo-x'), paneles: document.querySelectorAll('.det-panel').length };
    };
    const docY = sel => page.evaluate(s => { const e = document.querySelector(s); const r = e.getBoundingClientRect(); return { t: r.top + scrollY, b: r.bottom + scrollY }; }, sel);
    const regTop = E.regs[0];
    const subE = (lg) => `${nf(lg.botellas)} ${pl(lg.botellas, 'botella', 'botellas')} · ${pctTxtN(lg.botellas, E.total)} · ${nf(lg.iconos)} ${pl(lg.iconos, 'ícono', 'íconos')}` + (lg.vivino != null ? ` · Vivino ${nf(lg.vivino, 2)}` : '');
    await page.locator(`.geo-regiones .tr-fila[data-region="${regTop.region}"]`).click();
    await page.waitForTimeout(700);
    const f1 = await page.evaluate(LEER_BOD);
    check(P + '6. tocar Valle de Uco: la tarjeta dice "Bodegas de Valle de Uco" y no se abre ningún panel', f1.titulo.startsWith(`Bodegas de ${regTop.region}`) && f1.paneles === 0 && f1.filtro === regTop.region, `${f1.titulo} · paneles ${f1.paneles}`);
    check(P + '6. subtítulo "N botellas · P% · I íconos · Vivino V"', f1.sub === subE(regTop), `"${f1.sub}" vs "${subE(regTop)}"`);
    check(P + '6. hay una × arriba a la derecha', f1.x);
    check(P + '6. mismas filas (nombre · barra oliva · botellas), sin región debajo, máx. 10',
      same(f1.filas.map(f => [f.b, f.n]), regTop.bodegas.slice(0, 10).map(b => [b.bodega, nf(b.botellas)])) && f1.filas.every(f => f.reg === '' && f.barras === 0) && f1.filas.length <= 10, f1.filas.map(f => f.b + f.n).join(' | '));
    check(P + '6. la suma de las botellas de sus bodegas da las de la región', regTop.bodegas.reduce((s, b) => s + b.botellas, 0) === regTop.botellas);
    const restoR = regTop.bodegas.slice(10), unaR = restoR.filter(b => b.botellas === 1).length;
    check(P + '6. cierre "N bodegas más · K con una sola botella · Ver las T de Valle de Uco"',
      f1.resto === `${nf(restoR.length)} ${pl(restoR.length, 'bodega más', 'bodegas más')}${unaR ? ` · ${nf(unaR)} con una sola botella` : ''}` && f1.ver === `Ver las ${nf(regTop.bodegas.length)} de ${regTop.region}`, `${f1.resto} / ${f1.ver}`);
    const on = await page.evaluate(() => { const e = document.querySelector('.geo-regiones .tr-fila.on'); return e ? getComputedStyle(e).backgroundColor : null; });
    check(P + '6. la región tocada se marca con fondo #E6DCC4', on === FONDO_ON, String(on));
    if (vp.esc) check(P + '6. escritorio: las tarjetas de regiones y bodegas del mismo alto (±2 px)', Math.abs(f1.hRegiones - f1.hBodegas) <= 2, `${f1.hRegiones} vs ${f1.hBodegas}`);
    else check(P + '6. celular: scroll suave hasta la tarjeta de bodegas filtrada', f1.top >= -2 && f1.top < f1.vh * 0.5, `top ${Math.round(f1.top)} de ${f1.vh}`);
    const v2 = await page.evaluate(LEER);
    check(P + '6. filtrado: nada en dos renglones, recortado ni pisado', v2.partidos.length === 0 && v2.pisados.length === 0 && v2.recortados.length === 0, [...v2.partidos, ...v2.pisados, ...v2.recortados].slice(0, 4).join(' | '));

    // la lista completa de la región
    await page.locator('.gb-ver').click();
    await page.waitForTimeout(500);
    const l1 = await page.evaluate(LEER_LISTA);
    check(P + '6. "Ver las T de Valle de Uco": lista debajo, "Las T bodegas de Valle de Uco", con ×, sin barras',
      l1 && l1.titulo.startsWith(`Las ${nf(regTop.bodegas.length)} bodegas de ${regTop.region}`) && l1.x && l1.barras === 0 && l1.n === regTop.bodegas.length, JSON.stringify({ t: l1?.titulo, n: l1?.n }));
    check(P + '6. filas "nombre · N bot." ordenadas por botellas', l1 && same(l1.filas, regTop.bodegas.map(b => [b.bodega, `${nf(b.botellas)} bot.`])));
    check(P + (vp.esc ? '6. escritorio: 3 columnas' : '6. celular: 1 columna'), l1 && l1.cols === (vp.esc ? 3 : 1), `${l1?.cols}`);
    const cb = await docY('.geo-bodegas');
    const cr = await docY('.geo-regiones');
    if (vp.esc) check(P + '6. escritorio: la lista va debajo de las dos tarjetas, a todo el ancho', l1.t >= Math.max(cb.b, cr.b) - 1 && l1.w >= v.regiones.r.w * 1.9, JSON.stringify({ l: l1.t, cb: cb.b, cr: cr.b, w: l1.w }));
    else check(P + '6. celular: la lista va debajo de la tarjeta de bodegas', l1.t >= cb.b - 1);
    // tocar una de esas bodegas abre su panel en el mismo lugar y cierra la lista
    const bodTop = regTop.bodegas[0].bodega;
    const bodE = E.bods.find(b => b.bodega === bodTop);
    await page.locator('.geo-lista .lc-fila').first().click();
    await page.waitForTimeout(600);
    const bp = await page.evaluate(LEER_PANEL);
    const l2 = await page.evaluate(LEER_LISTA);
    check(P + '6. tocar una bodega de la lista abre su panel y cierra la lista', bp.hay && bp.titulo === bodTop && !l2, JSON.stringify({ t: bp.titulo, lista: !!l2 }));
    check(P + '6. panel de bodega: Botellas · Etiquetas · Íconos · Vivino promedio',
      same(bp.cajas.map(c => c.n), [nf(bodE.botellas), nf(bodE.etiquetas.length), nf(bodE.iconos), ...(bodE.vivino != null ? [nf(bodE.vivino, 2)] : [])]) && bp.cajas[1].l.startsWith('Etiqueta'), JSON.stringify(bp.cajas.map(c => c.n + c.l)));
    const regDe = E.regs.find(r => r.region === bodE.region && r.bodegas.some(b => b.bodega === bodE.bodega)) ?? E.regs.find(r => r.region === bodE.region);
    check(P + '6. subtítulo del panel: región principal (con país) (+N)', bp.sub === `${regDe.pais !== 'Argentina' ? `${regDe.region} (${regDe.pais})` : regDe.region}${bodE.otrasRegiones ? ` +${bodE.otrasRegiones}` : ''}`, bp.sub);
    check(P + '6. etiquetas agrupadas por vino ("2017 ×2 · 2018 ×1") con su Vivino',
      bp.filas.length > 0 && bp.filas.every(f => /×\d/.test(f.an) && (f.d === '—' || /^\d,\d$/.test(f.d))), bp.filas.slice(0, 3).map(f => `${f.v} ${f.an} ${f.d}`).join(' | '));
    check(P + '6. panel de bodega: borde oliva, serif', bp.borde === OLIVA && /Fraunces/.test(bp.tFont));
    const pb = await docY('.det-panel');
    const cb2 = await docY('.geo-bodegas'), cr2 = await docY('.geo-regiones');
    if (vp.esc) check(P + '6. escritorio: el panel va debajo de las dos tarjetas, a todo el ancho', pb.t >= Math.max(cb2.b, cr2.b) - 1 && bp.r.w >= v.regiones.r.w * 1.9, JSON.stringify({ p: pb, cb: cb2.b, cr: cr2.b }));
    else check(P + '6. celular: el panel va debajo de la tarjeta de bodegas', pb.t >= cb2.b - 1);
    // la lista y el panel no se muestran a la vez
    await page.locator('.gb-ver').click();
    await page.waitForTimeout(400);
    const l3 = await page.evaluate(LEER_LISTA);
    check(P + '6. abrir la lista cierra el panel de la bodega', !!l3 && l3.paneles === 0);
    await page.locator('.geo-lista .geo-x').click();
    check(P + '6. la × de la lista la cierra', await page.locator('.geo-lista').count() === 0);
    // volver
    await page.locator('.geo-bodegas .geo-x').click();
    await page.waitForTimeout(300);
    const f0 = await page.evaluate(LEER_BOD);
    check(P + '6. la × vuelve a "Las bodegas" con todas', f0.filtro === '' && f0.titulo.startsWith('Las bodegas') && f0.titulo.includes(`${nf(E.bods.length)} en guarda`), f0.titulo);
    check(P + '6. sin región marcada al volver', await page.locator('.geo-regiones .tr-fila.on').count() === 0);
    // tocar de nuevo la misma región lo deja y tocarla otra vez lo saca; tocar otra cambia el filtro
    await page.locator(`.geo-regiones .tr-fila[data-region="${regTop.region}"]`).click();
    await page.locator(`.geo-regiones .tr-fila[data-region="${regTop.region}"]`).click();
    check(P + '6. tocar la misma región otra vez vuelve a todas las bodegas', (await page.evaluate(LEER_BOD)).filtro === '');
    const otra = E.regs[1];
    await page.locator(`.geo-regiones .tr-fila[data-region="${regTop.region}"]`).click();
    await page.locator(`.geo-regiones .tr-fila[data-region="${otra.region}"]`).click();
    const fo = await page.evaluate(LEER_BOD);
    check(P + '6. tocar otra región cambia el filtro', fo.filtro === otra.region && fo.titulo.startsWith(`Bodegas de ${otra.region}`), fo.titulo);
    await page.locator('.geo-bodegas .geo-x').click();

    // región chica (1 bodega): una fila y sin link
    const unaB = [...E.regs].reverse().find(r => r.bodegas.length === 1 && r.botellas >= 3);
    const trev = E.regs.find(r => r.region === 'Trevelin' && r.bodegas.length === 1) ?? unaB;
    if (trev) {
      await page.locator(`.geo-regiones .tr-fila[data-region="${trev.region}"]`).click();
      await page.waitForTimeout(500);
      const ft = await page.evaluate(LEER_BOD);
      check(P + `6. ${trev.region} (1 bodega): una fila y sin link`, ft.filas.length === 1 && !ft.ver && !ft.resto, JSON.stringify({ f: ft.filas.length, v: ft.ver }));
      await page.locator('.geo-bodegas .geo-x').click();
    }

    // la cordillera filtra igual, por provincia
    const provTop = conGuarda[0];
    await page.locator(`.ns-prov[data-prov="${provTop.provincia}"]`).click();
    await page.waitForTimeout(700);
    const fp = await page.evaluate(LEER_BOD);
    check(P + `6. tocar ${provTop.provincia} en la cordillera: "Bodegas de ${provTop.provincia}", sin panel`, fp.titulo.startsWith(`Bodegas de ${provTop.provincia}`) && fp.paneles === 0, `${fp.titulo} · ${fp.paneles}`);
    check(P + '6. subtítulo de la provincia con sus datos', fp.sub === subE({ botellas: provTop.enGuarda, iconos: provTop.iconos, vivino: provTop.vivino }), `"${fp.sub}"`);
    const marcada = await page.evaluate(p => { const c = document.querySelector(`.ns-prov[data-prov="${p}"] circle`); const s = getComputedStyle(c); return [s.stroke, s.strokeWidth]; }, provTop.provincia);
    check(P + '6. la provincia tocada se marca con borde oscuro #2A1A1E de 2 px', marcada[0] === 'rgb(42, 26, 30)' && marcada[1] === '2px', marcada.join(' '));
    check(P + '6. la provincia suma sus botellas', provTop.bodegas.reduce((s, b) => s + b.botellas, 0) === provTop.enGuarda);
    await page.locator(`.ns-prov[data-prov="${provTop.provincia}"]`).click();
    check(P + '6. tocar la misma provincia vuelve a todas las bodegas', (await page.evaluate(LEER_BOD)).filtro === '');
    if (soloAb.length) {
      await page.locator(`.ns-prov[data-prov="${soloAb[0].provincia}"]`).click({ force: true });
      await page.waitForTimeout(150);
      check(P + '6. una provincia gris (sólo abiertas) no filtra nada', (await page.evaluate(LEER_BOD)).filtro === '');
    }
    // lista completa general
    await page.locator('.gb-ver').click();
    await page.waitForTimeout(400);
    const lg = await page.evaluate(LEER_LISTA);
    check(P + '6. "Ver las T": todas las bodegas, título "Las T bodegas", ' + (vp.esc ? '3 columnas' : '1 columna'),
      lg && lg.n === E.bods.length && lg.titulo.startsWith(`Las ${nf(E.bods.length)} bodegas`) && lg.cols === (vp.esc ? 3 : 1) && lg.barras === 0, JSON.stringify({ n: lg?.n, c: lg?.cols, t: lg?.titulo }));
    check(P + '6. la lista completa suma las botellas en guarda', lg && lg.filas.reduce((s, f) => s + num(f[1].replace(' bot.', '')), 0) === E.total);
    const lv = await page.evaluate(LEER);
    check(P + '6. con la lista abierta: nada en dos renglones, recortado ni pisado', lv.partidos.length === 0 && lv.pisados.length === 0 && lv.recortados.length === 0, [...lv.partidos, ...lv.pisados, ...lv.recortados].slice(0, 4).join(' | '));
    check(P + '6. nunca más de 10 filas en la tarjeta de bodegas', (await page.locator('.geo-bodegas .gb-fila').count()) <= 10);
    await page.locator('.geo-lista .geo-x').click();
    if (SHOTS && vp.esc) {
      mkdirSync(SHOTS, { recursive: true });
      await page.locator(`.geo-regiones .tr-fila[data-region="${regTop.region}"]`).click();
      await page.waitForTimeout(400);
      await page.locator('.geo-fila').nth(1).screenshot({ path: join(SHOTS, `${vp.file}-filtrado.png`) });
    }
    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      if (vp.esc) {
        await page.locator('.geo-hero').screenshot({ path: join(SHOTS, `${vp.file}-destacado.png`) });
        await page.locator('.geo-fila').first().screenshot({ path: join(SHOTS, `${vp.file}-norte-mundo.png`) });
      } else {
        await page.locator('.geo-norte').screenshot({ path: join(SHOTS, `${vp.file}-norte.png`) });
      }
    }
    await ctx.close();
    console.log('');
  }

  // ── Safari de iPhone 13 (WebKit, 390 px) ────────────────────────
  {
    console.log('── WebKit · iPhone 13 · 390 px ──');
    const P = '[webkit 390] ';
    const { browser: wk, ctx: wctx } = await abrirIphone();
    try {
      const wp = await wctx.newPage();
      const errs = [];
      wp.on('pageerror', e => errs.push(e.message));
      if (apiBody) await wp.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
      await wp.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await wp.waitForSelector('.geo-sec', { timeout: 30000 });
      await wp.waitForTimeout(1200);
      const vw = await wp.evaluate(LEER);
      const conG = E.G.provincias.filter(p => p.enGuarda > 0 && LAT[p.provincia]);
      check(P + 'cordillera: cada provincia con botellas tiene nombre y número visibles ("Salta 22", "Mendoza 308"…)',
        conG.every(p => { const g = vw.ns.provs.find(x => x.p === p.provincia); return g && g.rotulo === p.provincia && g.num === nf(p.enGuarda) && g.nombreW > 8 && g.numW > 4; }), vw.ns.provs.map(g => `${g.rotulo}|${g.num}|${Math.round(g.nombreW)}`).join(' · '));
      check(P + 'cordillera: ningún rótulo pisa a otro', vw.cordillera.pisos.length === 0, vw.cordillera.pisos.join(' | '));
      const lay = await reglaDeLayout(wp, {
        enUnaLinea: '.geo-sec .cepa-kpi b, .geo-sec .cepa-kpi span, .geo-sec .tr-rot, .geo-sec .tr-n, .geo-sec .tr-pct, .geo-sec .gb-n, .geo-sec .gb-bot, .geo-sec .gb-pos, .geo-sec .ns-rot, .geo-sec .ns-n, .geo-sec .gr-grupo, .geo-sec .gb-reg, .geo-sec .ae-rot, .geo-sec .ae-num, .geo-sec .ae-pct, .geo-sec .lc-vino, .geo-sec .lc-dato',
        sinRecortar: '.geo-sec .tr-rot, .geo-sec .gm-rot, .geo-sec .ae-rot, .geo-sec .cepa-kpi b',
        sinPisar: ['.geo-sec .tr-rot', '.geo-sec .tr-n', '.geo-sec .tr-pct', '.geo-sec .gm-rot', '.geo-sec .ae-rot', '.geo-sec .ae-num', '.geo-sec .ae-pct', '.geo-sec .cepa-kpi b'],
      });
      check(P + 'regla de layout (una línea, sin recortes, sin pisarse, sin scroll horizontal)', sinInfracciones(lay), textoInfracciones(lay));
      if (vw.barras) {
        const mx = Math.max(...vw.barras.pistas.map(p => p.bw));
        check(P + 'barras de regiones: la más larga ≥ 85% de la tarjeta y pista de 12 px', mx / vw.barras.card >= 0.85 && vw.barras.pistas.every(p => Math.round(p.h) === 12), `${Math.round(mx / vw.barras.card * 100)}%`);
      }
      await wp.locator('.geo-regiones .tr-fila').first().tap();
      await wp.waitForTimeout(900);
      const fw = await wp.evaluate(() => { const c = document.querySelector('.geo-bodegas'); return { filtro: c.dataset.filtro, filas: c.querySelectorAll('.gb-fila').length }; });
      check(P + 'tocar una región filtra las bodegas (máx. 10 filas)', fw.filtro !== '' && fw.filas <= 10 && fw.filas > 0, JSON.stringify(fw));
      const lay2 = await reglaDeLayout(wp, { enUnaLinea: '.geo-sec .tr-rot, .geo-sec .tr-n, .geo-sec .gb-reg, .geo-sec .gb-n, .geo-sec .gb-bot, .geo-sec .ns-rot, .geo-sec .ns-n', sinPisar: ['.geo-sec .tr-rot', '.geo-sec .tr-n', '.geo-sec .gb-n', '.geo-sec .gb-bot'] });
      check(P + 'filtrado: regla de layout', sinInfracciones(lay2), textoInfracciones(lay2));
      check(P + 'la página no tira errores', errs.length === 0, errs.slice(0, 2).join(' | '));
    } finally { await wk.close(); }
    console.log('');
  }

  // ── cava chica: 1 región, 1 bodega, sin importados ──────────────
  console.log('── cava chica (1 región, 1 bodega, sin importados) ──');
  const chicaTxt = cavaChica(apiTxt);
  for (const vp of VIEWPORTS) {
    const P = `[cava chica ${vp.w}] `;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p2 = await ctx.newPage();
    const errs = [];
    p2.on('pageerror', e => errs.push(e.message));
    await p2.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: chicaTxt }));
    await p2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p2.waitForSelector('.geo-sec', { timeout: 30000 });
    await p2.waitForTimeout(700);
    const vc = await p2.evaluate(LEER);
    check(P + 'destacado "1 región" · "1 bodega en 12 botellas"', vc.hero.num === '1 región' && vc.hero.text === '1 bodega en 12 botellas', `${vc.hero.num} | ${vc.hero.text}`);
    check(P + 'sin abiertas: quedan 2 cajas (sin "Países probados")', same(vc.cajas.map(c => c.id), ['paises-guarda', 'region-top']), vc.cajas.map(c => c.id).join(','));
    check(P + 'sin importados no aparece "Del mundo" y "De norte a sur" ocupa todo el ancho', !vc.mundo && vc.norteR.w >= 0.9 * (vp.w - 32), `${vc.norteR.w}`);
    check(P + 'una sola provincia (Mendoza) en el mapa', same(vc.ns.provs.map(p => p.p), ['Mendoza']));
    check(P + 'con menos de 3 bodegas no aparece "Las bodegas"', !vc.bodegas);
    check(P + 'con menos de 3 regiones: sin rótulos de grupo', vc.regiones && vc.regiones.items.every(i => !i.grupo) && vc.regiones.items.length === 1);
    check(P + 'sin abiertas no aparece el espejo', !vc.espejo);
    check(P + 'no sobra "y N regiones más"', !vc.regiones.resto);
    check(P + 'renglones, recortes y superposiciones bien', vc.partidos.length === 0 && vc.recortados.length === 0 && vc.pisados.length === 0 && vc.cordillera.pisos.length === 0 && vc.scroll.s <= vc.scroll.i,
      [...vc.partidos, ...vc.recortados, ...vc.pisados, ...vc.cordillera.pisos].slice(0, 4).join(' | '));
    await p2.locator('.geo-regiones .tr-fila').first().click();
    await p2.waitForTimeout(300);
    check(P + 'tocar la única región no abre ningún panel (y no hay tarjeta de bodegas que filtrar)', await p2.locator('.det-panel, .geo-lista').count() === 0 && await p2.locator('.geo-bodegas').count() === 0);
    check(P + 'la página no tira errores', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  console.log('');

  // ── referencia congelada del 24/10/2026 (sólo AVISO) ─────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1000 } });
    const pg = await ctx.newPage();
    if (apiBody) await pg.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    await pg.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await pg.waitForSelector('.geo-sec', { timeout: 30000 });
    await pg.waitForTimeout(700);
    const v = await pg.evaluate(LEER);
    aviso('ref. destacado', v.hero.num === REF.hero[0] && v.hero.text === REF.hero[1], `hoy ${v.hero.num} · ${v.hero.text}`);
    aviso('ref. cajas 4 · 11 · Valle de Uco', same(v.cajas.map(c => c.n), REF.cajas), v.cajas.map(c => c.n).join(' · '));
    for (const [p, n] of Object.entries(REF.provincias)) {
      const g = v.ns.provs.find(x => x.p === p);
      aviso(`ref. ${p} ${n}`, !!g && g.n === n, g ? `hoy ${g.n}` : 'no está');
    }
    aviso('ref. en gris La Rioja y Neuquén', same(v.ns.provs.filter(g => g.gris).map(g => g.p).sort(), [...REF.grises].sort()), v.ns.provs.filter(g => g.gris).map(g => g.p).join(', '));
    aviso('ref. En guarda: España 11 · EEUU 3 · Chile 1', same(v.mundo?.guarda?.items.map(f => [f.p, Number(f.n)]), REF.guarda), JSON.stringify(v.mundo?.guarda?.items.map(f => f.p + f.n)));
    aviso('ref. Probados: Francia 10 · España 9 · EEUU 6 · Italia 6 · Chile 5', same(v.mundo?.probados?.items.map(f => [f.p, Number(f.n)]), [['Francia', 10], ['España', 9], ['EEUU', 6], ['Italia', 6], ['Chile', 5]]), JSON.stringify(v.mundo?.probados?.items.map(f => f.p + f.n)));
    for (const [r, [ab, gu, pct]] of Object.entries(REF.espejo)) {
      const f = v.espejo?.filas.find(x => x.r === r);
      aviso(`ref. espejo ${r} ${ab}/${gu} ${pct}`, !!f && f.ab === nf(ab) && f.gu === nf(gu) && f.pct === pct, f ? `hoy ${f.ab}/${f.gu} ${f.pct}` : 'no está');
    }
    await pg.locator('.geo-regiones .tr-fila[data-region="Valle de Uco"]').click();
    await pg.waitForTimeout(600);
    const pn = await pg.evaluate(() => {
      const t = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const c = document.querySelector('.geo-bodegas');
      return { titulo: t(c.querySelector('h3')), sub: t(c.querySelector('.gb-sub')),
        filas: [...c.querySelectorAll('.gb-fila')].map(f => [f.dataset.bodega, t(f.querySelector('.gb-bot'))]) };
    });
    aviso('ref. Valle de Uco: "Bodegas de Valle de Uco" · 129 botellas · 34% · 53 íconos · Vivino 4,28', pn.titulo.startsWith('Bodegas de Valle de Uco') && pn.sub === '129 botellas · 34% · 53 íconos · Vivino 4,28', pn.sub);
    aviso('ref. Valle de Uco: Salentein 13, Trapiche 11, Cuvelier Los Andes 9, Viña Cobos 8, Finca Ambrosia 6',
      same(pn.filas.slice(0, 5), [['Salentein', '13'], ['Trapiche', '11'], ['Cuvelier Los Andes', '9'], ['Viña Cobos', '8'], ['Finca Ambrosia', '6']]),
      pn.filas.slice(0, 5).map(f => f.join(' ')).join(', '));
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}

function pctTxtN(n, total) {
  const p = n / total * 100;
  return p > 0 && p < 1 ? '<1%' : `${nf(Math.round(p))}%`;
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
