#!/usr/bin/env node
// Humo de la ronda "Bugs Inicio 3": la barra de arriba (flechitas y bloque de la derecha) y la ficha del grupo en una sola fila.
// Local en Chromium, nada en producción.
//
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-inicio3.mjs
//
// Corre api/auth, api/cava, api/montos y api/juntadas en este equipo con una sesión firmada acá (el Admin, que tiene varias cavas)
// y los datos reales de Airtable, en MODO SECO (ninguna escritura sale hacia Airtable). No manda mails.
// Chequeos: (1) a 320 y a 390 px, "7 miembros" y el monto ocupan un solo renglón cada uno; (2) a 320 px el escudo y "Barraquitas"
// están en la misma fila, con el nombre a la derecha del escudo; (3) a 1280 px el borde derecho del bloque "Santiago / Barraquitas"
// queda a menos de 32 px del borde derecho de la barra; (4) a 1280 px la ficha mide menos de 100 px de alto; (5) las flechitas de la
// barra miden al menos 10 px.
// "La barra" es el contenedor de la cabecera (.tab-top-in, de 1040 px de ancho máximo y centrado): a 1280 px queda a 120 px del borde
// de la pantalla, igual que el logo del lado izquierdo; también se imprime la distancia al borde de la pantalla.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4202, BASE = `http://localhost:${PUERTO}`;
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
  const tmp = join(tmpdir(), `inicio3-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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
    await p.waitForSelector('[data-ficha="cuota"]', { timeout: 40000 });
    await p.waitForSelector('.tab-top [data-sel="cabecera"]', { timeout: 40000 });
    await p.waitForTimeout(1200);
    const m = await p.evaluate(() => {
      const r = e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left * 10) / 10, r: Math.round(b.right * 10) / 10, t: Math.round(b.top * 10) / 10, b: Math.round(b.bottom * 10) / 10, h: Math.round(b.height * 10) / 10 }; };
      const f = document.querySelector('.ficha-fila');
      const miembros = f.querySelector('.pf-miembros-n'), cuota = f.querySelector('.pf-cuota');
      const fs = e => parseFloat(getComputedStyle(e).fontSize);
      // renglones = alto ÷ interlineado (si es "normal", 1,3 × el tamaño de la letra)
      const renglones = e => { const lh = parseFloat(getComputedStyle(e).lineHeight); return Math.round(e.getBoundingClientRect().height / (Number.isFinite(lh) ? lh : fs(e) * 1.3)); };
      const der = f.querySelector('.ficha-der');
      return {
        miembros: { txt: miembros.textContent, h: r(miembros).h, renglones: renglones(miembros) },
        cuota: { txt: cuota.textContent, h: r(cuota).h, renglones: renglones(cuota) },
        derCortada: der.scrollWidth > der.clientWidth + 1,
        av: r(f.querySelector('.pf-av')), nombre: r(f.querySelector('.pf-name')), nombreTxt: f.querySelector('.pf-name').textContent,
        ficha: r(f), bloque: r(document.querySelector('.tab-top .tab-der')), barra: r(document.querySelector('.tab-top-in')),
        flechas: [...document.querySelectorAll('.tab-top .fl')].map(e => ({ txt: e.textContent, fs: fs(e), h: r(e).h })),
        vw: window.innerWidth,
      };
    });
    await ctx.close();
    return m;
  }

  const a320 = await medir(320, 700), a390 = await medir(390, 844), a1280 = await medir(1280, 800);
  const unRenglon = m => m.miembros.renglones === 1 && m.cuota.renglones === 1 && !m.derCortada;
  console.log(`  320 px: "${a320.miembros.txt}" ${a320.miembros.renglones} renglón · "${a320.cuota.txt}" ${a320.cuota.renglones} renglón`);
  console.log(`  390 px: "${a390.miembros.txt}" ${a390.miembros.renglones} renglón · "${a390.cuota.txt}" ${a390.cuota.renglones} renglón`);
  check('1. a 320 y a 390 px, "7 miembros" y el monto ocupan un solo renglón cada uno', unRenglon(a320) && unRenglon(a390), JSON.stringify({ a320: [a320.miembros, a320.cuota], a390: [a390.miembros, a390.cuota] }));

  const enFila = a320.nombre.l >= a320.av.r && (a320.nombre.t + a320.nombre.b) / 2 >= a320.av.t && (a320.nombre.t + a320.nombre.b) / 2 <= a320.av.b;
  console.log(`  320 px: escudo ${a320.av.l}–${a320.av.r} (alto ${a320.av.t}–${a320.av.b}) · "${a320.nombreTxt}" desde ${a320.nombre.l}, centro vertical ${(a320.nombre.t + a320.nombre.b) / 2}`);
  check('2. a 320 px el escudo y "Barraquitas" están en la misma fila (el nombre a la derecha del escudo)', enFila && /Barraquitas/.test(a320.nombreTxt), JSON.stringify({ av: a320.av, nombre: a320.nombre }));

  const aBorde = a1280.barra.r - a1280.bloque.r;
  console.log(`  1280 px: el bloque termina a ${aBorde.toFixed(1)} px del borde derecho de la barra (y a ${a1280.vw - a1280.bloque.r} px del borde de la pantalla)`);
  check('3. a 1280 px el borde derecho del bloque "Santiago / Barraquitas" queda a menos de 32 px del borde derecho de la barra', aBorde >= 0 && aBorde < 32, JSON.stringify({ bloque: a1280.bloque, barra: a1280.barra }));

  console.log(`  1280 px: la ficha mide ${a1280.ficha.h} px de alto`);
  check('4. a 1280 px la ficha mide menos de 100 px de alto', a1280.ficha.h < 100, `${a1280.ficha.h} px`);

  console.log(`  flechitas: ${a1280.flechas.map(f => `${f.txt} ${f.fs}px (alto ${f.h})`).join(' · ')}`);
  check('5. las flechitas de la barra miden al menos 10 px', a1280.flechas.length === 2 && a1280.flechas.every(f => f.fs >= 10 && f.h >= 10), JSON.stringify(a1280.flechas));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  console.log(`  (modo seco: ${escrituras.length} escrituras cortadas antes de salir)`);
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
