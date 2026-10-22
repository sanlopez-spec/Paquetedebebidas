#!/usr/bin/env node
// Verificación automática del Inicio de la app del club (/club/cava).
//
//   node scripts/check-inicio.mjs                              (local: vite preview + api/cava.ts real)
//   node scripts/check-inicio.mjs --base https://edb.com.ar    (producción)
//   node scripts/check-inicio.mjs --base <url> --shots <dir>   (además guarda capturas)
//
// En local levanta `vite preview` y, como el preview no corre funciones
// serverless, ejecuta api/cava.ts acá mismo (con AIRTABLE_TOKEN de .env.local)
// y sirve ese JSON — así se verifica también el código nuevo de la API.
//
// Recorre el Inicio entrando por /club/cava y desde el modal de /club, en
// 390×844 y 1440×900. Sale con código 1 si falla cualquier chequeo.

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

const VIEWPORTS = [
  { w: 390,  h: 844, label: 'celular',    file: 'mob' },
  { w: 1440, h: 900, label: 'escritorio', file: 'dsk' },
];

// ── referencia congelada del 22/10/2026 — sólo para AVISO ──────────
const REF = {
  enGuarda: 383, etiquetas: 222, abiertas: 205, compradas: 588,
  cepas: 18, regiones: 24, bodegas: 83, paises: 4, edad: '8,7', anada: 2017,
  vivino: '4,2', vivino43: 175, paisesConsumidas: 11,
  tramos: { 'Hasta 5 años': 95, '6 a 10': 182, '11 a 15': 67, 'Más de 15': 33 },
  masTomada: 'Malbec', masTomadaN: 46,
  juntada: '2026-09', juntadaBot: 7,
  juntadaVinos: ['Colome Altura Maxima Malbec', 'Salentein Gran VU Blend Añada',
                 'Las Notas de Jean Claude Merlot'],
  ultimaCompra: '2026-09', ultimaCompraBot: 2,
  anadaMin: 2004, anadaMax: 2025, anadasCount: 21, primerConsumo: '2021-05',
  comprasTotal: 571, comprasDesde: '2021-04',
};

// Los textos exactos de las 4 tarjetas de Mi cava (datos reales → AVISO).
const EXPECT_CARDS = [
  { etiqueta: 'Cepas y estilos', num: '18',  palabra: 'cepas',      sub: '90% tintos' },
  { etiqueta: 'Geografía',       num: '24',  palabra: 'regiones',   sub: '83 bodegas de 4 países' },
  { etiqueta: 'Añadas',          num: '8,7', palabra: 'edad prom.', sub: 'añada promedio 2017' },
  { etiqueta: 'Calidad',         num: '4,2', palabra: 'en Vivino',  sub: '175 con 4,3 o más' },
];

const BANDA_A = 'rgb(228, 220, 200)';  // #E4DCC8
const BANDA_B = 'rgb(216, 205, 180)';  // #D8CDB4

const PROHIBIDAS = ['inversión', 'inversion', 'valuación', 'valuacion',
                    'revalorización', 'revalorizacion', 'ganancia'];
const MONEY_KEY = /costo|precio|valor|usd|sugerid|ganancia|inversi|valuaci|revaloriz|monto|importe|ahorro/i;
// Números de la cava que no pueden estar escritos a mano en el código.
const LITERALES = [588, 383, 205, 222, 175, 83, 24];
const MOJIBAKE  = ['Ã', 'Â', 'â€'];

const CHIPS_ESPERADOS = ['Cepas y estilos', 'Geografía', 'Añadas', 'Calidad', 'Las botellas'];

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
// Los datos de la cava cambian cada vez que se carga algo en Airtable:
// compararlos contra valores congelados sirve para enterarse, no para frenar
// el deploy. Lo que falla de verdad es que la pantalla no coincida con
// /api/cava, y todo lo de layout, navegación y reglas.
function aviso(name, ok, detail = '') {
  results.push({ name, ok, detail, soloAviso: true });
  console.log(`  ${ok ? 'OK   ' : 'AVISO'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
const norm = s => (s || '').replace(/\s+/g, ' ').trim();
const n = (v, d = 0) => new Intl.NumberFormat('es-AR',
  { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const MESN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto',
              'Septiembre','Octubre','Noviembre','Diciembre'];
const mesLargo = (ym, cap = false) => {
  const [y, m] = String(ym).split('-').map(Number);
  const nom = MESN[(m || 1) - 1] ?? '';
  return `${cap ? nom : nom.toLowerCase()} ${y}`;
};
const plural = (v, uno, varios) => (v === 1 ? uno : varios);

// ── 9. chequeos de archivos (no dependen del browser) ─────────────
function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(p))) out.push(p);
  }
  return out;
}

// Saca sólo lo que es dibujo: atributos de SVG (viewBox, d, coordenadas) y
// colores. Todo lo demás —código Y texto de JSX— sí cuenta como dato.
function sinDibujo(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
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
    const code = sinDibujo(readFileSync(p, 'utf8'));
    code.split('\n').forEach((linea, i) => {
      for (const num of LITERALES) {
        if (new RegExp(`(?<![\\d.,])${num}(?![\\d.,])`).test(linea)) {
          hallazgos.push(`${relative(ROOT, p)}:${i + 1} → ${num}  «${linea.trim().slice(0, 70)}»`);
        }
      }
    });
  }
  check('9. sin números de la cava escritos a mano en src/club (código y JSX)',
    hallazgos.length === 0, hallazgos.join(' | '));

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
  check('9. sin mojibake (Ã, Â, â€) en src/, api/, public/, index.html',
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

async function waitForServer(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url, { method: 'GET' }); if (r.ok || r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

// ── sondas dentro de la página ────────────────────────────────────

// El contenedor que scrollea: el cuerpo del modal si está abierto, o el documento.
const EN_PAGINA = {
  scroller: `(document.querySelector('.tablero-modal-body') ?? document.scrollingElement)`,
};

const LEER_INICIO = () => {
  const t = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const caja = e => (e ? e.getBoundingClientRect().toJSON() : null);
  const cs = e => (e ? getComputedStyle(e) : null);

  return {
    pantalla: document.querySelector('[data-pantalla]')?.dataset.pantalla ?? null,
    bandas: [...document.querySelectorAll('.banda')].map(e => ({
      n: e.dataset.banda,
      bg: getComputedStyle(e).backgroundColor,
      top: Math.round(e.getBoundingClientRect().top),
      padding: `${cs(e).paddingTop}/${cs(e).paddingBottom}/${cs(e).paddingLeft}`,
    })),
    ficha: t(document.querySelector('.ficha-grupo')),
    miembros: t(document.querySelector('.pf-miembros-n')),
    circulos: document.querySelectorAll('.pf-circulos i').length,
    fichaEsLink: !!document.querySelector('.ficha-grupo a, button.ficha-grupo, .ficha-grupo button'),
    // El club en números
    graficos: [...document.querySelectorAll('.num-card')].map(e => e.dataset.gra),
    dots: document.querySelectorAll('.num-dot').length,
    dotActivo: [...document.querySelectorAll('.num-dot')].findIndex(e => e.classList.contains('on')),
    numPos: t(document.querySelector('.num-pos')),
    carruselTouch: cs(document.querySelector('.num-carrusel'))?.touchAction ?? null,
    evo: (() => {
      const w = document.querySelector('.num-card[data-gra="evo"]');
      if (!w) return null;
      return {
        titulo: t(w.querySelector('h3')),
        hero: t(w.querySelector('.evo-hero-num')),
        label: t(w.querySelector('.evo-hero-label')),
        ends: [...w.querySelectorAll('.evo-end')].map(e => t(e)),
        edad: [...w.querySelectorAll('.evo-edad-n')].map(e => t(e)),
        xs: [...w.querySelectorAll('.evo-xlabel')].map(e => t(e)),
      };
    })(),
    edadGra: (() => {
      const w = document.querySelector('.num-card[data-gra="edad"]');
      if (!w) return null;
      const barra = w.querySelector('.edad-barra');
      return {
        titulo: t(w.querySelector('h3')),
        num: t(w.querySelector('.edad-hero b')),
        label: t(w.querySelector('.edad-hero span')),
        alto: barra ? Math.round(barra.getBoundingClientRect().height) : 0,
        segs: [...w.querySelectorAll('.edad-seg')].map(e => ({
          tramo: e.dataset.tramo,
          ancho: Math.round(e.getBoundingClientRect().width),
          bg: getComputedStyle(e).backgroundColor,
          pct: t(e.querySelector('.edad-pct')),
        })),
        leyenda: [...w.querySelectorAll('.edad-leg')].map(e => ({
          tramo: e.dataset.tramo, txt: t(e),
        })),
      };
    })(),
    // Mi cava
    cavaDato: t(document.querySelector('[data-bloque="cava"] .bloque-dato')),
    cards: [...document.querySelectorAll('[data-bloque="cava"] .sec-card')].map(e => ({
      etiqueta: t(e.querySelector('.sec-card-label')),
      num: t(e.querySelector('.sec-card-big b')),
      palabra: t(e.querySelector('.sec-card-big span')),
      sub: t(e.querySelector('.sec-card-sub')),
      pill: t(e.querySelector('.sec-card-pill')),
      ills: e.querySelectorAll('.sec-card-ill').length,
      alto: Math.round(e.getBoundingClientRect().height),
      bg: getComputedStyle(e).backgroundColor,
      top: Math.round(e.getBoundingClientRect().top),
    })),
    linkBotellas: {
      txt: t(document.querySelector('.link-botellas')),
      alto: Math.round(caja(document.querySelector('.link-botellas'))?.height ?? 0),
    },
    // Consumos y Compras: tarjetas con el mismo formato que Mi cava
    tarjetas: ['consumos', 'compras'].map(b => {
      const e = document.querySelector(`[data-bloque="${b}"] .sec-card`);
      if (!e) return null;
      return {
        bloque: b,
        etiqueta: t(e.querySelector('.sec-card-label')),
        mayus: cs(e.querySelector('.sec-card-label'))?.textTransform ?? null,
        num: t(e.querySelector('.sec-card-big b')),
        palabra: t(e.querySelector('.sec-card-big span')),
        sub: t(e.querySelector('.sec-card-sub')),
        pill: t(e.querySelector('.sec-card-pill')),
        bg: getComputedStyle(e).backgroundColor,
      };
    }),
    datos: ['consumos', 'compras'].map(b =>
      t(document.querySelector(`[data-bloque="${b}"] .bloque-dato`))),
    links: document.querySelectorAll('.bloque-link').length,
    // la ficha
    fichaLineas: (() => {
      const e = document.querySelector('.ficha-grupo .pf-name');
      if (!e) return 0;
      const r = document.createRange(); r.selectNodeContents(e);
      // Un renglón puede tener varios tramos (el nombre grande y el alias
      // chico), y con tamaños distintos sus "top" no coinciden: son el mismo
      // renglón si se pisan verticalmente.
      const cajas = [...r.getClientRects()].filter(c => c.width > 0)
        .sort((a, b) => a.top - b.top);
      let lineas = 0, piso = -Infinity;
      for (const c of cajas) { if (c.top >= piso - 0.5) { lineas++; piso = c.bottom; } }
      return lineas;
    })(),
    miembrosDebajo: (() => {
      const m = document.querySelector('.ficha-grupo .pf-miembros');
      const meta = document.querySelector('.ficha-grupo .pf-meta');
      if (!m || !meta) return false;
      return m.getBoundingClientRect().top >= meta.getBoundingClientRect().bottom - 1;
    })(),
    // la tarjeta oscura del valor
    valorCard: {
      label: t(document.querySelector('.valor-card-label')),
      pill: t(document.querySelector('.valor-card-pill')),
    },
    junta: (() => {
      const j = document.querySelector('.junta');
      if (!j) return null;
      return {
        mes: j.dataset.mes ?? null,
        esBoton: j.tagName.toLowerCase() === 'button',
        pill: t(j.querySelector('.junta-pill')),
        titulo: t(j.querySelector('.junta-t')),
        sub: t(j.querySelector('.junta-sub')),
        foto: t(j.querySelector('.junta-foto > span:not(.junta-pill)')),
        fotoAlto: Math.round(caja(j.querySelector('.junta-foto'))?.height ?? 0),
        vinos: [...j.querySelectorAll('.junta-v')].map(e => ({
          nom: t(e.querySelector('.jv-nom')), viv: t(e.querySelector('.jv-viv')),
        })),
        mas: t(j.querySelector('.junta-mas')),
      };
    })(),
    btnCargar: {
      n: document.querySelectorAll('.btn-cargar').length,
      txt: t(document.querySelector('.btn-cargar')),
      alto: Math.round(caja(document.querySelector('.btn-cargar'))?.height ?? 0),
    },
    // Compras
    compra: {
      rot: t(document.querySelector('.cc-rot')),
      montos: [...document.querySelectorAll('.monto')].map(e =>
        `${t(e.querySelector('span'))} · ${t(e.querySelector('b'))}`),
      pie: t(document.querySelector('.montos-pie')),
      candados: document.querySelectorAll('.montos-pie svg').length,
    },
    // Valor de la cava + nota
    lock: [...document.querySelectorAll('.lock-col')].map(e =>
      `${t(e.querySelector('span'))} · ${t(e.querySelector('b'))}`),
    nota: t(document.querySelector('.tnote')),
    huecoNota: (() => {
      const l = document.querySelector('.lockcard'), p = document.querySelector('.tnote');
      if (!l || !p) return null;
      return Math.round(p.getBoundingClientRect().top - l.getBoundingClientRect().bottom);
    })(),
    // barra de abajo
    barra: {
      items: [...document.querySelectorAll('.appbar-item')].map(e => ({
        pantalla: e.dataset.pantalla ?? null,
        lbl: t(e.querySelector('.appbar-lbl')),
        on: e.classList.contains('on'),
        alto: Math.round(e.getBoundingClientRect().height),
        icono: e.querySelectorAll('svg').length,
      })),
      bg: cs(document.querySelector('.appbar'))?.backgroundColor ?? null,
      borde: cs(document.querySelector('.appbar'))?.borderTopColor ?? null,
      bordeAncho: cs(document.querySelector('.appbar'))?.borderTopWidth ?? null,
      mas: (() => {
        const b = document.querySelector('.appbar-mas-btn');
        if (!b) return null;
        const s = getComputedStyle(b);
        const barra = document.querySelector('.appbar');
        return {
          w: Math.round(b.getBoundingClientRect().width),
          h: Math.round(b.getBoundingClientRect().height),
          bg: s.backgroundColor, borde: s.borderTopWidth, bordeColor: s.borderTopColor,
          sobresale: Math.round(barra.getBoundingClientRect().top - b.getBoundingClientRect().top),
        };
      })(),
    },
    scrollH: { sw: document.documentElement.scrollWidth, iw: window.innerWidth },
  };
};

// Contraste AA de todo el texto sobre su fondo real.
const LEER_CONTRASTE = (selectores) => {
  const lin = v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const rgb = s => {
    const m = (s || '').match(/-?[\d.]+/g);
    if (!m || m.length < 3) return null;
    return { c: [+m[0], +m[1], +m[2]], a: m[3] === undefined ? 1 : +m[3] };
  };
  // El fondo real es el del primer ancestro opaco que además contiene la caja
  // del texto: hay rótulos (los de la línea de edad del gráfico) que se dibujan
  // por fuera de su padre, y ahí el color del padre no es el fondo que se ve.
  const contiene = (a, b) =>
    a.left <= b.left + 0.5 && a.right >= b.right - 0.5 &&
    a.top <= b.top + 0.5 && a.bottom >= b.bottom - 0.5;
  const fondo = el => {
    const caja = el.getBoundingClientRect();
    for (let node = el; node; node = node.parentElement) {
      const b = rgb(getComputedStyle(node).backgroundColor);
      if (!b || b.a <= 0.95) continue;
      if (node === el || contiene(node.getBoundingClientRect(), caja)) return b.c;
    }
    return [255, 255, 255];
  };
  const malos = [];
  for (const sel of selectores) {
    for (const el of document.querySelectorAll(sel)) {
      if (el.closest('[aria-hidden="true"]')) continue;
      if (el.classList && el.classList.contains('sk-text')) continue;
      const propio = [...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim());
      if (!propio) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) continue;
      const col = rgb(s.color);
      if (!col || col.a < 0.95) continue;
      const Lt = lum(col.c), Lb = lum(fondo(el));
      const cr = (Math.max(Lt, Lb) + 0.05) / (Math.min(Lt, Lb) + 0.05);
      const px = parseFloat(s.fontSize);
      const peso = Number(s.fontWeight) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);
      const minimo = grande ? 3 : 4.5;
      if (cr < minimo - 0.005) {
        const clase = typeof el.className === 'string' ? el.className : el.tagName;
        malos.push(`${clase || el.tagName} «${(el.textContent || '').trim().slice(0, 20)}» ` +
          `${cr.toFixed(2)}:1 (${s.color} sobre rgb(${fondo(el).join(',')}), ${px}px/${peso})`);
      }
    }
  }
  return [...new Set(malos)];
};

// ── navegación (sirve igual en la página directa y en el modal) ───
async function abrirInicio(page, modo, apiBody) {
  if (apiBody) {
    await page.route('**/api/cava', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
  }
  if (modo === 'modal') {
    await page.goto(BASE + '/club', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Abrir el tablero' }).first().click();
  } else {
    await page.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  await page.waitForSelector('.sec-card', { timeout: 25000 });
  await page.waitForTimeout(1100);
}

async function tocarNav(page, pantalla) {
  await page.locator(`.appbar-item[data-pantalla="${pantalla}"]`).click();
  await page.waitForTimeout(650);
  return page.evaluate(() => ({
    pantalla: document.querySelector('[data-pantalla]')?.dataset.pantalla ?? null,
    activos: [...document.querySelectorAll('.appbar-item.on')].map(e => e.dataset.pantalla),
  }));
}

async function irAlFinal(page) {
  await page.evaluate(() => {
    const s = document.querySelector('.tablero-modal-body') ?? document.scrollingElement;
    s.scrollTo(0, s.scrollHeight);
  });
  await page.waitForTimeout(500);
}

// ── el recorrido completo de una entrada ──────────────────────────
async function verificar(ctx, vp, modo, apiBody) {
  const P = `${vp.file}/${modo}: `;
  const page = await ctx.newPage();
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });

  await abrirInicio(page, modo, apiBody);

  const api = await page.evaluate(async () => (await (await fetch('/api/cava')).json()));
  const s = api.stats;
  const v = await page.evaluate(LEER_INICIO);

  // ── 2. las 5 bandas, en orden y alternando el fondo ─────────────
  check(P + '2. hay 5 bandas, en orden',
    v.bandas.length === 5 && v.bandas.every((b, i) => b.n === String(i + 1)),
    `${v.bandas.length} bandas: ${v.bandas.map(b => b.n).join(',')}`);
  const bgEsperado = [BANDA_A, BANDA_B, BANDA_A, BANDA_B, BANDA_A];
  check(P + '2. los fondos de las bandas alternan #E4DCC8 / #D8CDB4',
    v.bandas.length === 5 && v.bandas.every((b, i) => b.bg === bgEsperado[i]),
    v.bandas.map(b => b.bg).join(' / '));
  check(P + '2. las bandas van de arriba hacia abajo en orden',
    v.bandas.every((b, i) => i === 0 || b.top > v.bandas[i - 1].top),
    v.bandas.map(b => b.top).join(', '));
  check(P + '2. cada banda tiene 24 px arriba y abajo y 16 a los costados',
    v.bandas.every(b => b.padding === '24px/24px/16px'),
    [...new Set(v.bandas.map(b => b.padding))].join(' | '));

  const malContraste = await page.evaluate(LEER_CONTRASTE,
    ['.banda *', '.appbar *']);
  check(P + '2. contraste AA de todo el texto sobre su fondo',
    malContraste.length === 0, malContraste.slice(0, 4).join(' | '));

  // ── 1. la ficha del grupo ───────────────────────────────────────
  const cfg = api.config ?? api.perfiles?.grupal ?? {};
  const cuota = cfg.cuotaMensual
    ? `${cfg.cuotaMoneda ?? 'USD'} ${n(cfg.cuotaMensual)} por mes cada uno` : null;
  check(P + '1. la ficha dice la cuota que manda /api/cava',
    !!cuota && v.ficha.includes(cuota), `esperaba "${cuota}" en "${v.ficha}"`);
  check(P + '1. la ficha dice el año de fundación de /api/cava',
    v.ficha.includes(`Fundada ${cfg.fundado}`), v.ficha);
  check(P + '1. los miembros salen de /api/cava',
    v.miembros === `${n(cfg.miembros)} miembros`, `"${v.miembros}" vs API ${cfg.miembros}`);
  check(P + '1. en la línea de la ficha ya no se repite "miembros"',
    !norm(v.ficha.replace(v.miembros, '')).includes('miembros'), v.ficha);
  check(P + '2.2 tres círculos de miembros y la ficha todavía no es un link',
    v.circulos === 3 && !v.fichaEsLink, `círculos ${v.circulos}, link ${v.fichaEsLink}`);

  // ── 5. el carrusel ──────────────────────────────────────────────
  const conAnada = (api.tramosEdad ?? []).reduce((a, t) => a + t.botellas, 0);
  const esperaGraficos = 1 + (conAnada >= 10 && s.edadPromedioGuarda != null ? 1 : 0);
  check(P + '5. hay un gráfico por cada uno de la lista',
    v.graficos.length === esperaGraficos, `${v.graficos.join(',')} (esperaba ${esperaGraficos})`);
  check(P + '5. la cantidad de puntitos es la cantidad de gráficos',
    v.graficos.length > 1 ? v.dots === v.graficos.length : v.dots === 0,
    `${v.dots} puntitos, ${v.graficos.length} gráficos`);
  check(P + '5. el carrusel no traba el scroll vertical (touch-action)',
    v.carruselTouch === 'pan-x pan-y', String(v.carruselTouch));
  if (v.graficos.length > 1) {
    check(P + '5. dice "1 de N · deslizá"',
      v.numPos === `${n(1)} de ${n(v.graficos.length)} · deslizá`, v.numPos);
  } else {
    check(P + '5. con un solo gráfico no hay puntitos ni "deslizá"',
      v.dots === 0 && v.numPos === '', `${v.dots} / "${v.numPos}"`);
  }

  // 1 — el gráfico de evolución, igual que antes
  check(P + '1. el primer gráfico es "Evolución de la cava"',
    !!v.evo && v.evo.titulo === 'Evolución de la cava', v.evo?.titulo);
  if (v.evo) {
    const ultimo = s.evolution[s.evolution.length - 1];
    check(P + '1. el número grande del gráfico es las compradas de /api/cava',
      v.evo.hero === n(ultimo.compradas), `"${v.evo.hero}" vs API ${ultimo.compradas}`);
    check(P + '1. dice "botellas compradas desde abril 2021"',
      v.evo.label === 'botellas compradas desde abril 2021', v.evo.label);
    check(P + '1. las etiquetas finales son en guarda y abiertas de /api/cava',
      v.evo.ends.join('/') === `${n(ultimo.enGuarda)}/${n(ultimo.abiertas)}`,
      `${v.evo.ends.join(' / ')} vs API ${ultimo.enGuarda} / ${ultimo.abiertas}`);
    check(P + '1. los valores de "Edad al abrir" usan coma decimal',
      v.evo.edad.length > 0 && v.evo.edad.every(x => /^\d+,\d$/.test(x)), v.evo.edad.join(' · '));
    aviso(P + `ref. compradas = ${REF.compradas}`, v.evo.hero === n(REF.compradas), v.evo.hero);
  }

  // 2 — ¿cuánto tiempo tiene tu cava?
  if (esperaGraficos > 1) {
    const tramos = (api.tramosEdad ?? []).filter(t => t.botellas > 0);
    const e = v.edadGra;
    check(P + '1. el segundo gráfico es "¿Cuánto tiempo tiene tu cava?"',
      !!e && e.titulo === '¿Cuánto tiempo tiene tu cava?', e?.titulo);
    if (e) {
      check(P + '1. el número grande es la edad promedio de /api/cava',
        e.num === n(s.edadPromedioGuarda, 1), `"${e.num}" vs API ${s.edadPromedioGuarda}`);
      check(P + '1. dice "años de edad promedio"', e.label === 'años de edad promedio', e.label);
      check(P + '1. la barra de edad mide 22 px', e.alto === 22, `${e.alto} px`);
      check(P + '1. hay un tramo por cada tramo de /api/cava con botellas',
        e.segs.length === tramos.length
        && tramos.every((t, i) => e.segs[i].tramo === t.tramo),
        `${e.segs.map(x => x.tramo).join(', ')} vs API ${tramos.map(t => t.tramo).join(', ')}`);
      const hex2rgb = h => {
        const x = h.replace('#', '');
        return `rgb(${parseInt(x.slice(0, 2), 16)}, ${parseInt(x.slice(2, 4), 16)}, ${parseInt(x.slice(4, 6), 16)})`;
      };
      check(P + '1. cada tramo usa el color que manda la API',
        e.segs.every((x, i) => x.bg === hex2rgb(tramos[i].color)),
        e.segs.map(x => `${x.tramo}=${x.bg}`).join(', '));
      const totalTramos = tramos.reduce((a, t) => a + t.botellas, 0);
      const malPct = e.segs.filter((x, i) => {
        const pct = n(Math.round(tramos[i].botellas / totalTramos * 100));
        return x.ancho > 34 ? x.pct !== `${pct}%` : x.pct !== '';
      });
      check(P + '1. el % va adentro sólo si el tramo pasa los 34 px',
        malPct.length === 0,
        malPct.map(x => `${x.tramo}: ${x.ancho}px "${x.pct}"`).join(' | '));
      const legEsperada = tramos.map(t => `${t.tramo} ${n(t.botellas)}`);
      check(P + '1. la leyenda tiene el nombre y las botellas de cada tramo',
        e.leyenda.map(x => x.txt).join(' | ') === legEsperada.join(' | '),
        `${e.leyenda.map(x => x.txt).join(' | ')} vs ${legEsperada.join(' | ')}`);
      for (const [tramo, bot] of Object.entries(REF.tramos)) {
        const real = (api.tramosEdad ?? []).find(t => t.tramo === tramo)?.botellas;
        aviso(P + `ref. tramo ${tramo} = ${bot}`, real === bot, `hoy ${real ?? '—'}`);
      }
    }
  }

  // ── 3. Mi cava: 4 tarjetas y el link a las botellas ─────────────
  check(P + '3. Mi cava tiene exactamente 4 tarjetas', v.cards.length === 4,
    `hay ${v.cards.length}`);
  check(P + '3. ninguna tarjeta tiene ilustración de fondo',
    v.cards.every(c => c.ills === 0), v.cards.map(c => c.ills).join(','));
  check(P + '3. las 4 tarjetas miden 96 px o más de alto',
    v.cards.every(c => c.alto >= 96), v.cards.map(c => c.alto).join(', '));
  check(P + '3. las tarjetas de una misma fila miden igual', (() => {
    const filas = {};
    v.cards.forEach(c => { (filas[c.top] ??= []).push(c.alto); });
    return Object.values(filas).every(hs => Math.max(...hs) - Math.min(...hs) <= 1);
  })(), v.cards.map(c => `${c.top}:${c.alto}`).join(' '));
  check(P + '3. las 4 tarjetas tienen la píldora "Ver ›"',
    v.cards.every(c => c.pill === 'Ver ›'), v.cards.map(c => c.pill).join(' / '));
  check(P + '3. los 4 fondos son distintos entre sí',
    new Set(v.cards.map(c => c.bg)).size === 4, v.cards.map(c => c.bg).join(' / '));

  // los textos de las tarjetas, contra la API (esto es lo que no puede fallar)
  const topTipo = s.tipoComposicion[0];
  const esperaCards = [
    { etiqueta: 'Cepas y estilos', num: n(s.cepasCount), palabra: 'cepas',
      sub: `${n(topTipo.pct)}% ${topTipo.tipo}s` },
    { etiqueta: 'Geografía', num: n(s.regionesCount), palabra: 'regiones',
      sub: `${n(s.bodegasCount)} bodegas de ${n(s.paisesCount)} países` },
    { etiqueta: 'Añadas', num: n(s.edadPromedioGuarda, 1), palabra: 'edad prom.',
      sub: `añada promedio ${s.anadaPromedio}` },
    { etiqueta: 'Calidad', num: n(s.vivinoPromedio, 1), palabra: 'en Vivino',
      sub: `${n(s.vivinoAlto43Count)} con 4,3 o más` },
  ];
  const desvios = esperaCards.map((exp, i) => {
    const got = v.cards[i];
    if (!got) return `tarjeta ${i + 1} no existe`;
    if (got.etiqueta !== exp.etiqueta) return `tarjeta ${i + 1}: "${got.etiqueta}" vs "${exp.etiqueta}"`;
    if (got.num !== exp.num) return `${exp.etiqueta}: número "${got.num}" vs API "${exp.num}"`;
    if (got.palabra !== exp.palabra) return `${exp.etiqueta}: palabra "${got.palabra}" vs "${exp.palabra}"`;
    if (got.sub !== exp.sub) return `${exp.etiqueta}: subtítulo "${got.sub}" vs API "${exp.sub}"`;
    return null;
  }).filter(Boolean);
  check(P + '3. las 4 tarjetas muestran lo que dice /api/cava',
    desvios.length === 0, desvios.join(' | '));
  EXPECT_CARDS.forEach((exp, i) => {
    const got = v.cards[i];
    aviso(P + `ref. tarjeta «${exp.etiqueta}»`,
      !!got && got.num === exp.num && got.palabra === exp.palabra && got.sub === exp.sub,
      got ? `hoy "${got.num} ${got.palabra} / ${got.sub}"` : 'no existe');
  });

  check(P + '3. el título de Mi cava dice en guarda y etiquetas de /api/cava',
    v.cavaDato === `${n(s.enGuarda)} en guarda · ${n(s.etiquetas)} etiquetas`,
    `"${v.cavaDato}" vs API ${s.enGuarda} / ${s.etiquetas}`);
  check(P + '3. el link dice "Ver las N botellas" con N de /api/cava',
    v.linkBotellas.txt.startsWith(`Ver las ${n(s.enGuarda)} botellas`),
    `"${v.linkBotellas.txt}" vs API ${s.enGuarda}`);
  check(P + '3. el renglón del link mide 48 px o más',
    v.linkBotellas.alto >= 48, `${v.linkBotellas.alto} px`);

  // ── v2.2 la ficha del grupo ─────────────────────────────────────
  check(P + 'v2.2 el nombre del grupo entra en una sola línea',
    v.fichaLineas === 1, `${v.fichaLineas} líneas`);
  check(P + 'v2.2 "N miembros" va debajo de la línea de la cuota',
    v.miembrosDebajo, 'quedó al costado');

  // ── v2.4 Consumos y Compras, con el formato de Mi cava ──────────
  const totalCompras0 = (api.compras ?? []).reduce((a, c) => a + c.botellas, 0);
  const subConsumos = [
    s.paisesConsumidasCount != null ? `de ${n(s.paisesConsumidasCount)} países` : null,
    api.masTomada ? `${api.masTomada.cepa}, la más tomada` : null,
  ].filter(Boolean).join(' · ');
  const uc0 = api.ultimaCompra;
  const esperaTarjetas = [
    { bloque: 'consumos', etiqueta: 'Consumos', num: n(api.cons.grupal.total),
      palabra: 'abiertas', sub: subConsumos, bg: 'rgb(156, 74, 90)' },
    { bloque: 'compras', etiqueta: 'Compras', num: n(totalCompras0),
      palabra: plural(totalCompras0, 'botella comprada', 'botellas compradas'),
      sub: uc0 ? `última: ${mesLargo(uc0.mes)} · ${n(uc0.botellas)} ${plural(uc0.botellas, 'botella', 'botellas')}` : '—',
      bg: 'rgb(47, 74, 85)' },
  ];
  esperaTarjetas.forEach((exp, i) => {
    const got = v.tarjetas[i];
    check(P + `v2.4 la tarjeta de ${exp.bloque} tiene etiqueta, número y "Ver ›" de /api/cava`,
      !!got && got.etiqueta === exp.etiqueta && got.mayus === 'uppercase'
      && got.num === exp.num
      && got.palabra === exp.palabra && got.sub === exp.sub
      && got.pill === 'Ver ›' && got.bg === exp.bg,
      got ? `"${got.etiqueta} / ${got.num} ${got.palabra} / ${got.sub} / ${got.pill} / ${got.bg}" vs "${exp.etiqueta} / ${exp.num} ${exp.palabra} / ${exp.sub} / Ver › / ${exp.bg}"` : 'no existe');
  });
  check(P + 'v2.4 ya no hay links "Ver todos ›" en los títulos de bloque',
    v.links === 0, `${v.links} links`);
  check(P + 'v2.4 los títulos llevan el dato chico en su lugar',
    v.datos[0] === (api.primerConsumo ? `desde ${mesLargo(api.primerConsumo)}` : '')
    && v.datos[1] === 'transparencia del club',
    v.datos.join(' | '));
  aviso(P + `ref. la más tomada = ${REF.masTomada} ${REF.masTomadaN}`,
    api.masTomada?.cepa === REF.masTomada && api.masTomada?.botellas === REF.masTomadaN,
    `hoy ${api.masTomada?.cepa} ${api.masTomada?.botellas}`);

  const j = api.ultimaJuntada;
  check(P + '1. la tarjeta "Última juntada" existe cuando la API la manda',
    !!j === !!v.junta, `API ${!!j}, pantalla ${!!v.junta}`);
  if (j && v.junta) {
    check(P + '1. el título dice el mes del último consumo',
      v.junta.titulo === `Última juntada · ${mesLargo(j.mes)}`,
      `"${v.junta.titulo}" vs API ${j.mes}`);
    check(P + '1. dice los vinos abiertos de ese mes',
      v.junta.sub === `${n(j.botellas)} ${plural(j.botellas, 'vino abierto', 'vinos abiertos')}`,
      `"${v.junta.sub}" vs API ${j.botellas}`);
    check(P + '1. el espacio de foto mide 150 px y dice "Foto de la juntada"',
      v.junta.fotoAlto === 150 && v.junta.foto === 'Foto de la juntada',
      `${v.junta.fotoAlto} px / "${v.junta.foto}"`);
    const vinosEsp = j.vinos.map(x => ({
      nom: `${x.vino}${x.anada ? ` · ${x.anada}` : ''}`,
      viv: x.vivino != null ? n(x.vivino, 1) : '',
    }));
    check(P + '1. los 3 vinos con mejor Vivino son los de /api/cava',
      v.junta.vinos.length === vinosEsp.length
      && vinosEsp.every((x, i) => v.junta.vinos[i].nom === x.nom && v.junta.vinos[i].viv === x.viv),
      `${v.junta.vinos.map(x => `${x.nom}=${x.viv}`).join(' | ')} vs ${vinosEsp.map(x => `${x.nom}=${x.viv}`).join(' | ')}`);
    check(P + '1. dice "y N más · puntaje Vivino" con N de /api/cava',
      j.resto > 0 ? v.junta.mas === `y ${n(j.resto)} más · puntaje Vivino` : v.junta.mas === '',
      `"${v.junta.mas}" vs API resto ${j.resto}`);
    aviso(P + `ref. última juntada = ${REF.juntada} con ${REF.juntadaBot} vinos`,
      j.mes === REF.juntada && j.botellas === REF.juntadaBot, `hoy ${j.mes} con ${j.botellas}`);
    aviso(P + 'ref. los 3 vinos de la última juntada',
      j.vinos.map(x => x.vino).join(' | ') === REF.juntadaVinos.join(' | '),
      `hoy ${j.vinos.map(x => x.vino).join(' | ')}`);
  }
  check(P + '1. el botón de carga dice "+ Cargar consumo o botella" y mide 48 px',
    v.btnCargar.txt === '+ Cargar consumo o botella' && v.btnCargar.alto >= 48,
    `"${v.btnCargar.txt}" ${v.btnCargar.alto} px`);

  // ── 1. Compras ──────────────────────────────────────────────────
  const uc = api.ultimaCompra;
  check(P + 'v2.4 el bloque de montos ya no repite "Última compra"',
    v.compra.rot === '', `"${v.compra.rot}"`);
  check(P + '1. los dos montos van con candado y sin números',
    v.compra.montos.join(' | ') === 'Presupuesto del mes · USD ●●●● | Asignado a la cava · USD ●●●●'
    && v.compra.pie === 'Montos visibles para miembros del club' && v.compra.candados === 1,
    `${v.compra.montos.join(' | ')} / "${v.compra.pie}" / candados ${v.compra.candados}`);
  aviso(P + `ref. cosechas = ${REF.anadasCount}, de ${REF.anadaMin} a ${REF.anadaMax}`,
    s.anadaMin === REF.anadaMin && s.anadaMax === REF.anadaMax
    && s.anadasCount === REF.anadasCount,
    `hoy ${s.anadasCount}, de ${s.anadaMin} a ${s.anadaMax}`);
  aviso(P + `ref. primer consumo = ${REF.primerConsumo}`,
    api.primerConsumo === REF.primerConsumo, `hoy ${api.primerConsumo}`);
  aviso(P + `ref. última compra = ${REF.ultimaCompra} con ${REF.ultimaCompraBot} botellas`,
    uc?.mes === REF.ultimaCompra && uc?.botellas === REF.ultimaCompraBot,
    `hoy ${uc?.mes} con ${uc?.botellas}`);

  // ── v2.6 la tarjeta del valor: etiqueta y píldora ───────────────
  check(P + 'v2.6 la tarjeta del valor tiene su etiqueta y "Ver informe ›"',
    v.valorCard.label === 'Valor de la cava' && v.valorCard.pill === 'Ver informe ›',
    `"${v.valorCard.label}" / "${v.valorCard.pill}"`);

  // ── 2.7 Valor de la cava y la nota al pie ───────────────────────
  check(P + '2.7 las 3 columnas de "Valor de la cava"',
    v.lock.join(' | ') === 'Valor de la cava · USD ●●●● | Ahorro por precio club · USD ●●●● | Valor sumado por la guarda · USD ●●●●',
    v.lock.join(' | '));
  check(P + '2.7 la nota al pie, a 24 px del bloque',
    v.nota === 'Datos reales de la cava: inventario y consumos.'
    && v.huecoNota !== null && Math.abs(v.huecoNota - 24) <= 2,
    `"${v.nota}" a ${v.huecoNota} px`);

  // ── 9. sin scroll horizontal, palabras y decimales ──────────────
  check(P + '9. sin scroll horizontal', v.scrollH.sw <= v.scrollH.iw,
    `scrollWidth ${v.scrollH.sw} > innerWidth ${v.scrollH.iw}`);
  // sólo el texto del tablero: entrando por el modal, el de la landing de
  // /club no es parte de esta pantalla
  const texto = await page.evaluate(() =>
    document.querySelector('[data-pantalla]')?.innerText ?? '');
  const hallada = PROHIBIDAS.filter(p => texto.toLowerCase().includes(p));
  check(P + '9. sin palabras prohibidas', hallada.length === 0, hallada.join(', '));
  const puntos = texto.match(/\d+\.\d+/g) || [];
  check(P + '9. ningún decimal con punto', puntos.length === 0, puntos.join(', '));

  // ── 4. la barra de abajo ────────────────────────────────────────
  check(P + '4. la barra tiene 5 ítems', v.barra.items.length === 5,
    `hay ${v.barra.items.length}: ${v.barra.items.map(i => i.lbl).join(', ')}`);
  check(P + '4. los rótulos de la barra',
    v.barra.items.map(i => i.lbl).join(' | ') === 'Inicio | Mi cava | Cargar | Consumos | Compras',
    v.barra.items.map(i => i.lbl).join(' | '));
  check(P + '4. cada ítem tiene su ícono', v.barra.items.every(i => i.icono >= 1),
    v.barra.items.map(i => i.icono).join(','));
  check(P + '4. la zona tocable de cada ítem llega a 48 px',
    v.barra.items.every(i => i.alto >= 48), v.barra.items.map(i => i.alto).join(', '));
  check(P + '4. el fondo de la barra es #F6F0E3 con borde de 1 px #CFC3AB',
    v.barra.bg === 'rgb(246, 240, 227)' && v.barra.borde === 'rgb(207, 195, 171)'
    && v.barra.bordeAncho === '1px',
    `${v.barra.bg} / ${v.barra.borde} ${v.barra.bordeAncho}`);
  check(P + '4. el "+" es un círculo bordó de 52 px que sobresale 24 px, con borde de 4 px',
    !!v.barra.mas && v.barra.mas.w === 52 && v.barra.mas.h === 52
    && v.barra.mas.bg === 'rgb(107, 30, 46)' && v.barra.mas.borde === '4px'
    && v.barra.mas.bordeColor === 'rgb(246, 240, 227)'
    && Math.abs(v.barra.mas.sobresale - 24) <= 1,
    JSON.stringify(v.barra.mas));
  check(P + '4. en el Inicio el ítem marcado es "Inicio"',
    v.barra.items.filter(i => i.on).map(i => i.pantalla).join(',') === 'inicio',
    v.barra.items.filter(i => i.on).map(i => i.lbl).join(','));

  // visible al final del scroll y sin tapar la nota al pie
  await irAlFinal(page);
  const final = await page.evaluate(() => {
    const modal = document.querySelector('.tablero-modal-body');
    const vista = modal
      ? modal.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    const barra = document.querySelector('.appbar').getBoundingClientRect();
    const nota = document.querySelector('.tnote').getBoundingClientRect();
    return {
      visible: Math.round(barra.top) < Math.round(vista.bottom) && Math.round(barra.bottom) > Math.round(vista.top),
      tapaNota: barra.top < nota.bottom - 1,
      barra: Math.round(barra.top), nota: Math.round(nota.bottom), vista: Math.round(vista.bottom),
    };
  });
  check(P + '4. la barra se ve después de scrollear hasta el final', final.visible,
    JSON.stringify(final));
  check(P + '4. la barra no tapa la nota al pie', !final.tapaNota, JSON.stringify(final));

  // cada ítem lleva a su pantalla y queda marcado
  for (const [pantalla, label] of [['cava', 'Mi cava'], ['consumos', 'Consumos'],
                                   ['compras', 'Compras'], ['inicio', 'Inicio']]) {
    const r = await tocarNav(page, pantalla);
    check(P + `4. «${label}» lleva a su pantalla y queda marcado`,
      r.pantalla === (pantalla === 'inicio' ? 'inicio' : pantalla)
      && r.activos.join(',') === pantalla,
      `pantalla=${r.pantalla}, marcados=${r.activos.join(',')}`);
  }

  // ── 3. el link lleva a #botellas ────────────────────────────────
  await tocarNav(page, 'cava');
  await page.locator('.link-botellas').click();
  await page.waitForTimeout(650);
  const trasLink = await page.evaluate(() => ({
    pantalla: document.querySelector('[data-pantalla]')?.dataset.pantalla ?? null,
    activos: [...document.querySelectorAll('.appbar-item.on')].map(e => e.dataset.pantalla),
  }));
  check(P + '3. "Ver las N botellas" lleva a las botellas, con "Mi cava" marcado',
    trasLink.pantalla === 'botellas' && trasLink.activos.join(',') === 'cava',
    JSON.stringify(trasLink));

  // ── 8. los chips de Mi cava son sólo esos cinco ─────────────────
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('.sec-chip')].map(e => e.textContent.trim()));
  check(P + '8. los chips son Cepas, Geografía, Añadas, Calidad y Botellas',
    chips.join(' | ') === CHIPS_ESPERADOS.join(' | '), chips.join(' | '));
  // "← Volver" vuelve a Mi cava
  await page.locator('.sec-back-btn').first().click();
  await page.waitForTimeout(650);
  const trasVolver = await page.evaluate(() =>
    document.querySelector('[data-pantalla]')?.dataset.pantalla ?? null);
  check(P + '8. "← Volver" vuelve a Mi cava', trasVolver === 'cava', String(trasVolver));

  // ── 7. la sección Compras ───────────────────────────────────────
  await tocarNav(page, 'compras');
  const compras = await page.evaluate(() => {
   const t = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
   return {
    heroNum: t(document.querySelector('.sec-hero-num')),
    heroTxt: t(document.querySelector('.sec-hero-text')),
    meses: [...document.querySelectorAll('.acc-item')].map(e => ({
      mes: e.dataset.mes, bot: Number(e.dataset.bot),
      txt: `${t(e.querySelector('.acc-mes'))} · ${t(e.querySelector('.acc-bot'))}`,
    })),
    paneles: [...document.querySelectorAll('.tpanel h3')].map(e => {
      const span = e.querySelector('span');
      const propio = [...e.childNodes].filter(x => x.nodeType === 3)
        .map(x => x.textContent).join('').replace(/\s+/g, ' ').trim();
      return span ? `${propio} · ${t(span)}` : propio;
    }),
    montos: [...document.querySelectorAll('.monto')].map(e =>
      `${t(e.querySelector('span'))} · ${t(e.querySelector('b'))}`),
    // sólo el texto del tablero: el de la landing de /club no es de esta pantalla
    texto: document.querySelector('[data-pantalla]')?.innerText ?? '',
   };
  });
  const comprasApi = api.compras ?? [];
  const otrasApi = api.otrasEntradas ?? [];
  const totalCompras = comprasApi.reduce((a, c) => a + c.botellas, 0);
  const totalOtras = otrasApi.reduce((a, c) => a + c.botellas, 0);
  check(P + '7. el destacado son las botellas compradas por el club desde el primer mes',
    compras.heroNum === `${n(totalCompras)} ${plural(totalCompras, 'botella', 'botellas')}`
    && compras.heroTxt === `compradas por el club desde ${mesLargo(comprasApi[comprasApi.length - 1].mes)}`,
    `"${compras.heroNum}" / "${compras.heroTxt}"`);
  const esperaMeses = [...comprasApi, ...otrasApi];
  check(P + '7. los meses del acordeón son los de /api/cava, del más nuevo al más viejo',
    compras.meses.length === esperaMeses.length
    && esperaMeses.every((m, i) => compras.meses[i].mes === m.mes && compras.meses[i].bot === m.botellas),
    `pantalla ${compras.meses.length} meses, API ${esperaMeses.length}`);
  check(P + '7. cada mes muestra "Mes AAAA · N botellas" con N de la API',
    esperaMeses.every((m, i) => compras.meses[i]?.txt ===
      `${mesLargo(m.mes, true)} · ${n(m.botellas)} ${plural(m.botellas, 'botella', 'botellas')}`),
    compras.meses.slice(0, 2).map(m => m.txt).join(' | '));
  check(P + '7. los meses suman las botellas de Compra club de /api/cava',
    comprasApi.reduce((a, c) => a + c.botellas, 0) === totalCompras
    && compras.meses.slice(0, comprasApi.length).reduce((a, m) => a + m.bot, 0) === totalCompras,
    `${compras.meses.slice(0, comprasApi.length).reduce((a, m) => a + m.bot, 0)} vs API ${totalCompras}`);
  check(P + '7. los otros orígenes van en "Regalos y aportes · N botellas"',
    totalOtras > 0
      ? compras.paneles.includes(`Regalos y aportes · ${n(totalOtras)} ${plural(totalOtras, 'botella', 'botellas')}`)
      : !compras.paneles.some(h => h.startsWith('Regalos y aportes')),
    compras.paneles.join(' | '));
  check(P + '7. el bloque con candado también está en la sección',
    compras.montos.join(' | ') === 'Presupuesto del mes · USD ●●●● | Asignado a la cava · USD ●●●●',
    compras.montos.join(' | '));
  const usdNum = compras.texto.match(/USD\s*\d/g) || [];
  check(P + '7. ningún texto visible tiene "USD" seguido de un dígito',
    usdNum.length === 0, usdNum.join(', '));
  aviso(P + `ref. compras del club = ${REF.comprasTotal} desde ${REF.comprasDesde}`,
    totalCompras === REF.comprasTotal
    && comprasApi[comprasApi.length - 1].mes === REF.comprasDesde,
    `hoy ${totalCompras} desde ${comprasApi[comprasApi.length - 1].mes}`);

  // al abrir un mes salen sus etiquetas
  await page.locator('.acc-btn').first().click();
  await page.waitForTimeout(400);
  const abierto = await page.evaluate(() =>
    [...document.querySelectorAll('.acc-cuerpo .acc-fila')].map(e => ({
      vino: e.querySelector('.acc-vino')?.textContent.trim(),
      bod: e.querySelector('.acc-bod')?.textContent.trim(),
      qty: e.querySelector('.acc-qty')?.textContent.trim(),
    })));
  const etiq0 = comprasApi[0].etiquetas;
  check(P + '7. al abrir un mes salen sus etiquetas (vino · añada · bodega · botellas)',
    abierto.length === etiq0.length && etiq0.every((e, i) =>
      abierto[i].vino === `${e.vino}${e.anada ? ` · ${e.anada}` : ''}`
      && abierto[i].bod === e.bodega && abierto[i].qty === n(e.botellas)),
    `${abierto.map(a => `${a.vino}/${a.bod}/${a.qty}`).join(' | ')} vs API ${etiq0.length}`);

  // ═══ v2: la X, el carrusel, las tarjetas nuevas y #valor ═══════
  // los chequeos de acá miran el Inicio: vengo de la sección Compras
  await tocarNav(page, 'inicio');

  // ── v2.1 la X del modal no se superpone con nada ────────────────
  if (modo === 'modal') {
    for (const [donde, frac] of [['la mitad', 0.5], ['el final', 1]]) {
      await page.evaluate(f => {
        const sc = document.querySelector('.tablero-modal-body');
        sc.scrollTo({ top: sc.scrollHeight * f, behavior: 'instant' });
      }, frac);
      await page.waitForTimeout(400);
      const choques = await page.evaluate(() => {
        const x = document.querySelector('.tablero-modal-close');
        const cuerpo = document.querySelector('.tablero-modal-body');
        if (!x || !cuerpo) return ['no encontré la X'];
        const r = x.getBoundingClientRect();
        const vista = cuerpo.getBoundingClientRect();
        // si la X se fue con el scroll no hay nada que mirar
        if (r.bottom <= vista.top + 1 || r.top >= vista.bottom - 1) return [];
        const cruza = (a, b) => a.left < b.right - 1 && b.left < a.right - 1
          && a.top < b.bottom - 1 && b.top < a.bottom - 1;
        const malos = [];
        const candidatos = document.querySelectorAll(
          '.banda *, .sec-card, .tarjeta-clara, .lockcard, .appbar-item');
        for (const e of candidatos) {
          if (e.contains(x) || x.contains(e)) continue;
          const propio = [...e.childNodes].some(t => t.nodeType === 3 && t.textContent.trim());
          const esCaja = e.classList.contains('sec-card') || e.classList.contains('tarjeta-clara');
          if (!propio && !esCaja) continue;
          const c = e.getBoundingClientRect();
          if (c.width === 0 || c.height === 0) continue;
          if (c.bottom <= vista.top || c.top >= vista.bottom) continue;
          if (cruza(r, c)) {
            const clase = typeof e.className === 'string' ? e.className : e.tagName;
            malos.push(clase + ' «' + (e.textContent || '').trim().slice(0, 24) + '»');
          }
        }
        return [...new Set(malos)];
      });
      check(P + 'v2.1 la X no se cruza con nada scrolleando hasta ' + donde,
        choques.length === 0, choques.slice(0, 3).join(' | '));
    }
    await page.evaluate(() => {
      const sc = document.querySelector('.tablero-modal-body');
      sc.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.waitForTimeout(300);
  }

  // ── v2.3 la segunda tarjeta del carrusel ────────────────────────
  if (esperaGraficos > 1) {
    const mini = await page.evaluate(() => {
      const t = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      const card = document.querySelector('.num-card[data-gra="edad"]');
      if (!card) return null;
      const top = card.getBoundingClientRect().top;
      const dist = sel => {
        const e = card.querySelector(sel);
        return e ? Math.round(e.getBoundingClientRect().top - top) : -1;
      };
      return {
        items: [...card.querySelectorAll('.edad-mini-it')].map(e =>
          ({ num: t(e.querySelector('b')), txt: t(e.querySelector('span')) })),
        distTitulo: dist('h3'),
        distNum: dist('.edad-hero b'),
        // ningún % puede quedar cortado adentro de su tramo
        cortados: [...card.querySelectorAll('.edad-seg')].filter(seg => {
          const p = seg.querySelector('.edad-pct');
          if (!p) return false;
          const a = p.getBoundingClientRect(), b = seg.getBoundingClientRect();
          return a.left < b.left - 0.5 || a.right > b.right + 0.5
            || p.scrollWidth > p.clientWidth + 1;
        }).map(e => e.dataset.tramo),
        fuera: [...card.querySelectorAll('.edad-pct-fuera span')].map(e =>
          ({ tramo: e.dataset.tramo, txt: t(e) })),
        segs: [...card.querySelectorAll('.edad-seg')].map(e =>
          ({ tramo: e.dataset.tramo, w: e.getBoundingClientRect().width,
             dentro: !!e.querySelector('.edad-pct') })),
      };
    });
    check(P + 'v2.3 existe la segunda tarjeta del carrusel', !!mini);
    if (mini) {
      const esperaMini = [
        { num: String(s.anadaMin), txt: 'la cosecha más antigua en guarda' },
        { num: n(s.anadasCount), txt: 'cosechas distintas, de ' + s.anadaMin + ' a ' + s.anadaMax },
      ];
      check(P + 'v2.3 los mini indicadores salen de /api/cava',
        mini.items.length === 2
        && esperaMini.every((e, i) => mini.items[i].num === e.num && mini.items[i].txt === e.txt),
        mini.items.map(x => x.num + '/' + x.txt).join(' | ') + ' vs '
          + esperaMini.map(x => x.num + '/' + x.txt).join(' | '));
      check(P + 'v2.3 el título y el número grande están a menos de 80 px del borde',
        mini.distTitulo >= 0 && mini.distTitulo < 80 && mini.distNum >= 0 && mini.distNum < 80,
        'título ' + mini.distTitulo + ' px, número ' + mini.distNum + ' px');
      check(P + 'v2.3 ningún % queda cortado adentro de su tramo',
        mini.cortados.length === 0, mini.cortados.join(', '));
      const angostos = mini.segs.filter(a => a.w <= 34).map(a => a.tramo);
      check(P + 'v2.3 los tramos angostos muestran el % afuera, a la derecha',
        angostos.every(t => mini.fuera.some(f => f.tramo === t))
        && mini.fuera.every(f => angostos.includes(f.tramo))
        && mini.segs.every(a => a.dentro === (a.w > 34)),
        'angostos [' + angostos.join(', ') + '] vs afuera ['
          + mini.fuera.map(f => f.tramo).join(', ') + ']');
    }
  }

  // ── v2.4 las tarjetas nuevas llevan a su pantalla ───────────────
  for (const bloque of ['consumos', 'compras']) {
    await tocarNav(page, 'inicio');
    await page.locator('[data-bloque="' + bloque + '"] .sec-card').click();
    await page.waitForTimeout(650);
    const r = await page.evaluate(() =>
      document.querySelector('[data-pantalla]')?.dataset.pantalla ?? null);
    check(P + 'v2.4 la tarjeta de ' + bloque + ' lleva a #' + bloque, r === bloque, String(r));
  }

  // ── v2.5 la juntada lleva a su mes dentro de Consumos ───────────
  if (api.ultimaJuntada) {
    await tocarNav(page, 'inicio');
    await page.locator('.junta').first().click();
    await page.waitForTimeout(1000);
    const ancla = await page.evaluate(mes => {
      const raiz = document.querySelector('[data-pantalla]');
      const el = document.querySelector('[data-mes="' + mes + '"]');
      const modal = document.querySelector('.tablero-modal-body');
      const vista = modal
        ? modal.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      const c = el ? el.getBoundingClientRect() : null;
      return {
        pantalla: raiz?.dataset.pantalla ?? null,
        hash: location.hash,
        hay: !!el,
        aLaVista: !!c && c.top < vista.bottom && c.bottom > vista.top,
      };
    }, api.ultimaJuntada.mes);
    check(P + 'v2.5 la juntada lleva a Consumos, parado en ese mes',
      ancla.pantalla === 'consumos' && ancla.hay && ancla.aLaVista,
      JSON.stringify(ancla));
    if (modo === 'directa') {
      check(P + 'v2.5 el hash es #consumos/AAAA-MM',
        ancla.hash === '#consumos/' + api.ultimaJuntada.mes, ancla.hash);
    }
  }

  // ── v2.6 "Ver informe ›" y la pantalla #valor ───────────────────
  await tocarNav(page, 'inicio');
  const pedidosValor = [];
  const anotar = r => {
    const u = r.url();
    if (u.startsWith(BASE) || /\/api\//.test(u)) pedidosValor.push(u);
  };
  page.on('request', anotar);
  await page.locator('.valor-card-pill').click();
  await page.waitForTimeout(900);
  const valor = await page.evaluate(() => {
    const t = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const raiz = document.querySelector('[data-pantalla]');
    const pdf = document.querySelector('.valor-pdf');
    return {
      pantalla: raiz?.dataset.pantalla ?? null,
      cabecera: t(document.querySelector('.valor-top')),
      hoy: t(document.querySelector('.valor-hoy-num')),
      sub: t(document.querySelector('.valor-hoy-sub')),
      tramos: [...document.querySelectorAll('.valor-barra span')].map(e =>
        Math.round(e.getBoundingClientRect().width)),
      leyenda: [...document.querySelectorAll('.valor-leg-it')].map(e =>
        t(e.querySelector('span')) + ' · ' + t(e.querySelector('b'))),
      significa: [...document.querySelectorAll('.valor-sig')].map(e =>
        t(e.querySelector('b')) + ' ' + t(e.querySelector('span'))),
      parte: (() => {
        const e = document.querySelector('.valor-parte');
        return e ? t(e.querySelector('.vp-rot')) + ' · ' + t(e.querySelector('b')) : '';
      })(),
      anios: [...document.querySelectorAll('.vg-anio')].map(e => t(e)),
      alturas: [...document.querySelectorAll('.vg-barra')].map(e =>
        Math.round(e.getBoundingClientRect().height)),
      rank: document.querySelectorAll('.vr-fila').length,
      rankNombres: [...document.querySelectorAll('.vr-fila .vr-skel')].map(e => t(e)),
      pdfTxt: t(pdf),
      pdfOff: !!pdf && pdf.disabled,
      bandas: [...document.querySelectorAll('.banda')].map(e =>
        getComputedStyle(e).backgroundColor),
      barra: document.querySelectorAll('.appbar-item').length,
      activos: document.querySelectorAll('.appbar-item.on').length,
      texto: raiz?.innerText ?? '',
      scrollH: { sw: document.documentElement.scrollWidth, iw: window.innerWidth },
    };
  });
  check(P + 'v2.6 "Ver informe ›" lleva a #valor', valor.pantalla === 'valor', String(valor.pantalla));
  check(P + 'v2.6 la cabecera dice "Valor de la cava" y "Solo miembros"',
    valor.cabecera.includes('Valor de la cava')
    && valor.cabecera.includes('Solo miembros · Club EDB #001'), valor.cabecera);
  check(P + 'v2.6 el valor estimado está tapado y dice las botellas de /api/cava',
    valor.hoy === 'USD ●●●●'
    && valor.sub === 'de las ' + n(s.enGuarda) + ' '
      + plural(s.enGuarda, 'botella', 'botellas') + ' en guarda',
    '"' + valor.hoy + '" / "' + valor.sub + '"');
  check(P + 'v2.6 los tres tramos de la barra miden igual',
    valor.tramos.length === 3 && Math.max(...valor.tramos) - Math.min(...valor.tramos) <= 1,
    valor.tramos.join(', '));
  check(P + 'v2.6 la leyenda de los tres tramos, con los montos tapados',
    valor.leyenda.join(' | ') === 'Pagado a precio club · USD ●●●● | Ahorro por precio club · USD ●●●● | Sumado por la guarda · USD ●●●●',
    valor.leyenda.join(' | '));
  check(P + 'v2.6 "Lo que significa" son dos tarjetas con ●●%',
    valor.significa.join(' | ') === '●●% menos que en góndola | ●●% sumó la guarda sobre el precio de góndola',
    valor.significa.join(' | '));
  check(P + 'v2.6 "Tu parte · 1 de N" con N de config.miembros',
    valor.parte === 'Tu parte · 1 de ' + n(cfg.miembros) + ' · USD ●●●●', valor.parte);
  const aniosEsp = [];
  for (let a = cfg.fundado; a <= new Date().getFullYear(); a++) aniosEsp.push(String(a));
  check(P + 'v2.6 el gráfico usa los años reales de la cava',
    valor.anios.join(',') === aniosEsp.join(','),
    valor.anios.join(',') + ' vs ' + aniosEsp.join(','));
  check(P + 'v2.6 las barras del gráfico son todas de la misma altura',
    valor.alturas.length > 0 && Math.max(...valor.alturas) - Math.min(...valor.alturas) <= 1,
    [...new Set(valor.alturas)].join(', '));
  check(P + 'v2.6 el ranking son 5 renglones esqueleto, sin nombres de vinos',
    valor.rank === 5 && valor.rankNombres.every(x => x === ''), valor.rank + ' filas');
  check(P + 'v2.6 las 4 bandas de #valor alternan igual que el Inicio',
    valor.bandas.join(' / ') === [BANDA_A, BANDA_B, BANDA_A, BANDA_B].join(' / '),
    valor.bandas.join(' / '));
  check(P + 'v2.6 la barra de abajo está y ningún ítem queda activo',
    valor.barra === 5 && valor.activos === 0,
    valor.barra + ' ítems, ' + valor.activos + ' activos');
  check(P + 'v2.6 sin scroll horizontal en #valor',
    valor.scrollH.sw <= valor.scrollH.iw, valor.scrollH.sw + ' > ' + valor.scrollH.iw);

  const malValor = await page.evaluate(LEER_CONTRASTE, ['.banda *', '.valor-top *', '.appbar *']);
  check(P + 'v2.6 contraste AA de todo el texto de #valor',
    malValor.length === 0, malValor.slice(0, 4).join(' | '));

  // ── v2.6 ningún monto ni porcentaje con dígitos ─────────────────
  const conDigito = txt => [...(txt.match(/USD\s*\d/g) || []), ...(txt.match(/\d\s*%/g) || [])];
  check(P + 'v2.6 en #valor ningún texto tiene dígitos después de "USD" ni antes de "%"',
    conDigito(valor.texto).length === 0, conDigito(valor.texto).join(', '));

  // ── v2.7 la descarga está bloqueada y no pide nada ──────────────
  check(P + 'v2.7 el botón del PDF dice lo que corresponde y está deshabilitado',
    valor.pdfTxt === 'Descargar el informe anual (PDF)' && valor.pdfOff,
    '"' + valor.pdfTxt + '" off=' + valor.pdfOff);
  pedidosValor.length = 0;
  await page.locator('.valor-pdf').click({ force: true });
  await page.waitForTimeout(700);
  check(P + 'v2.7 tocar el botón del PDF no genera ningún pedido de red',
    pedidosValor.length === 0, pedidosValor.slice(0, 3).join(' | '));
  page.off('request', anotar);

  // de vuelta al Inicio: los bloques de valor tampoco muestran montos
  await tocarNav(page, 'inicio');
  const valorInicio = await page.evaluate(() =>
    [...document.querySelectorAll('.lockcard, .montos, .valor-card')]
      .map(e => e.innerText ?? '').join(' '));
  check(P + 'v2.6 en el Inicio los bloques de valor tampoco tienen montos',
    conDigito(valorInicio).length === 0, conDigito(valorInicio).join(', '));

  // ── 6. el panel "Cargar" ────────────────────────────────────────
  // Sólo cuentan los pedidos al sitio: las balizas de Clarity/GA/Pixel siguen
  // saliendo por su cuenta y no las dispara el panel.
  const pedidos = [];
  const propio = u => u.startsWith(BASE) || /\/api\//.test(u);
  page.on('request', r => { if (propio(r.url())) pedidos.push(r.url()); });
  for (const desde of ['barra', 'consumos']) {
    if (desde === 'barra') {
      await tocarNav(page, 'inicio');
      await page.locator('.appbar-mas-btn').click();
    } else {
      await tocarNav(page, 'consumos');
      await page.locator('.btn-cargar').first().click();
    }
    await page.waitForTimeout(500);
    const panel = await page.evaluate(() => {
      const p = document.querySelector('.cargar-sheet');
      if (!p) return null;
      const t = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return {
        titulo: t(p.querySelector('.cargar-t')),
        opts: [...p.querySelectorAll('.cargar-opt')].map(e => ({
          id: e.dataset.opt, alto: Math.round(e.getBoundingClientRect().height),
          b: t(e.querySelector('b')), d: t(e.querySelector('small')),
        })),
        fondo: getComputedStyle(document.querySelector('.cargar-back')).backgroundColor,
        x: !!p.querySelector('.cargar-x'),
        aviso: t(p.querySelector('.cargar-aviso')),
      };
    });
    check(P + `6. el panel abre desde ${desde === 'barra' ? 'el "+" de la barra' : 'el botón de Consumos'}`,
      !!panel, 'no apareció .cargar-sheet');
    if (panel) {
      check(P + `6. (${desde}) el panel dice "¿Qué querés cargar?" con X y fondo oscurecido`,
        panel.titulo === '¿Qué querés cargar?' && panel.x
        && /rgba\(36, 19, 24/.test(panel.fondo),
        `"${panel.titulo}" x=${panel.x} fondo=${panel.fondo}`);
      check(P + `6. (${desde}) las 2 opciones, de 64 px o más`,
        panel.opts.length === 2 && panel.opts.every(o => o.alto >= 64)
        && panel.opts[0].b === 'Un consumo' && panel.opts[1].b === 'Una botella de afuera'
        && panel.opts.every(o => o.d.length > 20),
        JSON.stringify(panel.opts));
      check(P + `6. (${desde}) todavía no muestra el aviso`, panel.aviso === '', panel.aviso);

      // tocar las dos opciones no puede generar ningún pedido de red
      pedidos.length = 0;
      await page.locator('.cargar-opt[data-opt="consumo"]').click();
      await page.waitForTimeout(350);
      await page.locator('.cargar-opt[data-opt="afuera"]').click();
      await page.waitForTimeout(600);
      const avisoTxt = await page.evaluate(() =>
        (document.querySelector('.cargar-aviso')?.textContent ?? '').replace(/\s+/g, ' ').trim());
      check(P + `6. (${desde}) al tocar una opción dice "Disponible para miembros del club"`,
        avisoTxt === 'Disponible para miembros del club', avisoTxt);
      check(P + `6. (${desde}) tocar las opciones no genera ningún pedido de red`,
        pedidos.length === 0, pedidos.slice(0, 3).join(' | '));

      // cerrar con la X y comprobar que el scroll queda libre
      await page.locator('.cargar-x').click();
      await page.waitForTimeout(600);
      const trasCerrar = await page.evaluate(() => {
        const modal = document.querySelector('.tablero-modal-body');
        const leer = () => (modal ? modal.scrollTop : window.scrollY);
        // 'instant': <html> tiene scroll-behavior: smooth y si no, el valor
        // leído justo después sigue siendo el de antes
        const mover = y => (modal
          ? (modal.scrollTop = y)
          : window.scrollTo({ top: y, behavior: 'instant' }));
        const alcance = modal
          ? modal.scrollHeight - modal.clientHeight
          : document.scrollingElement.scrollHeight - window.innerHeight;
        const antes = leer();
        mover(antes + 200);
        const despues = leer();
        mover(antes);
        return {
          panel: document.querySelectorAll('.cargar-sheet').length,
          movio: Math.abs(despues - antes) > 8 || alcance < 40,
          alcance: Math.round(alcance),
          body: getComputedStyle(document.body).overflow,
          modal: !!modal,
        };
      });
      check(P + `6. (${desde}) la X cierra el panel y el scroll queda libre`,
        trasCerrar.panel === 0 && trasCerrar.movio
        && (trasCerrar.modal || trasCerrar.body !== 'hidden'),
        JSON.stringify(trasCerrar));
      check(P + `6. (${desde}) cerrar el panel no cerró el tablero`,
        trasCerrar.modal === (modo === 'modal'),
        `modal=${trasCerrar.modal}, modo=${modo}`);
    }
  }

  // ── 9. la API no trae campos de dinero ──────────────────────────
  const money = await page.evaluate(async (reKey) => {
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
    return [...new Set(hits)];
  }, MONEY_KEY.source);
  check(P + '9. la API no tiene campos de dinero', money.length === 0, money.join(', '));

  check(P + 'sin errores de consola', errores.length === 0, errores.slice(0, 3).join(' | '));

  // referencias generales
  aviso(P + `ref. ${REF.enGuarda} en guarda y ${REF.etiquetas} etiquetas`,
    s.enGuarda === REF.enGuarda && s.etiquetas === REF.etiquetas,
    `hoy ${s.enGuarda} / ${s.etiquetas}`);
  aviso(P + `ref. ${REF.abiertas} abiertas de ${REF.paisesConsumidas} países`,
    api.cons.grupal.total === REF.abiertas && s.paisesConsumidasCount === REF.paisesConsumidas,
    `hoy ${api.cons.grupal.total} / ${s.paisesConsumidasCount}`);

  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await tocarNav(page, 'inicio');
    await page.screenshot({ path: join(SHOTS, `${vp.file}-${modo}-inicio.png`), fullPage: modo !== 'modal' });
  }

  await page.close();
}

// ── 5. el carrusel: deslizar, frenar el avance solo y reduced-motion ──
async function verificarCarrusel(ctx, vp, apiBody) {
  const P = `${vp.file}/carrusel: `;
  const page = await ctx.newPage();
  await abrirInicio(page, 'directa', apiBody);

  const cuantos = await page.locator('.num-card').count();
  if (cuantos < 2) {
    check(P + '5. con un solo gráfico no hay nada que deslizar', true);
    await page.close();
    return;
  }

  const activo = () => page.evaluate(() =>
    [...document.querySelectorAll('.num-dot')].findIndex(e => e.classList.contains('on')));

  check(P + '5. arranca en el primer puntito', await activo() === 0, String(await activo()));

  // deslizar con la rueda sobre el carrusel (pasa por los listeners igual que el dedo)
  const caja = await page.locator('.num-carrusel').boundingBox();
  await page.mouse.move(Math.round(caja.x + caja.width / 2), Math.round(caja.y + caja.height / 2));
  await page.mouse.wheel(400, 0);
  await page.waitForTimeout(900);
  const trasDeslizar = await activo();
  check(P + '5. deslizar cambia el puntito activo', trasDeslizar === 1, `puntito ${trasDeslizar}`);
  const tocado = await page.evaluate(() => document.querySelector('.num-wrap')?.dataset.tocado);
  check(P + '5. deslizar marca el carrusel como tocado', tocado === 'si', String(tocado));

  // después de tocarlo no puede avanzar solo (el ciclo es de 7 s)
  await page.waitForTimeout(8500);
  const trasEsperar = await activo();
  check(P + '5. después de tocarlo no avanza solo', trasEsperar === trasDeslizar,
    `${trasDeslizar} → ${trasEsperar}`);
  await page.close();

  // con prefers-reduced-motion tampoco avanza solo
  const ctxRM = await ctx.browser().newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.w < 500 ? 2 : 1,
    reducedMotion: 'reduce',
  });
  const pRM = await ctxRM.newPage();
  await abrirInicio(pRM, 'directa', apiBody);
  const a0 = await pRM.evaluate(() =>
    [...document.querySelectorAll('.num-dot')].findIndex(e => e.classList.contains('on')));
  await pRM.waitForTimeout(8500);
  const a1 = await pRM.evaluate(() =>
    [...document.querySelectorAll('.num-dot')].findIndex(e => e.classList.contains('on')));
  check(P + '5. con prefers-reduced-motion no avanza solo', a0 === 0 && a1 === 0, `${a0} → ${a1}`);
  await ctxRM.close();
}

// ── arranque ──────────────────────────────────────────────────────
chequeosDeArchivos();

let server = null, apiBody = null;
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

console.log(`\nVerificando el Inicio en ${BASE}\n`);
const browser = await chromium.launch({ headless: true });

try {
  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.label} (${vp.w}×${vp.h}) ──`);
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: vp.w < 500 ? 2 : 1,
    });
    for (const modo of ['directa', 'modal']) {
      await verificar(ctx, vp, modo, apiBody);
    }
    await verificarCarrusel(ctx, vp, apiBody);
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
  console.log(`\n${avisos.length} AVISO(S) — cambiaron datos de la cava, actualizá la referencia:`);
  avisos.forEach(a => console.log(`  ! ${a.name}${a.detail ? '  →  ' + a.detail : ''}`));
}
if (fallas.length) {
  console.log(`\n${fallas.length} FALLA(S):`);
  fallas.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? '  →  ' + f.detail : ''}`));
  process.exit(1);
}
console.log('TODO OK ✓');
