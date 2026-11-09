#!/usr/bin/env node
// Humo de la ronda de bugs 1 (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs1.mjs
//
// Corre los endpoints reales (api/auth, api/cava, api/juntadas) en este equipo, con sesión firmada acá (SESSION_SECRET de prueba) y datos
// reales de Airtable. MODO SECO: cualquier escritura a Airtable se corta antes de salir. /api/montos va simulado.
// Chequeos: (1) a 1280 px no hay barra de abajo y la cabecera trae las 4 secciones y "+ Cargar"; a 390 px sí hay barra;
// (2) a 1280 px el modal tiene el mismo alto en Inicio y en Consumos; (3) la ficha de una botella "Fuera del club" no muestra Valor;
// (4) Consumos de una cava con menos de 10 consumos muestra el candado; (5) "Marcar como abierta" es un <button>.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4184, BASE = `http://localhost:${PUERTO}`;
const ID_003 = 'recvDIqbX1X4JSaGw';
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');

const escriturasCortadas = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, op = {}) => {
  const metodo = String(op.method ?? 'GET').toUpperCase();
  if (/airtable\.com/.test(String(url)) && metodo !== 'GET') { escriturasCortadas.push(metodo); return Promise.reject(new Error('modo seco: escritura cortada')); }
  return fetchReal(url, op);
};

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `rb-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, cava: (await cargar('api/cava.ts')).default, juntadas: (await cargar('api/juntadas.ts')).default };
const S = await cargar('api/_lib/sesion.ts');
const cookieDe = id => `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: id, x: Date.now() + 3600_000 }, 'sesion'))}`;
async function llamar(handler, url, cookie, method = 'GET', body = {}) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await handler({ method, query: q, headers: { cookie }, body }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}
const usuarios = await S.listar(S.TBL.usuarios, [S.FLD.uNombre, S.FLD.uAdmin]);
const santiago = usuarios.find(u => u.fields[S.FLD.uAdmin] === true);
if (!santiago) { console.error('No encuentro a Santiago'); process.exit(1); }

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const montos = { fuera: [] };
  // página con la sesión de Santiago en la #003; /api/montos simulado (con la lista de etiquetas "Fuera del club" que se le diga)
  async function abrir(ancho, hash) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 800 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_003);
    const p = await ctx.newPage();
    const ck = cookieDe(santiago.id);
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava], ['**/api/juntadas*', H.juntadas]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), r.request().postDataJSON?.() ?? {});
        await r.fulfill({ status: estado, json: cuerpo ?? {} });
      });
    }
    await p.route('**/api/montos*', r => r.fulfill({ json: {
      total: {}, tuParte: {}, porEtiqueta: {}, cava: { id: ID_003, nombre: 'x', tipo: 'Individual', miembros: 1 },
      informe: { serie: [], valorCava: 0, compras: 0, porcentaje: 0, guarda: 0, tomado: 0, botellasTomadas: 0, botellasEnCava: 0, tuParte: { valorCava: 0, compras: 0 }, presupuestoMes: null, mesEnCurso: '', asignadoMes: 0, comprasPorMes: {} },
      fueraDelClub: montos.fuera,
    } }));
    await p.goto(`${BASE}/club/cava${hash}`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(id => localStorage.getItem('edb_cava') === id && document.querySelector('.tab-top'), ID_003, { timeout: 40000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(1500);
    return { ctx, p };
  }

  // 1. menú: 1280 sin barra y con la cabecera completa; 390 con barra
  const d = await abrir(1280, '');
  const desk = await d.p.evaluate(() => {
    const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    return {
      barra: vis(document.querySelector('nav.appbar')),
      items: [...document.querySelectorAll('.tab-top .tab-nav-item')].filter(vis).map(e => e.textContent.trim()),
      cargar: vis(document.querySelector('.tab-top .tab-nav-cargar')),
    };
  });
  const m = await abrir(390, '');
  const movil = await m.p.evaluate(() => { const el = document.querySelector('nav.appbar'); return !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0; });
  await m.ctx.close();
  check('1. a 1280 px no hay barra de abajo y la cabecera trae las 4 secciones y "+ Cargar"; a 390 px sí hay barra',
    !desk.barra && desk.items.join('|') === 'Inicio|Mi cava|Consumos|Compras' && desk.cargar && movil, JSON.stringify({ desk, movil }));

  // 4 y 5 en la misma página de escritorio
  await d.p.locator('.tab-top [data-pantalla-top="consumos"]').click();
  await d.p.waitForSelector('.cons-sec', { timeout: 30000 });
  await d.p.waitForTimeout(2500);
  const lock = await d.p.locator('[data-cons="bloqueado"]').innerText().catch(() => '');
  const conteo = await d.p.locator('[data-cons="avance"]').innerText().catch(() => '');
  check('4. Consumos con menos de 10 consumos muestra "Abrí 10 botellas para desbloquear tu informe de consumos"',
    lock.includes('Abrí 10 botellas para desbloquear tu informe de consumos'), `texto=${JSON.stringify(lock.slice(0, 120))} avance=${conteo}`);

  await d.p.locator('.tab-top [data-pantalla-top="cava"]').click();
  await d.p.goto(`${BASE}/club/cava#catalogo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await d.p.waitForSelector('.bt-fila', { timeout: 30000 });
  await d.p.waitForTimeout(1000);
  const fila = d.p.locator('.bt-fila:not(.ab)').first();
  const clave = await fila.getAttribute('data-key');
  await fila.click();
  await d.p.waitForSelector('.bt-ficha', { timeout: 10000 });
  const marcar = await d.p.evaluate(() => { const e = document.querySelector('[data-jt="marcar-abierta"]'); return e ? e.tagName : null; });
  const valorAntes = await d.p.locator('.bt-ficha [data-bloque="valor"]').count();
  check('5. "Marcar como abierta" es un <button>', marcar === 'BUTTON', `tag=${marcar}`);
  await d.ctx.close();

  // 3. con la etiqueta marcada "Fuera del club", la ficha no muestra Valor
  montos.fuera = [clave];
  const f = await abrir(1280, '');
  await f.p.goto(`${BASE}/club/cava#catalogo`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await f.p.waitForSelector('.bt-fila', { timeout: 30000 });
  await f.p.locator(`.bt-fila[data-key="${clave}"]`).click();
  await f.p.waitForSelector('.bt-ficha', { timeout: 10000 });
  const valorDespues = await f.p.locator('.bt-ficha [data-bloque="valor"]').count();
  await f.ctx.close();
  check('3. la ficha de una botella "Fuera del club" no muestra el bloque Valor (y las demás sí)', valorAntes === 1 && valorDespues === 0, `antes=${valorAntes} después=${valorDespues} clave=${clave}`);

  // 2. el modal de /club: mismo alto en Inicio y en Consumos
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p2 = await ctx2.newPage();
  await p2.route('**/api/cava*', async r => { const u = new URL(r.request().url()); const { estado, cuerpo } = await llamar(H.cava, u.pathname + u.search, ''); await r.fulfill({ status: estado, json: cuerpo ?? {} }); });
  await p2.goto(`${BASE}/club`, { waitUntil: 'domcontentloaded' });
  await p2.getByRole('button', { name: 'Abrir el tablero' }).first().click();
  await p2.waitForSelector('.tab-top', { timeout: 30000 });
  await p2.waitForTimeout(1500);
  const alto = () => p2.evaluate(() => Math.round(document.querySelector('.tablero-modal-panel').getBoundingClientRect().height));
  const hInicio = await alto();
  await p2.locator('.tab-top [data-pantalla-top="consumos"]').click();
  await p2.waitForSelector('.cons-sec', { timeout: 30000 });
  await p2.waitForTimeout(1500);
  const hCons = await alto();
  await ctx2.close();
  check('2. a 1280 px el modal tiene el mismo alto (ventana − 48 px) en Inicio y en Consumos', hInicio === hCons && hInicio === 752, `inicio=${hInicio} consumos=${hCons}`);
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escriturasCortadas.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
