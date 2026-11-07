#!/usr/bin/env node
// Humo de "Otras cavas · admin" (una corrida local en Chromium 390×844, nada en producción).
//   npx vite build && node scripts/check-admin-cavas.mjs
// Corre los endpoints reales (api/auth, admin-cavas, cava, montos) en este equipo con una sesión firmada acá (SESSION_SECRET de prueba)
// y los datos reales de Airtable (AIRTABLE_TOKEN de .env.local); sólo se sirven a la página por la red local.
// (1) Santiago: la hoja "Tus cavas" tiene "Otras cavas · admin" con Bruno Borrelli; (2) al tocar a Bruno sale la franja
// "Estás viendo la cava de Bruno Borrelli como admin" y Compras de octubre dice 53,83; (3) con la sesión de Bruno la hoja no tiene
// "Otras cavas"; (4) el endpoint de la lista, con la sesión de Bruno, responde 403.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4183, BASE = `http://localhost:${PUERTO}`;
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');   // sólo para firmar cookies de este script

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `adm-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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

// Llama al endpoint de verdad con la cookie de la persona y devuelve estado + cuerpo
async function llamar(handler, url, cookie) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  const res = { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; } };
  await handler({ method: 'GET', query: q, headers: { cookie }, body: {} }, res);
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
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const abrir = async (u, hash = '') => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await rutas(cookieDe(u))(page);
    await page.goto(`${BASE}/club/cava${hash}`, { waitUntil: 'domcontentloaded' });
    return { ctx, page };
  };
  const abrirHoja = async page => {
    await page.waitForSelector('[data-sel="cambiar"]', { timeout: 30000 });
    await page.locator('[data-sel="cambiar"]').click();
    await page.waitForSelector('[data-sel="hoja"]', { timeout: 10000 });
  };

  // 1 y 2. Santiago
  const { ctx: c1, page: p1 } = await abrir(santiago);
  await abrirHoja(p1);
  await p1.waitForSelector('[data-sel="otras"]', { timeout: 20000 }).catch(() => {});
  const hoja = await p1.locator('[data-sel="hoja"]').innerText();
  const filaBruno = p1.locator('[data-sel-fila]', { hasText: 'Bruno Borrelli' });
  check('1. Santiago: la hoja tiene "Otras cavas · admin" con "Cava personal / Bruno Borrelli"',
    hoja.includes('Otras cavas · admin') && await filaBruno.count() === 1 && (await filaBruno.innerText()).includes('Cava personal'), hoja.replace(/\n/g, ' | '));
  await filaBruno.click();
  await p1.waitForSelector('[data-sel="franja"]', { timeout: 20000 });
  const franja = (await p1.locator('[data-sel="franja"]').innerText()).replace(/\s+/g, ' ');
  const cavaBruno = (await llamar(H.admin, '/api/admin-cavas', cookieDe(santiago))).cuerpo.cavas.find(c => c.dueno === 'Bruno Borrelli')?.id;
  const guardada = await p1.evaluate(() => localStorage.getItem('edb_cava'));
  await p1.evaluate(() => { location.hash = '#compras'; });
  await p1.waitForSelector('[data-cm="mes"]', { timeout: 30000 });
  await p1.locator('[data-cm="prev"]').click();
  const oct = (await p1.locator('[data-cm="mes"]').innerText()).replace(/\s+/g, ' ');
  const m = await llamar(H.montos, `/api/montos?cava=${cavaBruno}`, cookieDe(santiago));
  const costoOct = m.cuerpo?.compras?.porMes?.['2026-10']?.costo;
  check('2. al tocar a Bruno: franja "Estás viendo la cava de Bruno Borrelli como admin", no se recuerda, y Compras de octubre: 4 botellas, USD 54 de 50 (la app redondea los dólares: 53,83)',
    franja.startsWith('Estás viendo la cava de Bruno Borrelli como admin') && guardada === null && /4 botellas/.test(oct) && /asignados de USD 50/.test(oct) && Math.abs(costoOct - 53.83) < 0.5, `${franja} | guardada=${guardada} | costo=${costoOct} | ${oct}`);
  await c1.close();

  // 3. Bruno
  const { ctx: c3, page: p3 } = await abrir(bruno);
  await p3.waitForSelector('.club-root', { timeout: 30000 });
  await p3.waitForTimeout(3000);
  const hayCambiar = await p3.locator('[data-sel="cambiar"]').count();
  if (hayCambiar) await abrirHoja(p3);
  const hoja3 = hayCambiar ? await p3.locator('[data-sel="hoja"]').innerText() : '';
  const franja3 = await p3.locator('[data-sel="franja"]').count();
  check('3. Bruno: la hoja no tiene "Otras cavas" ni franja de admin', !/Otras cavas/.test(hoja3) && !/Otras cavas/.test(await p3.locator('body').innerText()) && franja3 === 0, hoja3);
  await c3.close();

  // 4. el endpoint, con la sesión de Bruno
  const r4 = await llamar(H.admin, '/api/admin-cavas', cookieDe(bruno));
  check('4. /api/admin-cavas con la sesión de Bruno responde 403 y no lista nada', r4.estado === 403 && !r4.cuerpo?.cavas, JSON.stringify(r4));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 4 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
