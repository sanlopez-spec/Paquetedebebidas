#!/usr/bin/env node
// Verificación automática de la pantalla de resumen de /club/cava.
//
//   node scripts/check-resumen.mjs                              (local: vite preview + api/cava.ts real)
//   node scripts/check-resumen.mjs --base https://edb.com.ar    (producción)
//   node scripts/check-resumen.mjs --base <url> --shots <dir>   (además guarda capturas)
//
// En local levanta `vite preview` y, como el preview no corre funciones
// serverless, ejecuta api/cava.ts acá mismo (con AIRTABLE_TOKEN de .env.local)
// y sirve ese JSON — así se verifica también el código nuevo de la API.
//
// Sale con código 1 si falla cualquier chequeo.

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
const URL      = BASE + '/club/cava';

const VIEWPORTS = [
  { w: 390,  h: 844, label: 'celular',   file: 'mob' },
  { w: 1440, h: 900, label: 'escritorio', file: 'dsk' },
];

// ── 1. Texto esperado de las 6 tarjetas, en orden ─────────────────
const EXPECT_CARDS = [
  { titulo: 'Cepas y estilos', big: '18 cepas',      sub: '89% tintos' },
  { titulo: 'Geografía',       big: '24 regiones',   sub: '83 bodegas de 4 países' },
  { titulo: 'Añadas',          big: '8,7 años',      sub: 'añada promedio 2017' },
  { titulo: 'Calidad',         big: '4,2',           sub: 'puntaje promedio en Vivino.com' },
  { titulo: 'Consumos',        big: '205',           sub: 'abiertas, de 11 países' },
  { titulo: 'Las botellas',    big: '383 en guarda', sub: '222 etiquetas' },
];

const PROHIBIDAS = ['inversión', 'inversion', 'valuación', 'valuacion',
                    'revalorización', 'revalorizacion', 'ganancia'];
const MONEY_KEY = /costo|precio|valor|usd|sugerid|ganancia|inversi|valuaci|revaloriz|monto|importe|ahorro/i;
// Números de la cava que no pueden estar escritos a mano en el código.
const LITERALES = [588, 383, 205, 222, 175, 83, 24];
const MOJIBAKE  = ['Ã', 'Â', 'â€'];

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
const norm = s => (s || '').replace(/\s+/g, ' ').trim();

// ── chequeos de archivos (no dependen del browser) ────────────────
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(p))) out.push(p);
  }
  return out;
}

// Saca comentarios y literales de texto: lo que queda es código de verdad,
// así un viewBox="0 0 24 24" o un rgba(36,19,24,.5) no cuentan como dato.
function soloCodigo(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

function chequeosDeArchivos() {
  console.log('── archivos ──');

  // 10 ── números de la cava escritos a mano en src/club (sin src/club/data/)
  const archivos = walk(join(ROOT, 'src', 'club'), ['.ts', '.tsx'])
    .filter(p => !relative(ROOT, p).split(sep).includes('data'));
  const hallazgos = [];
  for (const p of archivos) {
    const code = soloCodigo(readFileSync(p, 'utf8'));
    code.split('\n').forEach((linea, i) => {
      for (const n of LITERALES) {
        if (new RegExp(`(?<![\\d.])${n}(?![\\d.])`).test(linea)) {
          hallazgos.push(`${relative(ROOT, p)}:${i + 1} → ${n}  «${linea.trim().slice(0, 70)}»`);
        }
      }
    });
  }
  check('sin números de la cava escritos a mano en src/club (excluye data/)',
    hallazgos.length === 0, hallazgos.join(' | '));

  // mojibake en src/, api/, public/, index.html
  const textos = [
    ...walk(join(ROOT, 'src'), ['.ts', '.tsx', '.css', '.json', '.html']),
    ...walk(join(ROOT, 'api'), ['.ts', '.json']),
    ...walk(join(ROOT, 'public'), ['.html', '.css', '.js', '.json', '.svg']),
    join(ROOT, 'index.html'),
  ].filter(p => existsSync(p));
  const mojis = [];
  for (const p of textos) {
    const src = readFileSync(p, 'utf8');
    for (const m of MOJIBAKE) if (src.includes(m)) mojis.push(`${relative(ROOT, p)} (${m})`);
  }
  check('sin mojibake (Ã, Â, â€) en src/, api/, public/, index.html',
    mojis.length === 0, [...new Set(mojis)].join(', '));
  console.log('');
}

// ── api/cava.ts ejecutado acá (sólo en local) ─────────────────────
async function apiLocal() {
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile) && !process.env.AIRTABLE_TOKEN) {
    for (const linea of readFileSync(envFile, 'utf8').split('\n')) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m) process.env[m[1]] ??= m[2];
    }
  }
  if (!process.env.AIRTABLE_TOKEN) {
    console.error('Falta AIRTABLE_TOKEN (ponelo en .env.local) para correr api/cava.ts en local.');
    process.exit(1);
  }
  const { transform } = await import('esbuild');
  const ts = readFileSync(join(ROOT, 'api', 'cava.ts'), 'utf8');
  const { code } = await transform(ts, { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `cava-api-${Date.now()}.mjs`);
  writeFileSync(tmp, code, 'utf8');
  const { default: handler } = await import(pathToFileURL(tmp).href);
  let body = null, status = 0;
  await handler({}, {
    setHeader() {},
    status(s) { status = s; return this; },
    json(b) { body = b; return this; },
  });
  if (status !== 200 || !body || body.error) {
    console.error('api/cava.ts devolvió', status, JSON.stringify(body).slice(0, 300));
    process.exit(1);
  }
  return JSON.stringify(body);
}

// ── servidor local ────────────────────────────────────────────────
async function waitForServer(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url, { method: 'GET' }); if (r.ok || r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

chequeosDeArchivos();

let server = null;
let apiBody = null;
if (IS_LOCAL) {
  console.log('Corriendo api/cava.ts contra Airtable…');
  apiBody = await apiLocal();
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteBin)) { console.error('No encuentro vite en node_modules.'); process.exit(1); }
  console.log('Levantando vite preview en 4173…');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'],
                 { cwd: ROOT, stdio: 'ignore' });
  if (!await waitForServer(BASE + '/', 30000)) {
    console.error('El preview local no respondió.'); server.kill(); process.exit(1);
  }
}

console.log(`\nVerificando ${URL}\n`);
const browser = await chromium.launch({ headless: true });

try {
  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.label} (${vp.w}×${vp.h}) ──`);
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.w < 500 ? 2 : 1,
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', e => consoleErrors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    if (apiBody) {
      await page.route('**/api/cava', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    }

    await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForSelector('.sec-card', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const P = vp.file + ': ';

    // ── 1. las 6 tarjetas, texto exacto ─────────────────────────────
    const cards = await page.$$eval('.sec-card', els => els.map(e => ({
      titulo: e.querySelector('.sec-card-title')?.textContent ?? '',
      big:    e.querySelector('.sec-card-big')?.textContent ?? '',
      sub:    e.querySelector('.sec-card-sub')?.textContent ?? '',
      todo:   e.textContent ?? '',
      pill:   e.querySelector('.sec-card-pill')?.textContent ?? '',
      bg:     getComputedStyle(e).backgroundColor,
      rects: {
        titulo: e.querySelector('.sec-card-title')?.getBoundingClientRect().toJSON() ?? null,
        sub:    e.querySelector('.sec-card-sub')?.getBoundingClientRect().toJSON() ?? null,
        pill:   e.querySelector('.sec-card-pill')?.getBoundingClientRect().toJSON() ?? null,
        ill:    e.querySelector('.sec-card-ill')?.getBoundingClientRect().toJSON() ?? null,
      },
    })));
    check(P + '1. hay 6 tarjetas', cards.length === 6, `hay ${cards.length}`);
    EXPECT_CARDS.forEach((exp, i) => {
      const got = cards[i];
      if (!got) { check(`${P}1. tarjeta ${i + 1} (${exp.titulo})`, false, 'no existe'); return; }
      const ok = norm(got.titulo) === exp.titulo && norm(got.big) === exp.big && norm(got.sub) === exp.sub;
      check(`${P}1. tarjeta ${i + 1} «${exp.titulo}»`, ok,
        `esperado "${exp.titulo} / ${exp.big} / ${exp.sub}" — obtuve "${norm(got.titulo)} / ${norm(got.big)} / ${norm(got.sub)}"`);
    });

    // ── 2. seis fondos distintos entre sí y del fondo de la página ──
    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const bgs = cards.map(c => c.bg);
    check(P + '2. los 6 fondos son distintos entre sí',
      new Set(bgs).size === 6, bgs.join(' / '));
    check(P + '2. ningún fondo igual al de la página',
      !bgs.includes(pageBg), `fondo de página ${pageBg}`);

    // ── 3. sin flechas, con píldora "Ver ›" ─────────────────────────
    const conFlecha = cards.filter(c => c.todo.includes('→')).length;
    check(P + '3. ninguna tarjeta contiene "→"', conFlecha === 0, `${conFlecha} tarjetas`);
    const sinPill = cards.filter(c => norm(c.pill) !== 'Ver ›').length;
    check(P + '3. las 6 tarjetas tienen la píldora "Ver ›"', sinPill === 0, `${sinPill} sin píldora`);

    // extra: la ilustración no puede quedar debajo del texto ni de la píldora
    const cruza = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const tapadas = cards.filter(c => ['titulo', 'sub', 'pill']
      .some(k => cruza(c.rects.ill, c.rects[k]))).length;
    check(P + '3. ninguna ilustración se superpone al texto', tapadas === 0, `${tapadas} tarjetas`);

    // ── 4. encabezado y áreas del gráfico ───────────────────────────
    const evo = await page.evaluate(() => {
      const w = document.querySelector('.evo-chart-wrap');
      if (!w) return null;
      return {
        hero:  w.querySelector('.evo-hero-num')?.textContent ?? '',
        label: w.querySelector('.evo-hero-label')?.textContent ?? '',
        dGuarda:   w.querySelector('.evo-area-guarda')?.getAttribute('d') ?? '',
        dAbiertas: w.querySelector('.evo-area-abiertas')?.getAttribute('d') ?? '',
        ends:  [...w.querySelectorAll('.evo-end')].map(e => e.textContent.trim()),
        xs:    [...w.querySelectorAll('.evo-xlabel')].map(e => e.textContent.trim()),
        edad:  [...w.querySelectorAll('.evo-edad-n')].map(e => e.textContent.trim()),
        filaVieja: document.querySelectorAll('.evo-edad-wrap, .evo-edad-row, .evo-edad-val').length,
        // los números de edad tienen que estar dentro del gráfico
        edadFuera: [...w.querySelectorAll('.evo-edad-n')]
          .filter(e => !e.closest('.evo-plot')).length,
      };
    });
    check(P + '4. gráfico de evolución presente', !!evo);
    if (evo) {
      check(P + '4. el encabezado dice 588', norm(evo.hero) === '588', norm(evo.hero));
      check(P + '4. dice "botellas compradas desde abril 2021"',
        norm(evo.label) === 'botellas compradas desde abril 2021', norm(evo.label));
      // en coordenadas normalizadas, y=1000 es el cero del eje
      check(P + '4. el primer punto del área "en guarda" es 0',
        /^M0\.0,1000\.0/.test(evo.dGuarda), evo.dGuarda.slice(0, 24));
      check(P + '4. el primer punto del área "abiertas" es 0',
        /^M0\.0,1000\.0/.test(evo.dAbiertas), evo.dAbiertas.slice(0, 24));
      check(P + '4. las etiquetas finales son 383 y 205',
        evo.ends.length === 2 && evo.ends[0] === '383' && evo.ends[1] === '205', evo.ends.join(' / '));
      check(P + '4. no existe la fila vieja "Edad al abrir" fuera del gráfico',
        evo.filaVieja === 0 && evo.edadFuera === 0, `${evo.filaVieja} filas, ${evo.edadFuera} valores fuera`);
      check(P + '4. el eje X tiene 2021…2026 y Hoy',
        evo.xs.join(',') === '2021,2022,2023,2024,2025,2026,Hoy', evo.xs.join(','));

      // ── 5. la línea de edad al abrir: 6 valores con coma ──────────
      check(P + '5. la línea "Edad al abrir" tiene 6 valores', evo.edad.length === 6,
        `hay ${evo.edad.length}: ${evo.edad.join(' · ')}`);
      check(P + '5. los 6 valores usan coma decimal',
        evo.edad.length === 6 && evo.edad.every(v => /^\d+,\d$/.test(v)), evo.edad.join(' · '));
    }

    // ── 6. las tres columnas de "Valor de la cava", en la misma fila ─
    const cols = await page.$$eval('.lock-col', els => els.map(e => ({
      top:    Math.round(e.getBoundingClientRect().top * 100) / 100,
      topVal: Math.round((e.querySelector('b')?.getBoundingClientRect().top ?? -1) * 100) / 100,
      txt:    e.querySelector('span')?.textContent ?? '',
      val:    e.querySelector('b')?.textContent ?? '',
    }))).then(cs => cs.map(c => ({ ...c, txt: norm(c.txt), val: norm(c.val) })));
    const spread = a => a.length === 3 ? Math.max(...a) - Math.min(...a) : Infinity;
    check(P + '6. las 3 columnas de "Valor de la cava" en la misma fila',
      cols.length === 3 && spread(cols.map(c => c.top)) <= 2,
      cols.length !== 3 ? `hay ${cols.length} columnas` : `tops ${cols.map(c => c.top).join(', ')}`);
    check(P + '6. los 3 "USD ●●●●" alineados entre sí',
      cols.length === 3 && spread(cols.map(c => c.topVal)) <= 2 && cols.every(c => c.val === 'USD ●●●●'),
      cols.map(c => `${c.val}@${c.topVal}`).join(', '));
    check(P + '6. los nombres de las 3 columnas',
      cols.map(c => c.txt).join(' | ') === 'Valor de la cava | Ahorro por precio club | Valor sumado por la guarda',
      cols.map(c => c.txt).join(' | '));

    // ── 7. sin scroll horizontal ────────────────────────────────────
    const sw = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    }));
    check(P + '7. sin scroll horizontal', sw.scrollWidth <= sw.innerWidth,
      `scrollWidth ${sw.scrollWidth} > innerWidth ${sw.innerWidth}`);

    // ── 8. palabras prohibidas y decimales con punto ────────────────
    const texto = await page.evaluate(() => {
      const svgTxt = [...document.querySelectorAll('svg text')].map(t => t.textContent).join(' ');
      return document.body.innerText + ' ' + svgTxt;
    });
    const low = texto.toLowerCase();
    const hallada = PROHIBIDAS.filter(p => low.includes(p));
    check(P + '8. sin palabras prohibidas', hallada.length === 0, hallada.join(', '));
    const puntos = texto.match(/\d+\.\d+/g) || [];
    check(P + '8. ningún decimal con punto', puntos.length === 0, puntos.join(', '));

    // ── 9. el JSON de la API no trae campos de dinero ───────────────
    const api = await page.evaluate(async (reKey) => {
      const re = new RegExp(reKey, 'i');
      const d = await (await fetch('/api/cava')).json();
      const hits = [];
      (function recorrer(o, path) {
        if (o === null || typeof o !== 'object') return;
        for (const k of Object.keys(o)) {
          if (re.test(k)) hits.push(path + '.' + k);
          recorrer(o[k], path + '.' + k);
        }
      })(d, '');
      const e0 = d?.stats?.evolution?.[0] ?? null;
      return { money: [...new Set(hits)], e0, evoLen: d?.stats?.evolution?.length ?? 0 };
    }, MONEY_KEY.source);
    check(P + '9. la API no tiene campos de dinero', api.money.length === 0, api.money.join(', '));
    check(P + '9. la API arranca la evolución en cero',
      !!api.e0 && api.e0.compradas === 0 && api.e0.abiertas === 0 && api.e0.enGuarda === 0,
      JSON.stringify(api.e0));
    check(P + '9. la evolución tiene 7 puntos (2021…2026 + Hoy)', api.evoLen === 7, `hay ${api.evoLen}`);

    // ── sin errores de consola ──────────────────────────────────────
    check(P + 'sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${vp.file}-resumen.png`), fullPage: false });
      await page.screenshot({ path: join(SHOTS, `${vp.file}-resumen-completo.png`), fullPage: true });
      console.log(`  (capturas en ${SHOTS})`);
    }

    await ctx.close();
    console.log('');
  }
} finally {
  await browser.close();
  if (server) server.kill();
}

const fallas = results.filter(r => !r.ok);
console.log('═'.repeat(64));
console.log(`${results.length - fallas.length}/${results.length} chequeos OK`);
if (fallas.length) {
  console.log(`\n${fallas.length} FALLA(S):`);
  fallas.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? '  →  ' + f.detail : ''}`));
  process.exit(1);
}
console.log('TODO OK ✓');
