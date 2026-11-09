#!/usr/bin/env node
// Humo de la ronda de bugs 3 (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs3.mjs
//
// Corre los endpoints reales (api/auth, api/cava) en este equipo, con sesión firmada acá (SESSION_SECRET de prueba) y datos reales
// de Airtable. MODO SECO: cualquier escritura a Airtable se corta antes de salir. El estado de /api/juntadas es el real de la #001,
// con dos cambios simulados: la juntada de octubre 2026 con la votación abierta (para que aparezca "Puntuar") y una juntada
// programada para el 26/11. /api/montos va simulado.
// Chequeos: (1) a 1280 px septiembre y octubre 2026 miden lo mismo y los asistentes de octubre van en la columna derecha;
// (2) a 390 px octubre (4 vinos) es más baja que septiembre (7); (3) "2026 ▾" abre la lista y "Mayo" de 2021 lleva a esa juntada;
// (4) a 1280 px la hoja de puntaje es una ventana centrada; (5) la programada muestra "Programada", "Voy", "No voy" y "va a tener".
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4186, BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';
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
  const tmp = join(tmpdir(), `rb3-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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
const ck = cookieDe(santiago.id);

// el estado simulado: el real de la #001 + octubre con la votación abierta + una programada para el 26/11
const real = (await llamar(H.juntadas, `/api/juntadas?accion=estado&cava=${ID_001}`, ck)).cuerpo;
const oct = real.juntadas.find(j => j.fecha.startsWith('2026-10'));
const sep = real.juntadas.find(j => j.fecha.startsWith('2026-09'));
const designados = real.guarda.slice(0, 4).map(b => ({ botella: b.id, vino: b.vino, anada: b.anada, cepa: b.cepa, bodega: b.bodega, vivino: 4.1, enGuarda: b.enGuarda }));
const programada = {
  ...oct, id: 'recPROGRAMADA0000', nombre: 'Juntada noviembre 2026', fecha: '2026-11-26', exacto: true, asistentes: [], asistentesNombres: [], consumos: [],
  abierta: false, soyAsistente: false, fotos: 0, portada: '', portadaPor: '', maridaje: 'Asado', notas: '', programada: true, sede: 'Casa de Juan', hora: '21:00',
  designados, van: [], noVan: [], miRespuesta: null, puedeResponder: true, puedeEmpezar: false, puedeBorrar: true, puedeEditar: true,
};
const simulado = { ...real, juntadas: [...real.juntadas.map(j => (j.id === oct.id ? { ...j, abierta: true, soyAsistente: true } : j)), programada] };

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  async function abrir(ancho) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
    const p = await ctx.newPage();
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), r.request().postDataJSON?.() ?? {});
        await r.fulfill({ status: estado, json: cuerpo ?? {} });
      });
    }
    await p.route('**/api/juntadas*', r => (new URL(r.request().url()).searchParams.get('accion') === 'estado' ? r.fulfill({ json: simulado }) : r.fulfill({ status: 403, json: { error: 'prueba' } })));
    await p.route('**/api/montos*', r => r.fulfill({ status: 401, json: {} }));
    await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.tab-top', { timeout: 40000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(1200);
    await p.locator(ancho >= 900 ? '.tab-top [data-pantalla-top="consumos"]' : 'nav.appbar [data-pantalla="consumos"]').click();
    await p.waitForSelector('.cj-card', { timeout: 30000 });
    await p.waitForTimeout(1500);
    return { ctx, p };
  }
  const titulo = p => p.locator('[data-cj="titulo"] h3').innerText();
  const alto = p => p.evaluate(() => Math.round(document.querySelector('.cj-card').getBoundingClientRect().height));

  // 1. desktop: mismo alto en septiembre y octubre; los asistentes de octubre, en la columna derecha
  const d = await abrir(1280);
  const tOct = await titulo(d.p);
  const hOct = await alto(d.p);
  const asisDer = await d.p.evaluate(() => !!document.querySelector('.cj-card .cj-col-b [data-cj="asistentes"]'));
  await d.p.locator('[data-cj="prev"]').click(); await d.p.waitForTimeout(400);
  const tSep = await titulo(d.p);
  const hSep = await alto(d.p);
  check('1. a 1280 px septiembre y octubre 2026 miden lo mismo y los asistentes de octubre van a la derecha',
    tOct === 'Octubre 2026' && tSep === 'Septiembre 2026' && hOct === hSep && asisDer && oct.asistentes.length > 0, JSON.stringify({ tOct, tSep, hOct, hSep, asisDer, asistentes: oct.asistentes.length }));

  // 3. "2026 ▾" → 2021 → Mayo
  await d.p.locator('[data-cj="anio-btn"]').click();
  await d.p.locator('[data-cj="lista-anios"] [data-anio="2021"] .cj-la-cab').click();
  await d.p.locator('[data-cj="lista-anios"] [data-anio="2021"] .cj-la-fila', { hasText: 'Mayo' }).click();
  await d.p.waitForTimeout(300);
  const tMayo = await titulo(d.p);
  const cerrada = await d.p.locator('[data-cj="lista-anios"]').count();
  check('3. "2026 ▾" abre la lista y "Mayo" de 2021 lleva a esa juntada', tMayo === 'Mayo 2021' && cerrada === 0, JSON.stringify({ tMayo, cerrada }));

  // 4. la hoja de puntaje, centrada (octubre con la votación abierta)
  await d.p.locator('[data-cj="anio-btn"]').click();
  await d.p.locator('[data-cj="lista-anios"] [data-anio="2026"] .cj-la-cab').click();   // con 2021 en pantalla, 2026 está plegado
  await d.p.locator('[data-cj="lista-anios"] [data-anio="2026"] .cj-la-fila', { hasText: 'Octubre' }).click();
  await d.p.waitForTimeout(300);
  await d.p.locator('[data-cj="puntuar"] button').first().click();
  await d.p.waitForSelector('.jt-punt', { timeout: 10000 });
  await d.p.waitForTimeout(400);
  const caja = await d.p.evaluate(() => { const r = document.querySelector('.jt-punt').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(innerHeight - r.bottom), centro: Math.round(r.left + r.width / 2 - innerWidth / 2), ancho: Math.round(r.width), handle: getComputedStyle(document.querySelector('.jt-punt .ses-handle')).display }; });
  check('4. a 1280 px la hoja de puntaje es una ventana centrada (no pegada abajo)',
    caja.top >= 40 && caja.bottom >= 40 && Math.abs(caja.centro) <= 2 && caja.ancho <= 560 && caja.handle === 'none', JSON.stringify(caja));
  await d.p.keyboard.press('Escape');
  await d.p.waitForTimeout(300);

  // 5. la programada: la flecha › desde octubre lleva a ella
  await d.p.locator('[data-cj="next"]').click(); await d.p.waitForTimeout(400);
  const prog = await d.p.evaluate(() => ({
    sello: document.querySelector('[data-cj="sello"]')?.textContent ?? '',
    voy: !!document.querySelector('[data-jt="voy"]'), noVoy: !!document.querySelector('[data-jt="no-voy"]'),
    vaATener: /va a tener \d+ años?/.test(document.querySelector('[data-cj="designados"]')?.textContent ?? ''),
    linea: document.querySelector('[data-cons="linea"]')?.textContent ?? '',
  }));
  check('5. la juntada programada muestra el sello "Programada", "Voy", "No voy" y "va a tener N años" (y no cuenta en las 36)',
    prog.sello === 'Programada' && prog.voy && prog.noVoy && prog.vaATener && /^36 juntadas/.test(prog.linea), JSON.stringify(prog));
  await d.ctx.close();

  // 2. celular: octubre (4 vinos) más baja que septiembre (7)
  const m = await abrir(390);
  const mOct = await alto(m.p);
  await m.p.locator('[data-cj="prev"]').click(); await m.p.waitForTimeout(400);
  const mSep = await alto(m.p);
  await m.ctx.close();
  check('2. a 390 px la tarjeta de octubre (4 vinos) es más baja que la de septiembre (7)', mOct < mSep && oct.consumos.length < sep.consumos.length, JSON.stringify({ mOct, mSep, vinosOct: oct.consumos.length, vinosSep: sep.consumos.length }));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escriturasCortadas.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
