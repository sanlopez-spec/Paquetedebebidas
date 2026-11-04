#!/usr/bin/env node
// Humo del selector de cavas y de las cavas individuales (una corrida local en Chromium 390×844, nada en producción).
//   npx vite build && node scripts/check-selector.mjs [--shots <carpeta>]
// Las sesiones son simuladas (cookie firmada con un secreto de prueba), pero /api/cava, /api/montos y el listado de cavas
// son el código real de api/ leyendo Airtable (sólo lectura) con el token de .env.local.
// (1) el botón "Cambiar cava" está a la derecha del nombre; (2) nada se superpone ni hay scroll horizontal; (3) el título del recuadro
// de perfil dice "Barraquitas". Chromium a 375 px, sesión simulada de Bruno (el código de api/ es el real, sólo lectura).
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
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
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
  await pb.waitForSelector('[data-sel="cambiar"]', { timeout: 20000 }).catch(() => {});
  await pb.waitForTimeout(1200);
  const caja = async sel => pb.locator(sel).first().boundingBox();
  const bBtn = await caja('[data-sel="cambiar"]'), bNom = await caja('.ficha-grupo .pf-name'), bMain = await caja('.ficha-grupo .pf-main');
  const bAv = await caja('.ficha-grupo .pf-av'), bPerfil = await caja('.ficha-grupo');
  const textoNom = await pb.locator('.ficha-grupo .pf-name').innerText();
  const derechaTexto = await pb.evaluate(() => {
    let max = 0;   // borde derecho del texto real del nombre y de los datos
    for (const el of document.querySelectorAll('.ficha-grupo .pf-main *')) {
      const r = document.createRange(); r.selectNodeContents(el);
      for (const q of r.getClientRects()) max = Math.max(max, q.right);
    }
    return max;
  });
  check('1. el botón "Cambiar cava" está a la derecha del texto del nombre y los datos',
    !!bBtn && bBtn.x > derechaTexto && bBtn.width <= 88 && bBtn.height >= 44 && bBtn.width >= 44, JSON.stringify({ bBtn, derechaTexto }));
  if (SHOTS) await pb.screenshot({ path: join(SHOTS, 'perfil-375.png') });
  const solapa = (p, q) => p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
  const centrado = !!bBtn && Math.abs((bBtn.y + bBtn.height / 2) - (bPerfil.y + bPerfil.height / 2)) <= 6;
  const scrollH = await pb.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('2. nada se superpone, el botón queda centrado y no hay scroll horizontal',
    !!bBtn && !solapa(bBtn, bMain) && !solapa(bBtn, bAv) && !solapa(bAv, bMain) && bBtn.x + bBtn.width <= bPerfil.x + bPerfil.width && centrado && !scrollH,
    JSON.stringify({ bBtn, bMain, bAv, bPerfil, scrollH }));
  check('3. el título del recuadro de perfil dice "Barraquitas"', textoNom.trim() === 'Barraquitas', JSON.stringify(textoNom));
  await cb.close();
} catch (e) {
  console.log('  ERROR  ' + (e?.message ?? e));
  results.push(false);
} finally {
  await browser?.close();
  srv.kill();
}
const ok = results.length === 3 && results.every(Boolean);
console.log(ok ? '\nTodo OK (3/3).' : `\nHay fallas (${results.filter(Boolean).length}/3).`);
process.exit(ok ? 0 : 1);
