#!/usr/bin/env node
// Humo de la reorganización de Mi cava (sección Colecciones, Catálogo, 6 tarjetas, colores). Una corrida local en Chromium, nada en producción.
//
//   npx vite build && node scripts/check-secciones.mjs
//
// Levanta `vite preview` sobre dist/, ejecuta api/cava.ts (con AIRTABLE_TOKEN de .env.local) para la #001 y la #003 y se las sirve
// a la página con una sesión simulada de Santiago. Celular (390 px); las capturas (celular y 1200 px) quedan en shots/.
// Chequeos: (1) #001: el carrusel tiene 2 tarjetas y ninguna dice "Tus colecciones"; (2) #001 Mi cava: 6 tarjetas en orden, Colecciones
// "8 verticales" / "6 horizontales", Catálogo "383 botellas" / "222 etiquetas distintas", sin "Ver las 383 botellas"; (3) #003: el carrusel
// tiene 1 tarjeta sin puntitos y Colecciones dice "5 verticales" / "1 horizontal"; (4) #001: Colecciones tiene los dos bloques, Añadas y
// Cepas ya no, y el chip activo es #2E4A56 (Colecciones) y #45403A (Catálogo); (5) existe el chip Catálogo, "Las botellas" no aparece y
// el link viejo #botellas lleva a Catálogo.

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
  const tmp = join(tmpdir(), `secc-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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

  async function abrir(cavaId, ancho, hash = '') {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: ancho > 600 ? 900 : 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, cavaId);
    const page = await ctx.newPage();
    await page.route('**/api/cava*', r => r.fulfill({ json: r.request().url().includes('cava=' + ID_003) ? cava003 : cava001 }));
    await page.route('**/api/auth*', r => r.fulfill({ json: { sesion: true, usuario: { nombre: 'Santiago', email: 'santiago@estaciondebebidas.com', admin: true }, cavas } }));
    await page.route('**/api/montos*', r => r.fulfill({ status: 401, json: { error: 'no' } }));
    await page.goto(`${BASE}/club/cava${hash}`, { waitUntil: 'domcontentloaded' });
    return { ctx, page };
  }
  const cartas = async page => {
    await page.waitForSelector('.sum-cards .sec-card .sec-card-big b:not(.sk-text)', { timeout: 20000 });
    return page.locator('.sum-cards .sec-card').evaluateAll(els => els.map(e => ({
      etiqueta: e.querySelector('.sec-card-label').textContent.trim(),
      dato: e.querySelector('.sec-card-big').textContent.replace(/\s+/g, ' ').trim(),
      sub: e.querySelector('.sec-card-sub').textContent.trim(),
    })));
  };
  const chip = (page, texto) => page.locator('.sec-chip', { hasText: texto }).first();
  const colorChipActivo = page => page.locator('.sec-chip.on').evaluate(e => getComputedStyle(e).backgroundColor);
  async function captura(page, selector, nombre) {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    await el.screenshot({ path: join(ROOT, 'shots', nombre) });
  }

  // ── 1. #001 Inicio (celular) ──
  const { ctx: c1, page: p1 } = await abrir(ID_001, 390);
  const t1 = await cartas(p1);
  const cuerpo1 = await p1.locator('body').innerText();
  const carrusel1 = await p1.locator('.num-card').evaluateAll(els => els.map(e => e.textContent));
  check('1. #001: el carrusel tiene 2 tarjetas y ninguna dice "Tus colecciones"',
    carrusel1.length === 2 && !carrusel1.some(x => x.includes('Tus colecciones')) && !/Tus colecciones/.test(cuerpo1), `${carrusel1.length} tarjetas`);
  const col = t1[4], cat = t1[5];
  check('2. #001 Mi cava: 6 tarjetas en orden; Colecciones 8/6; Catálogo 383/222; sin "Ver las 383 botellas"',
    t1.map(t => t.etiqueta).join('|') === 'Cepas y estilos|Geografía|Añadas|Calidad|Colecciones|Catálogo'
      && col?.dato === '8 verticales' && col?.sub === '6 horizontales'
      && cat?.dato === '383 botellas' && cat?.sub === '222 etiquetas distintas' && !/Ver las 383 botellas/.test(cuerpo1),
    JSON.stringify(t1));
  await captura(p1, '[data-bloque="cava"]', 'secciones-001-inicio-celu.png');

  // ── 2. #001: la sección Colecciones ──
  await p1.locator('.sum-cards .sec-card', { hasText: 'Colecciones' }).click();
  await p1.waitForSelector('[data-bloque="verticales"]', { timeout: 20000 });
  const enColecciones = { v: await p1.locator('[data-bloque="verticales"]').count(), h: await p1.locator('[data-bloque="horizontales"]').count() };
  const cuerpoCol = await p1.locator('body').innerText();
  const colorCol = await colorChipActivo(p1);
  await captura(p1, '.col-sec', 'secciones-001-colecciones-celu.png');
  await chip(p1, 'Añadas').click();
  await p1.waitForSelector('[data-bloque], .an-sec', { timeout: 10000 });
  await p1.waitForTimeout(300);
  const enAnadas = await p1.locator('[data-bloque="verticales"], [data-bloque="horizontales"]').count();
  await chip(p1, 'Cepas').click();
  await p1.waitForTimeout(500);
  const enCepas = await p1.locator('[data-bloque="verticales"], [data-bloque="horizontales"]').count();
  const bloquesBien = enColecciones.v === 1 && enColecciones.h === 1 && enAnadas === 0 && enCepas === 0;

  // ── 4 y 5 (parte 1). chips y colores ──
  await chip(p1, 'Catálogo').click();
  await p1.waitForSelector('.bt-raiz', { timeout: 20000 });
  await p1.waitForTimeout(500);   // el chip tiene una transición corta
  const colorCat = await colorChipActivo(p1);
  const cuerpoCat = await p1.locator('body').innerText();
  check('4. #001: Colecciones tiene los dos bloques y Añadas/Cepas ya no; el chip activo es #2E4A56 en Colecciones y #45403A en Catálogo',
    bloquesBien && colorCol === 'rgb(46, 74, 86)' && colorCat === 'rgb(69, 64, 58)',
    `col=${JSON.stringify(enColecciones)} anadas=${enAnadas} cepas=${enCepas} | ${colorCol} | ${colorCat}`);
  await c1.close();

  // ── 3. #003 ──
  const { ctx: c3, page: p3 } = await abrir(ID_003, 390);
  const t3 = await cartas(p3);
  const carrusel3 = await p3.locator('.num-card').count();
  const puntitos3 = await p3.locator('.num-dot, .num-pos').count();
  check('3. #003: el carrusel tiene 1 tarjeta sin puntitos; Colecciones dice "5 verticales" y "1 horizontal"',
    carrusel3 === 1 && puntitos3 === 0 && t3[4]?.dato === '5 verticales' && t3[4]?.sub === '1 horizontal',
    `tarjetas=${carrusel3} puntitos=${puntitos3} ${JSON.stringify(t3.slice(4))}`);
  await c3.close();

  // ── 5. Catálogo: el nombre y el link viejo ──
  const { ctx: c5, page: p5 } = await abrir(ID_001, 390, '#botellas');
  await p5.waitForSelector('.sec-chip.on', { timeout: 20000 });
  await p5.waitForTimeout(800);
  const hashFinal = await p5.evaluate(() => location.hash);
  const activo = (await p5.locator('.sec-chip.on').innerText()).trim();
  const hayChip = await chip(p5, 'Catálogo').count();
  const texto5 = await p5.locator('body').innerText();
  const todo = [cuerpo1, cuerpoCol, cuerpoCat, texto5].join('\n');
  check('5. existe el chip Catálogo, "Las botellas" no aparece y el link viejo #botellas lleva a Catálogo',
    hayChip === 1 && !/Las botellas/i.test(todo) && activo === 'Catálogo' && hashFinal.startsWith('#catalogo'), `chip=${hayChip} activo=${activo} hash=${hashFinal}`);
  await c5.close();

  // ── capturas en escritorio (1200 px) ──
  const { ctx: cd, page: pd } = await abrir(ID_001, 1200);
  await cartas(pd);
  await captura(pd, '[data-bloque="cava"]', 'secciones-001-inicio-desktop.png');
  await pd.locator('.sum-cards .sec-card', { hasText: 'Colecciones' }).click();
  await pd.waitForSelector('[data-bloque="verticales"]', { timeout: 20000 });
  await captura(pd, '.col-sec', 'secciones-001-colecciones-desktop.png');
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
