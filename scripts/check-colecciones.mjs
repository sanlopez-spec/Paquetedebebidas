#!/usr/bin/env node
// Humo de Colecciones (mínimo 3 etiquetas, años sin pisarse, horizontales en filas). Una corrida local en Chromium, nada en producción.
//
//   npx vite build && node scripts/check-colecciones.mjs
//
// Levanta `vite preview` sobre dist/, ejecuta api/cava.ts (con AIRTABLE_TOKEN de .env.local) para la #001 y la #003 y se las
// sirve a la página con una sesión simulada de Santiago. Las capturas de la #001 (celular y 1200 px) quedan en shots/.
// Chequeos: (1) #003: el Inicio dice 5 verticales y 1 horizontal; Colecciones: 5 filas verticales y 1 fila horizontal;
// (2) #001 en 390 px: ninguna fila vertical superpone dos etiquetas de año; (3) lo mismo en 1200 px;
// (4) #001 Cepas: primera fila La Linterna 2016, 4 bloques "Los Chañares", "El Tomillo", "La Yesca", "El Milagro" y "todos Malbec";
// (5) #001 Cepas: Viña Cobos Estates 2019 dice "Terroir Chañares", "Marchiori" y "Terroir Zingaretti".

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4182;
const BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';
const ID_003 = 'recvDIqbX1X4JSaGw';

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
  const tmp = join(tmpdir(), `colec-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, code, 'utf8');
  return import(pathToFileURL(tmp).href);
}
async function cuerpo(servir, forzada) {
  let body = null;
  await servir({ query: {} }, { setHeader() {}, status() { return this; }, json(b) { body = b; return this; } }, forzada);
  return body;
}

const { servir } = await cargarTs('api/cava.ts');
const cava001 = await cuerpo(servir, null);
const cava003 = await cuerpo(servir, { id: ID_003, config: { nombre: 'Cava personal', alias: '', tipo: 'individual', fundado: 2026, miembros: 1 } });

const cavas = [
  { id: ID_001, nombre: 'Club EDB #001', tipo: 'Grupo', miembros: 7, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false },
  { id: ID_003, nombre: 'Cava #003', tipo: 'Individual', miembros: 1, propia: true, dueno: 'Santiago', titulo: 'Cava personal', avatar: false, puedeAvatar: false },
];
mkdirSync(join(ROOT, 'shots'), { recursive: true });

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
const terminar = code => { try { srv.kill(); } catch {} process.exit(code); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });

  async function abrir(cavaId, ancho) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho > 600 ? 900 : 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, cavaId);
    const page = await ctx.newPage();
    await page.route('**/api/cava*', r => r.fulfill({ json: r.request().url().includes('cava=' + ID_003) ? cava003 : cava001 }));
    await page.route('**/api/auth*', r => r.fulfill({ json: { sesion: true, usuario: { nombre: 'Santiago', email: 'santiago@estaciondebebidas.com', admin: true }, cavas } }));
    await page.route('**/api/montos*', r => r.fulfill({ status: 401, json: { error: 'no' } }));
    await page.goto(`${BASE}/club/cava`, { waitUntil: 'domcontentloaded' });
    return { ctx, page };
  }
  // La sesión simulada reinicia la pantalla al cargar la cava: se entra a la sección desde el Inicio.
  async function aSeccion(page, texto) {
    await page.waitForSelector('[data-col="tarjeta"], .num-card', { timeout: 20000 });
    await page.waitForSelector('button.sec-card', { timeout: 20000 });
    await page.locator('button.sec-card', { hasText: texto }).first().click();
  }
  async function captura(page, selector, nombre) {
    const el = page.locator(selector);
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: join(ROOT, 'shots', nombre) });
  }
  // ¿alguna fila vertical superpone dos cajas de etiqueta de año?
  async function pisadas(page) {
    return page.evaluate(() => {
      const malas = [];
      document.querySelectorAll('[data-col="vertical"]').forEach(fila => {
        const r = [...fila.querySelectorAll('.col-anio')].map(e => ({ t: e.textContent, b: e.getBoundingClientRect() }));
        for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
          const a = r[i].b, b = r[j].b;
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) malas.push(`${fila.querySelector('.col-nom b').textContent}: ${r[i].t}/${r[j].t}`);
        }
      });
      return { malas, filas: document.querySelectorAll('[data-col="vertical"]').length, etiquetas: document.querySelectorAll('.col-anio').length };
    });
  }
  async function verticales001(ancho, check_, nombreCaptura) {
    const { ctx, page } = await abrir(ID_001, ancho);
    await aSeccion(page, 'Colecciones');
    const v = page.locator('[data-bloque="verticales"]');
    await v.waitFor({ timeout: 20000 });
    await v.locator('.col-mas').click();
    await page.waitForTimeout(400);
    const r = await pisadas(page);
    const primera = await v.locator('[data-col="vertical"]').first().locator('.col-nom b').innerText();
    const etiq1 = await v.locator('[data-col="vertical"]').first().locator('.col-anio').allInnerTexts();
    check_(`${ancho} px: #001, ${r.filas} filas verticales sin etiquetas de año superpuestas`,
      r.filas === 8 && r.malas.length === 0 && r.etiquetas > 0, `${r.filas} filas | pisadas: ${r.malas.join(', ')} | 1ª: ${primera} ${etiq1.join(' ')}`);
    await captura(page, '[data-bloque="verticales"]', nombreCaptura);
    await ctx.close();
  }
  async function horizontales001(ancho, nombreCaptura) {
    const { ctx, page } = await abrir(ID_001, ancho);
    await aSeccion(page, 'Colecciones');
    const h = page.locator('[data-bloque="horizontales"]');
    await h.waitFor({ timeout: 20000 });
    const filas = h.locator('[data-col="horizontal"]');
    const lectura = await filas.evaluateAll(els => els.map(e => ({
      an: e.querySelector('.col-an').textContent, linea: e.querySelector('.col-linea-n').textContent, sub: e.querySelector('.col-sub').textContent,
      vinos: [...e.querySelectorAll('[data-vino]')].map(b => b.getAttribute('data-vino')),
    })));
    await captura(page, '[data-bloque="horizontales"]', nombreCaptura);
    await ctx.close();
    return lectura;
  }

  // ── 1. #003 ──
  const { ctx: c1, page: p1 } = await abrir(ID_003, 390);
  await p1.waitForSelector('[data-col="tarjeta"]', { timeout: 20000 });
  const tarjeta = (await p1.locator('[data-col="tarjeta"]').innerText()).replace(/\n/g, ' ');
  await aSeccion(p1, 'Colecciones');
  await p1.waitForSelector('[data-bloque="verticales"]', { timeout: 20000 });
  const nV = await p1.locator('[data-bloque="verticales"] [data-col="vertical"]').count();
  await p1.waitForSelector('[data-bloque="horizontales"]', { timeout: 20000 });
  const nH = await p1.locator('[data-bloque="horizontales"] [data-col="horizontal"]').count();
  check('1. #003: el Inicio dice 5 verticales y 1 horizontal; Colecciones: 5 filas verticales y 1 fila horizontal',
    /5 colecciones verticales/.test(tarjeta) && /1 horizontal(?!es)/.test(tarjeta) && tarjeta.includes('Finca Las Moras Gran Syrah · 2014 → 2020 · 6 años de diferencia') && nV === 5 && nH === 1,
    `${tarjeta} | filas V=${nV} H=${nH}`);
  await c1.close();

  // ── 2 y 3. #001: años sin pisarse ──
  await verticales001(390, (n, ok, d) => check('2. ' + n, ok, d), 'colecciones-001-verticales-celu.png');
  await verticales001(1200, (n, ok, d) => check('3. ' + n, ok, d), 'colecciones-001-verticales-desktop.png');

  // ── 4 y 5. #001: horizontales ──
  await horizontales001(390, 'colecciones-001-horizontales-celu.png');
  const lect = await horizontales001(1200, 'colecciones-001-horizontales-desktop.png');
  const lin = lect[0];
  check('4. #001 Cepas: primera fila La Linterna 2016 con 4 bloques y "todos Malbec"',
    lect.length === 6 && lin.linea === 'La Linterna' && lin.an === '2016' && lin.vinos.join() === 'Los Chañares,El Tomillo,La Yesca,El Milagro' && lin.sub.includes('todos Malbec'),
    JSON.stringify(lect.map(l => [l.linea, l.an, l.vinos.length])) + ' ' + JSON.stringify(lin));
  const cobos = lect.find(l => l.linea === 'Viña Cobos Estates' && l.an === '2019');
  check('5. #001 Cepas: Viña Cobos Estates 2019 dice "Terroir Chañares", "Marchiori" y "Terroir Zingaretti"',
    !!cobos && [...cobos.vinos].sort().join() === ['Marchiori', 'Terroir Chañares', 'Terroir Zingaretti'].sort().join(), JSON.stringify(cobos));
} catch (e) {
  console.error('Error del script:', e.message);
  results.push(false);
} finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  terminar(bien ? 0 : 1);
}
