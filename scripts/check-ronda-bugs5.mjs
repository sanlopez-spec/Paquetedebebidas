#!/usr/bin/env node
// Humo de la ronda de bugs 5 (local en Chromium, nada en producción, ningún mail).
//
//   npx vite build && node scripts/check-ronda-bugs5.mjs
//
// Corre los endpoints reales (api/auth, api/cava) en este equipo, con sesión firmada acá y datos reales de Airtable, en MODO SECO
// (ni escrituras a Airtable ni mails). El estado de /api/juntadas es el real de la #001 más una juntada programada simulada,
// sin "Invitación enviada".
// Chequeos: (1) Consumos no tiene el título "Consumos" y tiene "Juntadas" e "Informe de consumos"; (2) las 5 secciones del
// informe arrancan cerradas y al abrir Calidad se cierra Ritmo; (3) a 1280 px, "Botellas por año" mide 400 px o menos y sus
// barras 40 px o menos; (4) en septiembre 2026 no hay un "·" pegado a una palabra; (5) la programada sin invitación enviada
// muestra "Enviar la invitación".
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4188, BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';
const PROG = 'recPROGRAMADA0000';
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');
process.env.RESEND_API_KEY = 'prueba-sin-envio';

// modo seco: nada de escrituras a Airtable ni mails; la programada simulada se responde acá
const cortados = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, op = {}) => {
  const u = String(url), metodo = String(op.method ?? 'GET').toUpperCase();
  if (/resend\.com/.test(u)) { cortados.push('resend'); return Promise.reject(new Error('modo seco: mail cortado')); }
  if (/airtable\.com/.test(u) && metodo !== 'GET') { cortados.push(metodo); return Promise.reject(new Error('modo seco: escritura cortada')); }
  if (/airtable\.com/.test(u) && u.includes('tblXjEG9P1VZEEcpE') && decodeURIComponent(u).includes(PROG)) {
    return Promise.resolve(new Response(JSON.stringify({ records: [{ id: PROG, createdTime: '2026-11-09T00:00:00.000Z', fields: {
      fld8m6VnxAUF39uls: [ID_001], fldNjI92ecirmFzNj: 'Programada', fldoLC4TDsOuji996: '2026-11-26', fldyj3Sx2ivf2qoAr: '21:00', fldV8mloKBm9ffZSd: 'Cava', fldq22lEbMSCtSQng: [], fldOjcBBBkiu9SJkK: [],
    } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(url, op);
};

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };
async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `rb4-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, cava: (await cargar('api/cava.ts')).default, juntadas: (await cargar('api/juntadas.ts')).default };
const S = await cargar('api/_lib/sesion.ts');
const M = await cargar('api/_lib/mailJuntada.ts');
const cookieDe = id => `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: id, x: Date.now() + 3600_000 }, 'sesion'))}`;
async function llamar(handler, url, cookie, method = 'GET', body = {}) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await handler({ method, query: q, headers: { cookie }, body }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}
const usuarios = await S.listar(S.TBL.usuarios, [S.FLD.uNombre, S.FLD.uAdmin]);
const santiago = usuarios.find(u => u.fields[S.FLD.uAdmin] === true);
const ck = cookieDe(santiago.id);
// un socio de la #001 (para el link del mail)
const grupo = (await S.listar(S.TBL.cavas, [S.FLD.cGrupo], `RECORD_ID()='${ID_001}'`))[0].fields[S.FLD.cGrupo][0];
const socio = (await S.listar(S.TBL.membresias, [S.FLD.mUsuario, S.FLD.mGrupo])).find(m => (m.fields[S.FLD.mGrupo] ?? []).includes(grupo))?.fields[S.FLD.mUsuario]?.[0];

// el estado de la pantalla: el real de la #001 + una programada para el 26/11
const real = (await llamar(H.juntadas, `/api/juntadas?accion=estado&cava=${ID_001}`, ck)).cuerpo;
const oct = real.juntadas.find(j => j.fecha.startsWith('2026-10'));
const designados = real.guarda.slice(0, 3).map(b => ({ botella: b.id, vino: b.vino, anada: b.anada, cepa: b.cepa, tipo: '', bodega: b.bodega, vivino: 4.1, enGuarda: b.enGuarda }));
const programada = {
  ...oct, id: PROG, nombre: 'Juntada noviembre 2026', fecha: '2026-11-26', exacto: true, asistentes: [], asistentesNombres: [], consumos: [],
  abierta: false, soyAsistente: false, fotos: 0, portada: '', portadaPor: '', maridaje: '', notas: '', programada: true, sede: 'Cava', hora: '21:00',
  designados, van: [], noVan: [], miRespuesta: null, invitacionEnviada: '', puedeResponder: true, puedeEmpezar: false, puedeBorrar: true, puedeEditar: true,
};
const simulado = { ...real, juntadas: [...real.juntadas, programada] };

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
  const p = await ctx.newPage();
  for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava]]) {
    await p.route(patron, async r => {
      const u = new URL(r.request().url());
      const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), r.request().postDataJSON?.() ?? {});
      await r.fulfill({ status: estado, json: cuerpo ?? {} });
    });
  }
  // en la app, el estado simulado; la página del link usa el endpoint real (sin cookie)
  await p.route('**/api/juntadas*', async r => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('accion') === 'estado') return r.fulfill({ json: simulado });
    const { estado, cuerpo } = await llamar(H.juntadas, u.pathname + u.search, '', r.request().method(), r.request().postDataJSON?.() ?? {});
    await r.fulfill({ status: estado, json: cuerpo ?? {} });
  });
  await p.route('**/api/montos*', r => r.fulfill({ status: 401, json: {} }));
  await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.tab-top', { timeout: 40000 });
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(1200);
  await p.locator('.tab-top [data-pantalla-top="consumos"]').click();
  await p.waitForSelector('.cj-card', { timeout: 30000 });
  await p.waitForTimeout(1500);

  // 5. la programada (Consumos abre en ella) sin invitación enviada
  const boton = await p.locator('[data-jt="recordar"]').innerText().catch(() => '');
  check('5. con una programada sin "Invitación enviada", el botón dice "Enviar la invitación"', /^Enviar la invitación \(\d+\)$/.test(boton.trim()), boton);

  // 1. los encabezados
  const tit = await p.evaluate(() => ({
    h2: [...document.querySelectorAll('.cons-sec h2')].map(h => h.textContent.trim()),
    informe: document.querySelector('.ci-banda .ci-tt')?.textContent ?? '',
  }));
  check('1. Consumos no tiene el título "Consumos" y tiene "Juntadas" e "Informe de consumos"',
    !tit.h2.includes('Consumos') && tit.h2.includes('Juntadas') && tit.informe.startsWith('Informe de consumos'), JSON.stringify(tit));

  // 4. septiembre 2026: ningún "·" pegado a una palabra
  await p.locator('[data-cj="prev"]').click(); await p.waitForTimeout(300);
  await p.locator('[data-cj="prev"]').click(); await p.waitForTimeout(400);
  const tSep = await p.locator('[data-cj="titulo"] h3').innerText();
  const textoSep = await p.locator('.cj-card').innerText();
  const pegados = textoSep.match(/\S·/g);
  // y los años sí están, con su espacio antes y después del punto ("Merlot · 2019")
  const conAnio = (textoSep.match(/\S[\s\u00a0]·[\s\u00a0]\d{4}/g) ?? []).length;
  check('4. en la ficha de septiembre 2026 no hay un "·" pegado a una palabra ("Merlot·")', tSep === 'Septiembre 2026' && !pegados && conAnio >= 5, JSON.stringify({ tSep, pegados, conAnio }));

  // 2. el acordeón: todas cerradas; abrir Ritmo y después Calidad deja Ritmo cerrada
  const estados = () => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ia-fila')].map(b => [b.dataset.ia, b.getAttribute('aria-expanded')])));
  const alCargar = await estados();
  await p.locator('[data-ia="ritmo"]').click(); await p.waitForTimeout(400);
  await p.locator('[data-ia="calidad"]').click(); await p.waitForTimeout(600);
  const despues = await estados();
  check('2. al cargar, las 5 secciones están cerradas; al abrir Ritmo y después Calidad, Ritmo queda cerrada',
    Object.keys(alCargar).length === 5 && Object.values(alCargar).every(v => v === 'false') && despues.ritmo === 'false' && despues.calidad === 'true', JSON.stringify({ alCargar, despues }));

  // 3. Ritmo abierta, "Botellas por año": la tarjeta entra en 400 px y las barras no pasan de 40 px
  await p.locator('[data-ia="ritmo"]').click(); await p.waitForTimeout(600);
  const med = await p.evaluate(() => {
    const t = document.querySelector('[data-car="ritmo"] .ip-tarjeta[data-card="anios"]');
    if (!t) return null;
    const barras = [...t.querySelectorAll('.an-bar')].map(b => Math.round(b.getBoundingClientRect().width));
    return { alto: Math.round(t.getBoundingClientRect().height), barras, max: Math.max(...barras), min: Math.min(...barras) };
  });
  check('3. a 1280 px, en Ritmo, "Botellas por año" no supera los 400 px de alto y sus barras miden 40 px o menos',
    !!med && med.alto <= 400 && med.max <= 40 && med.min >= 16, JSON.stringify(med));
  await ctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${cortados.length} escrituras o mails cortados antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
