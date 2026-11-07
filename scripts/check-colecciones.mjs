#!/usr/bin/env node
// Humo del rediseño de Colecciones (línea de tiempo y barra de cepas). Una corrida local en Chromium, nada en producción.
//
//   npx vite build && node scripts/check-colecciones.mjs
//
// Levanta `vite preview` sobre dist/, ejecuta api/cava.ts (con AIRTABLE_TOKEN de .env.local) para la #003 y se la sirve
// a la página con una sesión simulada de Santiago. Tamaño celular; las capturas (celular y 1200 px) quedan en shots/.
// Chequeos: (1) Añadas: Colecciones verticales sin fichas viejas y con 6 filas con eje; (2) la primera fila es Finca Las Moras
// Gran Syrah, con 3 puntos y un "3" en el de 2020; (3) "Ver las 19" despliega y quedan 19 filas; (4) Cepas y estilos: la primera
// tarjeta horizontal es 2016 + Angelica Zapata, con barra de 3 partes; (5) tocar un punto vertical abre la ficha de botella.

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

  async function abrir(ancho) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho > 600 ? 900 : 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_003);
    const page = await ctx.newPage();
    await page.route('**/api/cava*', r => r.fulfill({ json: cava003 }));
    await page.route('**/api/auth*', r => r.fulfill({ json: { sesion: true, usuario: { nombre: 'Santiago', email: 'santiago@estaciondebebidas.com', admin: true }, cavas } }));
    await page.route('**/api/montos*', r => r.fulfill({ status: 401, json: { error: 'no' } }));
    await page.goto(`${BASE}/club/cava`, { waitUntil: 'domcontentloaded' });
    return { ctx, page };
  }
  // La sesión simulada reinicia la pantalla al cargar la cava: se entra a la sección desde el Inicio.
  async function aSeccion(page, texto) {
    await page.waitForSelector('[data-col="tarjeta"]', { timeout: 20000 });
    await page.locator('button.sec-card', { hasText: texto }).first().click();
  }
  async function captura(page, selector, nombre) {
    const el = page.locator(selector);
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: join(ROOT, 'shots', nombre) });
  }

  // ── Añadas (celular) ──
  const { ctx: c1, page: p1 } = await abrir(390);
  await aSeccion(p1, 'Añadas');
  const v = p1.locator('[data-bloque="verticales"]');
  await v.waitFor({ timeout: 20000 });
  const filas = v.locator('[data-col="vertical"]');
  const viejas = await v.locator('.col-ficha').count();
  const conEje = await v.locator('[data-col="vertical"] [data-col="eje"]').count();
  const nFilas = await filas.count();
  check('1. Añadas: Colecciones verticales sin fichas viejas y con 6 filas con eje',
    (await v.locator('h3').innerText()).startsWith('Colecciones verticales') && viejas === 0 && nFilas === 6 && conEje === 6,
    `viejas=${viejas} filas=${nFilas} ejes=${conEje}`);

  const f1 = filas.first();
  const puntos = await f1.locator('.col-punto').evaluateAll(els => els.map(e => ({ an: e.getAttribute('data-an'), n: e.querySelector('.col-bolita').textContent.trim() })));
  const nom1 = await f1.locator('.col-nom b').innerText();
  check('2. primera fila: Finca Las Moras Gran Syrah, 3 puntos y un "3" en el de 2020',
    nom1 === 'Finca Las Moras Gran Syrah' && puntos.map(p => p.an).join() === '2014,2019,2020' && puntos[2].n === '3' && puntos[0].n === '' && puntos[1].n === '',
    JSON.stringify(puntos));
  await captura(p1, '[data-bloque="verticales"]', 'colecciones-verticales-celu.png');

  await v.locator('.col-mas').click();
  const total = await filas.count();
  check('3. "Ver las 19" despliega y quedan 19 filas', total === 19, `filas=${total}`);
  await v.locator('.col-mas').click();   // se vuelve a plegar

  await f1.locator('.col-punto[data-an="2020"]').click();
  await p1.waitForSelector('.bt-ficha', { timeout: 10000 }).catch(() => {});
  const ficha = await p1.locator('.bt-ficha').first().innerText().catch(() => '');
  check('5. tocar un punto vertical abre la ficha de botella', ficha.includes('Finca Las Moras Gran Syrah') && ficha.includes('2020'), ficha.replace(/\n/g, ' ').slice(0, 80));
  await c1.close();

  // ── Cepas y estilos (celular) ──
  const { ctx: c2, page: p2 } = await abrir(390);
  await aSeccion(p2, 'Cepas');
  const h = p2.locator('[data-bloque="horizontales"]');
  await h.waitFor({ timeout: 20000 });
  const t1 = h.locator('[data-col="horizontal"]').first();
  const partes = await t1.locator('.col-parte span').allInnerTexts();
  const leyenda = (await t1.locator('.col-leyenda').innerText()).replace(/\n/g, ' ');
  check('4. Cepas y estilos: la primera tarjeta es 2016 + Angelica Zapata, con barra de 3 partes',
    (await h.locator('h3').innerText()).startsWith('Colecciones horizontales') && (await t1.locator('.col-an').innerText()) === '2016'
      && (await t1.locator('.col-linea-n').innerText()) === 'Angelica Zapata' && partes.join() === 'Cab. Sauv.,Malbec,Cab. Franc' && leyenda.includes('Cabernet Sauvignon ×2'),
    `${partes.join()} | ${leyenda}`);
  await captura(p2, '[data-bloque="horizontales"]', 'colecciones-horizontales-celu.png');
  await c2.close();

  // ── capturas en escritorio (1200 px) ──
  const { ctx: cd, page: pd } = await abrir(1200);
  await aSeccion(pd, 'Añadas');
  await pd.waitForSelector('[data-bloque="verticales"]', { timeout: 20000 });
  await captura(pd, '[data-bloque="verticales"]', 'colecciones-verticales-desktop.png');
  await pd.locator('.sec-chip', { hasText: 'Cepas' }).first().click();
  await pd.waitForSelector('[data-bloque="horizontales"]', { timeout: 20000 });
  await captura(pd, '[data-bloque="horizontales"]', 'colecciones-horizontales-desktop.png');
  await cd.close();
} catch (e) {
  console.error('Error del script:', e.message);
  results.push(false);
} finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  terminar(bien ? 0 : 1);
}
