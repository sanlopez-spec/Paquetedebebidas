#!/usr/bin/env node
// Humo del Panel Admin (una corrida local en Chromium, nada en producción y SIN escribir en Airtable: sólo lecturas).
//   npx vite build && node scripts/check-admin-panel.mjs
// Corre los endpoints reales en este equipo con una sesión firmada acá (SESSION_SECRET de prueba) y los datos reales de Airtable (.env.local).
// (1) admin-cavas responde 401 sin sesión y 403 con un socio que no es Admin (lista y detalle);
// (2) la lista del Admin trae las 4 cavas, cada una con su deuda y con los totales que suman;
// (3) api/cava.ts (público) sigue sin dinero, deudas ni datos personales (sólo el dólar del mes);
// (4) el menú del nombre muestra "Panel Admin" al Admin y no a un socio, y abre #admin con la lista;
// (5) el selector de cavas ya no tiene "Otras cavas · admin" (y el Admin ve sólo las suyas).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4184, BASE = `http://localhost:${PUERTO}`;
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');   // sólo para firmar cookies de este script
// modo seco: ningún POST/PATCH/DELETE sale hacia Airtable
const fetchReal = globalThis.fetch;
globalThis.fetch = (u, o) => (/airtable\.com/.test(String(u)) && o?.method && o.method !== 'GET' ? Promise.reject(new Error('modo seco')) : fetchReal(u, o));

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `admp-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, admin: (await cargar('api/admin-cavas.ts')).default, cava: (await cargar('api/cava.ts')).default, montos: (await cargar('api/montos.ts')).default };
const S = await cargar('api/_lib/sesion.ts');

const usuarios = await S.listar(S.TBL.usuarios, [S.FLD.uNombre, S.FLD.uEmail, S.FLD.uAdmin]);
const santiago = usuarios.find(u => u.fields[S.FLD.uAdmin] === true);
const bruno = usuarios.find(u => String(u.fields[S.FLD.uNombre] ?? '').includes('Bruno Borrelli'));
if (!santiago || !bruno) { console.error('No encuentro a Santiago (Admin) o a Bruno Borrelli en Usuarios'); process.exit(1); }
const cookieDe = u => `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: u.id, x: Date.now() + 3600_000 }, 'sesion'))}`;

async function llamar(handler, url, cookie) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  const res = { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; } };
  await handler({ method: 'GET', query: q, headers: cookie ? { cookie } : {}, body: {} }, res);
  return { estado, cuerpo };
}
const rutas = cookie => async page => {
  for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/admin-cavas*', H.admin], ['**/api/cava*', H.cava], ['**/api/montos*', H.montos]]) {
    await page.route(patron, async r => {
      const u = new URL(r.request().url());
      const { estado, cuerpo } = await llamar(h, u.pathname + u.search, cookie);
      await r.fulfill({ status: estado, json: cuerpo });
    });
  }
};

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  // 1. permisos
  const sin = await llamar(H.admin, '/api/admin-cavas?action=list', '');
  const socio = await llamar(H.admin, '/api/admin-cavas?action=list', cookieDe(bruno));
  const socioDet = await llamar(H.admin, '/api/admin-cavas?action=detail&cava=recAAAAAAAAAAAAAA', cookieDe(bruno));
  check('1. admin-cavas: 401 sin sesión y 403 con un socio (lista y ficha), sin datos',
    sin.estado === 401 && socio.estado === 403 && socioDet.estado === 403 && !socio.cuerpo?.cavas && !socioDet.cuerpo?.cava, JSON.stringify([sin.estado, socio.estado, socioDet.estado]));

  // 2. la lista
  const lista = await llamar(H.admin, '/api/admin-cavas?action=list', cookieDe(santiago));
  const cs = lista.cuerpo?.cavas ?? [], t = lista.cuerpo?.totales ?? {};
  const resumen = cs.map(c => `${c.numero} ${c.tipo} socios=${c.socios} debe=${c.deuda?.n}/${c.deuda?.ars}`).join(' · ');
  console.log('     ' + resumen + ` | totales socios=${t.socios} deuda=${t.deudaArs}`);
  check('2. la lista trae las 4 cavas, cada una con su deuda, y los totales suman',
    lista.estado === 200 && cs.length === 4 && cs.every(c => typeof c.deuda?.n === 'number' && typeof c.deuda?.ars === 'number')
    && t.cavas === 4 && t.deudaArs === cs.reduce((a, c) => a + c.deuda.ars, 0) && t.deudores === cs.reduce((a, c) => a + c.deuda.n, 0), resumen);

  // 3. api/cava.ts sigue sin dinero ni datos personales
  const pub = await llamar(H.cava, '/api/cava', '');
  const claves = new Set();
  (function rec(x) { if (Array.isArray(x)) x.forEach(rec); else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { claves.add(k); rec(v); } })(pub.cuerpo);
  const prohibidas = [...claves].filter(k => /deuda|cuota|saldo|pagado|pagaste|costo|monto|email|mail|tel[eé]fono|ars|usd/i.test(k));
  check('3. api/cava.ts: sin campos de dinero ni datos personales (sólo "dolar")', pub.estado === 200 && prohibidas.length === 0, prohibidas.join(', '));

  // 4 y 5. menú y selector en pantalla
  browser = await chromium.launch({ headless: true });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  const abrir = async (u, hash = '') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await rutas(cookieDe(u))(page);
    await page.goto(`${BASE}/club/cava${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-ses="nombre"]', { timeout: 30000 });
    return { ctx, page };
  };
  const { ctx: c1, page: p1 } = await abrir(santiago);
  await p1.locator('[data-ses="nombre"]').click();
  const hayAdmin = await p1.locator('[data-ses="panel-admin"]').count();
  await p1.locator('[data-ses="panel-admin"]').click();
  await p1.waitForSelector('[data-adm="lista"] tbody tr', { timeout: 30000 });
  const filas = await p1.locator('[data-adm="lista"] tbody tr').count();
  const sinBarra = await p1.locator('.appbar').count();
  const { ctx: c2, page: p2 } = await abrir(bruno);
  await p2.locator('[data-ses="nombre"]').click();
  const brunoAdmin = await p2.locator('[data-ses="panel-admin"]').count();
  await c2.close();
  check('4. "Panel Admin" sólo en el menú del Admin; abre #admin con las 4 cavas y sin la barra de abajo', hayAdmin === 1 && brunoAdmin === 0 && filas === 4 && sinBarra === 0, `admin=${hayAdmin} bruno=${brunoAdmin} filas=${filas} appbar=${sinBarra}`);

  await p1.locator('[data-adm="volver-app"]').click();
  await p1.waitForSelector('[data-sel="cabecera"]', { timeout: 20000 });
  await p1.locator('[data-sel="cabecera"]').click();
  await p1.waitForSelector('[data-sel="hoja"]', { timeout: 10000 });
  const hoja = await p1.locator('[data-sel="hoja"]').innerText();
  const nFilas = await p1.locator('[data-sel-fila]').count();
  check('5. el selector no tiene "Otras cavas · admin" y muestra sólo las cavas propias del Admin',
    !/Otras cavas/.test(hoja) && nFilas >= 1 && nFilas <= 2 && (await p1.locator('[data-sel="otras"]').count()) === 0, hoja.replace(/\n/g, ' | '));
  await c1.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
