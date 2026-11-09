#!/usr/bin/env node
// Humo de la ronda de bugs 5bis: borrar fotos de la juntada (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs5bis.mjs
//
// Corre los endpoints reales (api/auth, api/cava, api/juntadas) en este equipo, con sesión firmada acá y datos reales de Airtable, en
// MODO SECO (ninguna escritura sale hacia Airtable). La juntada de las fotos es simulada: dos fotos, una subida por el socio de la
// prueba y otra por otro socio.
// Chequeos: (1) un socio ve el tacho sólo en la foto que subió él; (2) el Admin y el Presidente pueden borrar todas;
// (3) el servidor rechaza (403) que un socio borre una foto ajena.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4189, BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';
const JID = 'recJUNTADAFOTOS00';
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');

const escrituras = [];
let registro = null;   // la juntada simulada (se arma abajo, cuando se sabe quién es quién)
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, op = {}) => {
  const u = String(url), metodo = String(op.method ?? 'GET').toUpperCase();
  if (/airtable\.com/.test(u) && metodo !== 'GET') { escrituras.push(metodo); return Promise.reject(new Error('modo seco: escritura cortada')); }
  if (registro && /airtable\.com/.test(u) && u.includes('tblXjEG9P1VZEEcpE') && decodeURIComponent(u).includes(JID)) {
    return Promise.resolve(new Response(JSON.stringify({ records: [registro] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(url, op);
};

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };
async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `rb5b-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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

// las personas: Santiago (Admin), el Presidente del grupo de la #001 y dos socios comunes
const usuarios = await S.listar(S.TBL.usuarios, [S.FLD.uNombre, S.FLD.uAdmin]);
const santiago = usuarios.find(u => u.fields[S.FLD.uAdmin] === true);
const grupo = (await S.listar(S.TBL.cavas, [S.FLD.cGrupo], `RECORD_ID()='${ID_001}'`))[0].fields[S.FLD.cGrupo][0];
const ms = (await S.listar(S.TBL.membresias, [S.FLD.mUsuario, S.FLD.mGrupo, S.FLD.mRol])).filter(m => (m.fields[S.FLD.mGrupo] ?? []).includes(grupo));
const rol = m => String(m.fields[S.FLD.mRol]?.name ?? m.fields[S.FLD.mRol] ?? '');
const esAdmin = id => usuarios.find(u => u.id === id)?.fields[S.FLD.uAdmin] === true;
const presidente = ms.find(m => rol(m) === 'Presidente')?.fields[S.FLD.mUsuario]?.[0];
const comunes = ms.filter(m => rol(m) !== 'Presidente').map(m => m.fields[S.FLD.mUsuario]?.[0]).filter(id => id && !esAdmin(id));
const [socio, otro] = comunes;
if (!santiago || !presidente || !socio || !otro) { console.error('Faltan personas para la prueba'); process.exit(1); }

const foto = id => ({ id, url: `https://dl.airtable.com/${id}.jpg`, thumbnails: { large: { url: `https://dl.airtable.com/${id}.jpg` }, full: { url: `https://dl.airtable.com/${id}.jpg` } } });
registro = {
  id: JID, createdTime: '2026-11-09T00:00:00.000Z', fields: {
    fld8m6VnxAUF39uls: [ID_001], fldqi83NGrcq5BfYf: [socio], fldKno8prsBjITYcQ: [foto('attSUBIDAPORSOCIO'), foto('attSUBIDAPOROTRO')],
    fldRquTGy320Dwtqr: `attSUBIDAPORSOCIO=${socio}\nattSUBIDAPOROTRO=${otro}`,
  },
};

const real = (await llamar(H.juntadas, `/api/juntadas?accion=estado&cava=${ID_001}`, cookieDe(socio))).cuerpo;
const oct = real.juntadas.find(j => j.fecha.startsWith('2026-10'));
const simulado = { ...real, juntadas: real.juntadas.map(j => (j.id === oct.id ? { ...j, id: JID, fotos: 2, puedeFotos: true, soyAsistente: true } : j)) };

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });

  // 1. el socio abre la galería: el tacho sólo en la foto que subió él
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
  const p = await ctx.newPage();
  const ck = cookieDe(socio);
  for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava]]) {
    await p.route(patron, async r => {
      const u = new URL(r.request().url());
      const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), r.request().postDataJSON?.() ?? {});
      await r.fulfill({ status: estado, json: cuerpo ?? {} });
    });
  }
  await p.route('**/api/juntadas*', async r => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('accion') === 'estado') return r.fulfill({ json: simulado });
    const { estado, cuerpo } = await llamar(H.juntadas, u.pathname + u.search, ck, r.request().method(), r.request().postDataJSON?.() ?? {});
    await r.fulfill({ status: estado, json: cuerpo ?? {} });
  });
  await p.route('**/api/montos*', r => r.fulfill({ status: 401, json: {} }));
  await p.route('https://dl.airtable.com/**', r => r.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }));
  await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.tab-top', { timeout: 40000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(1200);
  await p.locator('.tab-top [data-pantalla-top="consumos"]').click();
  await p.waitForSelector('.cj-card', { timeout: 30000 });
  await p.waitForTimeout(1200);
  if ((await p.locator('[data-cj="titulo"] h3').innerText()).startsWith('Próxima')) { await p.locator('[data-cj="prev"]').click(); await p.waitForTimeout(400); }
  await p.locator('[data-jt="ver-fotos"]').click();
  await p.waitForSelector('.jt-gal .jt-foto', { timeout: 10000 });
  const fotos = await p.locator('.jt-gal .jt-foto').count();
  const tachos = await p.evaluate(() => [...document.querySelectorAll('.jt-gal .jt-foto')].map(f => !!f.querySelector('[data-jt="borrar-foto"]')));
  // y la confirmación se abre dentro de la página (no con confirm())
  await p.locator('.jt-gal [data-jt="borrar-foto"]').first().click();
  const conf = await p.locator('[data-jt="borrar-foto-conf"]').innerText().catch(() => '');
  check('1. un socio ve el tacho sólo en la foto que subió él, y la confirmación pide "¿Borrar esta foto?"',
    fotos === 2 && tachos[0] === true && tachos[1] === false && conf.includes('¿Borrar esta foto? No se puede deshacer.') && conf.includes('Borrar') && conf.includes('Cancelar'), JSON.stringify({ fotos, tachos, conf }));
  await ctx.close();

  // 2. el Admin y el Presidente ven el tacho en todas (lo que el servidor manda para cada foto)
  const puede = async id => (await llamar(H.juntadas, `/api/juntadas?accion=fotos&juntada=${JID}`, cookieDe(id))).cuerpo?.fotos?.map(f => f.puedeBorrar);
  const [pAdmin, pPres, pSocio] = [await puede(santiago.id), await puede(presidente), await puede(socio)];
  check('2. el Admin y el Presidente pueden borrar todas las fotos; el socio sólo la suya',
    JSON.stringify(pAdmin) === '[true,true]' && JSON.stringify(pPres) === '[true,true]' && JSON.stringify(pSocio) === '[true,false]', JSON.stringify({ pAdmin, pPres, pSocio }));

  // 3. el servidor rechaza que un socio borre una foto ajena; la propia sí llega hasta el guardado (que el modo seco corta)
  const ajena = await llamar(H.juntadas, '/api/juntadas?accion=borrarfoto', cookieDe(socio), 'POST', { juntada: JID, foto: 'attSUBIDAPOROTRO' });
  const antes = escrituras.length;
  const propia = await llamar(H.juntadas, '/api/juntadas?accion=borrarfoto', cookieDe(socio), 'POST', { juntada: JID, foto: 'attSUBIDAPORSOCIO' });
  const sinSesion = await llamar(H.juntadas, '/api/juntadas?accion=borrarfoto', '', 'POST', { juntada: JID, foto: 'attSUBIDAPORSOCIO' });
  check('3. el servidor rechaza (403) que un socio borre una foto ajena, y sin sesión (401)',
    ajena.estado === 403 && escrituras.length - antes === 1 && propia.estado === 500 && sinSesion.estado === 401, JSON.stringify({ ajena: ajena.estado, intentoPropia: escrituras.length - antes, propia: propia.estado, sinSesion: sinSesion.estado }));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 3 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
