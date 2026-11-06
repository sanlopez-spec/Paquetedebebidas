#!/usr/bin/env node
// Humo de Colecciones y de la oferta de relevamiento. Una corrida local en Chromium, nada en producción.
//
//   npx vite build && node scripts/check-colecciones.mjs
//
// Levanta `vite preview` sobre dist/, ejecuta api/cava.ts (con AIRTABLE_TOKEN de .env.local) para la #001 y la #003
// y se las sirve a la página con una sesión simulada de Santiago. Tamaño celular.
// Chequeos: (1) #003: el carrusel no tiene Evolución y la primera tarjeta dice 19 verticales y 10 horizontales;
// (2) #003: "¿Cuánto vale tu cava hoy?" con 138 botellas y sin "Valor de la cava"; (3) #003 Añadas: Colecciones
// verticales, primera fila Finca Las Moras Gran Syrah (2014 · 2019 · 2020); (4) #003 Cepas y estilos: Colecciones
// horizontales, "Angelica Zapata · 2016" primera con tres fichas; (5) #001: sigue Evolución y la tarjeta Valor de la cava.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
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

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
const terminar = code => { try { srv.kill(); } catch {} process.exit(code); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });

  async function abrir(cavaId, hash = '') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, cavaId);
    const page = await ctx.newPage();
    await page.route('**/api/cava*', r => r.fulfill({ json: r.request().url().includes('cava=' + ID_003) ? cava003 : cava001 }));
    await page.route('**/api/auth*', r => r.fulfill({ json: { sesion: true, usuario: { nombre: 'Santiago', email: 'santiago@estaciondebebidas.com', admin: true }, cavas } }));
    await page.route('**/api/montos*', r => r.fulfill({ status: 401, json: { error: 'no' } }));
    await page.goto(`${BASE}/club/cava${hash}`, { waitUntil: 'domcontentloaded' });
    return { ctx, page };
  }

  // ── #003 ──
  const { ctx: c1, page: p1 } = await abrir(ID_003);
  await p1.waitForSelector('[data-col="tarjeta"]', { timeout: 20000 });
  const gra = await p1.locator('.num-card').evaluateAll(els => els.map(e => e.getAttribute('data-gra')));
  const primera = await p1.locator('.num-card').first().innerText();
  check('1. #003: carrusel sin Evolución; la primera tarjeta dice 19 verticales y 10 horizontales',
    !gra.includes('evo') && gra[0] === 'colecciones' && /19\s*colecciones verticales/.test(primera.replace(/\n/g, ' ')) && /10\s*horizontales/.test(primera.replace(/\n/g, ' '))
      && primera.includes('Finca Las Moras Gran Syrah · 2014 → 2020 · 6 años de diferencia'),
    `${gra.join()} | ${primera.replace(/\n/g, ' ')}`);

  await p1.waitForSelector('[data-tv="relevamiento"]', { timeout: 10000 }).catch(() => {});
  const inicio = await p1.locator('body').innerText();
  check('2. #003: aparece "¿Cuánto vale tu cava hoy?" con 138 botellas y no "Valor de la cava"',
    inicio.includes('¿Cuánto vale tu cava hoy?') && inicio.includes('tus 138 botellas') && !inicio.includes('Valor de la cava'),
    `origen=${JSON.stringify(cava003.origen)}`);

  await p1.locator('[data-col="tarjeta"]').click();
  await p1.waitForSelector('[data-bloque="verticales"]', { timeout: 10000 });
  const v = p1.locator('[data-bloque="verticales"]');
  const titulo = await v.locator('h3').innerText();
  const fila1 = (await v.locator('[data-col="vertical"]').first().innerText()).replace(/\n/g, ' ');
  check('3. #003 Añadas: Colecciones verticales, primera fila Finca Las Moras Gran Syrah (2014 · 2019 · 2020)',
    titulo.startsWith('Colecciones verticales') && fila1.includes('Finca Las Moras Gran Syrah') && /2014\s+2019\s+2020/.test(fila1) && !(await p1.locator('[data-bloque="verticales"] [data-col="resto"]').count()),
    fila1);
  await c1.close();

  const { ctx: c2, page: p2 } = await abrir(ID_003);
  await p2.waitForSelector('[data-col="tarjeta"]', { timeout: 20000 });
  await p2.locator('button.sec-card', { hasText: 'Cepas' }).first().click();
  await p2.waitForSelector('[data-bloque="horizontales"]', { timeout: 20000 });
  const h = p2.locator('[data-bloque="horizontales"]');
  const f1 = h.locator('[data-col="horizontal"]').first();
  const nom = (await f1.locator('.col-nom').innerText()).trim();
  const fichas = await f1.locator('.col-ficha').allInnerTexts();
  check('4. #003 Cepas y estilos: Colecciones horizontales, primera "Angelica Zapata · 2016" con tres fichas',
    (await h.locator('h3').innerText()).startsWith('Colecciones horizontales') && nom === 'Angelica Zapata · 2016' && fichas.length === 3,
    `${nom} | ${fichas.join(' / ')}`);
  await c2.close();

  // ── #001 ──
  const { ctx: c3, page: p3 } = await abrir(ID_001);
  await p3.waitForSelector('.num-card', { timeout: 20000 });
  await p3.waitForSelector('[data-tv="tarjeta"]', { timeout: 10000 }).catch(() => {});
  const gra1 = await p3.locator('.num-card').evaluateAll(els => els.map(e => e.getAttribute('data-gra')));
  const t1 = await p3.locator('body').innerText();
  check('5. #001: sigue Evolución en el carrusel y la tarjeta Valor de la cava',
    gra1[0] === 'evo' && t1.includes('Valor de la cava') && !t1.includes('¿Cuánto vale tu cava hoy?'),
    `${gra1.join()} | meses=${cava001.mesesEntreCompras}`);
  await c3.close();
} catch (e) {
  console.error('Error del script:', e.message);
  results.push(false);
} finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  terminar(bien ? 0 : 1);
}
