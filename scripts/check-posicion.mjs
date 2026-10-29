#!/usr/bin/env node
// Humo de la ronda "Posición en cava" (una corrida local en Chromium, 390×844, nada en producción).
//   npx vite build && node scripts/check-posicion.mjs [--shots <carpeta>]
// (1) api/cava.ts público no devuelve la posición; (2) logueado, la ficha de un vino con varias posiciones las muestra tal cual;
// (3) ídem con "CAJA"; (4) sin login no hay posición en ningún lado y la cabecera es la de la demo;
// (5) cabecera logueado: "Club EDB #001 · Barraquitas"; (6) la tarjeta de Valor dice "N botellas en la cava".
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4182, BASE = `http://localhost:${PUERTO}`;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { transform } = await import('esbuild');
  const { code } = await transform(readFileSync(join(ROOT, ruta), 'utf8'), { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `pos-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, code, 'utf8');
  return import(pathToFileURL(tmp).href);
}
async function listar(tabla, campos) {
  const out = []; let off;
  do {
    const p = new URLSearchParams({ returnFieldsByFieldId: 'true', pageSize: '100' });
    campos.forEach(c => p.append('fields[]', c)); if (off) p.set('offset', off);
    const r = await fetch(`https://api.airtable.com/v0/appag1VLp4aN3tD3v/${tabla}?${p}`, { headers: { Authorization: 'Bearer ' + process.env.AIRTABLE_TOKEN } });
    const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error));
    out.push(...j.records); off = j.offset;
  } while (off);
  return out;
}

// ── datos reales ──
const { default: cavaHandler } = await cargarTs('api/cava.ts');
let cavaBody = null;
await cavaHandler({}, { setHeader() {}, status() { return this; }, json(b) { cavaBody = b; return this; } });
const B = await listar('tblZIXNa2Ck3DNCwS', ['fldUZflAbSpmIdK20', 'fldKC7gp51yfg7wtF', 'fldTTRSLJDOLXafQe', 'fldMTLDQLjYDZQRa2']);
const juntas = {};
for (const r of B) {
  const f = r.fields, pos = String(f.fldTTRSLJDOLXafQe ?? '').trim();
  if (!pos || !(Number(f.fldMTLDQLjYDZQRa2) > 0)) continue;
  const k = `${String(f.fldUZflAbSpmIdK20 ?? '').trim().toLowerCase()}|${f.fldKC7gp51yfg7wtF ?? 'nv'}`;
  const l = juntas[k] ?? (juntas[k] = []);
  if (!l.includes(pos)) l.push(pos);
}
const posiciones = Object.fromEntries(Object.entries(juntas).map(([k, l]) => [k, l.join(', ')]));
const multi = Object.entries(posiciones).find(([k, v]) => /barda/.test(k) && /pinot/.test(k) && v.includes(',')) ?? Object.entries(posiciones).find(([, v]) => v.includes(','));
const caja = Object.entries(posiciones).find(([, v]) => v === 'CAJA');
console.log('  botellas con posición:', Object.keys(posiciones).length, '| prueba multi:', multi?.join(' = '), '| caja:', caja?.[0]);

const CAVA = { id: 'recAAAAAAAAAAAAAA', nombre: 'Club EDB #001', tipo: 'Grupo', miembros: 7 };
const cero = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const informe = { valorCava: 27339, compras: 20240, porcentaje: 35, guarda: 3939, tomado: 17081, botellasTomadas: 192, botellasEnCava: 379,
  serie: [{ mes: '2021-04', compras: 100, tomado: 0, cava: 200 }, { mes: '2026-10', compras: 20240, tomado: 17081, cava: 27339 }],
  mesEnCurso: '2026-09', asignadoMes: 43, comprasPorMes: {}, presupuestoMes: 350, tuParte: { valorCava: 3906, compras: 2891 } };
const montosBody = { moneda: 'USD', cava: CAVA, esAdmin: false, informe, posiciones, total: cero, tuParte: cero, porEtiqueta: {} };

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  const abrir = async conSesion => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.route('**/api/cava', r => r.fulfill({ json: cavaBody }));
    await page.route('**/api/auth*', r => r.fulfill({ json: conSesion ? { sesion: true, usuario: { nombre: 'Prueba Socio', email: 'p@example.com', admin: false }, cavas: [CAVA] } : { sesion: false } }));
    await page.route('**/api/montos*', r => conSesion ? r.fulfill({ json: montosBody }) : r.fulfill({ status: 401, json: { error: 'no' } }));
    await page.goto(`${BASE}/club/cava`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-tv="tarjeta"]:not([data-estado="cargando"])', { timeout: 20000 });
    return { ctx, page };
  };
  // abre Las botellas, busca el vino y abre la ficha de la etiqueta pedida
  const abrirFicha = async (page, key) => {
    await page.goto(`${BASE}/club/cava#botellas?q=${encodeURIComponent(key.split('|')[0])}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const sel = page.locator(`button.bt-fila[data-key="${key.replace(/"/g, '\\"')}"]`);
    await sel.first().waitFor({ timeout: 15000 });
    const textoFila = await sel.first().innerText();
    await sel.first().click();
    await page.waitForSelector('.bt-ficha', { timeout: 8000 });
    return { textoFila, ficha: await page.locator('.bt-ficha').innerText() };
  };

  const j = JSON.stringify(cavaBody);
  check('1. api/cava.ts (público) no devuelve la posición', !/posici[oó]n/i.test(j) && !/"E5, E6/.test(j) && !/"CAJA"/.test(j), 'aparece');

  const { ctx: c1, page: p1 } = await abrir(true);
  check('5. cabecera logueado: "Club EDB #001 · Barraquitas"', (await p1.locator('.tab-top .tsub').first().innerText()).trim() === 'Club EDB #001 · Barraquitas');
  check('6. tarjeta de Valor: "379 botellas en la cava"', (await p1.locator('[data-tv="tarjeta"]').innerText()).includes('379 botellas en la cava'));
  // el pie "Valores a precio sugerido..." no puede quedar tapado por el botón + de la barra de abajo
  await p1.locator('.tv-nota').first().scrollIntoViewIfNeeded();
  await p1.evaluate(() => { let e = document.querySelector('.tv-nota'); while (e) { e.scrollTop = e.scrollHeight; e = e.parentElement; } window.scrollTo(0, document.body.scrollHeight); });
  await p1.waitForTimeout(300);
  const pie = await p1.evaluate(() => { const n = document.querySelector('.tv-nota').getBoundingClientRect(); const m = document.querySelector('.appbar-mas-btn').getBoundingClientRect(); return { notaAbajo: n.bottom, notaDer: n.right, notaIzq: n.left, masArriba: m.top, masIzq: m.left, masDer: m.right }; });
  const choca = pie.notaAbajo > pie.masArriba && pie.notaIzq < pie.masDer && pie.notaDer > pie.masIzq;
  check('6b. el pie de la tarjeta queda a la vista, sin tapar por el botón +', !choca && pie.notaAbajo <= 844, JSON.stringify(pie));
  if (SHOTS) await p1.screenshot({ path: join(SHOTS, 'inicio-valor.png') });

  if (!multi || !caja) check('2/3. hay botellas de prueba (varias posiciones y CAJA)', false, JSON.stringify({ multi, caja }));
  else {
    const a = await abrirFicha(p1, multi[0]);
    check(`2. ficha ${multi[0]}: "Posición: ${multi[1]}" (también en la lista)`, a.ficha.includes(`Posición: ${multi[1]}`) && a.textoFila.includes(`Posición: ${multi[1]}`), a.ficha.slice(0, 160));
    if (SHOTS) await p1.screenshot({ path: join(SHOTS, 'ficha-multi.png') });
    const b = await abrirFicha(p1, caja[0]);
    check(`3. ficha ${caja[0]}: "Posición: CAJA" (también en la lista)`, b.ficha.includes('Posición: CAJA') && b.textoFila.includes('Posición: CAJA'), b.ficha.slice(0, 160));
  }
  await c1.close();

  const { ctx: c2, page: p2 } = await abrir(false);
  const sub = (await p2.locator('.tab-top .tsub').first().innerText()).trim();
  const r2 = multi ? await abrirFicha(p2, multi[0]) : { textoFila: '', ficha: '' };
  const html = await p2.content();
  check('4. sin login: ninguna posición en lista, ficha ni página; cabecera de la demo',
    !r2.textoFila.includes('Posición') && !r2.ficha.includes('Posición') && !html.includes('data-posicion') && sub === 'Cava real del club · así se verá tu propio tablero', sub);
  await c2.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length >= 7 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
