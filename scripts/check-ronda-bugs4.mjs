#!/usr/bin/env node
// Humo de la ronda de bugs 4 (local en Chromium, nada en producción, ningún mail).
//
//   npx vite build && node scripts/check-ronda-bugs4.mjs
//
// Corre los endpoints reales (api/auth, api/cava, api/juntadas) en este equipo, con sesión firmada acá (SESSION_SECRET de prueba)
// y datos reales de Airtable. MODO SECO: cualquier escritura a Airtable se corta antes de salir, y cualquier pedido a Resend
// también. La juntada programada es simulada: en la pantalla, un estado armado; en el servidor, la lectura de ese registro.
// Chequeos: (1) con una programada, Consumos abre en ella; (2) su ficha no tiene "botellas ·"; (3) en septiembre 2026
// "La más vieja" dice "Cabernet Sauvignon 2010"; (4) un link firmado válido abre la confirmación sin guardar y uno alterado
// muestra error; (5) el HTML de la invitación (armado sin mandar) tiene "Voy", "No voy" y los vinos designados.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4187, BASE = `http://localhost:${PUERTO}`;
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
  designados, van: [real.socios[0]?.id].filter(Boolean), noVan: [], miRespuesta: null, puedeResponder: true, puedeEmpezar: false, puedeBorrar: true, puedeEditar: true,
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
  await p.waitForTimeout(1200);

  // 1 y 2. abre en la programada, sin la línea de botellas
  const t1 = await p.locator('[data-cj="titulo"] h3').innerText();
  const ficha = await p.locator('.cj-card').innerText();
  check('1. con una programada, Consumos abre en ella', t1.startsWith('Próxima juntada') && (await p.locator('.cj-card[data-programada]').count()) === 1, t1);
  check('2. la ficha de la programada no tiene el texto "botellas ·"', !ficha.includes('botellas ·') && !/\d+ botellas?$/m.test(ficha), ficha.slice(0, 200));

  // 3. septiembre 2026: "La más vieja" con cepa y añada arriba
  await p.locator('[data-cj="prev"]').click(); await p.waitForTimeout(300);
  await p.locator('[data-cj="prev"]').click(); await p.waitForTimeout(400);
  const tSep = await p.locator('[data-cj="titulo"] h3').innerText();
  const vieja = await p.locator('[data-cj="mas-vieja"] b').innerText().catch(() => '');
  const viejaSub = await p.locator('[data-cj="mas-vieja"] small').innerText().catch(() => '');
  check('3. en septiembre 2026 "La más vieja" muestra "Cabernet Sauvignon 2010"', tSep === 'Septiembre 2026' && vieja === 'Cabernet Sauvignon 2010' && !!viejaSub, JSON.stringify({ tSep, vieja, viejaSub }));

  // 4. el link del mail: válido abre la confirmación sin guardar; alterado da error
  const token = S.firmar({ u: socio, j: PROG, r: 'va', x: Date.now() + 3600_000 }, 'rsvp');
  const antes = cortados.length;
  await p.goto(`${BASE}/club/respuesta#t=${token}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-rs="pregunta"], [data-rs="vencida"], .rs-t', { timeout: 30000 });
  const pregunta = await p.locator('[data-rs="pregunta"]').innerText().catch(() => '');
  const boton = await p.locator('[data-rs="confirmar"]').innerText().catch(() => '');
  const barra = await p.evaluate(() => location.href);
  const escribio = cortados.length - antes;
  // la firma con un carácter cambiado en el medio; en una página nueva (cambiar sólo el # no recarga la página)
  const k = token.indexOf('.') + 10;
  const malo = token.slice(0, k) + (token[k] === 'A' ? 'B' : 'A') + token.slice(k + 1);
  await p.goto('about:blank');
  await p.goto(`${BASE}/club/respuesta#t=${malo}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.rs-t', { timeout: 30000 });
  const err = await p.locator('.rs-t').innerText();
  check('4. un link firmado válido abre la confirmación sin guardar nada y uno alterado muestra error',
    /^¿Confirmás que vas, .+\?$/.test(pregunta) && boton === 'Sí, voy' && escribio === 0 && !barra.includes('#t=') && err === 'Este link no es válido.', JSON.stringify({ pregunta, boton, escribio, barra, err }));
  await ctx.close();

  // 5. el HTML de la invitación, armado sin mandar
  const datos = { cava: 'Barraquitas', fecha: '2026-11-26', hora: '21:00', sede: 'Cava', maridaje: '', vinos: designados.map(d => ({ vino: d.vino, cepa: d.cepa, anada: d.anada })) };
  const mail = M.armarInvitacion(datos, { nombre: 'Nano', links: { va: 'https://edb.com.ar/club/respuesta#t=va', no: 'https://edb.com.ar/club/respuesta#t=no', app: 'https://edb.com.ar/club/cava#consumos' } });
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const tieneVinos = designados.every(d => mail.html.includes(esc(d.vino)));
  check('5. la invitación (sin mandar) tiene los botones "Voy" y "No voy" y los vinos designados',
    />Voy<\/a>/.test(mail.html) && />No voy<\/a>/.test(mail.html) && tieneVinos && mail.html.includes('1. ') && mail.asunto === 'Juntada del jueves 26/11 · Barraquitas',
    JSON.stringify({ asunto: mail.asunto, tieneVinos }));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${cortados.length} escrituras o mails cortados antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
