#!/usr/bin/env node
// Humo de la pestaña Consumos rehecha (una corrida local en Chromium 390×844, nada en producción).
//
//   npx vite build && node scripts/check-consumos.mjs
//
// Levanta `vite preview` sobre dist/, ejecuta api/cava.ts (con AIRTABLE_TOKEN de .env.local) para la #001 y se la sirve a la página con
// una sesión simulada de Santiago. Las capturas (celular y 1200 px) quedan en shots/.
// Chequeos: (1) se abre en "Octubre 2026" (jueves 29/10, juntada 36 de 36) con los 4 vinos en orden y el pie 4 · 11,5 · 4,10; con ‹ pasa a
// septiembre; (2) ya no están "Evolución de la cava", el botón "Cargar consumo o botella" ni la ventana "Consumo AAAA";
// (3) las cajas dicen 209 · 36 · 9,1 · 4,18 y con el chip 2022 las botellas pasan a 39; (4) después de bajar 1500 px los chips de año
// siguen arriba de la pantalla y la tira de juntadas no está fija; (5) hay 5 carruseles en orden y el primero de Calidad es "Puntaje por puntaje".
// Diseño, en 390 y en 1200 px: (6) sin scroll horizontal y ningún texto encimado con otro ni saliéndose de su tarjeta; (7) en cada carrusel,
// todas las tarjetas miden lo mismo (±2 px); (8) en cada tarjeta, el contenido ocupa al menos el 75% del alto útil.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4183;
const BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2];
}
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { transform } = await import('esbuild');
  const { code } = await transform(readFileSync(join(ROOT, ruta), 'utf8'), { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `cons-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, code, 'utf8');
  return import(pathToFileURL(tmp).href);
}
async function cuerpo(servir) {
  let body = null;
  await servir({ query: {} }, { setHeader() {}, status() { return this; }, json(b) { body = b; return this; } }, null);
  return body;
}

const { servir } = await cargarTs('api/cava.ts');
const cava001 = await cuerpo(servir);
const cavas = [{ id: ID_001, nombre: 'Club EDB #001', tipo: 'Grupo', miembros: 7, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }];
mkdirSync(join(ROOT, 'shots'), { recursive: true });

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
const terminar = code => { try { srv.kill(); } catch {} process.exit(code); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });

  async function abrir(ancho) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho > 600 ? 900 : 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
    const page = await ctx.newPage();
    await page.route('**/api/cava*', r => r.fulfill({ json: cava001 }));
    await page.route('**/api/auth*', r => r.fulfill({ json: { sesion: true, usuario: { nombre: 'Santiago', email: 'santiago@estaciondebebidas.com', admin: true }, cavas } }));
    await page.route('**/api/montos*', r => r.fulfill({ status: 401, json: { error: 'no' } }));
    await page.goto(`${BASE}/club/cava`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.sum-cards .sec-card .sec-card-big b:not(.sk-text)', { timeout: 30000 });
    await page.locator('.bar-app, nav, footer').getByText('Consumos', { exact: true }).first().click();
    await page.waitForSelector('[data-cons="raiz"]', { timeout: 20000 });
    return { ctx, page };
  };
  const txt = (page, sel) => page.locator(sel).first().innerText().then(t => t.replace(/\s+/g, ' ').trim());
  // medidas de diseño de la pantalla abierta
  const diseno = page => page.evaluate(() => {
    const scroll = document.scrollingElement.scrollWidth - window.innerWidth;
    // cajas reales de cada texto (no del elemento): así se ve si un texto se sale aunque su caja no
    const cajasTexto = raiz => {
      const out = [];
      const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('svg') || getComputedStyle(el).visibility === 'hidden') continue;
        const r = document.createRange(); r.selectNodeContents(n);
        // texto cortado con "…" a propósito: vale la caja del elemento
        const cs = getComputedStyle(el);
        const corta = cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible';
        for (const b of (corta ? [el.getBoundingClientRect()] : r.getClientRects())) if (b.width > 1 && b.height > 1) out.push({ t: n.textContent.trim().slice(0, 30), b });
      }
      return out;
    };
    const choques = [];
    for (const card of document.querySelectorAll('.cc-card, .cj-card, .ci-cajas')) {
      const c = card.getBoundingClientRect();
      const ts = cajasTexto(card);
      for (const { t, b } of ts) if (b.left < c.left - 1 || b.right > c.right + 1 || b.top < c.top - 1 || b.bottom > c.bottom + 1) choques.push('afuera: ' + t);
      for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
        const a = ts[i].b, b = ts[j].b;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 2 && y > 2) choques.push(`encima: "${ts[i].t}" / "${ts[j].t}"`);
      }
    }
    const alturas = [...document.querySelectorAll('[data-car]')].map(car => {
      const hs = [...car.querySelectorAll('.cc-card')].map(c => c.getBoundingClientRect().height);
      return { car: car.dataset.car, dif: Math.max(...hs) - Math.min(...hs) };
    });
    const relleno = [...document.querySelectorAll('.cc-card')].map(card => {
      const cs = getComputedStyle(card);
      const util = card.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const cuerpo = card.querySelector('.cc-cuerpo');
      const hijos = [...card.children].filter(e => e !== cuerpo).concat([...cuerpo.children]);
      const suma = hijos.reduce((s, e) => s + e.getBoundingClientRect().height, 0);
      return { card: card.dataset.card, pct: Math.round(suma / util * 100) };
    });
    return { scroll, choques: [...new Set(choques)], alturas, relleno };
  });
  const captura = async (page, sel, nombre) => {
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: join(ROOT, 'shots', nombre) });
  };

  // ── 1 y 2. la juntada (celular) ──
  const { ctx: c1, page: p1 } = await abrir(390);
  const linea = await txt(p1, '[data-cons="linea"]');
  const titulo = await txt(p1, '[data-cj="titulo"]');
  const vinos = await p1.locator('.cj-vino .cj-vnom').allInnerTexts();
  const vivinos = await p1.locator('.cj-vino .cj-viv').allInnerTexts();
  const pie = await txt(p1, '.cj-pie');
  const esperados = ['Mastrantonio 63 Premium Petit Verdot · 2015', 'Casa Yague Sauv. Blanc · 2023', 'Susana Balbo Brioso · 2013', 'Kaiken Ultra Cab. Sauv. · 2007'];
  await captura(p1, '.cons-sec', 'consumos-juntada-celu.png');
  await p1.locator('[data-cj="prev"]').click();
  const tituloSep = await txt(p1, '[data-cj="titulo"]');
  check('1. abre en Octubre 2026 (jueves 29/10, juntada 36 de 36) con los 4 vinos y el pie esperados; ‹ pasa a Septiembre 2026',
    linea.startsWith('36 juntadas · 209 botellas abiertas desde 2021') && titulo.includes('Octubre 2026') && titulo.includes('jueves 29/10') && titulo.includes('juntada 36 de 36')
      && JSON.stringify(vinos) === JSON.stringify(esperados) && vivinos.join('|') === '4,3|4,2|4,2|3,7'
      && /4 botellas/.test(pie) && pie.includes('11,5') && pie.includes('4,10') && tituloSep.includes('Septiembre 2026'),
    `${linea} | ${titulo} | ${vinos.join(' / ')} | ${vivinos.join(',')} | ${pie} | ${tituloSep}`);
  const todo = await p1.locator('body').innerText();
  const modal = await p1.locator('.ymodal.on').count();
  check('2. ya no están "Evolución de la cava", "Cargar consumo o botella", "Ver informe acumulado" ni la ventana "Consumo AAAA"',
    !/Evolución de la cava/.test(todo) && !/Cargar consumo o botella/.test(todo) && !/Ver informe acumulado/.test(todo) && !/botellas abiertas por año/i.test(todo) && modal === 0, '');

  // ── 3. cajas y filtro ──
  const cajas = (await p1.locator('[data-cons="cajas"] > div').allInnerTexts()).map(t => t.split('\n')[0]);
  const tituloInf = await txt(p1, '[data-cons="informe"]');
  await p1.locator('[data-anio-chip="2022"]').click();
  await p1.waitForTimeout(200);
  const cajas22 = (await p1.locator('[data-cons="cajas"] > div').allInnerTexts()).map(t => t.split('\n')[0]);
  check('3. las cajas dicen 209 · 36 · 9,1 · 4,18; con el chip 2022 las botellas pasan a 39',
    cajas.join('|') === '209|36|9,1|4,18' && tituloInf === 'Informe del club · 2021 a hoy' && cajas22[0] === '39', `${cajas.join('|')} | ${tituloInf} | ${cajas22.join('|')}`);
  await p1.locator('[data-anio-chip="todo"]').click();

  // ── 4. chips pegados arriba, tira no fija ──
  await p1.evaluate(() => window.scrollTo(0, 1500));
  await p1.waitForTimeout(400);
  const pos = await p1.evaluate(() => ({
    y: window.scrollY,
    chips: document.querySelector('[data-cons="chips"]').getBoundingClientRect().top,
    nav: document.querySelector('[data-cj="nav"]').getBoundingClientRect().bottom,
  }));
  check('4. después de bajar 1500 px los chips de año siguen arriba de la pantalla y la tira de juntadas no está fija',
    pos.y > 1000 && pos.chips >= -1 && pos.chips <= 12 && pos.nav < 0, JSON.stringify(pos));
  await p1.evaluate(() => window.scrollTo(0, 0));

  // ── 5. carruseles ──
  const ids = await p1.locator('[data-car]').evaluateAll(els => els.map(e => e.dataset.car));
  const primeraCal = await txt(p1, '[data-car="calidad"] .cc-card h4');
  const cartas = await p1.locator('[data-car] .cc-card h4').allInnerTexts();
  check('5. hay 5 carruseles en orden y el primer gráfico de Calidad es "Puntaje por puntaje"',
    ids.join('|') === 'ritmo|cepas|geografia|anadas|calidad' && primeraCal === 'Puntaje por puntaje', `${ids.join('|')} | ${cartas.join(' / ')}`);
  const d390 = await diseno(p1);
  await captura(p1, '[data-car="cepas"]', 'consumos-cepas-celu.png');
  await captura(p1, '[data-car="geografia"]', 'consumos-geografia-celu.png');
  await c1.close();

  // ── capturas en escritorio ──
  const { ctx: cd, page: pd } = await abrir(1200);
  await captura(pd, '.cons-sec', 'consumos-juntada-desktop.png');
  await captura(pd, '[data-car="cepas"]', 'consumos-cepas-desktop.png');
  await captura(pd, '[data-car="calidad"]', 'consumos-calidad-desktop.png');
  const d1200 = await diseno(pd);
  await cd.close();

  // ── 6 a 8. diseño ──
  const ds = [['390', d390], ['1200', d1200]];
  check('6. 390 y 1200 px: sin scroll horizontal y ningún texto encimado ni saliéndose de su tarjeta',
    ds.every(([, d]) => d.scroll <= 0 && d.choques.length === 0), ds.map(([w, d]) => `${w}: scroll ${d.scroll}, ${d.choques.slice(0, 6).join(' | ')}`).join(' ;; '));
  check('7. 390 y 1200 px: en cada carrusel las tarjetas miden lo mismo (±2 px)',
    ds.every(([, d]) => d.alturas.every(a => a.dif <= 2)), ds.map(([w, d]) => w + ': ' + d.alturas.filter(a => a.dif > 2).map(a => a.car + ' ' + Math.round(a.dif)).join(', ')).join(' ;; '));
  check('8. 390 y 1200 px: en cada tarjeta el contenido ocupa al menos el 75% del alto útil',
    ds.every(([, d]) => d.relleno.every(r => r.pct >= 75)), ds.map(([w, d]) => w + ': ' + d.relleno.filter(r => r.pct < 75).map(r => r.card + ' ' + r.pct + '%').join(', ')).join(' ;; '));
} catch (e) {
  console.error('Error del script:', e.message);
  results.push(false);
} finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 8 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  terminar(bien ? 0 : 1);
}
