#!/usr/bin/env node
// Verificación automática de la pantalla de resumen de /club/cava.
// Uso:
//   node scripts/check-resumen.mjs                              (local: levanta vite preview)
//   node scripts/check-resumen.mjs --base https://edb.com.ar    (producción)
//   node scripts/check-resumen.mjs --base <url> --shots <dir>   (además guarda capturas)
// Sale con código 1 si falla cualquier chequeo.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const BASE     = (arg('base', 'http://localhost:4173')).replace(/\/+$/, '');
const SHOTS    = arg('shots', null);
const API_SRC  = arg('api', 'https://www.edb.com.ar/api/cava');
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const URL      = BASE + '/club/cava';

const VIEWPORTS = [
  { w: 390,  h: 844, label: 'mob' },
  { w: 1440, h: 900, label: 'dsk' },
];

// Texto esperado de las 6 tarjetas, en orden.
const EXPECT_CARDS = [
  { titulo: 'Cepas y estilos', big: '18 cepas',      sub: '89% tintos · 10% blancos · 1% espumantes' },
  { titulo: 'Geografía',       big: '24 regiones',   sub: '83 bodegas de 4 países' },
  { titulo: 'Añadas',          big: '8,7 años',      sub: 'añada promedio 2017' },
  { titulo: 'Calidad',         big: '4,2',           sub: '175 botellas con 4,3 o más' },
  { titulo: 'Consumos',        big: '205',           sub: 'botellas abiertas' },
  { titulo: 'Las botellas',    big: '383 en guarda', sub: '222 etiquetas' },
];

const PROHIBIDAS = ['inversión', 'inversion', 'valuación', 'valuacion',
                    'revalorización', 'revalorizacion', 'ganancia'];
const MONEY_KEY = /costo|precio|valor|usd|sugerid|ganancia|inversi|valuaci|revaloriz|monto|importe|ahorro/i;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}
const norm = s => (s || '').replace(/\s+/g, ' ').trim();

// ── servidor local ────────────────────────────────────────────────
async function waitForServer(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url, { method: 'GET' }); if (r.ok || r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

let server = null;
if (IS_LOCAL) {
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteBin)) { console.error('No encuentro vite en node_modules.'); process.exit(1); }
  console.log('Levantando vite preview en 4173…');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'],
                 { cwd: ROOT, stdio: 'ignore' });
  if (!await waitForServer(BASE + '/', 30000)) {
    console.error('El preview local no respondió.'); server.kill(); process.exit(1);
  }
}

// En local el preview no tiene funciones serverless: inyectamos el JSON real de producción.
let apiBody = null;
if (IS_LOCAL) {
  console.log('Trayendo /api/cava real desde', API_SRC, '…');
  apiBody = await (await fetch(API_SRC)).text();
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

    const P = vp.label + ': ';

    // 1 ── las 6 tarjetas, texto exacto
    const cards = await page.$$eval('.sec-card', els => els.map(e => ({
      titulo: e.querySelector('.sec-card-title')?.textContent ?? '',
      big:    e.querySelector('.sec-card-big')?.textContent ?? '',
      sub:    e.querySelector('.sec-card-sub')?.textContent ?? '',
    })));
    check(P + '6 tarjetas presentes', cards.length === 6, `hay ${cards.length}`);
    EXPECT_CARDS.forEach((exp, i) => {
      const got = cards[i];
      if (!got) { check(`${P}tarjeta ${i + 1} (${exp.titulo})`, false, 'no existe'); return; }
      const okT = norm(got.titulo) === exp.titulo;
      const okB = norm(got.big) === exp.big;
      const okS = norm(got.sub) === exp.sub;
      check(`${P}tarjeta ${i + 1} ${exp.titulo}`, okT && okB && okS,
        `esperado "${exp.titulo} / ${exp.big} / ${exp.sub}" — obtuve "${norm(got.titulo)} / ${norm(got.big)} / ${norm(got.sub)}"`);
    });

    // 2 ── encabezado del gráfico: 588, 383, 205 y 6 cortes
    const evo = await page.evaluate(() => {
      const w = document.querySelector('.evo-chart-wrap');
      if (!w) return null;
      return {
        hero: w.querySelector('.evo-hero-num')?.textContent ?? '',
        lab:  w.querySelector('.evo-hero-label')?.textContent ?? '',
        xs:   [...w.querySelectorAll('.evo-xlabel')].map(e => e.textContent.trim()),
        edad: [...w.querySelectorAll('.evo-edad-val')].map(e => e.textContent.trim()),
      };
    });
    check(P + 'gráfico de evolución presente', !!evo);
    if (evo) {
      check(P + 'hero dice 588', norm(evo.hero) === '588', norm(evo.hero));
      check(P + 'encabezado dice 383 y 205',
        evo.lab.includes('383') && evo.lab.includes('205'), norm(evo.lab));
      check(P + 'el gráfico tiene 6 cortes', evo.xs.length === 6, `hay ${evo.xs.length}: ${evo.xs.join(', ')}`);
      check(P + 'fila "Edad al abrir": 6 valores', evo.edad.length === 6, `hay ${evo.edad.length}`);
      const comaOk = evo.edad.length === 6 && evo.edad.every(v => /^\d+,\d$/.test(v));
      check(P + 'edad al abrir con coma decimal', comaOk, evo.edad.join(' · '));
    }

    // 3 ── sin scroll horizontal
    const sw = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    check(P + 'sin scroll horizontal', sw.scrollWidth <= sw.innerWidth,
      `scrollWidth ${sw.scrollWidth} > innerWidth ${sw.innerWidth}`);

    // 4 ── no quedan el selector ni los 4 números viejos
    const viejos = await page.evaluate(() => ({
      pick: document.querySelectorAll('.cavapick').length,
      sums: document.querySelectorAll('.sum-stats, .sum-stat').length,
    }));
    check(P + 'sin selector de cava en el DOM', viejos.pick === 0, `${viejos.pick} nodos`);
    check(P + 'sin los 4 números grandes viejos', viejos.sums === 0, `${viejos.sums} nodos`);

    // 5 ── banner dorado a una sola línea (solo 390)
    if (vp.w === 390) {
      const lines = await page.evaluate(() => {
        const el = document.querySelector('.demoband');
        if (!el) return -1;
        const r = document.createRange(); r.selectNodeContents(el);
        return r.getClientRects().length;
      });
      check(P + 'banner dorado en una sola línea', lines === 1, `${lines} líneas`);
    }

    // 6 ── palabras prohibidas y decimales con punto
    const texto = await page.evaluate(() => {
      const svgTxt = [...document.querySelectorAll('svg text')].map(t => t.textContent).join(' ');
      return (document.body.innerText + ' ' + svgTxt);
    });
    const low = texto.toLowerCase();
    const hallada = PROHIBIDAS.filter(p => low.includes(p));
    check(P + 'sin palabras prohibidas', hallada.length === 0, hallada.join(', '));
    const puntos = texto.match(/\d+\.\d+/g) || [];
    check(P + 'ningún decimal con punto', puntos.length === 0, puntos.join(', '));

    // 7 ── el JSON de la API no trae campos de dinero
    const money = await page.evaluate(async (reKey) => {
      const re = new RegExp(reKey, 'i');
      const d = await (await fetch('/api/cava')).json();
      const hits = [];
      (function walk(o, path) {
        if (o === null || typeof o !== 'object') return;
        for (const k of Object.keys(o)) {
          if (re.test(k)) hits.push(path + '.' + k);
          walk(o[k], path + '.' + k);
        }
      })(d, '');
      return [...new Set(hits)];
    }, MONEY_KEY.source);
    check(P + 'API sin campos de dinero', money.length === 0, money.join(', '));

    // 8 ── sin errores de consola
    check(P + 'sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    if (SHOTS) {
      mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: join(SHOTS, `${vp.label}-resumen.png`), fullPage: false });
      await page.screenshot({ path: join(SHOTS, `${vp.label}-resumen-completo.png`), fullPage: true });
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
console.log('═'.repeat(60));
console.log(`${results.length - fallas.length}/${results.length} chequeos OK`);
if (fallas.length) {
  console.log(`\n${fallas.length} FALLA(S):`);
  fallas.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? '  →  ' + f.detail : ''}`));
  process.exit(1);
}
console.log('TODO OK ✓');
