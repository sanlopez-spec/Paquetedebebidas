#!/usr/bin/env node
// Verifica la sección "Cepas y estilos" de /club/cava.
//
//   node scripts/check-cepas.mjs                             (local)
//   node scripts/check-cepas.mjs --base https://edb.com.ar   (producción)
//   node scripts/check-cepas.mjs --base <url> --shots <dir>
//
// Lo que compara contra /api/cava en vivo FALLA. Lo que compara contra los
// valores congelados del 21/10/2026 sale como AVISO: los datos de la cava
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
const URL      = BASE + '/club/cava#cepas';

const VIEWPORTS = [
  { w: 360,  h: 800, label: 'celular',    file: 'mob' },
  { w: 820,  h: 1000, label: 'tableta',   file: 'tab' },
  { w: 1440, h: 900, label: 'escritorio', file: 'dsk' },
];

// Referencia del 21/10/2026 — sólo para AVISO.
const REF = {
  compradas: 28, desde: 2021, enGuarda: 18, probadas: 27,
  masTomada: 'Malbec', masTomadaN: 46,
  masGuardada: 'Malbec', masGuardadaN: 132,
  mosaico: { 'Malbec': 132, 'Blend tinto': 113, 'Cabernet Sauvignon': 28, 'Merlot': 20, 'Chardonnay': 17 },
};

const PROHIBIDAS = ['inversión', 'inversion', 'valuación', 'valuacion',
                    'revalorización', 'revalorizacion', 'ganancia'];
const MONEY_KEY = /costo|precio|valor|usd|sugerid|ganancia|inversi|valuaci|revaloriz|monto|importe|ahorro/i;
const LITERALES = [588, 383, 205, 222, 175, 83, 24];
const ABIERTAS_GRIS = 'rgb(74, 67, 64)';   // #4A4340
const DORADOS = ['rgb(217, 176, 74)', 'rgb(140, 106, 34)', 'rgb(200, 146, 42)'];

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
function aviso(name, ok, detail = '') {
  results.push({ name, ok, detail, soloAviso: true });
  console.log(`  ${ok ? 'OK   ' : 'AVISO'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = s => (s || '').replace(/\s+/g, ' ').trim();

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
  check('8. sin números de la cava escritos a mano en src/club', hallazgos.length === 0, hallazgos.join(' | '));
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

// Cava chica de prueba: 8 botellas en guarda, nada abierto.
function cavaChica(real) {
  const d = JSON.parse(real);
  const lista = (d.cepas?.lista ?? []).filter(c => c.enGuarda > 0).slice(0, 3);
  let quedan = 8;
  const chicas = lista.map((c, i) => {
    const q = i === lista.length - 1 ? quedan : Math.min(3, quedan - (lista.length - 1 - i));
    quedan -= q;
    return { ...c, enGuarda: q, abiertas: 0, vinos: c.vinos.slice(0, 1).map(v => ({ ...v, qty: q })) };
  }).filter(c => c.enGuarda > 0);
  const total = chicas.reduce((s, c) => s + c.enGuarda, 0);
  d.cepas = {
    lista: chicas,
    enGuarda: chicas.filter(c => c.esUva).length,
    probadas: 0, masTomada: null, sinFicha: [],
    tipo: {
      enGuarda: { total, items: [{ tipo: 'tinto', count: total, pct: 100 }] },
      abiertas: { total: 0, items: [] },
    },
  };
  d.cons = { grupal: { total: 0, juntadas: 0, byYear: {} } };
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

// Base para armar la cava de prueba: en local, el JSON que ya calculamos;
// en producción, el que sirve el sitio.
let apiParaFixture = apiBody;
if (!apiParaFixture) {
  try { apiParaFixture = await (await fetch(BASE + '/api/cava')).text(); }
  catch { apiParaFixture = null; }
}

console.log(`\nVerificando ${URL}\n`);
const browser = await chromium.launch({ headless: true });

// Lee de la pantalla todo lo que hace falta comparar.
const LEER = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rects = [...document.querySelectorAll('.mos-rect')].map(e => ({
    cepa: e.dataset.cepa, qty: Number(e.dataset.qty),
    bg: getComputedStyle(e).backgroundColor,
    w: Math.round(e.getBoundingClientRect().width),
    h: Math.round(e.getBoundingClientRect().height),
    nom: e.querySelector('.mos-nom') ? txt(e.querySelector('.mos-nom')) : null,
    tieneQty: !!e.querySelector('.mos-qty'),
    // ¿algún texto cortado o fuera del rectángulo?
    cortado: [...e.querySelectorAll('.mos-nom, .mos-qty')].some(t => t.scrollWidth > t.clientWidth + 0.5
      || t.getBoundingClientRect().right > e.getBoundingClientRect().right + 0.5
      || t.getBoundingClientRect().left < e.getBoundingClientRect().left - 0.5
      || t.getBoundingClientRect().bottom > e.getBoundingClientRect().bottom + 0.5
      || t.getBoundingClientRect().top < e.getBoundingClientRect().top - 0.5),
  }));
  const barras = [...document.querySelectorAll('.bt-fila')].map(f => ({
    rotulo: txt(f.querySelector('.bt-rotulo')),
    rotuloCaja: f.querySelector('.bt-rotulo')?.getBoundingClientRect().toJSON() ?? null,
    barraCaja: f.querySelector('.bt-barra')?.getBoundingClientRect().toJSON() ?? null,
    textoAdentro: txt(f.querySelector('.bt-barra')),
    segs: [...f.querySelectorAll('.bt-seg')].map(s => ({
      tipo: s.dataset.tipo, ancho: parseFloat(s.style.width),
      bg: getComputedStyle(s).backgroundColor, borde: getComputedStyle(s).borderTopWidth,
    })),
    desglose: [...f.querySelectorAll('.bt-item')].map(i => ({
      tipo: i.dataset.tipo, txt: txt(i),
      punto: (() => {
        const p = i.querySelector('i');
        return p ? { bg: getComputedStyle(p).backgroundColor, borde: getComputedStyle(p).borderTopWidth } : null;
      })(),
    })),
  }));
  return {
    kpis: [...document.querySelectorAll('.cepa-kpi')].map(e => ({
      n: txt(e.querySelector('b')), l: txt(e.querySelector('span')),
    })),
    hero: txt(document.querySelector('.sec-hero')),
    rects, barras,
    chicas: [...document.querySelectorAll('.mos-chica')].map(e => txt(e)),
    espejo: [...document.querySelectorAll('.ae-lista .ae-fila')].map(e => {
      const R = x => x.getBoundingClientRect();
      const rot = e.querySelector('.ae-rot'), nAb = e.querySelector('.ae-izq .ae-num'), nGu = e.querySelector('.ae-der .ae-num');
      const pct = e.querySelector('.ae-pct'), bAb = e.querySelector('.ae-ab'), bGu = e.querySelector('.ae-gu');
      const cs = getComputedStyle(rot);
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const lineas = el => {
        const r = document.createRange(); r.selectNodeContents(el);
        return new Set([...r.getClientRects()].filter(q => q.width > 0).map(q => Math.round(q.top))).size;
      };
      const cajas = [rot, nAb, bAb, bGu, nGu, pct].map(R);
      const centros = [rot, nAb, nGu, pct].filter(x => txt(x)).map(x => (R(x).top + R(x).bottom) / 2);
      const bar = R(e.querySelector('.ae-barras'));
      const pisa = (p, q) => p.left < q.right - 0.5 && q.left < p.right - 0.5;
      return {
        cepa: e.dataset.cepa, nombre: txt(rot), completo: rot.dataset.cepa,
        nums: [txt(nAb), txt(nGu)], pct: txt(pct),
        bgAb: getComputedStyle(bAb).backgroundColor, bgGu: getComputedStyle(bGu).backgroundColor,
        lineas: [rot, nAb, nGu, pct].filter(x => txt(x)).map(lineas),
        unaLinea: centros.length > 0 && Math.max(...centros) - Math.min(...centros) <= 4,
        recortado: rot.scrollWidth > rot.clientWidth + 0.5 || txt(rot).includes('…'),
        cabeCompleto: cv.measureText(rot.dataset.cepa).width <= rot.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        // el número en guarda no toca el %, ni el número de abiertas el nombre; todo dentro de su zona
        pisados: [
          pisa(R(nGu), R(pct)) && txt(pct), pisa(R(rot), R(nAb)), pisa(R(nGu), R(bGu)), pisa(R(nAb), R(bAb)),
        ].some(Boolean),
        fuera: R(nAb).left < bar.left - 0.5 || R(nGu).right > bar.right + 0.5 || R(bAb).left < bar.left - 0.5,
      };
    }),
    cabEspejo: [...document.querySelectorAll('.ae-cab .ae-h1, .ae-cab .ae-h2, .ae-cab .ae-pct')].map(e => {
      const r = document.createRange(); r.selectNodeContents(e);
      return { t: txt(e), lineas: new Set([...r.getClientRects()].filter(q => q.width > 0).map(q => Math.round(q.top))).size,
        ancho: e.getBoundingClientRect().right - document.querySelector('.ae-cab').getBoundingClientRect().right };
    }),
    hayEspejo: !!document.querySelector('.ae-lista'),
    ficha: document.querySelector('.cepa-ficha') ? {
      cepa: document.querySelector('.cepa-ficha').dataset.cepa,
      nombre: txt(document.querySelector('.cepa-ficha-nombre')),
      vinos: document.querySelectorAll('.cepa-vino').length,
      dentroDelPanel: !!document.querySelector('.tpanel .cepa-ficha'),
      debajoDelMosaico: (() => {
        const m = document.querySelector('.mosaico'), f = document.querySelector('.cepa-ficha');
        return !!m && !!f && f.getBoundingClientRect().top >= m.getBoundingClientRect().bottom - 2;
      })(),
      // ¿la ficha es un modal propio? Se mira sólo de la ficha hasta su panel:
      // más arriba está el overlay del tablero, que sí es fixed por diseño.
      esModal: (() => {
        const f = document.querySelector('.cepa-ficha');
        for (let n = f; n && !n.classList.contains('tpanel'); n = n.parentElement) {
          if (getComputedStyle(n).position === 'fixed') return true;
        }
        return false;
      })(),
    } : null,
    viejos: document.querySelectorAll('.donut, .pieblock, .otras-list, .otras-item, .tlegend').length,
    textoViejo: document.body.innerText.includes('Cepas más tomadas'),
    panelesVacios: [...document.querySelectorAll('.tpanel')]
      .filter(p => p.innerText.replace(/\s+/g, '').length < 12).length,
  };
};

try {
  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.label} (${vp.w}×${vp.h}) ──`);
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.w < 500 ? 2 : 1 });
    const page = await ctx.newPage();
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
    if (apiBody) {
      await page.route('**/api/cava', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    }

    const P = vp.file + ': ';
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.mos-rect', { timeout: 25000 });
    await page.waitForTimeout(900);

    const api = await page.evaluate(async () => (await (await fetch('/api/cava')).json()).cepas);
    const v = await page.evaluate(LEER);
    const n = (x, d = 0) => new Intl.NumberFormat('es-AR',
      { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);

    // ── 1. contra la API en vivo ────────────────────────────────────
    check(P + '1. el destacado son las cepas compradas, con el año',
      v.hero.includes(`${n(api.compradas)} cepas`) && v.hero.includes('compradas')
      && (!api.anioPrimeraCompra || v.hero.includes(`desde ${api.anioPrimeraCompra}`)),
      `${v.hero} (API: ${api.compradas} desde ${api.anioPrimeraCompra})`);
    const kpiN = v.kpis.map(k => k.n);
    check(P + '1. indicador "Cepas en guarda"',
      v.kpis.some(k => k.l.includes('Cepas en guarda') && k.n === n(api.enGuarda)),
      JSON.stringify(v.kpis));
    const hayAb = api.tipo.abiertas.total > 0;
    check(P + '1. indicador "Cepas probadas"',
      hayAb ? v.kpis.some(k => k.l.includes('Cepas probadas') && k.n === n(api.probadas))
            : !v.kpis.some(k => k.l.includes('Cepas probadas')),
      JSON.stringify(kpiN));
    // el tercer indicador es la más GUARDADA (un dato de la cava, no de consumo)
    check(P + '1. el tercer indicador dice "La más guardada · N" con la cepa y N de la API',
      !!api.masGuardada && v.kpis[2]?.n === api.masGuardada.cepa
      && norm(v.kpis[2]?.l) === `La más guardada · ${n(api.masGuardada.botellas)}`,
      `${JSON.stringify(v.kpis[2])} vs API ${JSON.stringify(api.masGuardada)}`);
    check(P + '1. ya no aparece "La más tomada" entre los indicadores',
      !v.kpis.some(k => k.l.includes('La más tomada')), JSON.stringify(v.kpis));
    const delMosaico = v.rects.find(r => r.cepa === api.masGuardada?.cepa);
    check(P + '1. el número de la más guardada es el de esa cepa en el mosaico',
      !!delMosaico && delMosaico.qty === api.masGuardada?.botellas
      && v.rects.every(r => r.qty <= api.masGuardada.botellas),
      `mosaico ${delMosaico?.cepa} ${delMosaico?.qty} vs API ${api.masGuardada?.botellas}`);
    aviso(P + `ref. la más guardada = ${REF.masGuardada} ${REF.masGuardadaN}`,
      api.masGuardada?.cepa === REF.masGuardada && api.masGuardada?.botellas === REF.masGuardadaN,
      `hoy ${api.masGuardada?.cepa} ${api.masGuardada?.botellas}`);

    const mosApi = api.lista.filter(c => c.enGuarda > 0);
    const mosOk = v.rects.length === mosApi.length
      && mosApi.every(c => v.rects.some(r => r.cepa === c.nombre && r.qty === c.enGuarda));
    check(P + '1. el mosaico muestra las cepas de la API', mosOk,
      `pantalla ${v.rects.length} vs API ${mosApi.length}`);

    // ── 2. las sumas cierran ────────────────────────────────────────
    const sumaMos = v.rects.reduce((s, r) => s + r.qty, 0);
    check(P + '2. la suma del mosaico es el total en guarda',
      sumaMos === api.tipo.enGuarda.total, `${sumaMos} vs ${api.tipo.enGuarda.total}`);
    const hex2rgb = h => {
      const x = h.replace('#', '');
      return `rgb(${parseInt(x.slice(0, 2), 16)}, ${parseInt(x.slice(2, 4), 16)}, ${parseInt(x.slice(4, 6), 16)})`;
    };
    const barrasApi = [api.tipo.enGuarda, ...(hayAb ? [api.tipo.abiertas] : [])];
    check(P + '2. hay una barra por cada composición', v.barras.length === barrasApi.length,
      `${v.barras.length} vs ${barrasApi.length}`);
    barrasApi.forEach((comp, i) => {
      const b = v.barras[i];
      if (!b) { check(`${P}2. barra ${i + 1}`, false, 'no existe'); return; }
      const anchoTotal = b.segs.reduce((s, x) => s + x.ancho, 0);
      const mismos = b.segs.length === comp.items.length;
      check(`${P}2. la barra "${norm(b.rotulo)}" suma su total`,
        mismos && Math.abs(anchoTotal - 100) < 0.6 && b.rotulo.includes(n(comp.total)),
        `segs ${b.segs.length}/${comp.items.length}, ancho ${anchoTotal.toFixed(1)}%`);

      // ── 1. la barra no lleva texto adentro, y mide 10 px ──────────
      check(`${P}1. la barra ${i + 1} no tiene texto adentro`, b.textoAdentro === '',
        `"${b.textoAdentro}"`);
      check(`${P}1. la barra ${i + 1} mide 10 px o menos`,
        !!b.barraCaja && b.barraCaja.height <= 10, `${b.barraCaja?.height} px`);

      // ── 2. el desglose de abajo coincide con la API ───────────────
      const esperado = comp.items.map(it => {
        const pct = it.count / comp.total * 100;
        const cap = it.tipo.charAt(0).toUpperCase() + it.tipo.slice(1);
        return `${cap} ${pct < 1 ? n(it.count) : n(Math.round(pct)) + '%'}`;
      });
      const visto = b.desglose.map(d => norm(d.txt));
      check(`${P}2. el desglose de "${norm(b.rotulo)}" coincide con la API`,
        visto.length === esperado.length && esperado.every((e, k) => visto[k] === e),
        `pantalla [${visto.join(' | ')}] vs API [${esperado.join(' | ')}]`);
      check(`${P}2. los puntos del desglose usan el color de la API`,
        b.desglose.every((d, k) => d.punto
          && d.punto.bg === hex2rgb(comp.items[k].color ?? '#B8AC9C')),
        b.desglose.map(d => `${d.tipo}=${d.punto?.bg}`).join(', '));
    });

    // ── 3. colores ──────────────────────────────────────────────────
    const malColor = v.rects.filter(r => {
      const c = mosApi.find(x => x.nombre === r.cepa);
      return !c || r.bg !== hex2rgb(c.color);
    });
    check(P + '3. cada rectángulo usa el color de su cepa', malColor.length === 0,
      malColor.map(r => `${r.cepa}=${r.bg}`).join(', '));
    if (v.hayEspejo) {
      check(P + '3. en el espejo, las abiertas van en gris carbón',
        v.espejo.every(e => e.bgAb === ABIERTAS_GRIS),
        [...new Set(v.espejo.map(e => e.bgAb))].join(', '));
      const dorado = v.espejo.filter(e => DORADOS.includes(e.bgAb));
      check(P + '3. ninguna barra de abiertas usa dorado', dorado.length === 0,
        dorado.map(e => e.cepa).join(', '));
    }

    // ── 5. escritorio: rótulo a la izquierda y barra fina ───────────
    if (vp.w >= 600) {
      const mal = v.barras.filter(b => !b.rotuloCaja || !b.barraCaja
        || b.rotuloCaja.right > b.barraCaja.left + 1
        || Math.abs(b.rotuloCaja.top - b.barraCaja.top) > 12);
      check(P + '5. el rótulo está a la izquierda de la barra', mal.length === 0,
        JSON.stringify(v.barras.map(b => ({ r: b.rotuloCaja?.right, l: b.barraCaja?.left }))));
      check(P + '5. la barra mide 16 px o menos',
        v.barras.every(b => b.barraCaja && b.barraCaja.height <= 16),
        v.barras.map(b => b.barraCaja?.height).join(', '));
    } else {
      // en celular el rótulo va arriba de la barra, no al costado
      const mal = v.barras.filter(b => !b.rotuloCaja || !b.barraCaja
        || b.rotuloCaja.bottom > b.barraCaja.top + 1);
      check(P + '5. en celular el rótulo va arriba de la barra', mal.length === 0,
        JSON.stringify(v.barras.map(b => ({ rot: b.rotuloCaja?.bottom, bar: b.barraCaja?.top }))));
    }

    // ── 4b. los tipos salen del mapa de la API ──────────────────────
    const tiposApi = new Map();
    for (const it of [...api.tipo.enGuarda.items, ...api.tipo.abiertas.items]) {
      if (!tiposApi.has(it.tipo)) tiposApi.set(it.tipo, it.color);
    }
    const segs = await page.evaluate(() => [...document.querySelectorAll('.bt-seg')].map(e => ({
      tipo: e.dataset.tipo, bg: getComputedStyle(e).backgroundColor,
    })));
    const colorMal = segs.filter(s => s.bg !== hex2rgb(tiposApi.get(s.tipo) ?? '#B8AC9C'));
    check(P + '4b. cada segmento usa el color que manda la API', colorMal.length === 0,
      colorMal.map(s => `${s.tipo}=${s.bg}`).join(', '));

    // ── 3. la leyenda separada ya no existe ─────────────────────────
    const leyendaVieja = await page.locator('.bt-leyenda, .bt-leg').count();
    check(P + '3. no existe la leyenda separada del bloque', leyendaVieja === 0,
      `${leyendaVieja} nodos`);

    // ── 4. los colores nuevos de tipo ───────────────────────────────
    const esperaColor = { blanco: '#E2CC6F', espumante: '#F1EBD6', naranjo: '#C8823A', tinto: '#6B1E2E' };
    for (const [tipo, hex] of Object.entries(esperaColor)) {
      if (!tiposApi.has(tipo)) continue;
      const s = segs.find(x => x.tipo === tipo);
      check(P + `4. el ${tipo} usa ${hex}`, !!s && s.bg === hex2rgb(hex),
        `${s?.bg} (API dice ${tiposApi.get(tipo)})`);
    }
    check(P + '4. ningún segmento usa el dorado viejo #D9B04A',
      !segs.some(s => s.bg === hex2rgb('#D9B04A')),
      segs.map(s => `${s.tipo}=${s.bg}`).join(', '));
    if (tiposApi.has('espumante')) {
      const esp = v.barras.flatMap(b => b.segs).find(s => s.tipo === 'espumante');
      const pto = v.barras.flatMap(b => b.desglose).find(d => d.tipo === 'espumante');
      check(P + '4. el espumante lleva borde en la barra y en el punto',
        !!esp && parseFloat(esp.borde) >= 1 && !!pto?.punto && parseFloat(pto.punto.borde) >= 1,
        `barra ${esp?.borde}, punto ${pto?.punto?.borde}`);
    }
    if (tiposApi.has('naranjo')) {
      const nar = api.tipo.abiertas.items.find(i => i.tipo === 'naranjo');
      const enDesglose = v.barras.flatMap(b => b.desglose).find(d => d.tipo === 'naranjo');
      // por debajo del 1% el desglose muestra la cantidad, no el porcentaje
      const esperado = `Naranjo ${n(nar.count)}`;
      check(P + '4b. el naranjo tiene su segmento, su color y su entrada',
        segs.some(s => s.tipo === 'naranjo' && s.bg === hex2rgb('#C8823A'))
        && !!enDesglose && norm(enDesglose.txt) === esperado,
        `desglose "${enDesglose?.txt}" (esperaba "${esperado}")`);
    }

    // ── 6. ya no están los bloques viejos ───────────────────────────
    check(P + '6. no quedan donas ni chips de "Otras"', v.viejos === 0, `${v.viejos} nodos`);
    check(P + '6. no existe "Cepas más tomadas"', !v.textoViejo);

    // ── 4. la ficha: abre, cambia y cierra ──────────────────────────
    const c1 = v.rects[0].cepa, c2 = v.rects[1]?.cepa;
    await page.locator(`.mos-rect[data-cepa="${c1}"]`).click();
    await page.waitForTimeout(450);
    let f = (await page.evaluate(LEER)).ficha;
    check(P + '4. al tocar un rectángulo se abre su ficha',
      !!f && f.nombre === c1, JSON.stringify(f && { n: f.nombre }));
    check(P + '4. la ficha va debajo del mosaico, no es un modal',
      !!f && f.debajoDelMosaico && !f.esModal && f.dentroDelPanel,
      JSON.stringify(f && { debajo: f.debajoDelMosaico, modal: f.esModal }));
    // ── 2. la lista de vinos arranca cerrada ────────────────────────
    const vinosApi = mosApi.find(c => c.nombre === c1)?.vinos.length ?? 0;
    check(P + '2. al abrir la ficha la lista de vinos está cerrada',
      await page.locator('.cepa-vino').count() === 0,
      `${await page.locator('.cepa-vino').count()} filas visibles`);
    const rotulo = norm(await page.locator('.cepa-vinos-mas').textContent());
    check(P + '2. el botón dice "Ver las N etiquetas en guarda"',
      rotulo === `Ver las ${n(vinosApi)} etiqueta${vinosApi !== 1 ? 's' : ''} en guarda`,
      `"${rotulo}" (API: ${vinosApi})`);
    await page.locator('.cepa-vinos-mas').click();
    await page.waitForTimeout(350);
    const vinosVistos = await page.locator('.cepa-vino').count();
    check(P + '2. al tocarlo aparecen las N etiquetas',
      vinosVistos === vinosApi, `${vinosVistos} vs API ${vinosApi}`);
    check(P + '2. el botón pasa a "Ocultar etiquetas"',
      norm(await page.locator('.cepa-vinos-mas').textContent()) === 'Ocultar etiquetas');
    await page.locator('.cepa-vinos-mas').click();
    await page.waitForTimeout(300);
    check(P + '2. "Ocultar etiquetas" las cierra',
      await page.locator('.cepa-vino').count() === 0);

    // ── 3. el Malbec no repite el origen en "Terroirs en el mundo" ──
    if (mosApi.some(c => c.nombre === 'Malbec')) {
      await page.locator('.mos-rect[data-cepa="Malbec"]').click();
      await page.waitForTimeout(400);
      const atrib = await page.evaluate(() =>
        [...document.querySelectorAll('.cepa-atrib dt')].map(e => e.textContent.trim()));
      check(P + '3. la ficha del Malbec no muestra "Terroirs en el mundo"',
        !atrib.includes('Terroirs en el mundo'), atrib.join(' · '));
      await page.locator(`.mos-rect[data-cepa="${c1}"]`).click();
      await page.waitForTimeout(350);
    }
    check(P + '4. el rectángulo elegido queda marcado',
      await page.locator(`.mos-rect[data-cepa="${c1}"].on`).count() === 1);
    if (c2) {
      await page.locator(`.mos-rect[data-cepa="${c2}"]`).click();
      await page.waitForTimeout(450);
      f = (await page.evaluate(LEER)).ficha;
      check(P + '4. tocar otro rectángulo cambia la ficha', !!f && f.nombre === c2, f?.nombre);
    }
    await page.locator('.cepa-ficha-x').click();
    await page.waitForTimeout(400);
    check(P + '4. la X cierra la ficha',
      await page.locator('.cepa-ficha').count() === 0);
    if (v.chicas.length) {
      await page.locator('.mos-chica').first().click();
      await page.waitForTimeout(450);
      const fc = (await page.evaluate(LEER)).ficha;
      const esperada = v.chicas[0].replace(/\s+\d+[\d.,]*\s*·?$/, '').trim();
      check(P + '4. "También: …" abre la misma ficha',
        !!fc && esperada.startsWith(fc.nombre), `${fc?.nombre} vs "${v.chicas[0]}"`);
      await page.locator('.cepa-ficha-x').click();
      await page.waitForTimeout(300);
    }

    // ── el espejo contra la API ─────────────────────────────────────
    if (v.hayEspejo) {
      const esperado = api.lista.map(c => ({ ...c, total: c.enGuarda + c.abiertas }))
        .filter(c => c.total > 0).sort((a, b) => b.total - a.total).slice(0, 10);
      const pctDe = c => (c.total >= 5 ? n(Math.round(c.enGuarda / c.total * 100)) + '%' : '');
      const ok = v.espejo.length === esperado.length
        && esperado.every((c, i) => v.espejo[i].cepa === c.nombre && v.espejo[i].pct === pctDe(c)
          && v.espejo[i].nums[0] === n(c.abiertas) && v.espejo[i].nums[1] === n(c.enGuarda));
      check(P + '1. "¿Se guarda o se toma?" coincide con la API (cepas, orden, números y %)', ok,
        v.espejo.map(e => `${e.cepa} ${e.nums.join('/')} ${e.pct}`).join(' | '));
      check(P + '1. el espejo muestra el % sólo con 5 botellas o más',
        esperado.every((c, i) => (c.total >= 5) === (v.espejo[i].pct !== '')));
      check(P + '1. el espejo: cada cepa en una sola línea (nombre, dos números, barras y %)',
        v.espejo.every(e => e.unaLinea && e.lineas.every(l => l === 1)),
        v.espejo.filter(e => !e.unaLinea || e.lineas.some(l => l !== 1)).map(e => e.cepa).join(', '));
      check(P + '1. el espejo: ningún número se pisa con el % ni con otro texto',
        v.espejo.every(e => !e.pisados && !e.fuera),
        v.espejo.filter(e => e.pisados || e.fuera).map(e => e.cepa).join(', '));
      check(P + '1. el espejo: encabezado "ABIERTAS" · "EN GUARDA" · "% guardado" en una línea cada uno',
        v.cabEspejo.length === 3 && v.cabEspejo.every(c => c.lineas === 1)
        && same(v.cabEspejo.map(c => c.t), ['abiertas', 'en guarda', '% guardado']) && v.cabEspejo.every(c => c.ancho <= 0.5),
        JSON.stringify(v.cabEspejo));
      check(P + '1. el espejo: ningún nombre recortado ni con "…"', v.espejo.every(e => !e.recortado),
        v.espejo.filter(e => e.recortado).map(e => e.nombre).join(', '));
      check(P + '1. el espejo: nombre corto sólo si el completo no entra',
        v.espejo.every(e => e.nombre === e.completo || (!e.cabeCompleto && e.nombre.length < e.completo.length)),
        v.espejo.filter(e => e.nombre !== e.completo).map(e => `${e.completo}→${e.nombre} (cabe: ${e.cabeCompleto})`).join(', '));
      check(P + '1. el espejo: escala de barras sobre el espacio que queda (la más larga no toca el eje opuesto ni el %)',
        v.espejo.every(e => !e.fuera));
      // valores congelados (AVISO)
      for (const [cepa, ab, gu, pct] of [['Malbec', 46, 132, '74%'], ['Blend tinto', 40, 113, '74%'], ['Cabernet Sauvignon', 22, 28, '56%'], ['Chardonnay', 30, 17, '36%']]) {
        const e = v.espejo.find(x => x.cepa === cepa);
        aviso(P + `ref. espejo ${cepa} ${ab} / ${gu} · ${pct}`,
          !!e && e.nums[0] === n(ab) && e.nums[1] === n(gu) && e.pct === pct,
          e ? `hoy ${e.nums.join(' / ')} · ${e.pct}` : 'no está');
      }
    }

    // ── los rótulos del treemap ─────────────────────────────────────
    check(P + '2. treemap: ningún rótulo cortado ni desbordado', v.rects.every(r => !r.cortado),
      v.rects.filter(r => r.cortado).map(r => r.cepa).join(', '));
    check(P + '2. treemap: toda cepa sin su nombre en el rectángulo está en "También:"',
      v.rects.every(r => r.nom || v.chicas.some(t => t.startsWith(r.cepa))),
      v.rects.filter(r => !r.nom && !v.chicas.some(t => t.startsWith(r.cepa))).map(r => r.cepa).join(', '));
    check(P + '2. treemap: el nombre es el completo o uno más corto (nunca "…")',
      v.rects.every(r => !r.nom || (!r.nom.includes('…') && r.nom.length <= r.cepa.length)),
      v.rects.filter(r => r.nom && r.nom !== r.cepa).map(r => `${r.cepa}→${r.nom}`).join(', '));
    check(P + '2. treemap: "Petit Verdot", "Tempranillo" y "Chardonnay" no salen cortados',
      v.rects.filter(r => ['Petit Verdot', 'Tempranillo', 'Chardonnay'].includes(r.cepa)).every(r => !r.cortado));

    // ── 8. reglas generales ─────────────────────────────────────────
    const sw = await page.evaluate(() => ({
      s: document.documentElement.scrollWidth, i: window.innerWidth }));
    check(P + '8. sin scroll horizontal', sw.s <= sw.i, `${sw.s} > ${sw.i}`);
    const texto = await page.evaluate(() => document.body.innerText);
    const hall = PROHIBIDAS.filter(p => texto.toLowerCase().includes(p));
    check(P + '8. sin palabras prohibidas', hall.length === 0, hall.join(', '));
    const puntos = texto.match(/\d+\.\d+/g) || [];
    check(P + '8. ningún decimal con punto', puntos.length === 0, puntos.join(', '));
    const money = await page.evaluate(async re => {
      const r = new RegExp(re, 'i'); const d = await (await fetch('/api/cava')).json();
      const hits = []; (function w(o, p) {
        if (o === null || typeof o !== 'object') return;
        for (const k of Object.keys(o)) { if (r.test(k)) hits.push(p + '.' + k); w(o[k], p + '.' + k); }
      })(d, ''); return [...new Set(hits)];
    }, MONEY_KEY.source);
    check(P + '8. la API no tiene campos de dinero', money.length === 0, money.join(', '));

    // ── valores congelados (AVISO) ──────────────────────────────────
    aviso(P + `ref. cepas compradas = ${REF.compradas} desde ${REF.desde}`,
      api.compradas === REF.compradas && api.anioPrimeraCompra === REF.desde,
      `hoy ${api.compradas} desde ${api.anioPrimeraCompra}`);
    aviso(P + `ref. cepas en guarda = ${REF.enGuarda}`,
      api.enGuarda === REF.enGuarda, `hoy ${api.enGuarda}`);
    aviso(P + `ref. cepas probadas = ${REF.probadas}`, api.probadas === REF.probadas, `hoy ${api.probadas}`);
    aviso(P + `ref. la más tomada = ${REF.masTomada} ${REF.masTomadaN}`,
      api.masTomada?.nombre === REF.masTomada && api.masTomada?.abiertas === REF.masTomadaN,
      `hoy ${api.masTomada?.nombre} ${api.masTomada?.abiertas}`);
    for (const [cepa, qty] of Object.entries(REF.mosaico)) {
      const real = mosApi.find(c => c.nombre === cepa)?.enGuarda;
      aviso(P + `ref. ${cepa} = ${qty} en guarda`, real === qty, `hoy ${real ?? '—'}`);
    }

    // ── 7. cava chica: 8 botellas, nada abierto ─────────────────────
    // El fixture se arma recortando la respuesta real, así el chequeo corre
    // igual en local y en producción.
    if (apiParaFixture) {
      const chica = cavaChica(apiParaFixture);
      const p2 = await ctx.newPage();
      await p2.route('**/api/cava', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: chica }));
      await p2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p2.waitForSelector('.mos-rect', { timeout: 25000 });
      await p2.waitForTimeout(700);
      const vc = await p2.evaluate(LEER);
      check(P + '7. cava chica: no aparece "Cepas probadas"',
        !vc.kpis.some(k => k.l.includes('Cepas probadas')), JSON.stringify(vc.kpis.map(k => k.l)));
      check(P + '7. cava chica: no aparece "La más tomada"',
        !vc.kpis.some(k => k.l.includes('La más tomada')), JSON.stringify(vc.kpis.map(k => k.l)));
      check(P + '7. cava chica: no aparece "¿Se guarda o se toma?"', !vc.hayEspejo);
      check(P + '7. cava chica: una sola barra de tipo', vc.barras.length === 1, `${vc.barras.length}`);
      check(P + '7. cava chica: el mosaico suma 8',
        vc.rects.reduce((s, r) => s + r.qty, 0) === 8,
        String(vc.rects.reduce((s, r) => s + r.qty, 0)));
      check(P + '7. cava chica: ningún panel vacío', vc.panelesVacios === 0, `${vc.panelesVacios}`);
      await p2.close();

      // ── 4b. un tipo de vino que el mapa no conoce no rompe nada ───
      const d = JSON.parse(apiParaFixture);
      d.cepas.tipo.abiertas.items = [...d.cepas.tipo.abiertas.items,
        { tipo: 'prueba', count: 1, pct: 0, color: '#B8AC9C' }];
      d.cepas.tipo.abiertas.total += 1;
      const p4 = await ctx.newPage();
      const errP4 = [];
      p4.on('pageerror', e => errP4.push(e.message));
      await p4.route('**/api/cava', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }));
      await p4.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await p4.waitForSelector('.mos-rect', { timeout: 25000 });
      await p4.waitForTimeout(700);
      const vp4 = await p4.evaluate(() => ({
        seg: (() => {
          const e = document.querySelector('.bt-seg[data-tipo="prueba"]');
          return e ? getComputedStyle(e).backgroundColor : null;
        })(),
        leg: (() => {
          const e = document.querySelector('.bt-item[data-tipo="prueba"]');
          return e ? e.textContent.trim() : null;
        })(),
        anchos: [...document.querySelectorAll('.bt-fila')].map(f =>
          [...f.querySelectorAll('.bt-seg')].reduce((s, x) => s + parseFloat(x.style.width), 0)),
      }));
      check(P + '4b. un tipo desconocido se muestra en gris',
        vp4.seg === hex2rgb('#B8AC9C'), String(vp4.seg));
      check(P + '4b. un tipo desconocido aparece en el desglose con su nombre',
        (vp4.leg ?? '').startsWith('Prueba'), String(vp4.leg));
      check(P + '4b. con un tipo desconocido las barras siguen sumando 100%',
        vp4.anchos.every(a => Math.abs(a - 100) < 0.6), vp4.anchos.join(', '));
      check(P + '4b. un tipo desconocido no rompe la página', errP4.length === 0,
        errP4.slice(0, 2).join(' | '));
      await p4.close();
    }

    // ── la sección también anda dentro del modal ────────────────────
    const p3 = await ctx.newPage();
    if (apiBody) {
      await p3.route('**/api/cava', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    }
    await p3.goto(BASE + '/club', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p3.waitForTimeout(900);
    await p3.getByRole('button', { name: 'Abrir el tablero' }).first().click();
    await p3.waitForSelector('.tablero-modal-body .sec-card', { timeout: 25000 });
    await p3.waitForTimeout(600);
    await p3.locator('.sec-card').first().click();   // Cepas y estilos
    await p3.waitForSelector('.tablero-modal-body .mos-rect', { timeout: 25000 });
    await p3.waitForTimeout(600);
    const vm = await p3.evaluate(LEER);
    check(P + 'modal: el mosaico aparece y suma igual',
      vm.rects.length === v.rects.length
      && vm.rects.reduce((s, r) => s + r.qty, 0) === sumaMos,
      `${vm.rects.length} rects`);
    await p3.locator('.mos-rect').first().click();
    await p3.waitForTimeout(450);
    const fm = (await p3.evaluate(LEER)).ficha;
    check(P + 'modal: la ficha abre debajo del mosaico',
      !!fm && fm.debajoDelMosaico && !fm.esModal, JSON.stringify(fm && { d: fm.debajoDelMosaico }));
    await p3.close();

    check(P + 'sin errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '));

    if (SHOTS && vp.w < 700) {
      // celular: el treemap y el espejo "¿Se guarda o se toma?"
      mkdirSync(SHOTS, { recursive: true });
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.mos-rect');
      await page.waitForTimeout(700);
      await page.locator('.tpanel').filter({ has: page.locator('.mosaico') })
        .screenshot({ path: join(SHOTS, `${vp.file}-treemap.png`) });
      await page.locator('.tpanel').filter({ has: page.locator('.ae') })
        .screenshot({ path: join(SHOTS, `${vp.file}-espejo.png`) });
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
