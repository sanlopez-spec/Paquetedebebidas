#!/usr/bin/env node
// Humo de carga de juntadas, puntajes y cava personal (local en Chromium 390×844, nada en producción).
//
//   npx vite build && node scripts/check-juntada-carga.mjs
//
// Corre los endpoints reales (api/auth, api/cava, api/juntadas) en este equipo, con sesiones firmadas acá (SESSION_SECRET de prueba)
// y los datos reales de Airtable. MODO SECO: cualquier escritura a Airtable (POST, PATCH o DELETE) se corta antes de salir, así que
// la prueba no puede tocar la base. Donde hace falta una juntada abierta con asistentes, la página recibe un estado simulado.
// Chequeos: (1) un socio sin rol de Presidente no ve "Armar juntada" y el endpoint le responde 403; (2) la pantalla de puntaje suma
// bien: 4/12/17/8 → 91; (3) un no asistente recibe 403 al votar; (4) antes de votar no se ven los votos de otros y después sí;
// (5) en una cava individual se ve el listado por mes y el botón "Abrir botella".
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4183, BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a', ID_003 = 'recvDIqbX1X4JSaGw';
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');

// modo seco: ninguna escritura sale hacia Airtable
const escriturasCortadas = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, op = {}) => {
  const metodo = String(op.method ?? 'GET').toUpperCase();
  if (/airtable\.com/.test(String(url)) && metodo !== 'GET') { escriturasCortadas.push(metodo); return Promise.reject(new Error('modo seco: escritura cortada')); }
  return fetchReal(url, op);
};

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `jc-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, cava: (await cargar('api/cava.ts')).default, juntadas: await cargar('api/juntadas.ts') };
const S = await cargar('api/_lib/sesion.ts');
const cookieDe = id => `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: id, x: Date.now() + 3600_000 }, 'sesion'))}`;
async function llamar(handler, url, cookie, method = 'GET', body = {}) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await handler({ method, query: q, headers: { cookie }, body }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}

// las personas: Santiago (Admin) y un socio de la #001 sin rol de Presidente ni Admin
const usuarios = await S.listar(S.TBL.usuarios, [S.FLD.uNombre, S.FLD.uAdmin]);
const santiago = usuarios.find(u => u.fields[S.FLD.uAdmin] === true);
const cava001 = (await S.listar(S.TBL.cavas, [S.FLD.cGrupo], `RECORD_ID()='${ID_001}'`))[0];
const grupo = cava001.fields[S.FLD.cGrupo][0];
const ms = await S.listar(S.TBL.membresias, [S.FLD.mUsuario, S.FLD.mGrupo, S.FLD.mRol]);
const rol = m => String(m.fields[S.FLD.mRol]?.name ?? m.fields[S.FLD.mRol] ?? '');
const comun = ms.filter(m => (m.fields[S.FLD.mGrupo] ?? []).includes(grupo) && rol(m) !== 'Presidente')
  .map(m => m.fields[S.FLD.mUsuario][0]).find(id => usuarios.find(u => u.id === id && u.fields[S.FLD.uAdmin] !== true));
if (!santiago || !comun) { console.error('No encuentro a Santiago o a un socio común de la #001'); process.exit(1); }

// un consumo real de la última juntada (para pedir un voto que tiene que rebotar)
const consumoReal = (await S.listar('tblvfDCiHNUXo1ZFQ', ['fldCOhmlxHcAIY3RB'])).find(c => c.fields.fldCOhmlxHcAIY3RB)?.id
  ?? (await S.listar('tblvfDCiHNUXo1ZFQ', ['fldst9TObn0RlTmZQ']))[0].id;

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  // una página con la sesión de alguien; `estado` permite reemplazar la respuesta de /api/juntadas?accion=estado
  async function abrir(usuarioId, cavaId, estado = null) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, cavaId);
    const p = await ctx.newPage();
    const ck = cookieDe(usuarioId);
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava], ['**/api/juntadas*', H.juntadas.default]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        if (estado && u.pathname === '/api/juntadas' && u.searchParams.get('accion') === 'estado') return r.fulfill({ json: estado });
        const { estado: st, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), r.request().postDataJSON?.() ?? {});
        await r.fulfill({ status: st, json: cuerpo ?? {} });
      });
    }
    await p.route('**/api/montos*', r => r.fulfill({ status: 401, json: {} }));
    await p.goto(`${BASE}/club/cava`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.sum-cards .sec-card', { timeout: 40000 });
    // al cambiar de cava la app vuelve al Inicio: se espera a que la sesión elija la cava antes de ir a Consumos
    await p.waitForFunction(id => localStorage.getItem('edb_cava') === id && document.querySelector('.tab-top'), cavaId, { timeout: 20000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(800);
    await p.locator('nav.appbar').getByText('Consumos', { exact: true }).click();
    await p.waitForSelector('.cons-sec', { timeout: 30000 });
    await p.waitForTimeout(1500);
    return { ctx, p };
  }

  // 1. socio común: sin botón y 403 al armar
  const { ctx: c1, p: p1 } = await abrir(comun, ID_001);
  const boton = await p1.locator('[data-jt="armar-juntada"]').count();
  await c1.close();
  const r1 = await llamar(H.juntadas.default, '/api/juntadas?accion=armar', cookieDe(comun), 'POST', { cava: ID_001, fecha: '2026-11-08', asistentes: [comun], vinos: [{ botella: 'recAAAAAAAAAAAAAA' }] });
  check('1. un socio sin rol de Presidente no ve "Armar juntada" y el endpoint le responde 403', boton === 0 && r1.estado === 403, `botón=${boton} estado=${r1.estado} ${JSON.stringify(r1.cuerpo)}`);

  // 2. la pantalla de puntaje suma bien (estado simulado: Santiago asistente de la última juntada, votación abierta)
  const real = (await llamar(H.juntadas.default, `/api/juntadas?accion=estado&cava=${ID_001}`, cookieDe(santiago.id))).cuerpo;
  const pub = (await llamar(H.cava, '/api/cava', '')).cuerpo.consumos.juntadas;
  const ult = pub[pub.length - 1];
  const nombre = ult.clave.replace(/^t:/, '');
  const consumos = ult.filas.map((f, i) => ({ id: `recPRUEBA${String(i).padStart(8, '0')}`, botella: 'recBOTELLA0000000', vino: f.vino, anada: f.anada, cepa: f.cepa, tipo: f.tipo, bodega: f.bodega, fecha: real.hoy, orden: i + 1, vivino: f.vivino, mio: false }));
  const simulado = { ...real, juntadas: [{ id: 'recJUNTADA0000000', nombre, fecha: real.hoy, asistentes: [santiago.id], abierta: true, soyAsistente: true, fotos: 0, portada: '', portadaPor: '', maridaje: '', notas: '', consumos }], puntajes: {} };
  const { ctx: c2, p: p2 } = await abrir(santiago.id, ID_001, simulado);
  await p2.locator('[data-cj="puntuar"]').first().click();
  await p2.waitForSelector('[data-jt="total"]', { timeout: 10000 });
  for (const [k, v] of [['color', 4], ['aroma', 12], ['sabor', 17], ['impresion', 8]]) await p2.locator(`[data-parte="${k}"]`).fill(String(v));
  const total = (await p2.locator('[data-jt="total"]').innerText()).trim();
  const franja = (await p2.locator('.jt-franja').innerText()).trim();
  await c2.close();
  check('2. la pantalla de puntaje suma bien: 4/12/17/8 → 91', total === '91' && franja === 'sobresaliente', `total=${total} franja=${franja}`);

  // 3. un no asistente recibe 403 al votar (Santiago no es asistente de ninguna juntada cargada)
  const r3 = await llamar(H.juntadas.default, '/api/juntadas?accion=votar', cookieDe(santiago.id), 'POST', { consumo: consumoReal, color: 4, aroma: 12, sabor: 17, impresion: 8 });
  check('3. un no asistente recibe 403 al votar', r3.estado === 403, `${r3.estado} ${JSON.stringify(r3.cuerpo)}`);

  // 4. los votos de otros: antes de votar, nada; después, el promedio y el detalle
  const otros = [{ consumo: 'c1', usuario: 'uOtro1', total: 90, partes: {}, notas: '' }, { consumo: 'c1', usuario: 'uOtro2', total: 86, partes: {}, notas: '' }];
  const antes = H.juntadas.puntajesVisibles(otros, 'uYo', id => id);
  const despues = H.juntadas.puntajesVisibles([...otros, { consumo: 'c1', usuario: 'uYo', total: 91, partes: {}, notas: '' }], 'uYo', id => id);
  const enEstado = Object.values(real.puntajes ?? {}).every(p => p.club == null || p.mio != null);
  check('4. antes de votar no se ven los votos de otros; después sí',
    antes.c1.club === null && antes.c1.mio === null && despues.c1.club?.votos === 3 && despues.c1.club.detalle.length === 3 && despues.c1.club.promedio === 89 && enEstado,
    JSON.stringify({ antes: antes.c1, despues: despues.c1?.club, enEstado }));

  // 5. cava individual: listado por mes y "Abrir botella" (estado real de la #003, con dos aperturas simuladas en meses distintos)
  const real3 = (await llamar(H.juntadas.default, `/api/juntadas?accion=estado&cava=${ID_003}`, cookieDe(santiago.id))).cuerpo;
  const g = real3.guarda.slice(0, 2);
  const ind = g.map((b, i) => ({ id: `recIND${String(i).padStart(11, '0')}`, botella: b.id, vino: b.vino, anada: b.anada, cepa: b.cepa, tipo: '', bodega: b.bodega, fecha: i ? '2026-10-12' : '2026-11-03', orden: null, vivino: null, mio: true }));
  const { ctx: c5, p: p5 } = await abrir(santiago.id, ID_003, { ...real3, individuales: ind });
  const meses = await p5.locator('[data-jt="individual"] .ji-mes h3').allInnerTexts();
  const abrirBtn = await p5.locator('[data-jt="abrir-botella"]').count();
  const puntuar = await p5.locator('[data-jt="individual"] .jt-puntuar').count();
  await c5.close();
  check('5. en una cava individual se ve el listado por mes y el botón "Abrir botella"',
    real3.individual === true && real3.esDueno === true && meses.join('|') === 'Noviembre 2026|Octubre 2026' && abrirBtn === 1 && puntuar === 2,
    `individual=${real3.individual} dueño=${real3.esDueno} meses=${meses.join('|')} botón=${abrirBtn} puntuar=${puntuar}`);
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escriturasCortadas.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
