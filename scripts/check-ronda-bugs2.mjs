#!/usr/bin/env node
// Humo de la ronda de bugs 1 (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs1.mjs
//
// Corre los endpoints reales (api/auth, api/cava, api/juntadas) en este equipo, con sesión firmada acá (SESSION_SECRET de prueba) y datos
// reales de Airtable. MODO SECO: cualquier escritura a Airtable se corta antes de salir. /api/montos va simulado.
// Humo de la ronda de bugs 2 (juntadas de la tabla, dos columnas en desktop, íconos de consumo, Vivino con 1 decimal).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4185, BASE = `http://localhost:${PUERTO}`;
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
  // conSesion: Santiago en la #003 (cava individual); sin sesión: la #001 pública
  async function abrir(ancho, conSesion) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    if (conSesion) await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_003);
    const p = await ctx.newPage();
    const ck = conSesion ? cookieDe(santiago.id) : '';
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava], ['**/api/juntadas*', H.juntadas]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), r.request().postDataJSON?.() ?? {});
        await r.fulfill({ status: estado, json: cuerpo ?? {} });
      });
    }
    await p.route('**/api/montos*', r => r.fulfill({ status: 401, json: {} }));
    await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
    if (conSesion) await p.waitForFunction(id => localStorage.getItem('edb_cava') === id && document.querySelector('.tab-top'), ID_003, { timeout: 40000 });
    await p.waitForSelector('.tab-top', { timeout: 40000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(1200);
    await p.locator(ancho >= 900 ? '.tab-top [data-pantalla-top="consumos"]' : 'nav.appbar [data-pantalla="consumos"]').click();
    await p.waitForSelector('.cons-sec', { timeout: 30000 });
    await p.waitForTimeout(2000);
    return { ctx, p };
  }

  const d = await abrir(1280, false);
  // 1. el #001 lee 36 juntadas de la tabla
  const linea = await d.p.locator('[data-cons="linea"]').innerText().catch(() => '');
  const sub = await d.p.locator('[data-cj="fecha"]').innerText().catch(() => '');
  check('1. Consumos del #001 dice "36 juntadas" y navega "juntada N de 36"', /^36 juntadas · 209 botellas abiertas desde 2021/.test(linea) && /de 36$/.test(sub), JSON.stringify({ linea, sub }));

  // 2. dos columnas a 1280 px y el mismo alto en septiembre y en octubre 2026
  const medir = () => d.p.evaluate(() => { const c = document.querySelector('.cj-card'); const a = c.querySelector('.cj-col-a').getBoundingClientRect(), b = c.querySelector('.cj-col-b').getBoundingClientRect(); return { alto: Math.round(c.getBoundingClientRect().height), lado: Math.abs(a.left - b.left) > 100 && Math.abs(a.width - b.width) < 2 }; });
  const oct = await medir();
  await d.p.locator('[data-cj="prev"]').click(); await d.p.waitForTimeout(500);
  const subSep = await d.p.locator('[data-cj="fecha"]').innerText();
  const sep = await medir();
  check('2. a 1280 px la juntada tiene dos columnas iguales y el mismo alto en septiembre y octubre 2026', oct.lado && sep.lado && oct.alto === sep.alto && /3\/09/.test(subSep), JSON.stringify({ oct, sep, subSep }));

  // 3. sin Día exacto: sólo el mes
  for (let i = 0; i < 6; i++) { const b = d.p.locator('[data-cj="anio-prev"]'); if (await b.isDisabled()) break; await b.click(); await d.p.waitForTimeout(250); }
  const sub21 = await d.p.locator('[data-cj="fecha"]').innerText();
  const anio = await d.p.locator('[data-cj="anio"]').innerText();
  check('3. una juntada sin "Día exacto" no muestra día ni día de la semana', anio === '2021' && /^juntada \d+ de 36$/.test(sub21), JSON.stringify({ anio, sub21 }));

  // 5. ningún Vivino con 2 decimales en Consumos (tarjeta de la juntada + informe)
  const texto = await d.p.locator('.cons-sec').innerText();
  const dos = texto.match(/\d[,.]\d{2}(?!\d)/g);
  check('5. en Consumos no hay números con 2 decimales', !dos, JSON.stringify(dos));
  await d.ctx.close();

  // 4. cava individual: Puntuar (o la pastilla) y Volver a comprar en cada fila
  const i3 = await abrir(390, true);
  const fila = await i3.p.evaluate(() => { const f = document.querySelector('[data-jt="individual"] .ji-fila'); return f ? { punt: !!f.querySelector('[data-jt="puntuar"], [data-jt="mi-puntaje"]'), compra: (f.querySelector('[data-jt="recomprar"]') || {}).href || '' } : null; });
  check('4. en una cava individual la fila trae Puntuar (o la pastilla) y Volver a comprar con el mensaje de WhatsApp', !!fila && fila.punt && /wa\.me\/5491165803342\?text=Hola%20Santi%2C%20quiero%20volver%20a%20comprar/.test(fila.compra), JSON.stringify(fila));
  await i3.ctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log('  (modo seco: ' + escriturasCortadas.length + ' escrituras cortadas antes de salir)');
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
