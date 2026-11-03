#!/usr/bin/env node
// Humo de la pantalla Compras para socios (una corrida local en Chromium 390×844, nada en producción).
//   npx vite build && node scripts/check-compras.mjs [--shots <carpeta>]
// (1) Cuotas lista a los socios del #001 con su estado y "Vos"; (2) la franja "Compras en pausa" y la tarjeta del mes
// (cuota, para gastar, barra); (3) la flecha ‹ lleva a octubre y › vuelve a noviembre; (4) Regalos y aportes es una lista sin meses;
// (5) sin login no aparecen montos ni deudas y api/cava.ts (público) no los devuelve.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4183, BASE = `http://localhost:${PUERTO}`;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2]; }
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };
const fmt = x => 'USD ' + String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

async function cargarTs(ruta) {
  const { transform } = await import('esbuild');
  const { code } = await transform(readFileSync(join(ROOT, ruta), 'utf8'), { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `cmp-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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
const { calcularValor, calcularCompras, calcularCuotas } = await cargarTs('api/_lib/valor.ts');
const s1 = v => Array.isArray(v) ? String(v[0] ?? '') : (v && v.name) || String(v ?? '');
const n = v => Number(Array.isArray(v) ? v[0] : v) || 0;
const cavas = await listar('tblMlk7zZG5WreEL5', ['fldg3OXbdsSUUX7BR', 'fldfcZ0QRQmCQkWYo', 'fldMPx4VJUx6kHPPr', 'fldspJQEGYiEkmr8J', 'fldQTHejxuFzS8GDy', 'fldHoennfWz2cEd5t', 'fldB25kKxMcB1SiHH']);
const c1 = cavas.find(c => String(c.fields.fldg3OXbdsSUUX7BR).includes('001'));
const B = (await listar('tblZIXNa2Ck3DNCwS', ['fldA3mlzf0ZkPy3nM', 'fldm87g7J9lHhI8pM', 'fldMTLDQLjYDZQRa2', 'fld9RAJzfNv0du6iW', 'fldv4njMaHOaG2yOY', 'fldDzDpsRhlBVetGQ', 'fldDj8MZ9uvXAHtbf', 'fld3TVr6pcCoNFBdW', 'fld63GBOOkGiUMg0V', 'fld1BEs0Q3KVb3Na6', 'fldekIJ54IKI1gd2R', 'fldUZflAbSpmIdK20', 'fldKC7gp51yfg7wtF', 'fldsFEvABrBwU5fBn', 'fldL0kHShpmW0EHc1']))
  .filter(b => (b.fields.fldekIJ54IKI1gd2R ?? []).includes(c1.id));
const filas = B.map(r => { const f = r.fields; return { id: r.id, origen: s1(f.fldA3mlzf0ZkPy3nM), cantidad: n(f.fldm87g7J9lHhI8pM), enGuarda: n(f.fldMTLDQLjYDZQRa2), fecha: String(f.fld9RAJzfNv0du6iW ?? ''), pagado: n(f.fldv4njMaHOaG2yOY), sugerido: n(f.fldDzDpsRhlBVetGQ), valorEst: n(f.fldDj8MZ9uvXAHtbf), gananciaEstiba: n(f.fld3TVr6pcCoNFBdW), icono: !!f.fld63GBOOkGiUMg0V, formato: s1(f.fld1BEs0Q3KVb3Na6), vino: String(f.fldUZflAbSpmIdK20 ?? ''), anada: String(f.fldKC7gp51yfg7wtF ?? ''), bodega: s1(f.fldsFEvABrBwU5fBn), cepa: s1(f.fldL0kHShpmW0EHc1) }; });
const hoy = new Date().toISOString().slice(0, 10);
const cf = c1.fields;
const informe = calcularValor(filas, [], hoy);
const compras = calcularCompras(filas, hoy, { cuota: cf.fldfcZ0QRQmCQkWYo ?? null, saldoInicial: Number(cf.fldMPx4VJUx6kHPPr) || 0, saldoDesde: String(cf.fldspJQEGYiEkmr8J ?? '').slice(0, 7) });
const CAVA = { id: c1.id, nombre: 'Club EDB #001', tipo: 'Grupal', miembros: 7 };
const cero = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const nombres = new Map((await listar('tblrs54qDQH1JAHRW', ['fldCyrZEH75CRuq6x'])).map(r => [r.id, String(r.fields.fldCyrZEH75CRuq6x ?? '')]));
const grupo = cf.fldB25kKxMcB1SiHH[0];
const miembros = (await listar('tblETY9OBswoLrsxM', ['fld0RfCA3DA1WMMsH', 'fldgzZDW42nHsMBpw', 'flda7ZqecAcLHLyQz'])).filter(m => (m.fields.fldgzZDW42nHsMBpw ?? []).includes(grupo))
  .map(m => ({ id: m.fields.fld0RfCA3DA1WMMsH[0], nombre: nombres.get(m.fields.fld0RfCA3DA1WMMsH[0]), desde: String(m.fields.flda7ZqecAcLHLyQz ?? '').slice(0, 7) }));
const pagos = (await listar('tblcZzM0bfticDCMK', ['fld9B3IZ66qOjuouE', 'fldciEiLnBClJtUkE', 'fld4JYsBwnHIm8Kzg', 'fld7jwNYiW1LOOGBv']))
  .filter(p => (p.fields.fldciEiLnBClJtUkE ?? []).includes(c1.id)).map(p => ({ usuario: (p.fields.fld9B3IZ66qOjuouE ?? [])[0], mes: String(p.fields.fld4JYsBwnHIm8Kzg ?? ''), monto: Number(p.fields.fld7jwNYiW1LOOGBv) || 0 }));
const cuotas = calcularCuotas({ cuota: cf.fldfcZ0QRQmCQkWYo, cuotasDesde: String(cf.fldHoennfWz2cEd5t).slice(0, 7), miembros, pagos, hoy });
const VOS = miembros[1].id;
console.log('  cuotas:', cuotas.socios.map(s => s.nombre + ' ' + (s.alDia ? 'al día' : s.meses + 'm ' + s.debe)).join(' | '));
const montosBody = { moneda: 'USD', cava: CAVA, esAdmin: false, compras: { ...compras, pausa: !!cf.fldQTHejxuFzS8GDy, cuotas: { ...cuotas, vos: VOS } }, informe: { ...informe, presupuestoMes: cf.fldfcZ0QRQmCQkWYo ?? null, tuParte: { valorCava: 0, compras: 0 } }, total: cero, tuParte: cero, porEtiqueta: {} };
const meses = compras.meses, mAct = meses.at(-1);
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
    await page.goto(`${BASE}/club/cava#compras`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.acc-item', { timeout: 20000 });
    return { ctx, page };
  };

  const { ctx: c, page: p } = await abrir(true);
  await p.waitForSelector('[data-cm="mes"]', { timeout: 10000 }).catch(() => {});
  const cu = await p.locator('[data-cm="cuotas"]').innerText().catch(() => '');
  const filasCu = await p.locator('.cm-socio').allInnerTexts();
  const esperado = cuotas.socios.every(s => filasCu.some(t => t.includes(s.nombre) && t.includes(s.alDia ? 'Al día' : 'Debe ' + s.meses + (s.meses === 1 ? ' mes' : ' meses') + ' · ' + fmt(s.debe))));
  const yoFila = await p.locator('.cm-socio', { has: p.locator('.cm-vos') }).getAttribute('data-socio').catch(() => null);
  check('1. Cuotas: lista a los ' + miembros.length + ' socios con su estado y marca "Vos"',
    filasCu.length === miembros.length && esperado && yoFila === VOS && cu.includes(cuotas.alDia + ' de ' + cuotas.total + ' al día'), cu.replace(/\n/g, ' | ').slice(0, 300));
  if (SHOTS) { await p.locator('[data-cm="cuotas"]').scrollIntoViewIfNeeded(); await p.screenshot({ path: join(SHOTS, 'compras-cuotas.png') }); await p.evaluate(() => window.scrollTo(0, 0)); }

  const tj = await p.locator('[data-cm="mes"]').innerText().catch(() => '');
  const pausaTxt = await p.locator('[data-cm="pausa"]').innerText().catch(() => '');
  const pctBarra = await p.locator('[data-cm="barra"]').getAttribute('data-pct').catch(() => null);
  check('2. franja "Compras en pausa" y tarjeta del mes con cuota, para gastar y barra',
    pausaTxt.includes('Compras en pausa') && pausaTxt.includes('Ver cuotas') && tj.includes('Cuota del mes') && tj.includes(fmt(mAct.cuota)) && tj.includes('Para gastar en') && tj.includes(fmt(mAct.disponible)) && pctBarra !== null, tj.replace(/\n/g, ' | '));
  if (SHOTS) await p.screenshot({ path: join(SHOTS, 'compras-arriba.png') });

  await p.locator('[data-cm="prev"]').click();
  const oct = await p.locator('[data-cm="rot"]').innerText();
  const octTxt = await p.locator('[data-cm="mes"]').innerText();
  const mPrev = meses.at(-2);
  await p.locator('[data-cm="next"]').click();
  const nov = await p.locator('[data-cm="rot"]').innerText();
  const sigDeshab = await p.locator('[data-cm="next"]').isDisabled();
  check('3. ‹ lleva a octubre (antes de "Saldo desde": sólo cuota y asignado) y › vuelve a noviembre',
    /OCTUBRE 2026/.test(oct) && mPrev.disponible === null && octTxt.includes('Cuota del mes') && octTxt.includes('asignados') && !octTxt.includes('Para gastar') && !octTxt.includes('Pasó a') && !octTxt.includes('Saldo de') && /ESTE MES · NOVIEMBRE 2026/.test(nov) && sigDeshab, oct + ' / ' + nov + ' / ' + octTxt.replace(/\n/g, ' | '));

  const rg = await p.locator('[data-cm="regalos"]').innerText().catch(() => '');
  const nRg = await p.locator('[data-cm="regalos"] .cm-reg').count();
  const totRg = compras.regalos.reduce((s, e) => s + e.botellas, 0);
  check('4. Regalos y aportes: lista simple, sin meses ni montos',
    compras.regalos.length > 0 && rg.includes('Regalos y aportes') && rg.includes(totRg + ' botellas') && nRg === Math.min(8, compras.regalos.length) && !/USD/.test(rg) && !/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) 20\d\d/i.test(rg), rg.replace(/\n/g, ' | ').slice(0, 200));
  if (SHOTS) { await p.locator('[data-cm="regalos"]').scrollIntoViewIfNeeded(); await p.screenshot({ path: join(SHOTS, 'compras-regalos.png') }); }
  await c.close();

  const { ctx: c2, page: p2 } = await abrir(false);
  const body = await p2.locator('body').innerText();
  const hayTarjeta = await p2.locator('[data-cm]').count();
  await c2.close();
  const j = JSON.stringify(cavaBody);
  check('5. sin login: ningún monto ni deuda; api/cava.ts público tampoco los devuelve',
    hayTarjeta === 0 && !/USD\s*\d/.test(body) && !/Debe|Al día|Vos/.test(body) && !/cuota/i.test(j) && !/pausa|deuda|debe|pagos/i.test(j) && !/\bUSD\b/.test(j) && !j.includes('"pagad'),
    (body.match(/USD\s*\d[^\n]*/)?.[0] ?? '') + ' ' + ((j.match(/.{20}(cuota|USD|pausa|deuda|debe|pagos).{20}/i) ?? [''])[0]));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
