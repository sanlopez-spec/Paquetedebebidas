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
    const rot = [...svg.querySelectorAll('.ns-rot')].map(e => ({ n: txt(e), r: R(e) }));
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
        return { p: g.dataset.prov, gris: g.classList.contains('ns-gris'), r: Number(c.getAttribute('r')), cy: Number(c.getAttribute('cy')),
          fill: cs(c).fill, num: txt(g.querySelector('.ns-n')), n: g.dataset.bot ? Number(g.dataset.bot) : null, rotulo: txt(g.querySelector('.ns-rot')),
          rotFill: cs(g.querySelector('.ns-rot')).fill, nFill: g.querySelector('.ns-n') ? cs(g.querySelector('.ns-n')).fill : null,
          nFont: g.querySelector('.ns-n') ? cs(g.querySelector('.ns-n')).fontFamily : null, boton: g.getAttribute('role') === 'button' };
      }),
      marcas: [...svg.querySelectorAll('.ns-marca')].map(g => ({ t: txt(g.querySelector('text')), y: Number(g.querySelector('line').getAttribute('y1')), x: Number(g.querySelector('line').getAttribute('x2')) })),
      ancho: R(svg).w,
    } : null,
    cordillera,
    mundo: (() => {
      const m = document.querySelector('.geo-mundo'); if (!m) return null;
      const bloque = k => {
        const b = m.querySelector(`.gm-bloque[data-bloque="${k}"]`); if (!b) return null;
        return { t: txt(b.querySelector('.gm-t')), filas: [...b.querySelectorAll('.gm-fila')].map(f => ({ p: f.dataset.pais, n: txt(f.querySelector('.tr-n')), bg: cs(f.querySelector('.tr-barra')).backgroundColor, w: R(f.querySelector('.tr-barra')).w })),
          otros: txt(b.querySelector('.gm-otros')), otrosColor: b.querySelector('.gm-otros') ? cs(b.querySelector('.gm-otros')).color : null, otrosSize: b.querySelector('.gm-otros') ? parseFloat(cs(b.querySelector('.gm-otros')).fontSize) : null };
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
        filas: [...c.querySelectorAll('.gb-fila')].map(e => ({ b: e.dataset.bodega, reg: txt(e.querySelector('.gb-reg')), n: txt(e.querySelector('.tr-n')), bg: cs(e.querySelector('.tr-barra')).backgroundColor,
          regY: e.querySelector('.gb-reg') ? R(e.querySelector('.gb-reg')).t : null, nomY: R(e.querySelector('.tr-rot')).b, regColor: e.querySelector('.gb-reg') ? cs(e.querySelector('.gb-reg')).color : null })),
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
    check(P + '2. De norte a sur: viewBox 360×330 y cordillera gris #B9AE93 de 3 px en x=70', ns && ns.vb === '0 0 360 330' && ns.n && ns.n.x1 === '70' && ns.n.stroke === CORDILLERA && ns.n.sw === '3px', JSON.stringify(ns?.n));
    check(P + '2. marcas 25°S · 30°S · 35°S · 40°S a la izquierda, en su latitud',
      ns && same(ns.marcas.map(m => m.t), ['25°S', '30°S', '35°S', '40°S']) && ns.marcas.every(m => Math.abs(m.y - (18 + (Number(m.t.slice(0, 2)) - 24) * 14.2)) < 0.01 && m.x === 70), JSON.stringify(ns?.marcas));
    const conGuarda = E.G.provincias.filter(p => p.enGuarda > 0 && LAT[p.provincia]);
    const soloAb = E.G.provincias.filter(p => p.enGuarda === 0 && p.abiertas > 0 && LAT[p.provincia]);
    check(P + '2. una provincia por cada una con botellas en guarda o abiertas, ninguna vacía',
      same(ns.provs.map(p => p.p).sort(), [...conGuarda, ...soloAb].map(p => p.provincia).sort()), ns.provs.map(p => p.p).join(', '));
    check(P + '2. círculo oliva de radio 4 + 1,4 × √botellas, a su latitud',
      conGuarda.every(p => { const g = ns.provs.find(x => x.p === p.provincia); return g && !g.gris && g.fill === OLIVA && Math.abs(g.r - (4 + 1.4 * Math.sqrt(p.enGuarda))) < 0.01 && Math.abs(g.cy - (18 + (LAT[p.provincia] - 24) * 14.2)) < 0.01; }),
      ns.provs.map(g => `${g.p} r${g.r} cy${g.cy}`).join(' | '));
    check(P + '2. rótulo "Provincia N" con el número en serif oliva',
      conGuarda.every(p => { const g = ns.provs.find(x => x.p === p.provincia); return g && g.rotulo === `${p.provincia}${nf(p.enGuarda)}` && g.num === nf(p.enGuarda) && g.nFill === OLIVA && /Fraunces/.test(g.nFont); }),
      ns.provs.map(g => g.rotulo).join(' | '));
    check(P + '2. provincias sólo con abiertas: punto gris #CFC6B0 de radio 3,5 y nombre en gris',
      soloAb.every(p => { const g = ns.provs.find(x => x.p === p.provincia); return g && g.gris && g.r === 3.5 && g.fill === GRIS_PUNTO && g.rotulo === p.provincia && g.rotFill !== OLIVA && !g.boton; }),
      ns.provs.filter(g => g.gris).map(g => `${g.p} ${g.fill}`).join(' | '));
    check(P + '2. la cordillera: ningún rótulo pisado (provincias, latitudes y círculos)', v.cordillera.pisos.length === 0, v.cordillera.pisos.join(' | '));
    if (vp.esc) check(P + '2. escritorio: "De norte a sur" y "Del mundo" lado a lado (50/50)', !E.verGuarda && !E.verProbados ? true : (v.mundo && Math.abs(v.norteR.t - v.mundo.r.t) < 2 && Math.abs(v.norteR.w - v.mundo.r.w) < 3 && v.mundo.r.l >= v.norteR.r),
      JSON.stringify({ n: v.norteR, m: v.mundo?.r }));
    else check(P + '2. celular: apiladas', !v.mundo || v.mundo.r.t >= v.norteR.b - 1, JSON.stringify({ n: v.norteR.b, m: v.mundo?.r.t }));

    // 2b. Del mundo
    if (E.verGuarda || E.verProbados) {
      check(P + '2. Del mundo: bloque "En guarda" sólo con 1+ importada', !!v.mundo.guarda === E.verGuarda);
      if (E.verGuarda) {
        const g = v.mundo.guarda;
        check(P + '2. En guarda: "EN GUARDA · n" y barras oliva por país', g.t === `En guarda · ${nf(E.impGuarda.reduce((s, p) => s + p.enGuarda, 0))}`
          && same(g.filas.map(f => [f.p, f.n]), E.impGuarda.map(p => [p.pais, nf(p.enGuarda)])) && g.filas.every(f => f.bg === OLIVA), JSON.stringify(g.filas.map(f => f.p + f.n)));
      }
      check(P + '2. Del mundo: bloque "Probados" sólo con 5+ importadas abiertas', !!v.mundo.probados === E.verProbados);
      if (E.verProbados) {
        const p = v.mundo.probados;
        check(P + '2. Probados: título con abiertas y países, barras carbón, top 5 + "Otros"',
          p.t === `Probados · ${nf(E.abImp)} ${pl(E.abImp, 'abierta', 'abiertas')} de ${nf(E.impAb.length)} países`
          && same(p.filas.map(f => [f.p, f.n]), E.probados.map(([a, b]) => [a, nf(b)])) && p.filas.every(f => f.bg === ABIERTAS_GRIS), `${p.t} | ${p.filas.map(f => f.p + f.n).join(', ')}`);
        check(P + '2. Probados: debajo, en gris chico, los nombres de los otros', E.otros.length === 0 ? !p.otros : (E.otros.every(o => p.otros.includes(o.pais)) && p.otrosSize <= 11.5 && p.otrosColor === 'rgb(138, 111, 99)'), `${p.otros} ${p.otrosSize}`);
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
      const subE = b => (b.region ? `${b.region}${b.otrasRegiones ? ` +${nf(b.otrasRegiones)}` : ''}` : '');
      check(P + '3. Las bodegas: top 10 con su región principal (+N) debajo, barra oliva y botellas',
        same(B.filas.map(f => [f.b, f.reg, f.n]), E.bods.slice(0, 10).map(b => [b.bodega, subE(b), nf(b.botellas)])) && B.filas.every(f => f.bg === OLIVA),
        B.filas.map(f => `${f.b} / ${f.reg} / ${f.n}`).slice(0, 3).join(' | '));
      check(P + '3. la región va debajo del nombre, en gris chico', B.filas.every(f => f.regY == null || f.regY >= f.nomY - 3) && B.filas.every(f => f.regColor === 'rgb(138, 111, 99)'));
      check(P + '3. subtítulo "N en guarda · tocá una para ver sus etiquetas"', B.titulo.includes(`${nf(E.bods.length)} en guarda`) && B.titulo.includes('tocá una para ver sus etiquetas'), B.titulo);
      const rest = E.bods.slice(10), una = rest.filter(b => b.botellas === 1).length;
      const esp = rest.length ? `${nf(rest.length)} ${pl(rest.length, 'bodega más', 'bodegas más')}${una ? ` · ${nf(una)} con una sola botella` : ''} · Ver las ${nf(E.bods.length)}` : '';
      check(P + '3. cierre "N bodegas más · K con una sola botella · Ver las T"', B.resto === esp, `"${B.resto}" vs "${esp}"`);
    } else check(P + '3. con menos de 3 bodegas no aparece Las bodegas', !v.bodegas);
    if (vp.esc && v.regiones && v.bodegas) check(P + '3. escritorio: regiones y bodegas lado a lado (50/50)', Math.abs(v.regiones.r.t - v.bodegas.r.t) < 2 && Math.abs(v.regiones.r.w - v.bodegas.r.w) < 3 && v.bodegas.r.l >= v.regiones.r.r);
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

    // 6. paneles
    const regTop = E.regs[0];
    const cardReg = page.locator(`.geo-regiones .tr-fila[data-region="${regTop.region}"]`);
    await cardReg.click();
    await esperaPanel(page);
    const rp = await page.evaluate(LEER_PANEL);
    const boxesE = [`${nf(regTop.botellas)}`, `${nf(regTop.bodegas.length)}`, `${nf(regTop.iconos)}`];
    if (regTop.vivino != null) boxesE.push(nf(regTop.vivino, 2));
    check(P + '6. panel de región: título serif oliva, subtítulo gris con la provincia o país, ✕, borde oliva',
      rp.hay && rp.titulo === regTop.region && rp.sub === (regTop.pais === 'Argentina' ? regTop.provincia : regTop.pais) && /Fraunces/.test(rp.tFont) && rp.tColor === OLIVA && rp.borde === OLIVA && rp.x, JSON.stringify({ t: rp.titulo, s: rp.sub, c: rp.tColor, b: rp.borde }));
    check(P + '6. cajas: Botellas (con % de la cava) · Bodegas · Íconos · Vivino promedio',
      same(rp.cajas.map(c => c.n), boxesE) && rp.cajas[0].l === `Botellas · ${regTop.pct}% de la cava` && rp.cajas[1].l.startsWith('Bodega') && rp.cajas[2].l.startsWith('Ícono'), JSON.stringify(rp.cajas));
    if (vp.esc) check(P + '6. escritorio: las 4 cajas en fila', new Set(rp.cajas.map(c => c.y)).size === 1);
    else check(P + '6. celular: cajas 2×2', rp.cajas.length < 3 || (rp.cajas[0].y === rp.cajas[1].y && rp.cajas[2].y > rp.cajas[0].y));
    const bodsE = regTop.bodegas;
    check(P + '6. lista compacta de bodegas con "N bot.", hasta 8 filas', same(rp.filas.map(f => [f.v, f.d]), bodsE.slice(0, 8).map(b => [b.bodega, `${nf(b.botellas)} bot.`])), rp.filas.map(f => f.v + ' ' + f.d).join(' | '));
    check(P + '6. "Ver las N bodegas" sólo si hay más de 8', bodsE.length > 8 ? rp.ver === `Ver las ${nf(bodsE.length)} bodegas` : !rp.ver, rp.ver);
    if (vp.esc) {
      check(P + '6. escritorio: dos columnas si son 5 o más', bodsE.length >= 5 ? rp.columnas === 2 : rp.columnas === 1, `${rp.columnas} columnas`);
      check(P + '6. escritorio: el panel va debajo de las dos tarjetas, a todo el ancho',
        rp.r.t >= Math.max(v.regiones.r.b, v.bodegas.r.b) - 1 && rp.r.w >= v.regiones.r.w * 1.9, JSON.stringify({ p: rp.r, a: v.regiones.r.b, b: v.bodegas.r.b }));
    } else {
      check(P + '6. celular: una columna', rp.columnas === 1);
      check(P + '6. celular: el panel va debajo de la tarjeta tocada, antes de la otra', rp.r.t >= v.regiones.r.b - 1);
      const bT = await page.evaluate(() => document.querySelector('.geo-bodegas').getBoundingClientRect().top + scrollY);
      check(P + '6. celular: y la tarjeta de bodegas queda debajo del panel', bT >= rp.r.b - 1, `${bT} vs ${rp.r.b}`);
    }
    const on = await page.evaluate(() => { const e = document.querySelector('.geo-regiones .tr-fila.on'); return e ? getComputedStyle(e).backgroundColor : null; });
    check(P + '6. la región tocada se marca con fondo #E6DCC4', on === FONDO_ON, String(on));
    const v2 = await page.evaluate(LEER);
    check(P + '6. con el panel abierto: nada en dos renglones ni pisado', v2.partidos.length === 0 && v2.pisados.length === 0 && v2.recortados.length === 0, [...v2.partidos, ...v2.pisados, ...v2.recortados].slice(0, 4).join(' | '));
    if (SHOTS && vp.esc) {
      mkdirSync(SHOTS, { recursive: true });
      await page.locator('.geo-sec').screenshot({ path: join(SHOTS, `${vp.file}-regiones-panel.png`) });
    }
    // tocar una bodega abre su panel
    const bodTop = bodsE[0].bodega;
    const bodE = E.bods.find(b => b.bodega === bodTop);
    await page.locator('.det-panel .lc-fila').first().click();
    await page.waitForTimeout(500);
    const bp = await page.evaluate(LEER_PANEL);
    check(P + '6. tocar una bodega abre su panel: Botellas · Etiquetas · Íconos · Vivino promedio',
      bp.hay && bp.titulo === bodTop && same(bp.cajas.map(c => c.n), [nf(bodE.botellas), nf(bodE.etiquetas.length), nf(bodE.iconos), ...(bodE.vivino != null ? [nf(bodE.vivino, 2)] : [])])
      && bp.cajas[1].l.startsWith('Etiqueta'), JSON.stringify({ t: bp.titulo, c: bp.cajas.map(c => c.n + c.l) }));
    check(P + '6. subtítulo de la bodega: región principal (+N)', bp.sub === `${bodE.region}${bodE.otrasRegiones ? ` +${bodE.otrasRegiones}` : ''}`, bp.sub);
    check(P + '6. etiquetas agrupadas por vino ("2017 ×2 · 2018 ×1") con su Vivino',
      bp.filas.length > 0 && bp.filas.every(f => /×\d/.test(f.an) && (f.d === '—' || /^\d,\d$/.test(f.d))), bp.filas.slice(0, 3).map(f => `${f.v} ${f.an} ${f.d}`).join(' | '));
    check(P + '6. las botellas de la lista suman las de la caja', (() => {
      return bodE.etiquetas.reduce((s, e) => s + e.botellas, 0) === bodE.botellas;
    })());
    await page.locator('.det-x').click();
    check(P + '6. la ✕ cierra el panel', await page.locator('.det-panel').count() === 0);

    // provincia desde el mapa
    const provTop = conGuarda[0];
    await page.locator(`.ns-prov[data-prov="${provTop.provincia}"]`).click();
    await esperaPanel(page);
    const pp = await page.evaluate(LEER_PANEL);
    check(P + '6. tocar una provincia abre el mismo panel que una región',
      pp.hay && pp.titulo === provTop.provincia && pp.sub === 'Argentina' && pp.cajas[0].n === nf(provTop.enGuarda) && pp.cajas[0].l === `Botellas · ${provTop.pct}% de la cava` && pp.cajas[1].n === nf(provTop.bodegas.length),
      JSON.stringify({ t: pp.titulo, c: pp.cajas.map(c => c.n) }));
    if (vp.esc) check(P + '6. escritorio: el panel de la provincia va debajo de la fila de arriba, a todo el ancho', pp.r.t >= v.norteR.b - 1 && pp.r.w >= v.norteR.w * 1.9, JSON.stringify(pp.r));
    else {
      const mT = await page.evaluate(() => { const m = document.querySelector('.geo-mundo'); return m ? m.getBoundingClientRect().top + scrollY : null; });
      check(P + '6. celular: el panel de la provincia va debajo de "De norte a sur" y antes de "Del mundo"', pp.r.t >= v.norteR.b - 1 && (mT == null || mT >= pp.r.b - 1), JSON.stringify({ p: pp.r, n: v.norteR.b, m: mT }));
    }
    await page.locator(`.ns-prov[data-prov="${provTop.provincia}"]`).click();
    check(P + '6. tocar la misma provincia cierra el panel', await page.locator('.det-panel').count() === 0);
    if (soloAb.length) {
      await page.locator(`.ns-prov[data-prov="${soloAb[0].provincia}"]`).click({ force: true });
      await page.waitForTimeout(150);
      check(P + '6. una provincia gris (sólo abiertas) no abre nada', await page.locator('.det-panel').count() === 0);
    }
    // una región chica: sin link, una columna
    const chica = [...E.regs].reverse().find(r => r.bodegas.length <= 2);
    if (chica) {
      await page.locator(`.geo-regiones .tr-fila[data-region="${chica.region}"]`).click({ trial: false }).catch(() => {});
      if (await page.locator('.det-panel').count()) {
        await page.waitForTimeout(500);
        const cp = await page.evaluate(LEER_PANEL);
        check(P + '6. región con 1 o 2 bodegas: una columna, sin link, sólo lo que hay', cp.titulo === chica.region && cp.columnas === 1 && !cp.ver && cp.filas.length === chica.bodegas.length, JSON.stringify({ t: cp.titulo, f: cp.filas.length, c: cp.columnas, v: cp.ver }));
        await page.locator('.det-x').click();
      }
    }
    // "Ver las N bodegas" y "Ver las T" de la tarjeta
    if (E.verBodegas && E.bods.length > 10) {
      await page.locator('.gb-ver').click();
      check(P + '6. "Ver las T" despliega todas las bodegas', await page.locator('.geo-bodegas .gb-fila').count() === E.bods.length);
      await page.locator('.gb-ver').click();
      check(P + '6. "Ver menos" vuelve a las 10', await page.locator('.geo-bodegas .gb-fila').count() === 10);
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
    await esperaPanel(p2);
    const cp = await p2.evaluate(LEER_PANEL);
    check(P + 'panel de la única región: sin Vivino, íconos en 0, una bodega sin link, una columna',
      cp.titulo === 'Valle de Uco' && same(cp.cajas.map(c => c.n), ['12', '1', '0']) && !cp.ver && cp.columnas === 1 && cp.filas.length === 1, JSON.stringify({ c: cp.cajas.map(c => c.n), f: cp.filas.length }));
    await p2.locator('.det-panel .lc-fila').first().click();
    await p2.waitForTimeout(400);
    const bp = await p2.evaluate(LEER_PANEL);
    check(P + 'panel de la única bodega: Botellas 12 · Etiquetas 2 · Íconos 0, sin caja de Vivino', bp.titulo === 'Bodega de prueba' && same(bp.cajas.map(c => c.n), ['12', '2', '0']) && bp.filas.length === 1 && bp.filas[0].an === '2019 ×7 · 2020 ×5', JSON.stringify({ c: bp.cajas.map(c => c.n), f: bp.filas }));
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
    aviso('ref. En guarda: España 11 · EEUU 3 · Chile 1', same(v.mundo?.guarda?.filas.map(f => [f.p, Number(f.n)]), REF.guarda), JSON.stringify(v.mundo?.guarda?.filas.map(f => f.p + f.n)));
    aviso('ref. Probados: Francia 10 · España 9 · EEUU 6 · Chile 5 · Italia 5 · Otros 5', same(v.mundo?.probados?.filas.map(f => [f.p, Number(f.n)]), REF.probados), JSON.stringify(v.mundo?.probados?.filas.map(f => f.p + f.n)));
    for (const [r, [ab, gu, pct]] of Object.entries(REF.espejo)) {
      const f = v.espejo?.filas.find(x => x.r === r);
      aviso(`ref. espejo ${r} ${ab}/${gu} ${pct}`, !!f && f.ab === nf(ab) && f.gu === nf(gu) && f.pct === pct, f ? `hoy ${f.ab}/${f.gu} ${f.pct}` : 'no está');
    }
    await pg.locator('.geo-regiones .tr-fila[data-region="Valle de Uco"]').click();
    await esperaPanel(pg);
    const pn = await pg.evaluate(LEER_PANEL);
    aviso('ref. Valle de Uco: 129 · 36 bodegas · 53 íconos · 4,28', same(pn.cajas.map(c => c.n), ['129', '36', '53', '4,28']), pn.cajas.map(c => c.n).join(' · '));
    aviso('ref. Valle de Uco: 34% de la cava', pn.cajas[0]?.l === 'Botellas · 34% de la cava', pn.cajas[0]?.l);
    aviso('ref. Valle de Uco: Salentein 13, Trapiche 11, Cuvelier Los Andes 9, Viña Cobos 8, Finca Ambrosia 6',
      same(pn.filas.slice(0, 5).map(f => [f.v, f.d]), [['Salentein', '13 bot.'], ['Trapiche', '11 bot.'], ['Cuvelier Los Andes', '9 bot.'], ['Viña Cobos', '8 bot.'], ['Finca Ambrosia', '6 bot.']]),
      pn.filas.slice(0, 5).map(f => f.v + ' ' + f.d).join(', '));
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
