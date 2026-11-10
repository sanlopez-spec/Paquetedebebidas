#!/usr/bin/env node
// Humo de la ronda de bugs 8: la tarjeta "Valor" del informe de Consumos (local en Chromium, nada en producción).
//
//   npx vite build && node scripts/check-ronda-bugs8.mjs
//
// Corre los endpoints reales (api/auth, api/cava, api/montos) en este equipo, con una sesión firmada acá (SESSION_SECRET de prueba) y los
// datos reales de Airtable, en MODO SECO (ninguna escritura sale hacia Airtable). No manda mails. Imprime el total, el ahorro club y el
// top 3 que calcula para la #001, para cruzarlos con Airtable.
// Chequeos: (1) a 390 px la grilla tiene 6 tarjetas en 2 columnas y todas miden 68 px; (2) sin sesión, Valor muestra "●●●●" y la
// respuesta de api/cava no tiene ningún campo de precio; (3) con un socio de la #001, Valor muestra un total y la cabecera "tu parte";
// (4) "Las más caras" muestra 3 en el podio y la etiqueta de formato en las que no son 750; (5) a 390 px nada desborda de costado.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4193, BASE = `http://localhost:${PUERTO}`;
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
  const tmp = join(tmpdir(), `rb8-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const H = { auth: (await cargar('api/auth.ts')).default, cava: (await cargar('api/cava.ts')).default, montos: (await cargar('api/montos.ts')).default };
const S = await cargar('api/_lib/sesion.ts');
const cookieDe = id => `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: id, x: Date.now() + 3600_000 }, 'sesion'))}`;
async function llamar(handler, url, cookie, method = 'GET', body = {}) {
  const q = Object.fromEntries(new URL(url, BASE).searchParams);
  let estado = 200, cuerpo = null;
  await handler({ method, query: q, headers: { cookie }, body }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, cuerpo };
}

// un socio común de la #001 (ni Admin ni Presidente)
const usuarios = await S.listar(S.TBL.usuarios, [S.FLD.uNombre, S.FLD.uAdmin]);
const grupo = (await S.listar(S.TBL.cavas, [S.FLD.cGrupo], `RECORD_ID()='${ID_001}'`))[0].fields[S.FLD.cGrupo][0];
const ms = (await S.listar(S.TBL.membresias, [S.FLD.mUsuario, S.FLD.mGrupo, S.FLD.mRol])).filter(m => (m.fields[S.FLD.mGrupo] ?? []).includes(grupo));
const socio = ms.map(m => m.fields[S.FLD.mUsuario]?.[0]).find(id => id && usuarios.find(u => u.id === id)?.fields[S.FLD.uAdmin] !== true);
if (!socio) { console.error('No encuentro un socio de la #001'); process.exit(1); }

// lo que calcula la pantalla, para imprimirlo y cruzarlo con Airtable
const mt = (await llamar(H.montos, `/api/montos?cava=${ID_001}`, cookieDe(socio))).cuerpo;
const conPrecio = (mt.consumos ?? []).filter(c => c.sug > 0);
const total = conPrecio.reduce((a, c) => a + c.q * c.sug, 0), costo = conPrecio.reduce((a, c) => a + c.costo, 0);
const unicas = [...conPrecio.reduce((m, c) => { const k = `${c.vino}|${c.anada}|${c.formato}`; const p = m.get(k); if (!p || c.sug > p.sug) m.set(k, c); return m; }, new Map()).values()].sort((a, b) => b.sug - a.sug).slice(0, 5);
console.log(`  #001: ${mt.consumos.length} consumos, ${conPrecio.length} con precio, ${mt.consumos.length - conPrecio.length} sin precio`);
console.log(`  #001: total a precio sugerido USD ${total.toFixed(2)} · al costo USD ${costo.toFixed(2)} · ahorro club USD ${(total - costo).toFixed(2)} · por botella USD ${(total / conPrecio.length).toFixed(2)} · tu parte (1 de ${mt.cava.miembros}) USD ${(total / mt.cava.miembros).toFixed(2)}`);
console.log('  #001: top 3 más caras: ' + unicas.slice(0, 3).map(c => `${c.vino} ${c.anada ?? 'N/V'} (${c.formato || '?'}) USD ${c.sug}`).join(' | '));

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  async function abrir(ancho, conSesion) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    if (conSesion) await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
    const p = await ctx.newPage();
    const ck = conSesion ? cookieDe(socio) : '';
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava], ['**/api/montos*', H.montos]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method());
        await r.fulfill({ status: estado, json: cuerpo ?? {} });
      });
    }
    await p.route('**/api/juntadas*', r => r.fulfill({ status: 401, json: {} }));
    await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.tab-top', { timeout: 40000 });
    if (conSesion) await p.waitForFunction(() => document.querySelector('.ses-dentro'), null, { timeout: 30000 });
    await p.waitForLoadState('networkidle').catch(() => {});
    await p.waitForTimeout(1200);
    await p.locator(ancho >= 900 ? '.tab-top [data-pantalla-top="consumos"]' : 'nav.appbar [data-pantalla="consumos"]').click();
    await p.waitForSelector('[data-cons="grilla"]', { timeout: 30000 });
    await p.waitForTimeout(1500);
    return { ctx, p };
  }

  // 1 y 2. sin sesión, a 390 px
  const v = await abrir(390, false);
  const g = await v.p.evaluate(() => [...document.querySelectorAll('.ig-card')].map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.ig, alto: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }; }));
  const xs = [...new Set(g.map(t => t.x))];
  check('1. a 390 px la grilla tiene 6 tarjetas en 2 columnas y todas miden 68 px',
    g.length === 6 && xs.length === 2 && g.every(t => t.alto === 68) && g[0].id === 'ritmo' && g[1].id === 'valor' && g[0].y === g[1].y, JSON.stringify(g));
  const valorVisitante = await v.p.locator('[data-ig="valor"]').innerText();
  await v.p.locator('[data-ig="valor"]').click();
  await v.p.waitForSelector('.ip-panel [data-cons="valor-msg"]', { timeout: 10000 });
  const mensaje = await v.p.locator('.ip-panel [data-cons="valor-msg"]').innerText();
  const pub = (await llamar(H.cava, '/api/cava', '')).cuerpo;
  const claves = []; const mirar = (o, ruta) => { if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) { if (/sugerid|costo|pagad|precio|usd|dinero|ahorro|valorEst|tuParte/i.test(k)) claves.push(ruta + k); mirar(x, ruta + k + '.'); } };
  mirar(pub, '');
  check('2. sin sesión, Valor muestra "●●●●" (y "Disponible para socios") y api/cava no tiene ningún campo de precio',
    valorVisitante.includes('●●●●') && mensaje.includes('Disponible para socios del club') && claves.length === 0, JSON.stringify({ valorVisitante, mensaje, claves }));
  await v.ctx.close();

  // 3, 4 y 5. con un socio de la #001, a 390 px
  const m = await abrir(390, true);
  const valor = await m.p.locator('[data-ig="valor"]').innerText();
  await m.p.locator('[data-ig="valor"]').click();
  await m.p.waitForSelector('.ip-panel [data-cons="valor-cab"]', { timeout: 10000 });
  const cab = await m.p.locator('[data-cons="valor-cab"]').innerText();
  check('3. con un socio de la #001, Valor muestra un total y la cabecera trae "tu parte"',
    /\d\.\d{3}/.test(valor) && /tu parte USD [\d.]+ \(1 de \d+\)/.test(cab) && /al costo USD/.test(cab) && /ahorro club USD/.test(cab), JSON.stringify({ valor, cab }));

  const malos = [];
  const revisar = async nombre => {
    const r = await m.p.evaluate(() => [document.documentElement, ...document.querySelectorAll('.ip-panel, .ip-cuerpo, .cc-cuerpo, .ra, .vh, .vj, .pd')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => `${e.className || e.tagName}:${e.scrollWidth}>${e.clientWidth}`));
    if (r.length) malos.push(`${nombre}: ${r.join(', ')}`);
  };
  await revisar('por-anio');
  await m.p.locator('.ip-tab', { hasText: 'Las más caras' }).click();
  await m.p.waitForSelector('.ip-panel .pd-col', { timeout: 10000 });
  await m.p.waitForTimeout(400);
  const caras = await m.p.evaluate(() => ({ podio: document.querySelectorAll('.ip-panel .pd-col').length, metas: [...document.querySelectorAll('.ip-panel .pd-col .pd-meta, .ip-panel .pd-fsub')].map(e => e.textContent.trim()).filter(Boolean), grossa: !!document.querySelector('[data-cons="valor-grossa"]'), primero: document.querySelector('.ip-panel .pd-grande')?.textContent }));
  const esperadas = unicas.filter(c => c.formato && c.formato.trim() !== '750').length;
  check('4. "Las más caras" muestra 3 en el podio y la etiqueta de formato en las que no son 750 (y la juntada más grossa)',
    caras.podio === 3 && caras.metas.length === esperadas && caras.grossa, JSON.stringify({ caras, esperadas }));
  await revisar('caras');
  if (await m.p.locator('.ip-tab', { hasText: 'Joyas' }).count()) { await m.p.locator('.ip-tab', { hasText: 'Joyas' }).click(); await m.p.waitForTimeout(300); await revisar('joyas'); }
  for (const id of ['ritmo', 'geografia']) { await m.p.locator(`[data-ig="${id}"]`).click(); await m.p.waitForTimeout(400); await revisar(id); }
  check('5. a 390 px nada desborda de costado (scrollWidth = clientWidth) en Valor, Ritmo ni Geografía', malos.length === 0, malos.join(' | '));
  await m.ctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
