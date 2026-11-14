#!/usr/bin/env node
// Humo de la ronda "Bugs Inicio 2": dorado de lo abierto, línea del dólar una sola vez, Valor y Tu parte más cortos,
// caja de Compras con tres estados y cabecera con el selector debajo del nombre. Local en Chromium, nada en producción.
//
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-inicio2.mjs
//
// Corre api/auth, api/cava, api/montos y api/juntadas en este equipo con una sesión firmada acá (el Admin, que tiene varias cavas)
// y los datos reales de Airtable, en MODO SECO (ninguna escritura sale hacia Airtable). No manda mails.
// Chequeos: (1) "abiertas" en el gráfico del carrusel es el dorado de antes (#C8922A) y no #4A4340, y Catálogo sigue en gris;
// (2) en el Inicio la línea del dólar aparece una sola vez, al final; (3) en el Inicio no aparecen "botellas con precio" ni
// "tu parte de las compras" (y el informe de Valor sí los conserva); (4) la caja de Compras muestra el estado que corresponde al
// mes (con la #001 en noviembre: "Estamos eligiendo tus vinos de noviembre."); (5) la cabecera muestra "Barraquitas" en la columna
// derecha, debajo del nombre del socio.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4201, BASE = `http://localhost:${PUERTO}`;
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
  const tmp = join(tmpdir(), `inicio2-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// lo que tiene que mostrar la caja de Compras: se calcula acá con los datos de la API, con el mismo criterio de la sección Compras
const mt = (await llamar(H.montos, `/api/montos?cava=${ID_001}`, cookieDe(admin))).cuerpo;
const actual = mt.compras.meses[mt.compras.meses.length - 1];
const mes = MESES[Number(mt.informe.mesEnCurso.slice(5, 7)) - 1];
const disp = actual.disponible;
const pct = disp > 0 ? Math.min(100, (actual.asignado / disp) * 100) : actual.asignado > 0 ? 100 : 0;
const esperado = actual.asignado === 0 ? 'eligiendo' : (actual.asignado > 0 && pct >= 100 ? 'completo' : 'progreso');
console.log(`  #001, ${mes}: asignado ${actual.asignado} de ${disp} → estado esperado: ${esperado}`);

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.ses-dentro', { timeout: 40000 });
  await p.waitForSelector('[data-tv="tarjeta"][data-estado="socio"] [data-tv-fila="total"]', { timeout: 40000 });
  await p.waitForSelector('[data-compras-estado]', { timeout: 40000 });
  await p.waitForTimeout(1500);

  // 1. el dorado de "abiertas" y Catálogo en gris
  const c1 = await p.evaluate(() => ({
    area: document.querySelector('.evo-area-abiertas')?.getAttribute('fill'),
    leyenda: getComputedStyle(document.querySelector('.evo-leg-sq.abier')).backgroundColor,
    valorArea: document.querySelector('[data-tv-capa="tomado"]')?.getAttribute('fill'),
    catalogo: getComputedStyle([...document.querySelectorAll('.sum-cards .sec-card')].find(e => /Catálogo/i.test(e.textContent))).backgroundColor,
  }));
  console.log(`  carrusel: ${c1.area} · leyenda ${c1.leyenda} · Valor ${c1.valorArea} · Catálogo ${c1.catalogo}`);
  check('1. "abiertas" en el gráfico del carrusel es el dorado de antes (#C8922A), no #4A4340, y Catálogo sigue en gris',
    c1.area?.toUpperCase() === '#C8922A' && c1.leyenda === 'rgb(200, 146, 42)' && c1.valorArea?.toUpperCase() === '#C8922A' && c1.catalogo === 'rgb(69, 64, 58)', JSON.stringify(c1));

  // 2. la línea del dólar, una sola vez y al final
  const c2 = await p.evaluate(() => {
    const ls = [...document.querySelectorAll('.inicio [data-din="linea"]')];
    const ultima = document.querySelector('.inicio').lastElementChild;
    return { n: document.querySelectorAll('[data-din="linea"]').length, textos: ls.map(l => l.textContent), alFinal: !!ultima && ultima.contains(ls[0] ?? null) };
  });
  check('2. en el Inicio la línea del dólar aparece una sola vez, al final de la página',
    c2.n === 1 && c2.alFinal && /^Montos en pesos al dólar oficial de [a-zé]+ \(\$[\d.]+\)$/.test(c2.textos[0] ?? ''), JSON.stringify(c2));

  // 3. Valor y Tu parte más cortos en el Inicio (el informe de Valor los conserva)
  const inicioTxt = await p.evaluate(() => document.body.innerText);
  const parteTxt = await p.evaluate(() => document.querySelector('[data-tv="parte"]')?.innerText ?? '');
  console.log(`  Tu parte (Inicio): ${parteTxt.replace(/\n/g, ' | ')}`);
  check('3. en el Inicio no aparecen "botellas con precio" ni "tu parte de las compras"',
    !/botellas con precio/i.test(inicioTxt) && !/tu parte de las compras/i.test(inicioTxt) && /TU PARTE · 1 DE \d+/.test(parteTxt), JSON.stringify({ parteTxt }));

  // 4. la caja de Compras
  const c4 = await p.evaluate(() => {
    const e = document.querySelector('[data-compras-estado]');
    return { estado: e?.getAttribute('data-compras-estado'), texto: e?.innerText.trim(), barra: !!e?.querySelector('[data-cm="barra"]') };
  });
  console.log(`  caja de Compras: ${c4.estado} · "${c4.texto?.replace(/\n/g, ' ')}"`);
  const okTexto = c4.estado === 'eligiendo' ? c4.texto === `Estamos eligiendo tus vinos de ${mes}.`
    : c4.estado === 'completo' ? c4.texto.includes(`Las compras de ${mes} ya están en tu cava.`)
    : c4.barra && /asignados de/.test(c4.texto);
  check('4. la caja de Compras muestra el estado que corresponde al mes (con la #001 en noviembre: "Estamos eligiendo tus vinos de noviembre.")',
    c4.estado === esperado && okTexto, JSON.stringify({ c4, esperado }));

  // 5. la cabecera: el selector a la derecha, debajo del nombre
  const c5 = await p.evaluate(() => {
    const r = e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
    const nombre = document.querySelector('.tab-top [data-ses="nombre"]'), cava = document.querySelector('.tab-top [data-sel="cabecera"]'), logo = document.querySelector('.tab-top .crest');
    return { nombre: r(nombre), cava: r(cava), logo: r(logo), txt: cava.textContent, vw: window.innerWidth, alto: Math.round(document.querySelector('.tab-top').getBoundingClientRect().height) };
  });
  console.log(`  cabecera: ${JSON.stringify(c5)}`);
  check('5. la cabecera muestra "Barraquitas" en la columna derecha, debajo del nombre del socio',
    /Barraquitas/.test(c5.txt) && c5.cava.t >= c5.nombre.b - 2 && Math.abs(c5.cava.r - c5.nombre.r) <= 4 && c5.cava.l > c5.vw / 2 && c5.nombre.l > c5.vw / 2 && c5.logo.r < c5.vw / 2, JSON.stringify(c5));
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
