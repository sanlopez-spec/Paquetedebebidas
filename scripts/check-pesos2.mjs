#!/usr/bin/env node
// Humo de la ronda Pesos 2: landing, ficha del grupo y /club/condiciones en pesos (local en Chromium, nada en producción).
//
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-pesos2.mjs
//
// Corre api/cava y api/auth en este equipo con los datos reales de Airtable, en MODO SECO: ninguna escritura sale hacia Airtable
// (la fila del dólar del mes nueva NO se crea desde acá). Sin sesión: todo lo que mira es lo que ve un visitante.
// Chequeos: (1) api/cava devuelve dolar.valor > 0 y ningún campo de costo, sugerido o valor; (2) la landing muestra "Desde $" en los dos
// planes, la línea "Montos en pesos al dólar oficial de …" y el link a condiciones; (3) la landing no muestra "USD" fuera de esa línea
// chica (se descuenta el rótulo "USD" del campo donde la persona tipea su cuota); (4) la ficha del grupo muestra "$… por mes cada uno";
// (5) /club/condiciones responde 200, tiene los 10 títulos y contiene "Banco Nación, tipo vendedor".
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4198, BASE = `http://localhost:${PUERTO}`;
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');

const escrituras = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, op = {}) => {
  const metodo = String(op.method ?? 'GET').toUpperCase();
  if (/airtable\.com/.test(String(url)) && metodo !== 'GET') { escrituras.push(metodo); return Promise.reject(new Error('modo seco: escritura cortada')); }
  return fetchReal(url, op);
};
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `pesos2-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, cava: (await cargar('api/cava.ts')).default };
async function llamar(handler, url, cookie = '', method = 'GET') {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await handler({ method, query: q, headers: { cookie }, body: {} }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}

// 1. api/cava: el dólar y nada de plata
const pub = (await llamar(H.cava, '/api/cava')).cuerpo;
const claves = [];
const mirar = (o, ruta) => { if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) { if (/sugerid|costo|pagad|precio|usd|dinero|ahorro|valorEst|tuParte|cuota|deuda/i.test(k)) claves.push(ruta + k); mirar(x, ruta + k + '.'); } };
mirar(pub, '');
// "valor" suelto sólo puede estar dentro de dolar
const valorSuelto = []; const mirarValor = (o, ruta) => { if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) { if (/^valor$/i.test(k) && ruta !== 'dolar.') valorSuelto.push(ruta + k); mirarValor(x, ruta + k + '.'); } };
mirarValor(pub, '');
console.log(`  dólar que devuelve api/cava: ${JSON.stringify(pub?.dolar)}`);
check('1. api/cava devuelve dolar.valor > 0 y ningún campo de costo, sugerido o valor',
  pub?.dolar?.valor > 0 && /^\d{4}-\d{2}$/.test(pub.dolar.mes) && claves.length === 0 && valorSuelto.length === 0, JSON.stringify({ dolar: pub?.dolar, claves, valorSuelto }));

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  async function abrir(ruta, ancho = 1280) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    const p = await ctx.newPage();
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        const { estado, cuerpo } = await llamar(h, u.pathname + u.search, '', r.request().method());
        await r.fulfill({ status: estado, json: cuerpo ?? {} });
      });
    }
    await p.route('**/api/{montos,juntadas}*', r => r.fulfill({ status: 401, json: {} }));
    const resp = await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded' });
    return { ctx, p, resp };
  }

  // 2 y 3. la landing
  const l = await abrir('/club');
  await l.p.waitForSelector('[data-din="linea-comercial"]', { timeout: 40000 });
  await l.p.waitForTimeout(500);
  const t = await l.p.evaluate(() => {
    const filas = [...document.querySelectorAll('.compare .pricerow-amt')].map(e => e.innerText.trim());
    const linea = document.querySelector('[data-din="linea-comercial"]')?.innerText ?? '';
    const link = [...document.querySelectorAll('footer a')].find(a => /Condiciones del club/.test(a.textContent));
    // todo el texto visible de la landing, sin la línea chica ni el rótulo "USD" del campo de la cuota
    const raiz = document.querySelector('.club-root').cloneNode(true);
    raiz.querySelectorAll('[data-din="linea-comercial"], .budget-row .cur, script, style, svg').forEach(e => e.remove());
    return { filas, linea, href: link?.getAttribute('href') ?? null, sobrante: (raiz.innerText ?? raiz.textContent).match(/.{0,30}USD.{0,30}/g) };
  });
  console.log(`  planes: ${JSON.stringify(t.filas)}`);
  console.log(`  línea: "${t.linea}"`);
  check('2. la landing muestra "Desde $" en los dos planes, la línea "Montos en pesos al dólar oficial de …" y el link a condiciones',
    t.filas.length === 2 && t.filas.every(f => /^Desde \$[\d.]+ por mes$/.test(f)) && /^Montos en pesos al dólar oficial de [a-zé]+\. La cuota se define en dólares \(USD 50 y USD 100\) y se ajusta sola cada mes\.$/.test(t.linea) && t.href === '/club/condiciones', JSON.stringify(t));
  check('3. la landing no muestra "USD" fuera de esa línea chica (salvo el rótulo del campo donde se tipea la cuota)', !t.sobrante, JSON.stringify(t.sobrante));
  await l.ctx.close();

  // 4. la ficha del grupo, para el visitante
  const c = await abrir('/club/cava', 390);
  await c.p.waitForSelector('.pf-meta', { timeout: 40000 });
  await c.p.waitForFunction(() => /por mes cada uno/.test(document.querySelector('.pf-meta')?.innerText ?? ''), null, { timeout: 30000 }).catch(() => {});
  const meta = await c.p.locator('.pf-meta').innerText();
  console.log(`  ficha del grupo: "${meta.replace(/\n/g, ' · ')}"`);
  check('4. la ficha del grupo muestra "$… por mes cada uno"', /\$[\d.]+ por mes cada uno/.test(meta) && !/USD/.test(meta), meta);
  await c.ctx.close();

  // 5. /club/condiciones
  const k = await abrir('/club/condiciones', 390);
  await k.p.waitForSelector('.cond-wrap h2', { timeout: 30000 });
  await k.p.waitForSelector('[data-din="linea-comercial"]', { timeout: 30000 });
  const r = await k.p.evaluate(() => ({
    h2: [...document.querySelectorAll('.cond-wrap h2')].map(e => e.textContent.trim()),
    texto: document.querySelector('.cond-wrap').innerText,
    ancho: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
  }));
  console.log(`  condiciones: ${r.h2.length} títulos; cuota en pesos: ${(r.texto.match(/USD 50 a 99[^\n]*/) ?? [''])[0]}`);
  const diez = r.h2.length === 10 && r.h2.every((h, i) => h.startsWith(`${i + 1}. `));
  check('5. /club/condiciones responde 200, tiene los 10 títulos y contiene "Banco Nación, tipo vendedor"',
    k.resp.status() === 200 && diez && r.texto.includes('Banco Nación, tipo vendedor') && r.ancho[0] <= r.ancho[1], JSON.stringify({ estado: k.resp.status(), h2: r.h2, ancho: r.ancho }));
  await k.ctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
