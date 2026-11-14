#!/usr/bin/env node
// Humo de la ronda "Mi cava 2": barra de abajo fija, sin título en la sección, grilla de 3 columnas en desktop y banners del sommelier.
// Local en Chromium, nada en producción.
//
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-micava2.mjs
//
// Corre api/auth, api/cava, api/montos y api/juntadas en este equipo con una sesión firmada acá (el Admin) y los datos reales de
// Airtable, en MODO SECO (ninguna escritura sale hacia Airtable). No manda mails.
// Chequeos: (1) en el celular (390×844), el borde de abajo de la barra de navegación coincide con el del viewport (±2 px);
// (2) en la sección no existe el título "Mi cava" ni el texto "en guarda ·" fuera de las tarjetas; (3) en desktop (1280 px) las tres
// primeras tarjetas comparten la misma coordenada Y; (4) hay un banner con "EL SOMMELIER SUGIERE" y su botón apunta a wa.me con el
// texto armado; (5) en el celular cada tarjeta de la grilla mide 145 px o menos.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4200, BASE = `http://localhost:${PUERTO}`;
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
  const tmp = join(tmpdir(), `micava2-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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
  async function abrir(ancho, alto, conSesion = true) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); localStorage.removeItem('edb-club-sommelier-' + id); } catch {} }, ID_001);
    const p = await ctx.newPage();
    const ck = conSesion ? cookieDe(admin) : '';
    for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava], ['**/api/montos*', H.montos], ['**/api/juntadas*', H.juntadas]]) {
      await p.route(patron, async r => {
        const u = new URL(r.request().url());
        let body = {}; try { body = r.request().postDataJSON() ?? {}; } catch {}
        const { estado, cuerpo } = await llamar(h, u.pathname + u.search, ck, r.request().method(), body);
        await r.fulfill({ status: estado, json: cuerpo ?? {} });
      });
    }
    await p.goto(BASE + '/club/cava#cava', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.sum-cards .sec-card', { timeout: 40000 });
    await p.waitForFunction(() => !document.querySelector('.sum-cards .sk-text'), null, { timeout: 40000 });
    if (conSesion) await p.waitForSelector('[data-som="banners"]', { timeout: 40000 });
    await p.waitForTimeout(800);
    return { ctx, p };
  }

  // celular
  const m = await abrir(390, 844);
  const barra = await m.p.evaluate(() => ({ bottom: Math.round(document.querySelector('nav.appbar').getBoundingClientRect().bottom * 10) / 10, vh: window.innerHeight, scroll: document.documentElement.scrollHeight }));
  console.log(`  barra: borde de abajo ${barra.bottom} · viewport ${barra.vh} · alto de la página ${barra.scroll}`);
  check('1. en el celular (390×844), el borde de abajo de la barra coincide con el del viewport (±2 px)', Math.abs(barra.bottom - barra.vh) <= 2, JSON.stringify(barra));
  const sec = await m.p.evaluate(() => {
    const t = document.querySelector('.tshell').cloneNode(true);
    t.querySelectorAll('.sum-cards').forEach(e => e.remove());
    return { texto: t.innerText, titulos: [...document.querySelectorAll('.tshell .bloque-t')].map(e => e.textContent), dato: document.querySelectorAll('.tshell .bloque-dato').length };
  });
  check('2. en la sección no existe el título "Mi cava" ni el texto "en guarda ·" fuera de las tarjetas',
    !/Mi cava/.test(sec.texto) && !/en guarda ·/i.test(sec.texto) && sec.titulos.length === 0 && sec.dato === 0, JSON.stringify(sec));
  const alto = await m.p.evaluate(() => [...document.querySelectorAll('.sum-cards .sec-card')].map(e => Math.round(e.getBoundingClientRect().height)));
  console.log(`  alto de las tarjetas en el celular: ${alto.join(', ')}`);
  check('5. en el celular el alto de cada tarjeta de la grilla es 145 px o menos', alto.length === 6 && alto.every(h => h <= 145), JSON.stringify(alto));
  const cel = await m.p.evaluate(() => [...document.querySelectorAll('[data-som-cta]')].length);
  await m.ctx.close();

  // desktop
  const d = await abrir(1280, 800);
  const ys = await d.p.evaluate(() => [...document.querySelectorAll('.sum-cards .sec-card')].map(e => { const r = e.getBoundingClientRect(); return { y: Math.round(r.top), x: Math.round(r.left), h: Math.round(r.height) }; }));
  console.log(`  desktop, tarjetas (x,y,alto): ${ys.map(c => `${c.x},${c.y},${c.h}`).join(' | ')}`);
  check('3. en desktop (1280 px) las tres primeras tarjetas comparten la misma coordenada Y (y las otras tres, otra fila)',
    ys.length === 6 && ys[0].y === ys[1].y && ys[1].y === ys[2].y && ys[3].y === ys[4].y && ys[4].y === ys[5].y && ys[3].y > ys[0].y, JSON.stringify(ys));
  const b = await d.p.evaluate(() => [...document.querySelectorAll('.som-card')].map(e => ({
    rotulo: e.querySelector('.som-rot')?.textContent, titulo: e.querySelector('.som-t')?.textContent, texto: e.querySelector('.som-x')?.textContent,
    href: e.querySelector('[data-som-cta]')?.getAttribute('href'), cta: e.querySelector('[data-som-cta]')?.textContent, tocables: e.querySelectorAll('a, button').length,
  })));
  for (const x of b) console.log(`  banner: ${x.titulo} / ${x.texto}`);
  const esperado = x => `https://wa.me/5491165803342?text=${encodeURIComponent(`Hola! Vi en mi cava la sugerencia «${x.titulo}» y me interesa.`)}`;
  check('4. hay un banner con "EL SOMMELIER SUGIERE" y su botón apunta a wa.me con el texto armado (2 distintos en desktop, 1 en celular, y sólo el botón es tocable)',
    b.length === 2 && b[0].titulo !== b[1].titulo && b.every(x => x.rotulo === 'EL SOMMELIER SUGIERE' && x.cta === 'Pedir al club' && x.href === esperado(x) && x.tocables === 1) && cel === 1, JSON.stringify({ b, cel }));
  await d.ctx.close();

  // el visitante no los ve (informativo)
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const vp = await vctx.newPage();
  for (const [patron, h] of [['**/api/auth*', H.auth], ['**/api/cava*', H.cava]]) {
    await vp.route(patron, async r => { const u = new URL(r.request().url()); const { estado, cuerpo } = await llamar(h, u.pathname + u.search, '', r.request().method()); await r.fulfill({ status: estado, json: cuerpo ?? {} }); });
  }
  await vp.route('**/api/{montos,juntadas}*', r => r.fulfill({ status: 401, json: {} }));
  await vp.goto(BASE + '/club/cava#cava', { waitUntil: 'domcontentloaded' });
  await vp.waitForFunction(() => document.querySelector('.sum-cards .sec-card') && !document.querySelector('.sum-cards .sk-text'), null, { timeout: 40000 });
  await vp.waitForTimeout(800);
  console.log(`  (visitante sin login: ${await vp.locator('.som-card').count()} banners)`);
  await vctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
