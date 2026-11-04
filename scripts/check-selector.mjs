#!/usr/bin/env node
// Humo del selector de cavas y de las cavas individuales (una corrida local en Chromium 390×844, nada en producción).
//   npx vite build && node scripts/check-selector.mjs [--shots <carpeta>]
// Las sesiones son simuladas (cookie firmada con un secreto de prueba), pero /api/cava, /api/montos y el listado de cavas
// son el código real de api/ leyendo Airtable (sólo lectura) con el token de .env.local.
// (1) la cabecera dice "Barraquitas", sin ▾ y sin tocar; (2) con Bruno, el recuadro de perfil muestra "Cambiar cava" y abre la hoja;
// (3) no aparece "Club EDB #001" (ni ningún número de cava) en el Inicio ni en Compras; (4) el avatar muestra el lápiz con Santiago
// (Admin/Presidente) y no con Bruno en la grupal; (5) el endpoint del avatar sin sesión da 401 (y Bruno, sin permiso, 403).
// No sube ninguna foto: las pruebas de permiso se cortan antes de escribir en Airtable.
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
const { default: hAvatar } = await cargar('api/avatar.ts');
async function llamar(h, query, cookie) {
  let status = 200, body = null;
  await h({ method: 'GET', query, headers: cookie ? { cookie: `${ses.COOKIE_SESION}=${encodeURIComponent(cookie)}` } : {} },
    { setHeader() {}, status(c) { status = c; return this; }, json(b) { body = b; return this; } });
  return { status, body };
}
async function llamarA(h, method, query, body, cookie) {
  let status = 200, out = null;
  await h({ method, query, body, headers: cookie ? { cookie: `${ses.COOKIE_SESION}=${encodeURIComponent(cookie)}` } : {} },
    { setHeader() {}, status(c) { status = c; return this; }, json(b) { out = b; return this; }, end() { return this; } });
  return { status, body: out };
}
async function persona(nombre) {
  const us = await ses.listar(ses.TBL.usuarios, [ses.FLD.uNombre]);
  const r = us.find(u => String(u.fields[ses.FLD.uNombre] ?? '').trim() === nombre);
  if (!r) throw new Error('no encuentro a ' + nombre);
  const u = await ses.usuarioPorId(r.id);
  const cavas = await ses.cavasDe(u);
  // Mientras el Alias del grupo en Airtable no diga "Barraquitas", ALIAS_PRUEBA=Barraquitas lo simula sólo en esta prueba.
  if (process.env.ALIAS_PRUEBA) for (const c of cavas) if (c.tipo.toLowerCase().includes('grup')) c.titulo = process.env.ALIAS_PRUEBA;
  return { u, cookie: ses.firmar({ u: u.id, x: Date.now() + 3600_000 }, 'sesion'), cavas };
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

  const { ctx: cb, page: pb } = await abrir(bruno);
  await pb.waitForTimeout(1200);
  const cab = await pb.locator('[data-sel="cabecera"]').innerText();
  const cabEsBoton = await pb.locator('button[data-sel="cabecera"]').count();
  check('1. la cabecera dice "Barraquitas", sin ▾ y sin tocar', cab.trim() === 'Barraquitas' && !cab.includes('▾') && cabEsBoton === 0, JSON.stringify(cab));

  const btn = pb.locator('[data-sel="cambiar"]');
  const hayBtn = await btn.count();
  if (SHOTS) await pb.screenshot({ path: join(SHOTS, 'perfil-bruno.png') });
  let hoja = '';
  if (hayBtn) { await btn.click(); await pb.waitForSelector('[data-sel="hoja"]', { timeout: 5000 }); hoja = await pb.locator('[data-sel="hoja"]').innerText(); }
  check('2. Bruno: el recuadro de perfil muestra "Cambiar cava" y abre la hoja con Barraquitas y Cava personal',
    hayBtn === 1 && hoja.includes('Tus cavas') && hoja.includes('Barraquitas') && hoja.includes('Club · 7 socios') && hoja.includes('Cava personal') && hoja.includes('Bruno Borrelli') && !/#00/.test(hoja) && !hoja.includes('Club EDB'),
    hayBtn + ' / ' + hoja.replace(/\n/g, ' | '));
  if (SHOTS) await pb.screenshot({ path: join(SHOTS, 'selector-hoja.png') });
  await pb.keyboard.press('Escape');
  const inicio = await pb.locator('body').innerText();
  const avBruno = await pb.locator('[data-av="fijo"]').count(), lapizBruno = await pb.locator('.av-lapiz').count();
  await pb.evaluate(() => { location.hash = '#compras'; });
  await pb.waitForSelector('[data-cm="mes"]', { timeout: 20000 }).catch(() => {});
  await pb.waitForTimeout(500);
  const compras = await pb.locator('body').innerText();
  check('3. no aparece "Club EDB #001" (ni ningún número de cava) en el Inicio ni en Compras',
    inicio.includes('Barraquitas') && !/Club EDB #|#00\d/.test(inicio) && compras.length > 200 && !/Club EDB #|#00\d/.test(compras), (inicio.match(/.{15}#00\d.{10}/) ?? compras.match(/.{15}#00\d.{10}/) ?? [''])[0]);
  await cb.close();

  const { ctx: cs, page: ps } = await abrir(santiago);
  await ps.waitForTimeout(1200);
  const edSan = await ps.locator('[data-av="editable"]').count(), lapizSan = await ps.locator('.av-lapiz').count();
  if (SHOTS) await ps.screenshot({ path: join(SHOTS, 'perfil-santiago.png') });
  check('4. el avatar muestra el lápiz con Santiago (Presidente/Admin) y no con Bruno en la grupal',
    edSan === 1 && lapizSan === 1 && avBruno === 1 && lapizBruno === 0, `santiago=${edSan}/${lapizSan} bruno=${avBruno}/${lapizBruno}`);
  await cs.close();

  const grupal = bruno.cavas.find(c => c.propia && c.tipo.toLowerCase().includes('grup'));
  const sin = await llamarA(hAvatar, 'POST', {}, { cava: grupal.id, imagen: 'x' }, null);
  const sinGet = await llamarA(hAvatar, 'GET', { cava: grupal.id }, {}, null);
  const sinPermiso = await llamarA(hAvatar, 'POST', {}, { cava: grupal.id, imagen: 'x' }, bruno.cookie);
  check('5. el endpoint del avatar sin sesión da 401 (y Bruno, sin permiso en la grupal, 403)',
    sin.status === 401 && sinGet.status === 401 && sinPermiso.status === 403, `${sin.status}/${sinGet.status}/${sinPermiso.status}`);
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
