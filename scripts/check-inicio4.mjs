#!/usr/bin/env node
// Humo de la ronda "Bugs Inicio 4": caja de Compras sin compras del mes y tarjeta Valor del Inicio. Local en Chromium, MODO SECO.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-inicio4.mjs
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4203, BASE = `http://localhost:${PUERTO}`;
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

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `inicio4-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, cava: (await cargar('api/cava.ts')).default, montos: (await cargar('api/montos.ts')).default, juntadas: (await cargar('api/juntadas.ts')).default };
const S = await cargar('api/_lib/sesion.ts');
const cookieDe = id => `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: id, x: Date.now() + 3600_000 }, 'sesion'))}`;
async function llamar(handler, url, cookie, method = 'GET', body = {}) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await handler({ method, query: q, headers: { cookie }, body }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}
const admin = (await S.listar(S.TBL.usuarios, [S.FLD.uAdmin])).find(u => u.fields[S.FLD.uAdmin] === true)?.id;
if (!admin) { console.error('No encuentro un Admin'); process.exit(1); }

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  // abre el Inicio con la sesión del Admin a un ancho dado y mide la barra y la ficha
  async function medir(ancho, alto) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
    const p = await ctx.newPage();
    const ck = cookieDe(admin);
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava], ['**/api/montos*', H.montos], ['**/api/juntadas*', H.juntadas]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        let body = {}; try { body = r.request().postDataJSON() ?? {}; } catch {}
        const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), body);
        await r.fulfill({ status: estado, json: cuerpo ?? {} });
      });
    }
    await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.ses-dentro', { timeout: 40000 });
    await p.waitForSelector('[data-tv="cabecera"]', { timeout: 40000 });
    await p.waitForFunction(() => /\d/.test(document.querySelector('[data-tv="cabecera"] b')?.textContent ?? ''), null, { timeout: 40000 }); await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      const cab = document.querySelector('[data-tv="cabecera"]');
      const comp = document.querySelector('[data-bloque="compras"] .sec-card');
      const caja = document.querySelector('[data-compras-estado]');
      const pill = e => e?.querySelector('.sec-card-pill');
      const cs = (e, k) => e ? getComputedStyle(e)[k] : null;
      const desb = [cab, ...cab.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.className || e.tagName);
      return {
        cajaEstado: caja?.getAttribute('data-compras-estado'), cajaTxt: caja?.textContent.trim(),
        valorTxt: cab.textContent, texto: document.body.innerText,
        pillV: cs(pill(cab), 'color'), pillC: cs(pill(comp), 'color'), padV: cs(cab, 'padding'), padC: cs(comp, 'padding'),
        pillTxt: pill(cab)?.textContent, num: parseFloat(cs(cab.querySelector('b'), 'fontSize')), desb,
      };
    });
    await ctx.close();
    return m;
  }
  const a390 = await medir(390, 844), a320 = await medir(320, 700);
  console.log(`  caja Compras: ${a390.cajaEstado} · "${a390.cajaTxt}" · monto ${a390.num}px (390) / ${a320.num}px (320)`);
  check('1. la caja de Compras muestra "Estamos eligiendo tus vinos de este mes."', a390.cajaTxt === 'Estamos eligiendo tus vinos de este mes.', `${a390.cajaEstado} "${a390.cajaTxt}"`);
  check('2. la tarjeta Valor tiene "▲", "%" y el texto nuevo', a390.valorTxt.includes('▲') && a390.valorTxt.includes('%') && a390.valorTxt.includes('Lo que queda en la cava vale más que todo lo que se pagó.'), a390.valorTxt);
  check('3. en el Inicio no aparece "Ver informe" ni "vale 35 % más"', !/Ver informe|vale \d+ % más/.test(a390.texto));
  check('4. Valor y Compras: mismo color de "Ver ›" y mismo padding', a390.pillV === a390.pillC && a390.padV === a390.padC && a390.pillTxt === 'Ver ›', JSON.stringify([a390.pillV, a390.pillC, a390.padV, a390.padC]));
  check('5. a 320 px nada de la tarjeta Valor desborda', a320.desb.length === 0, a320.desb.join(','));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
