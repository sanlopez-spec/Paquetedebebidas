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
  // Ojo: son los datos reales de la cava. Si cambian en Airtable, hay que
  // actualizar esta tabla — el chequeo 1b avisa cuál se movió.
  { etiqueta: 'Cepas y estilos', num: '18',  palabra: 'cepas',              sub: '90% tintos' },
  { etiqueta: 'Geografía',       num: '24',  palabra: 'regiones',           sub: '83 bodegas de 4 países' },
  { etiqueta: 'Añadas',          num: '8,7', palabra: 'años',               sub: 'añada promedio 2017' },
  { etiqueta: 'Calidad',         num: '4,2', palabra: 'promedio Vivino',     sub: '175 botellas con 4,3 o más' },
  { etiqueta: 'Consumos',        num: '205', palabra: 'abiertas',           sub: 'de 11 países distintos' },
  { etiqueta: 'Las botellas',    num: '383', palabra: 'en guarda',          sub: '222 etiquetas' },
];
const ALTO_MAX = { 390: 150, 1440: 120 };

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
// Los datos de la cava cambian cada vez que se carga algo en Airtable. Compararlos
// contra valores congelados sirve para enterarse, no para frenar el deploy: esos
// chequeos salen como AVISO. Lo que falla de verdad es que la pantalla no coincida
// con /api/cava (chequeo 1b) y todo lo de layout, formato y reglas.
function aviso(name, ok, detail = '') {
  results.push({ name, ok, detail, soloAviso: true });
  console.log(`  ${ok ? 'OK   ' : 'AVISO'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
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

// Saca sólo lo que es dibujo: atributos de SVG (viewBox, d, coordenadas) y
// colores. Todo lo demás —código Y texto de JSX— sí cuenta como dato.
function sinDibujo(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    // atributos de SVG con números
    .replace(/\b(viewBox|d|points|transform|cx|cy|r|rx|ry|x|y|x1|x2|y1|y2|width|height|strokeWidth|strokeDasharray|offset|stdDeviation)\s*=\s*(".*?"|'.*?'|\{[^}]*\})/gs, ' ')
    // colores
    .replace(/#[0-9a-fA-F]{3,8}\b/g, ' ')
    .replace(/\b(rgba?|hsla?)\([^)]*\)/g, ' ');
}

function chequeosDeArchivos() {
  console.log('── archivos ──');

  // 7 ── números de la cava escritos a mano en src/club (sin src/club/data/),
  //      también dentro de textos y JSX, no sólo en código
  const archivos = walk(join(ROOT, 'src', 'club'), ['.ts', '.tsx'])
    .filter(p => !relative(ROOT, p).split(sep).includes('data'));
  const hallazgos = [];
  for (const p of archivos) {
    const code = sinDibujo(readFileSync(p, 'utf8'));
    code.split('\n').forEach((linea, i) => {
      for (const n of LITERALES) {
        if (new RegExp(`(?<![\\d.,])${n}(?![\\d.,])`).test(linea)) {
          hallazgos.push(`${relative(ROOT, p)}:${i + 1} → ${n}  «${linea.trim().slice(0, 70)}»`);
        }
      }
    });
  }
  check('7. sin números de la cava escritos a mano en src/club (código y JSX)',
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
    const LEER_CARDS = () => [...document.querySelectorAll('.sec-card')].map(e => {
      const r = s => e.querySelector(s)?.getBoundingClientRect().toJSON() ?? null;
      return {
        etiqueta: e.querySelector('.sec-card-label')?.textContent ?? '',
        num:      e.querySelector('.sec-card-big b')?.textContent ?? '',
        palabra:  e.querySelector('.sec-card-big span')?.textContent ?? '',
        sub:      e.querySelector('.sec-card-sub')?.textContent ?? '',
        todo:     e.textContent ?? '',
        pill:     e.querySelector('.sec-card-pill')?.textContent ?? '',
        bg:       getComputedStyle(e).backgroundColor,
        alto:     Math.round(e.getBoundingClientRect().height),
        illPos:   e.querySelector('.sec-card-ill') ? getComputedStyle(e.querySelector('.sec-card-ill')).position : null,
        caja:     e.getBoundingClientRect().toJSON(),
        rects: { etiqueta: r('.sec-card-label'), sub: r('.sec-card-sub'),
                 pill: r('.sec-card-pill'), ill: r('.sec-card-ill'), big: r('.sec-card-big') },
      };
    });
    const cards = await page.evaluate(LEER_CARDS);
    check(P + '1. hay 6 tarjetas', cards.length === 6, `hay ${cards.length}`);
    EXPECT_CARDS.forEach((exp, i) => {
      const got = cards[i];
      if (!got) { check(`${P}1. tarjeta ${i + 1} (${exp.etiqueta})`, false, 'no existe'); return; }
      const ok = norm(got.etiqueta) === exp.etiqueta && norm(got.num) === exp.num
              && norm(got.palabra) === exp.palabra && norm(got.sub) === exp.sub;
      aviso(`${P}1. tarjeta ${i + 1} «${exp.etiqueta}»`, ok,
        `esperado "${exp.num} ${exp.palabra} / ${exp.sub}" — obtuve "${norm(got.num)} ${norm(got.palabra)} / ${norm(got.sub)}"`);
    });

    // ── 2. alto, ilustración de fondo y píldora en la esquina ───────
    const tope = ALTO_MAX[vp.w];
    const altas = cards.filter(c => c.alto > tope);
    check(P + `2. ninguna tarjeta pasa los ${tope} px de alto`, altas.length === 0,
      `altos: ${cards.map(c => c.alto).join(', ')}`);
    const filas = {};
    cards.forEach(c => { const k = Math.round(c.caja.top); (filas[k] ??= []).push(c.alto); });
    const filasDesparejas = Object.entries(filas)
      .filter(([, hs]) => Math.max(...hs) - Math.min(...hs) > 1);
    check(P + '2. las tarjetas de una misma fila, iguales de alto',
      filasDesparejas.length === 0, JSON.stringify(filasDesparejas));
    check(P + '2. la ilustración es position:absolute',
      cards.every(c => c.illPos === 'absolute'), cards.map(c => c.illPos).join(', '));
    // La ilustración es fondo: va detrás del texto y no puede tapar la píldora.
    const cruza = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const tapaPill = cards.filter(c => cruza(c.rects.ill, c.rects.pill)).length;
    check(P + '2. la ilustración no llega a la píldora', tapaPill === 0, `${tapaPill} tarjetas`);
    const capas = await page.evaluate(() => [...document.querySelectorAll('.sec-card')].map(e => {
      const z = s => Number(getComputedStyle(e.querySelector(s)).zIndex) || 0;
      return { ill: z('.sec-card-ill'), txt: z('.sec-card-big'), pill: z('.sec-card-pill') };
    }));
    check(P + '2. la ilustración queda detrás del texto y de la píldora',
      capas.every(c => c.ill < c.txt && c.ill < c.pill), JSON.stringify(capas[0]));
    // "no ocupa lugar en el layout": sacarla no cambia el alto de la tarjeta
    const sinIll = await page.evaluate(() => {
      const cs = [...document.querySelectorAll('.sec-card')];
      const antes = cs.map(e => Math.round(e.getBoundingClientRect().height));
      const ills = [...document.querySelectorAll('.sec-card-ill')];
      ills.forEach(i => { i.style.display = 'none'; });
      const despues = cs.map(e => Math.round(e.getBoundingClientRect().height));
      ills.forEach(i => { i.style.display = ''; });
      return { antes, despues };
    });
    check(P + '2. la ilustración no ocupa lugar en el layout',
      sinIll.antes.every((h, i) => h === sinIll.despues[i]),
      `${sinIll.antes.join(',')} → ${sinIll.despues.join(',')}`);
    const pillMal = cards.filter(c => {
      const p = c.rects.pill, caja = c.caja;
      return !p || (caja.right - p.right) > 16 || (p.top - caja.top) > 16;
    }).length;
    check(P + '2. la píldora está en la esquina superior derecha', pillMal === 0, `${pillMal} tarjetas`);

    // fondos distintos entre sí y del fondo de la página
    const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const bgs = cards.map(c => c.bg);
    check(P + '2. los 6 fondos son distintos entre sí', new Set(bgs).size === 6, bgs.join(' / '));
    check(P + '2. ningún fondo igual al de la página', !bgs.includes(pageBg), `fondo de página ${pageBg}`);

    const conFlecha = cards.filter(c => c.todo.includes('→')).length;
    check(P + '2. ninguna tarjeta contiene "→"', conFlecha === 0, `${conFlecha} tarjetas`);
    const sinPill = cards.filter(c => norm(c.pill) !== 'Ver ›').length;
    check(P + '2. las 6 tarjetas tienen la píldora "Ver ›"', sinPill === 0, `${sinPill} sin píldora`);

    // ── 1b. lo que muestran las tarjetas es lo que dice la API ──────
    // Esto es el contrato de verdad: la tabla de arriba congela los datos de
    // hoy, pero lo que no puede fallar nunca es que la pantalla muestre otra
    // cosa que /api/cava.
    const contra = await page.evaluate(async () => {
      const d = await (await fetch('/api/cava')).json();
      const s = d.stats, n = (v, dec = 0) => new Intl.NumberFormat('es-AR',
        { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);
      const t0 = s.tipoComposicion[0];
      return [
        { num: n(s.cepasCount),        sub: `${n(t0.pct)}% ${t0.tipo}s` },
        { num: n(s.regionesCount),     sub: `${n(s.bodegasCount)} bodegas de ${n(s.paisesCount)} países` },
        { num: n(s.edadPromedioGuarda, 1), sub: `añada promedio ${s.anadaPromedio}` },
        { num: n(s.vivinoPromedio, 1), sub: `${n(s.vivinoAlto43Count)} botellas con 4,3 o más` },
        { num: n(d.cons.grupal.total), sub: `de ${n(s.paisesConsumidasCount)} países distintos` },
        { num: n(s.enGuarda),          sub: `${n(s.etiquetas)} etiquetas` },
      ];
    });
    const desvios = contra.map((esp, i) => {
      const got = cards[i];
      if (!got) return `tarjeta ${i + 1} no existe`;
      if (norm(got.num) !== esp.num) return `${EXPECT_CARDS[i].etiqueta}: número "${norm(got.num)}" vs API "${esp.num}"`;
      if (norm(got.sub) !== esp.sub) return `${EXPECT_CARDS[i].etiqueta}: subtítulo "${norm(got.sub)}" vs API "${esp.sub}"`;
      return null;
    }).filter(Boolean);
    check(P + '1b. las 6 tarjetas muestran lo que dice /api/cava',
      desvios.length === 0, desvios.join(' | '));

    // la cuota de la ficha también sale de la API, no del JSX
    const cuota = await page.evaluate(async () => {
      const d = await (await fetch('/api/cava')).json();
      const p = d.perfiles?.grupal ?? {};
      const esperado = p.cuotaMensual
        ? `${p.cuotaMoneda ?? 'USD'} ${new Intl.NumberFormat('es-AR').format(p.cuotaMensual)} por mes cada uno`
        : null;
      return { esperado, enPantalla: document.querySelector('.tperfil')?.textContent ?? '' };
    });
    check(P + '1b. la cuota de la ficha es la que dice /api/cava',
      !!cuota.esperado && cuota.enPantalla.includes(cuota.esperado),
      `esperaba "${cuota.esperado}"`);

    // ── 2b. la ficha del #001 y el título de Calidad ────────────────
    const ficha = await page.evaluate(() => {
      const f = document.querySelector('.tperfil');
      const cal = [...document.querySelectorAll('.sec-card')]
        .find(e => e.querySelector('.sec-card-label')?.textContent?.trim() === 'Calidad');
      const big = cal?.querySelector('.sec-card-big');
      const b = big?.querySelector('b');
      return {
        texto: f ? f.textContent : '',
        // ¿cuántos renglones ocupa el título de Calidad?
        renglones: big ? big.getClientRects().length : 0,
        altoBig: big ? Math.round(big.getBoundingClientRect().height) : 0,
        altoNum: b ? Math.round(b.getBoundingClientRect().height) : 0,
        calTexto: big ? big.textContent : '',
        // la caja del TEXTO (no la del div, que ocupa todo el ancho):
        // es lo que de verdad podría quedar encima de la estrella
        bigCaja: (() => {
          if (!big) return null;
          const rg = document.createRange(); rg.selectNodeContents(big);
          return rg.getBoundingClientRect().toJSON();
        })(),
        illCaja: cal?.querySelector('.sec-card-ill')?.getBoundingClientRect().toJSON() ?? null,
      };
    });
    aviso(P + '2b. la ficha dice "USD 50 por mes cada uno"',
      ficha.texto.includes('USD 50 por mes cada uno'), norm(ficha.texto));
    check(P + '2b. el título de Calidad no dice ".com"',
      !ficha.calTexto.includes('.com'), norm(ficha.calTexto));
    if (vp.w >= 1000) {
      check(P + '2b. en escritorio el título de Calidad entra en una línea',
        ficha.renglones === 1, `${ficha.renglones} renglones: "${norm(ficha.calTexto)}"`);
      const pisa = ficha.bigCaja && ficha.illCaja
        && ficha.bigCaja.left < ficha.illCaja.right && ficha.illCaja.left < ficha.bigCaja.right
        && ficha.bigCaja.top < ficha.illCaja.bottom && ficha.illCaja.top < ficha.bigCaja.bottom;
      check(P + '2b. el título de Calidad no tapa la estrella', !pisa, JSON.stringify(ficha.illCaja));
    }

    // ── 2c. la nota al pie, a 24 px del bloque "Valor de la cava" ───
    const hueco = await page.evaluate(() => {
      const lock = document.querySelector('.lockcard');
      const nota = document.querySelector('.tnote');
      if (!lock || !nota) return null;
      return Math.round(nota.getBoundingClientRect().top - lock.getBoundingClientRect().bottom);
    });
    check(P + '2c. 24 px entre "Valor de la cava" y la nota al pie',
      hueco !== null && Math.abs(hueco - 24) <= 2, `${hueco} px`);

    // ── 3. cabecera ─────────────────────────────────────────────────
    const cab = await page.evaluate(() => {
      const head = document.querySelector('.tab-top');
      return {
        banner: document.querySelectorAll('.demoband').length,
        franja: document.querySelectorAll('.cava-back-bar').length,
        texto:  head ? head.textContent : '',
        back:   !!head?.querySelector('.tab-back'),
        backCaja: head?.querySelector('.tab-back')?.getBoundingClientRect().toJSON() ?? null,
        sticky: head ? getComputedStyle(head).position : null,
      };
    });
    check(P + '3. no existe el banner dorado', cab.banner === 0, `${cab.banner} nodos`);
    check(P + '3. el header dice "así se verá tu propio tablero"',
      cab.texto.includes('así se verá tu propio tablero'), norm(cab.texto));
    check(P + '3. el header ya no dice "en tiempo real"',
      !cab.texto.includes('en tiempo real'), norm(cab.texto));
    check(P + '3. el "← Volver" está dentro del header, sin franja aparte',
      cab.back && cab.franja === 0, `back=${cab.back} franjas=${cab.franja}`);
    check(P + '3. zona tocable del "←" de 44 px',
      !!cab.backCaja && cab.backCaja.width >= 44 && cab.backCaja.height >= 44,
      JSON.stringify(cab.backCaja));
    check(P + '3. el header no es fijo', cab.sticky === 'static', `position: ${cab.sticky}`);

    // ── 4. el header se va con el scroll ────────────────────────────
    const scr = await page.evaluate(async () => {
      const se = document.scrollingElement;
      const max = se.scrollHeight - se.clientHeight;
      const meta = Math.min(600, max);
      window.scrollTo(0, meta);
      await new Promise(r => setTimeout(r, 300));
      const h = document.querySelector('.tab-top');
      const r = h.getBoundingClientRect();
      window.scrollTo(0, 0);
      return { max, meta, top: Math.round(r.top), visible: r.bottom > 0, alto: Math.round(r.height) };
    });
    await page.waitForTimeout(300);
    // se tiene que haber ido hacia arriba exactamente lo que se scrolleó
    check(P + `4. el header se va con el scroll (${scr.meta} px)`,
      Math.abs(scr.top + scr.meta) <= 2, `top=${scr.top} tras scrollear ${scr.meta}`);
    // Sólo exigible si el contenido da para scrollear más que el alto del header.
    if (scr.meta >= scr.alto) {
      check(P + `4. tras scrollear ${scr.meta} px el header ya no se ve`, scr.visible === false,
        `visible=${scr.visible}, alto=${scr.alto}`);
    } else {
      check(P + `4. el resumen entra casi entero: sólo ${Math.round(scr.max)} px de scroll, ` +
               `no alcanza para sacar el header (${scr.alto} px) — vale el chequeo de arriba`, true);
    }

    // ── 6. espacio entre el eje X y el borde del recuadro ───────────
    const colaEje = await page.evaluate(() => {
      const panel = document.querySelector('.tpanel');
      const xs = [...document.querySelectorAll('.evo-xlabel')];
      if (!panel || !xs.length) return null;
      const base = Math.max(...xs.map(e => e.getBoundingClientRect().bottom));
      return Math.round(panel.getBoundingClientRect().bottom - base);
    });
    check(P + '6. como mucho 24 px entre el eje X y el borde del recuadro',
      colaEje !== null && colaEje <= 24, `${colaEje} px`);

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
    check(P + '8. gráfico de evolución presente', !!evo);
    if (evo) {
      aviso(P + '8. el encabezado dice 588', norm(evo.hero) === '588', norm(evo.hero));
      check(P + '8. dice "botellas compradas desde abril 2021"',
        norm(evo.label) === 'botellas compradas desde abril 2021', norm(evo.label));
      // en coordenadas normalizadas, y=1000 es el cero del eje
      check(P + '8. el primer punto del área "en guarda" es 0',
        /^M0\.0,1000\.0/.test(evo.dGuarda), evo.dGuarda.slice(0, 24));
      check(P + '8. el primer punto del área "abiertas" es 0',
        /^M0\.0,1000\.0/.test(evo.dAbiertas), evo.dAbiertas.slice(0, 24));
      aviso(P + '8. las etiquetas finales son 383 y 205',
        evo.ends.length === 2 && evo.ends[0] === '383' && evo.ends[1] === '205', evo.ends.join(' / '));
      check(P + '8. no existe la fila vieja "Edad al abrir" fuera del gráfico',
        evo.filaVieja === 0 && evo.edadFuera === 0, `${evo.filaVieja} filas, ${evo.edadFuera} valores fuera`);
      aviso(P + '8. el eje X tiene 2021…2026 y Hoy',
        evo.xs.join(',') === '2021,2022,2023,2024,2025,2026,Hoy', evo.xs.join(','));

      // ── 5. la línea de edad al abrir: 6 valores con coma ──────────
      aviso(P + '8. la línea "Edad al abrir" tiene 6 valores', evo.edad.length === 6,
        `hay ${evo.edad.length}: ${evo.edad.join(' · ')}`);
      // el formato sí es regla: no depende de cuántos períodos haya
      check(P + '8. los valores de edad usan coma decimal',
        evo.edad.length > 0 && evo.edad.every(v => /^\d+,\d$/.test(v)), evo.edad.join(' · '));
    }

    // ── 6. las tres columnas de "Valor de la cava", en la misma fila ─
    const cols = await page.$$eval('.lock-col', els => els.map(e => ({
      top:    Math.round(e.getBoundingClientRect().top * 100) / 100,
      topVal: Math.round((e.querySelector('b')?.getBoundingClientRect().top ?? -1) * 100) / 100,
      txt:    e.querySelector('span')?.textContent ?? '',
      val:    e.querySelector('b')?.textContent ?? '',
    }))).then(cs => cs.map(c => ({ ...c, txt: norm(c.txt), val: norm(c.val) })));
    const spread = a => a.length === 3 ? Math.max(...a) - Math.min(...a) : Infinity;
    check(P + '8. las 3 columnas de "Valor de la cava" en la misma fila',
      cols.length === 3 && spread(cols.map(c => c.top)) <= 2,
      cols.length !== 3 ? `hay ${cols.length} columnas` : `tops ${cols.map(c => c.top).join(', ')}`);
    check(P + '8. los 3 "USD ●●●●" alineados entre sí',
      cols.length === 3 && spread(cols.map(c => c.topVal)) <= 2 && cols.every(c => c.val === 'USD ●●●●'),
      cols.map(c => `${c.val}@${c.topVal}`).join(', '));
    check(P + '8. los nombres de las 3 columnas',
      cols.map(c => c.txt).join(' | ') === 'Valor de la cava | Ahorro por precio club | Valor sumado por la guarda',
      cols.map(c => c.txt).join(' | '));

    // ── 7. sin scroll horizontal ────────────────────────────────────
    const sw = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    }));
    check(P + '8. sin scroll horizontal', sw.scrollWidth <= sw.innerWidth,
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
    check(P + '8. la API no tiene campos de dinero', api.money.length === 0, api.money.join(', '));
    check(P + '8. la API arranca la evolución en cero',
      !!api.e0 && api.e0.compradas === 0 && api.e0.abiertas === 0 && api.e0.enGuarda === 0,
      JSON.stringify(api.e0));
    aviso(P + '8. la evolución tiene 7 puntos (2021…2026 + Hoy)', api.evoLen === 7, `hay ${api.evoLen}`);

    // ── sin errores de consola ──────────────────────────────────────
    check(P + 'sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    // ── 5. carga: con /api/cava demorado 2 s no se ven números ──────
    {
      const page2 = await ctx.newPage();
      await page2.route('**/api/cava', async r => {
        await new Promise(res => setTimeout(res, 2000));
        if (apiBody) return r.fulfill({ status: 200, contentType: 'application/json', body: apiBody });
        return r.continue();
      });
      await page2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page2.waitForSelector('.sec-card', { timeout: 20000 });
      await page2.waitForTimeout(350);

      const durante = await page2.evaluate(() => ({
        textos: [...document.querySelectorAll('.sec-card')].map(e => e.textContent ?? ''),
        panel:  document.querySelector('.tpanel')?.getBoundingClientRect().height ?? null,
        msg:    document.querySelector('.tpanel')?.textContent ?? '',
        altos:  [...document.querySelectorAll('.sec-card')]
                  .map(e => Math.round(e.getBoundingClientRect().height)),
      }));
      const conNumero = durante.textos.filter(t => /\d/.test(t));
      check(P + '5. durante la carga ninguna tarjeta muestra un número',
        conNumero.length === 0, conNumero.map(norm).join(' | '));
      check(P + '5. durante la carga el recuadro del gráfico ya está',
        durante.panel !== null && durante.panel > 100, `alto ${durante.panel}`);
      check(P + '5. durante la carga dice "Una cava que crece sin parar"',
        durante.msg.includes('Una cava que crece sin parar'), norm(durante.msg).slice(0, 70));

      await page2.waitForFunction(() => {
        const c = document.querySelector('.sec-card');
        return !!c && /\d/.test(c.textContent ?? '');
      }, { timeout: 20000 });
      await page2.waitForTimeout(500);

      const despues = await page2.evaluate(() => ({
        panel: document.querySelector('.tpanel')?.getBoundingClientRect().height ?? null,
        altos: [...document.querySelectorAll('.sec-card')]
                 .map(e => Math.round(e.getBoundingClientRect().height)),
      }));
      check(P + '5. el recuadro del gráfico no cambia de alto (±4 px)',
        Math.abs((despues.panel ?? 0) - (durante.panel ?? 0)) <= 4,
        `${Math.round(durante.panel)} → ${Math.round(despues.panel)}`);
      const saltos = durante.altos
        .map((h, i) => Math.abs(h - (despues.altos[i] ?? 0)))
        .filter(d => d > 4);
      check(P + '5. ninguna tarjeta cambia de alto (±4 px)', saltos.length === 0,
        `${durante.altos.join(',')} → ${despues.altos.join(',')}`);
      await page2.close();
    }

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

const avisos = results.filter(r => !r.ok && r.soloAviso);
const fallas = results.filter(r => !r.ok && !r.soloAviso);
console.log('═'.repeat(64));
console.log(`${results.length - fallas.length - avisos.length}/${results.length} chequeos OK`);
if (avisos.length) {
  console.log(`\n${avisos.length} AVISO(S) — cambiaron datos de la cava, actualizá la tabla de referencia:`);
  avisos.forEach(a => console.log(`  ! ${a.name}${a.detail ? '  →  ' + a.detail : ''}`));
}
if (fallas.length) {
  console.log(`\n${fallas.length} FALLA(S):`);
  fallas.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? '  →  ' + f.detail : ''}`));
  process.exit(1);
}
console.log('TODO OK ✓');
