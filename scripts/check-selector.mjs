#!/usr/bin/env node
// Humo del selector de cavas y de las cavas individuales (una corrida local en Chromium 390×844, nada en producción).
//   npx vite build && node scripts/check-selector.mjs [--shots <carpeta>]
// Las sesiones son simuladas (cookie firmada con un secreto de prueba), pero /api/cava, /api/montos y el listado de cavas
// son el código real de api/ leyendo Airtable (sólo lectura) con el token de .env.local.
// (1) con Bruno, el subtítulo tiene ▾ y la hoja lista la grupal y "Cava personal"; (2) al elegir "Cava personal" el Inicio
// muestra el estado vacío y la cabecera dice "Cava personal · Bruno Borrelli"; (3) Compras de la #002: tarjeta del mes con
// cuota USD 50 y "Debés 1 mes · USD 50", sin "Tu parte"; (4) con Santiago, la #003 no muestra tarjeta del mes ni cuotas;
// (5) con Bruno, pedir montos (y datos) de la #003 da 403.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4184, BASE = `http://localhost:${PUERTO}`;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
process.env.SESSION_SECRET = 'secreto-de-prueba-solo-local-0123456789abcdef';
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

// el código real de api/, empaquetado a un archivo temporal
async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
  const tmp = join(tmpdir(), `sel-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const ses = await cargar('api/_lib/sesion.ts');
const { default: hCava } = await cargar('api/cava.ts');
const { default: hMontos } = await cargar('api/montos.ts');
async function llamar(h, query, cookie) {
  let status = 200, body = null;
  await h({ method: 'GET', query, headers: cookie ? { cookie: `${ses.COOKIE_SESION}=${encodeURIComponent(cookie)}` } : {} },
    { setHeader() {}, status(c) { status = c; return this; }, json(b) { body = b; return this; } });
  return { status, body };
}
async function persona(nombre) {
  const us = await ses.listar(ses.TBL.usuarios, [ses.FLD.uNombre]);
  const r = us.find(u => String(u.fields[ses.FLD.uNombre] ?? '').trim() === nombre);
  if (!r) throw new Error('no encuentro a ' + nombre);
  const u = await ses.usuarioPorId(r.id);
  return { u, cookie: ses.firmar({ u: u.id, x: Date.now() + 3600_000 }, 'sesion'), cavas: await ses.cavasDe(u) };
}
const bruno = await persona('Bruno Borrelli'), santiago = await persona('Santiago Lopez');
const ind = p => p.cavas.find(c => c.propia && !c.tipo.toLowerCase().includes('grup'));
const c002 = ind(bruno), c003 = ind(santiago);
const memo = new Map();
const una = (k, f) => memo.get(k) ?? (memo.set(k, f()), memo.get(k));

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const abrir = async (p, hash = '') => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.route('**/api/auth*', r => r.fulfill({ json: { sesion: true, usuario: { nombre: p.u.nombre, email: p.u.email, admin: p.u.admin }, cavas: p.cavas } }));
    await page.route('**/api/cava*', async r => {
      const cava = new URL(r.request().url()).searchParams.get('cava') ?? undefined;
      const x = await una(`cava|${p.u.id}|${cava}`, () => llamar(hCava, cava ? { cava } : {}, p.cookie));
      await r.fulfill({ status: x.status, json: x.body });
    });
    await page.route('**/api/montos*', async r => {
      const cava = new URL(r.request().url()).searchParams.get('cava');
      const x = await una(`montos|${p.u.id}|${cava}`, () => llamar(hMontos, { cava }, p.cookie));
      await r.fulfill({ status: x.status, json: x.body });
    });
    await page.goto(`${BASE}/club/cava${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-sel="cabecera"]', { timeout: 20000 });
    return { ctx, page };
  };
  const elegir = async (page, fila) => {
    await page.locator('[data-sel="cabecera"]').click();
    await page.waitForSelector('[data-sel="hoja"]', { timeout: 5000 });
    await page.locator(`[data-sel-fila="${fila}"]`).click();
  };

  // Bruno
  const { ctx: cb, page: pb } = await abrir(bruno);
  await pb.waitForTimeout(800);
  const sub0 = await pb.locator('[data-sel="cabecera"]').innerText();
  await pb.locator('[data-sel="cabecera"]').click();
  await pb.waitForSelector('[data-sel="hoja"]', { timeout: 5000 });
  const hoja = await pb.locator('[data-sel="hoja"]').innerText();
  check('1. Bruno: el subtítulo tiene ▾ y la hoja lista "Club EDB #001 · Barraquitas" y "Cava personal"',
    sub0.includes('▾') && sub0.includes('Club EDB #001 · Barraquitas') && hoja.includes('Tus cavas') && hoja.includes('Club EDB #001 · Barraquitas') && hoja.includes('Club · 7 socios')
      && hoja.includes('Cava personal') && hoja.includes('Bruno Borrelli') && !/#00[23]/.test(hoja), (sub0 + ' || ' + hoja).replace(/\n/g, ' | '));
  if (SHOTS) await pb.screenshot({ path: join(SHOTS, 'selector-hoja.png') });
  await pb.locator('[data-sel-fila="individual"]').click();
  await pb.waitForSelector('[data-cm="vacio"]', { timeout: 20000 }).catch(() => {});
  const vacio = await pb.locator('[data-cm="vacio"]').innerText().catch(() => '');
  const sub1 = await pb.locator('[data-sel="cabecera"]').innerText();
  const cuerpo1 = await pb.locator('body').innerText();
  check('2. al elegir "Cava personal": estado vacío en el Inicio y cabecera "Cava personal · Bruno Borrelli"',
    vacio.includes('Todavía no hay botellas en esta cava') && sub1.includes('Cava personal · Bruno Borrelli') && !/#00[23]/.test(cuerpo1), sub1 + ' / ' + vacio);
  if (SHOTS) await pb.screenshot({ path: join(SHOTS, 'selector-inicio-vacio.png') });

  await pb.evaluate(() => { location.hash = '#compras'; });
  await pb.waitForSelector('[data-cm="mes"]', { timeout: 20000 }).catch(() => {});
  await pb.waitForSelector('[data-cm="cuotas"]', { timeout: 5000 }).catch(() => {});
  const mes = await pb.locator('[data-cm="mes"]').innerText().catch(() => '');
  const cu = await pb.locator('[data-cm="cuotas"]').innerText().catch(() => '');
  const todo = await pb.locator('body').innerText();
  check('3. Compras de la #002: tarjeta del mes con cuota USD 50 y "Debés 1 mes · USD 50", sin "Tu parte"',
    mes.includes('Cuota del mes') && mes.includes('USD 50') && cu.includes('Debés 1 mes · USD 50') && !/tu parte/i.test(todo) && !/#00[23]/.test(todo), (mes + ' || ' + cu).replace(/\n/g, ' | '));
  if (SHOTS) await pb.screenshot({ path: join(SHOTS, 'selector-compras-002.png') });
  await cb.close();

  // Santiago (admin): en la hoja sólo ve SUS cavas
  const { ctx: cs, page: ps } = await abrir(santiago);
  await ps.waitForTimeout(800);
  await ps.locator('[data-sel="cabecera"]').click();
  await ps.waitForSelector('[data-sel="hoja"]', { timeout: 5000 });
  const filas = await ps.locator('[data-sel-fila]').count();
  await ps.locator('[data-sel-fila="individual"]').click();
  await ps.waitForSelector('[data-cm="vacio"]', { timeout: 20000 }).catch(() => {});
  await ps.evaluate(() => { location.hash = '#compras'; });
  await ps.waitForTimeout(2500);
  const tarj = await ps.locator('[data-cm="mes"]').count(), cuo = await ps.locator('[data-cm="cuotas"]').count(), pau = await ps.locator('[data-cm="pausa"]').count();
  const cuerpoS = await ps.locator('body').innerText();
  check('4. Santiago (admin): el selector muestra 2 cavas y la #003 no tiene tarjeta del mes, cuotas ni pausa',
    filas === 2 && ses && tarj === 0 && cuo === 0 && pau === 0 && /Todavía no hay botellas/.test(cuerpoS) && !/#00[23]/.test(cuerpoS), `filas=${filas} tarjeta=${tarj} cuotas=${cuo} pausa=${pau}`);
  if (SHOTS) await ps.screenshot({ path: join(SHOTS, 'selector-compras-003.png') });
  await cs.close();

  // seguridad: Bruno no entra a la #003 (ni por montos ni por datos); Santiago (admin) sí
  const m403 = await llamar(hMontos, { cava: c003.id }, bruno.cookie);
  const d403 = await llamar(hCava, { cava: c003.id }, bruno.cookie);
  const mAdm = await llamar(hMontos, { cava: c002.id }, santiago.cookie);
  const mSin = await llamar(hMontos, { cava: c003.id }, null);
  check('5. Bruno pidiendo la #003: montos y datos dan 403 (admin entra, sin sesión da 401)',
    m403.status === 403 && d403.status === 403 && mAdm.status === 200 && mSin.status === 401, `${m403.status}/${d403.status}/${mAdm.status}/${mSin.status}`);
} catch (e) {
  console.log('  ERROR  ' + (e?.message ?? e));
  results.push(false);
} finally {
  await browser?.close();
  srv.kill();
}
const ok = results.length === 5 && results.every(Boolean);
console.log(ok ? '\nTodo OK (5/5).' : `\nHay fallas (${results.filter(Boolean).length}/5).`);
process.exit(ok ? 0 : 1);
