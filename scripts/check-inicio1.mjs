#!/usr/bin/env node
// Humo de la ronda "Bugs Inicio 1": números del bloque Valor, sin pausa, selector de cavas en la cabecera y Catálogo primero.
// Local en Chromium, nada en producción.
//
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-inicio1.mjs
//
// Corre api/auth, api/cava, api/montos y api/juntadas en este equipo con una sesión firmada acá (el Admin, que tiene varias cavas)
// y los datos reales de Airtable, en MODO SECO (ninguna escritura sale hacia Airtable). No manda mails.
// Chequeos: (1) en el bloque Valor, las cuatro filas suman exacto el titular; (2) no hay "▲" ni "%" en el bloque Valor fuera de la línea
// "Lo que queda en la cava vale … más que todo lo que se pagó.", que sí está; (3) no aparece "En pausa" en el Inicio ni en Compras;
// (4) la cabecera tiene "Barraquitas ▾" tocable, al tocarlo se abre la lista de cavas, y la ficha no tiene "Cambiar cava";
// (5) la primera tarjeta de Mi cava es Catálogo, en el Inicio y en la sección (y el primer chip también).
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4199, BASE = `http://localhost:${PUERTO}`;
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
  const tmp = join(tmpdir(), `inicio1-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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
// "$43.503.100" / "−$26.047.900" / "USD 27.709" → número con signo
const aNumero = t => { const m = String(t).replace(/\s/g, '').match(/(−|-)?(?:\$|USD)([\d.]+)/); return m ? (m[1] ? -1 : 1) * Number(m[2].replace(/\./g, '')) : NaN; };

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); localStorage.removeItem('edb-club-moneda'); } catch {} }, ID_001);
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
  const ir = async (hash, esperar) => {
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.ses-dentro', { timeout: 40000 });
    await p.waitForSelector(esperar, { timeout: 40000 });
    await p.waitForTimeout(1000);
  };

  // 1 y 2. el bloque Valor del Inicio
  await ir('', '[data-tv="tarjeta"][data-estado="socio"] [data-tv-fila="total"]');
  const v = await p.evaluate(() => {
    const t = document.querySelector('[data-tv="tarjeta"]');
    const fila = k => { const e = t.querySelector(`[data-tv-fila="${k}"]`); return { r: e.querySelector('span').textContent, v: e.querySelector('b').textContent }; };
    const sinMas = t.cloneNode(true); sinMas.querySelector('[data-tv="mas"]')?.remove();
    return {
      titular: t.querySelector('[data-tv="valor"]').textContent,
      filas: ['compras', 'ahorro', 'guarda', 'abiertas', 'total'].map(fila),
      mas: t.querySelector('[data-tv="mas"]')?.textContent ?? '',
      resto: sinMas.innerText,
      sinPrecio: t.querySelector('[data-tv="sin-precio"]')?.textContent ?? '',
      baj: t.querySelector('.tv-baj')?.textContent ?? '',
    };
  });
  for (const f of v.filas) console.log(`  ${f.r.padEnd(34)} ${f.v}`);
  console.log(`  titular ${v.titular} · ${v.baj}`);
  console.log(`  ${v.mas}`);
  console.log(`  ${v.sinPrecio}`);
  const n = v.filas.map(f => aNumero(f.v));
  const suma = n[0] + n[1] + n[2] + n[3];
  check('1. en el bloque Valor, las cuatro filas suman exacto el titular',
    n.every(Number.isFinite) && n[3] < 0 && suma === n[4] && n[4] === aNumero(v.titular), JSON.stringify({ n, suma, titular: v.titular }));
  check('2. no hay "▲" ni "%" en el bloque Valor, y sí la línea "Lo que queda en la cava vale … más que todo lo que se pagó."',
    !/[▲%]/.test(v.resto) && /^Lo que queda en la cava vale \d+ % más que todo lo que se pagó\.$/.test(v.mas), JSON.stringify({ mas: v.mas, resto: (v.resto.match(/.{0,30}[▲%].{0,30}/g) ?? []) }));

  // 3. sin "En pausa" en el Inicio ni en Compras
  const inicioTxt = await p.evaluate(() => document.body.innerText);
  // 4. el selector de la cabecera (mientras estamos en el Inicio)
  const cab = await p.evaluate(() => { const b = document.querySelector('.tab-top [data-sel="cabecera"]'); return { tag: b?.tagName ?? null, txt: b?.textContent ?? '', cambiar: !!document.querySelector('[data-sel="cambiar"]') }; });
  await p.locator('.tab-top [data-sel="cabecera"]').click();
  const hoja = await p.waitForSelector('[data-sel="hoja"]', { timeout: 5000 }).then(() => true).catch(() => false);
  const filasHoja = hoja ? await p.locator('[data-sel="hoja"] .cv-fila').count() : 0;
  await p.keyboard.press('Escape');
  check('4. la cabecera tiene "Barraquitas ▾" tocable, al tocarlo se abre la lista de cavas, y la ficha no tiene "Cambiar cava"',
    cab.tag === 'BUTTON' && /Barraquitas\s*▾/.test(cab.txt) && hoja && filasHoja > 0 && !cab.cambiar, JSON.stringify({ cab, hoja, filasHoja }));
  // 5. Catálogo primero: Inicio, sección Mi cava y chips
  const primeraInicio = await p.locator('.sum-cards .sec-card .sec-card-label').first().textContent();
  await ir('#compras', '.tshell');
  const comprasTxt = await p.evaluate(() => document.body.innerText);
  check('3. no aparece "En pausa" en ninguna parte del Inicio ni de Compras', !/en pausa/i.test(inicioTxt) && !/en pausa/i.test(comprasTxt));
  await ir('#cava', '.sum-cards .sec-card');
  const primeraSeccion = await p.locator('.sum-cards .sec-card .sec-card-label').first().textContent();
  await ir('#cepas', '.sec-chip');
  const primerChip = await p.locator('.sec-chip').first().textContent();
  check('5. la primera tarjeta de Mi cava es Catálogo, en el Inicio y en la sección (y el primer chip)',
    primeraInicio === 'Catálogo' && primeraSeccion === 'Catálogo' && primerChip === 'Catálogo', JSON.stringify({ primeraInicio, primeraSeccion, primerChip }));
  await ctx.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
