#!/usr/bin/env node
// Verifica la cabecera unificada de Cepas, Geografía, Añadas y Calidad, y el gesto de deslizar
// entre secciones en celular.
//
//   node scripts/check-cabeceras.mjs                              (local)
//   node scripts/check-cabeceras.mjs --base https://edb.com.ar    (producción, sin "www")

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

// lo que tiene que mostrar cada cabecera, calculado de la API
function esperadas(api) {
  const C = api.cepas, G = api.geografia, A = api.anadas, Q = api.calidad;
  const hayAbCepas = C.tipo.abiertas.total > 0;
  const top = A.enGuarda.reduce((m, x) => (!m || x.botellas > m.botellas || (x.botellas === m.botellas && x.an > m.an) ? x : m), null);
  const pct40 = Q.puntuadas ? Math.round(Q.con40 / Q.puntuadas * 100) : 0;
  return {
    cepas: { num: nf(C.compradas), datos: [[nf(C.enGuarda), 'Cepas en guarda'], ...(hayAbCepas ? [[nf(C.probadas), 'Cepas probadas']] : []), ...(C.masGuardada ? [[C.masGuardada.cepa, `La más guardada · ${nf(C.masGuardada.botellas)}`]] : [])] },
    geografia: { num: nf(G.regiones.length), datos: [[nf(G.paisesEnGuarda), 'Países en guarda'], ...(G.abiertasTotal > 0 ? [[nf(G.paisesProbados), 'Países probados']] : []), [G.regiones[0].region, `La que más · ${nf(G.regiones[0].botellas)}`]] },
    anadas: { num: nf(api.stats.edadPromedioGuarda, 1), datos: [[String(A.enGuarda[0].an), 'La más antigua'], [nf(A.enGuarda.length), 'Cosechas distintas'], [String(top.an), `La más guardada · ${nf(top.botellas)}`]] },
    calidad: { num: nf(api.calidad.promedio, 2), datos: [[`${nf(pct40)}%`, 'Con 4,0 o más'], [nf(Q.con45), 'Con 4,5 o más'], [nf(Q.mejor.vivino, 1), `Mejor puntaje · ${nf(Q.mejor.botellas)} bot.`]] },
  };
}

const LEER = () => {
  const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const cab = document.querySelector('.cab'); if (!cab) return null;
  const cs = getComputedStyle(cab);
  const datos = [...cab.querySelectorAll('.cab-dato')];
  const uno = e => e && Math.round(e.getBoundingClientRect().height) <= Math.round(parseFloat(getComputedStyle(e).lineHeight === 'normal' ? parseFloat(getComputedStyle(e).fontSize) * 1.3 : getComputedStyle(e).lineHeight)) + 2;
  const svg = cab.querySelector('.cab-med-svg');
  let med = null;
  if (svg) {
    const g = svg.querySelector('g'), hub = svg.querySelector('circle'), sw = parseFloat(g.getAttribute('stroke-width'));
    const ds = [...g.querySelectorAll('path')].map(p => p.getAttribute('d'));
    const nums = ds[0].match(/-?\d+(\.\d+)?/g).map(Number);
    const x0 = nums[0];
    const cx = Number(hub.getAttribute('cx')), cy = Number(hub.getAttribute('cy'));
    const Rr = cx - x0;
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    med = { ancho: R(svg).w, alto: R(svg).h, dataAncho: Number(svg.dataset.ancho), sw, R: Rr, cx, cy, vb, izq: cx - Rr - sw / 2, der: cx + Rr + sw / 2, arriba: cy - Rr - sw / 2, textos: svg.querySelectorAll('text').length,
      rayitas: svg.querySelectorAll('line:not(.med-aguja)').length, aguja: !!svg.querySelector('.med-aguja'), box: R(svg) };
  }
  const n = cab.querySelector('.cab-cal-n');
  const logo = cab.querySelector('.med-logo');
  return {
    h: Math.round(R(cab).h), w: R(cab).w, cols: cs.gridTemplateColumns.split(' ').length, colsTxt: cs.gridTemplateColumns, gap: cs.columnGap, padL: cs.paddingLeft, padT: cs.paddingTop,
    id: cab.dataset.cab, num: txt(cab.querySelector('.cab-num b')), unidad: txt(cab.querySelector('.cab-num span')), sub: txt(cab.querySelector('.cab-sub')),
    numFont: cab.querySelector('.cab-num b') ? getComputedStyle(cab.querySelector('.cab-num b')).fontSize : null, numFam: cab.querySelector('.cab-num b') ? getComputedStyle(cab.querySelector('.cab-num b')).fontFamily : null,
    numColor: cab.querySelector('.cab-num b') ? getComputedStyle(cab.querySelector('.cab-num b')).color : null,
    datos: datos.map(d => ({ n: txt(d.querySelector('b')), l: txt(d.querySelector('span')), nFont: getComputedStyle(d.querySelector('b')).fontSize, lFont: getComputedStyle(d.querySelector('span')).fontSize, nColor: getComputedStyle(d.querySelector('b')).color,
      borde: getComputedStyle(d).borderTopWidth, bordeAbajo: getComputedStyle(d).borderBottomWidth, box: R(d), uno: uno(d.querySelector('b')) && uno(d.querySelector('span')), trunc: d.querySelector('b').scrollWidth > d.querySelector('b').clientWidth + 1 || d.querySelector('span').scrollWidth > d.querySelector('span').clientWidth + 1,
      mismoRenglon: Math.abs((R(d.querySelector('b')).t + R(d.querySelector('b')).b) / 2 - (R(d.querySelector('span')).t + R(d.querySelector('span')).b) / 2) < 14 })),
    cabBox: R(cab), subUno: cab.querySelector('.cab-sub') ? uno(cab.querySelector('.cab-sub')) : true, subTrunc: cab.querySelector('.cab-sub') ? cab.querySelector('.cab-sub').scrollWidth > cab.querySelector('.cab-sub').clientWidth + 1 : false,
    unidadAbajo: cab.querySelector('.cab-num span') ? R(cab.querySelector('.cab-num span')).t >= R(cab.querySelector('.cab-num b')).b - 6 : null,
    unidadAlLado: cab.querySelector('.cab-num span') ? R(cab.querySelector('.cab-num span')).l >= R(cab.querySelector('.cab-num b')).r - 1 : null,
    desborda: cab.scrollHeight > cab.clientHeight + 1,
    med, calN: n ? { txt: txt(n), font: getComputedStyle(n).fontSize, color: getComputedStyle(n).color, fam: getComputedStyle(n).fontFamily, box: R(n) } : null,
    logo: logo ? { alto: Math.round(R(logo).h), box: R(logo) } : null, calS: txt(cab.querySelector('.cab-cal-s')),
    scroll: { s: document.documentElement.scrollWidth, i: innerWidth },
  };
};

const SECCIONES = ['cepas', 'geografia', 'anadas', 'calidad'];
const COLORES = { cepas: 'rgb(107, 30, 46)', geografia: 'rgb(94, 107, 58)', anadas: 'rgb(107, 74, 43)', calidad: 'rgb(140, 106, 34)' };
const UNIDADES = { cepas: /^cepas?$/, geografia: /^regi(ón|ones)$/, anadas: /^años$/ };
const OPC_LAYOUT = {
  enUnaLinea: '.cab-num b, .cab-num span, .cab-sub, .cab-dato b, .cab-dato span, .cab-cal-n, .cab-cal-s',
  sinRecortar: '',
  sinPisar: ['.cab-dato b', '.cab-dato span', '.cab-sub', '.cab-num b'],
};

async function cabecera(c, apiBody, seccion, etiqueta, esc, E) {
  const P = `[${etiqueta}] ${seccion}: `;
  const pg = await c.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  if (apiBody) await pg.route('**/api/cava', r => r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
  await pg.goto(`${BASE}/club/cava#${seccion}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.waitForSelector('.cab', { timeout: 30000 });
  await pg.waitForTimeout(900);
  const v = await pg.evaluate(LEER);
  const e = E[seccion];
  check(P + 'existe la cabecera con alto fijo ' + (esc ? '124' : '150') + ' px (±2)', Math.abs(v.h - (esc ? 124 : 150)) <= 2, `${v.h} px`);
  check(P + 'dos columnas (' + (esc ? '1fr 300px, gap 24, padding 22' : '46% 1fr, gap 12, padding 14') + ')',
    v.cols === 2 && (esc ? Math.round(parseFloat(v.colsTxt.split(' ')[1])) === 300 && v.gap === '24px' && v.padL === '22px' : v.gap === '12px' && v.padL === '14px') && v.padT === '0px', `${v.colsTxt} · gap ${v.gap} · pad ${v.padL}/${v.padT}`);
  check(P + 'tres datos apilados, con raya fina entre ellos (ninguna arriba del primero ni abajo del último)',
    v.datos.length === e.datos.length && v.datos.length >= 2 && v.datos[0].borde === '0px' && v.datos.slice(1).every(d => d.borde !== '0px') && v.datos.every(d => d.bordeAbajo === '0px'), `${v.datos.length} datos`);
  check(P + 'datos: ' + e.datos.map(d => d.join(' ')).join(' | '), same(v.datos.map(d => [d.n, d.l]), e.datos), v.datos.map(d => `${d.n} ${d.l}`).join(' | '));
  check(P + 'los datos apilados quedan dentro de la tarjeta, sin desbordar', !v.desborda && v.datos.every(d => d.box.t >= v.cabBox.t - 1 && d.box.b <= v.cabBox.b + 1), JSON.stringify(v.cabBox));
  check(P + 'números de los datos en serif y en el color de la sección (' + (esc ? '22' : '17') + ' px, rótulo ' + (esc ? '13' : '11') + ' px)',
    v.datos.every(d => d.nColor === COLORES[seccion] && d.nFont === (esc ? '22px' : '17px') && d.lFont === (esc ? '13px' : '11px')), JSON.stringify(v.datos[0]));
  check(P + (esc ? 'escritorio: número y rótulo del dato en el mismo renglón' : 'celular: el rótulo debajo del número'), v.datos.every(d => esc ? d.mismoRenglon : !d.mismoRenglon));
  check(P + 'ningún rótulo en dos renglones', v.datos.every(d => d.uno) && v.subUno, JSON.stringify(v.datos.map(d => d.uno)));
  aviso(P + 'ningún dato ni subtítulo cortado con "…"', v.datos.every(d => !d.trunc) && !v.subTrunc, v.datos.filter(d => d.trunc).map(d => `${d.n} ${d.l}`).join(' | '));
  if (seccion !== 'calidad') {
    check(P + `indicador principal "${e.num}" serif en el color de la sección (${esc ? 46 : 34} px) con la unidad ${esc ? 'al lado' : 'abajo (20 px)'}`,
      v.num === e.num && v.numColor === COLORES[seccion] && /Fraunces/.test(v.numFam) && v.numFont === (esc ? '46px' : '34px') && UNIDADES[seccion].test(v.unidad) && (esc ? v.unidadAlLado : v.unidadAbajo), JSON.stringify({ n: v.num, u: v.unidad, f: v.numFont, c: v.numColor }));
    check(P + 'subtítulo gris de ' + (esc ? '13' : '11') + ' px', v.sub.length > 3, v.sub);
  } else {
    const m = v.med;
    check(P + `medidor de ${esc ? 150 : 124} px de ancho, sin rayitas ni números 0–5, con arco, aguja y eje`, !!m && Math.round(m.ancho) === (esc ? 150 : 124) && m.dataAncho === (esc ? 150 : 124) && m.textos === 0 && m.rayitas === 0 && m.aguja, JSON.stringify(m && { a: m.ancho, t: m.textos, r: m.rayitas }));
    check(P + 'el arco no se corta: ningún trazo fuera del viewBox (radio = (ancho − grosor)/2 − 2, centro y = radio + grosor/2 + 2)',
      !!m && m.izq >= -0.01 && m.der <= m.vb[2] + 0.01 && m.arriba >= -0.01 && m.cy + 4.5 <= m.vb[3] + 0.01 && Math.abs(m.R - ((m.vb[2] - m.sw) / 2 - 2)) < 0.05 && Math.abs(m.cy - (m.R + m.sw / 2 + 2)) < 0.05 && Math.abs(m.sw - m.vb[2] * 0.11) < 0.1, JSON.stringify(m && { izq: m.izq, der: m.der, arriba: m.arriba, sw: m.sw, R: m.R, cy: m.cy, vb: m.vb }));
    check(P + `"${e.num}" en serif dorado de ${esc ? '46' : '~25'} px, y el logo de Vivino de ${esc ? 13 : 11} px de alto`, v.calN?.txt === e.num && v.calN.color === COLORES.calidad && /Fraunces/.test(v.calN.fam) && (esc ? v.calN.font === '46px' : Math.abs(parseFloat(v.calN.font) - 25) <= 1) && v.logo && Math.abs(v.logo.alto - (esc ? 13 : 11)) <= 1, JSON.stringify({ n: v.calN, l: v.logo }));
    check(P + (esc ? 'escritorio: el 4,19 va al costado del medidor' : 'celular: el 4,19 va adentro del arco, arriba del eje'),
      esc ? v.calN.box.l >= m.box.r - 1 : (v.calN.box.l >= m.box.l - 1 && v.calN.box.r <= m.box.r + 1 && v.calN.box.b <= m.box.t + m.cy + 1 && v.calN.box.t >= m.box.t - 1), JSON.stringify({ n: v.calN?.box, m: m?.box }));
    check(P + (esc ? '"375 botellas puntuadas"' : '"375 puntuadas"') + ' debajo del logo', esc ? /botellas? puntuadas?$/.test(v.calS) : /puntuadas?$/.test(v.calS) && !/botella/.test(v.calS), v.calS);
  }
  const lay = await reglaDeLayout(pg, OPC_LAYOUT);
  check(P + 'regla de layout (una línea, sin pisarse, sin scroll horizontal)', sinInfracciones(lay), textoInfracciones(lay));
  check(P + 'la página no tira errores', errs.length === 0, errs.slice(0, 2).join(' | '));
  await pg.close();
  return v;
}

// ── gesto de deslizar ──
async function deslizar(pg, x0, y0, x1, y1) {
  await pg.evaluate(({ x0, y0, x1, y1 }) => {
    const el = document.elementFromPoint(x0, y0) ?? document.body;
    const toque = (x, y) => ({ clientX: x, clientY: y, identifier: 1, target: el });
    const ev = (type, x, y, fin) => {
      const e = new Event(type, { bubbles: true, composed: true });
      Object.defineProperty(e, 'touches', { value: fin ? [] : [toque(x, y)] });
      Object.defineProperty(e, 'changedTouches', { value: [toque(x, y)] });
      el.dispatchEvent(e);
    };
    ev('touchstart', x0, y0); ev('touchend', x1, y1, true);
  }, { x0, y0, x1, y1 });
  await pg.waitForTimeout(450);
}
const hash = pg => pg.evaluate(() => location.hash.split('?')[0]);

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
const E = esperadas(JSON.parse(apiTxt));

const browser = await chromium.launch({ headless: true });
let wk = null;
try {
  // las cuatro cabeceras: escritorio, celular en Chromium y en WebKit
  const altos = {};
  for (const [etiqueta, w, h, esc] of [['chromium 820', 820, 1000, true], ['chromium 390', 390, 844, false]]) {
    console.log(`── ${etiqueta} ──`);
    const c = await browser.newContext({ viewport: { width: w, height: h } });
    for (const s of SECCIONES) { const v = await cabecera(c, apiBody, s, etiqueta, esc, E); altos[`${etiqueta}${s}`] = v.h; }
    await c.close();
    check(`[${etiqueta}] las cuatro cabeceras tienen el mismo alto`, new Set(SECCIONES.map(s => altos[`${etiqueta}${s}`])).size === 1, JSON.stringify(SECCIONES.map(s => altos[`${etiqueta}${s}`])));
    console.log('');
  }
  console.log('── webkit iPhone 13 (390) ──');
  const { browser: b2, ctx } = await abrirIphone();
  wk = b2;
  for (const s of SECCIONES) await cabecera(ctx, apiBody, s, 'webkit 390', false, E);
  console.log('');

  // PENDIENTE (a mano en el iPhone): el gesto de deslizar entre secciones (izquierda/derecha, 40 px, diagonal, desde los chips,
  // desde el borde, con la ficha abierta, en escritorio). Las pruebas simuladas se sacaron de este script.
} finally {
  await browser.close();
  if (wk) await wk.close();
  if (server) server.kill();
}

const avisos = results.filter(r => !r.ok && r.soloAviso);
const fallas = results.filter(r => !r.ok && !r.soloAviso);
console.log('═'.repeat(64));
console.log(`${results.length - fallas.length - avisos.length}/${results.length} chequeos OK`);
if (avisos.length) { console.log(`\n${avisos.length} AVISO(S):`); avisos.forEach(a => console.log(`  ! ${a.name}${a.detail ? '  →  ' + a.detail : ''}`)); }
if (fallas.length) { console.log(`\n${fallas.length} FALLA(S):`); fallas.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? '  →  ' + f.detail : ''}`)); process.exit(1); }
console.log('TODO OK ✓');
