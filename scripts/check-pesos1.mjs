#!/usr/bin/env node
// Humo de la ronda Pesos 1: dólar del mes y montos en pesos (local en Chromium, nada en producción).
//
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-pesos1.mjs
//
// Corre api/auth, api/cava y api/montos en este equipo con una sesión firmada acá y los datos reales de Airtable, en MODO SECO:
// ninguna escritura sale hacia Airtable (la fila del mes nuevo NO se crea desde acá; la crea producción con el primer pedido del mes).
// Chequeos: (1) formatMonto(30, ARS, 1480) = "$44.400"; (2) api/montos devuelve dolar.mes = mes actual y dolar.valor > 0;
// (3) la pantalla Valor muestra montos con "$" y la línea "Montos en pesos al dólar oficial de …"; (4) el botón USD pasa los montos
// a USD y la línea a "Montos en dólares…", y al recargar sigue en USD; (5) con USD elegido, Inicio y Compras siguen sin ningún "USD"
// en los montos (salvo la ficha del grupo, que es de la ronda 2).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4197, BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';
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

async function cargar(ruta, opciones = {}) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false, ...opciones });
  const tmp = join(tmpdir(), `pesos1-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, cava: (await cargar('api/cava.ts')).default, montos: (await cargar('api/montos.ts')).default };
const S = await cargar('api/_lib/sesion.ts');
const cookieDe = id => `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: id, x: Date.now() + 3600_000 }, 'sesion'))}`;
async function llamar(handler, url, cookie, method = 'GET', body = {}) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await handler({ method, query: q, headers: { cookie }, body }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}

// 1. la función de montos (el módulo del front, empaquetado con React)
const M = await cargar('src/club/montos.ts', { loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty', '.jpg': 'empty', '.webp': 'empty' } });
const f1 = M.formatMonto(30, { moneda: 'ARS', dolar: { mes: '2026-11', valor: 1480 } });
check('1. formatMonto(30, pesos, dólar 1480) da "$44.400"', f1 === '$44.400', f1);

// un socio común de la #001
const usuarios = await S.listar(S.TBL.usuarios, [S.FLD.uNombre, S.FLD.uAdmin]);
const grupo = (await S.listar(S.TBL.cavas, [S.FLD.cGrupo], `RECORD_ID()='${ID_001}'`))[0].fields[S.FLD.cGrupo][0];
const ms = (await S.listar(S.TBL.membresias, [S.FLD.mUsuario, S.FLD.mGrupo])).filter(m => (m.fields[S.FLD.mGrupo] ?? []).includes(grupo));
const socio = ms.map(m => m.fields[S.FLD.mUsuario]?.[0]).find(id => id && usuarios.find(u => u.id === id)?.fields[S.FLD.uAdmin] !== true);
if (!socio) { console.error('No encuentro un socio de la #001'); process.exit(1); }

// 2. el dólar en la respuesta con sesión
const mesBA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const mt = await llamar(H.montos, `/api/montos?cava=${ID_001}`, cookieDe(socio));
const dl = mt.cuerpo?.dolar;
console.log(`  dólar que devuelve api/montos: ${JSON.stringify(dl)} (mes actual en Buenos Aires: ${mesBA})`);
check('2. api/montos devuelve dolar.mes = mes actual y dolar.valor > 0', mt.estado === 200 && dl?.mes === mesBA && dl?.valor > 0, JSON.stringify({ estado: mt.estado, dl }));

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
  const p = await ctx.newPage();
  const ck = cookieDe(socio);
  for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava], ['**/api/montos*', H.montos]]) {
    await p.route(patron, async r => {
      const u = new URL(r.request().url());
      const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method());
      await r.fulfill({ status: estado, json: cuerpo ?? {} });
    });
  }
  await p.route('**/api/juntadas*', r => r.fulfill({ status: 401, json: {} }));
  const ir = async hash => {
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.club-root', { timeout: 40000 });
    await p.waitForFunction(() => document.querySelector('.ses-dentro') || document.querySelector('[data-tv="tarjeta"][data-estado="socio"]'), null, { timeout: 30000 }).catch(() => {});
    await p.waitForSelector('[data-din="linea"]', { timeout: 30000 });
    await p.waitForTimeout(800);
  };
  const textoValor = () => p.evaluate(() => ({
    valor: document.querySelector('[data-tv="valor"]')?.textContent ?? '',
    linea: document.querySelector('[data-tv="tarjeta"] [data-din="linea"]')?.textContent ?? '',
  }));

  // 3. pantalla Valor en pesos
  await ir('#valor');
  const v3 = await textoValor();
  check('3. la pantalla Valor muestra montos con "$" y la línea "Montos en pesos al dólar oficial de …"',
    /^\$[\d.]+$/.test(v3.valor) && /^Montos en pesos al dólar oficial de [a-z]+ \(\$[\d.]+\)$/.test(v3.linea), JSON.stringify(v3));
  console.log(`  línea en pesos: "${v3.linea}" · valor: ${v3.valor}`);

  // 4. el botón USD, y al recargar sigue en USD
  await p.locator('[data-tv="tarjeta"] [data-din="selector"] [data-moneda="USD"]').click();
  await p.waitForTimeout(300);
  const v4 = await textoValor();
  await ir('#valor');
  const v4b = await textoValor();
  check('4. el botón USD pasa los montos a USD y la línea a "Montos en dólares…"; al recargar sigue en USD',
    /^USD [\d.]+$/.test(v4.valor) && v4.linea.startsWith('Montos en dólares') && /^USD [\d.]+$/.test(v4b.valor) && v4b.linea.startsWith('Montos en dólares'), JSON.stringify({ v4, v4b }));

  // 5. con USD elegido, Inicio y Compras siguen en pesos
  await ir('');
  const inicio = await p.evaluate(() => [...document.querySelectorAll('[data-bloque="compras"], [data-banda="5"]')].map(e => e.innerText).join(' | '));
  await ir('#compras');
  const compras = await p.evaluate(() => document.querySelector('.tshell')?.innerText ?? '');
  const conUSD = [inicio, compras].filter(t => /USD/.test(t));
  check('5. con USD elegido, Inicio (Compras y Valor) y la pantalla Compras no muestran "USD" y sí "$"',
    conUSD.length === 0 && /\$\d/.test(inicio) && /\$\d/.test(compras), JSON.stringify({ inicio: inicio.slice(0, 300), compras: compras.slice(0, 300) }));
  await ctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
