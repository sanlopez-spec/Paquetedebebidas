#!/usr/bin/env node
// Humo de la pantalla Compras para socios (una corrida local en Chromium 390×844, nada en producción).
//   npx vite build && node scripts/check-compras.mjs [--shots <carpeta>]
// (1) logueado: la tarjeta del mes muestra cuota, "Para gastar" y barra; (2) un mes abierto muestra Al costo, A precio sugerido
// y Ahorro club del mes; (3) el bloque del club muestra la cuenta y "Tu parte"; (4) sin login no hay ningún monto;
// (5) api/cava.ts (público) no devuelve cuota ni montos.
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
const { calcularValor, calcularCompras } = await cargarTs('api/_lib/valor.ts');
const s1 = v => Array.isArray(v) ? String(v[0] ?? '') : (v && v.name) || String(v ?? '');
const n = v => Number(Array.isArray(v) ? v[0] : v) || 0;
const cavas = await listar('tblMlk7zZG5WreEL5', ['fldg3OXbdsSUUX7BR', 'fldfcZ0QRQmCQkWYo', 'fldMPx4VJUx6kHPPr', 'fldspJQEGYiEkmr8J']);
const c1 = cavas.find(c => String(c.fields.fldg3OXbdsSUUX7BR).includes('001'));
const B = (await listar('tblZIXNa2Ck3DNCwS', ['fldA3mlzf0ZkPy3nM', 'fldm87g7J9lHhI8pM', 'fldMTLDQLjYDZQRa2', 'fld9RAJzfNv0du6iW', 'fldv4njMaHOaG2yOY', 'fldDzDpsRhlBVetGQ', 'fldDj8MZ9uvXAHtbf', 'fld3TVr6pcCoNFBdW', 'fld63GBOOkGiUMg0V', 'fld1BEs0Q3KVb3Na6', 'fldekIJ54IKI1gd2R', 'fldUZflAbSpmIdK20', 'fldKC7gp51yfg7wtF', 'fldsFEvABrBwU5fBn', 'fldL0kHShpmW0EHc1']))
  .filter(b => (b.fields.fldekIJ54IKI1gd2R ?? []).includes(c1.id));
const filas = B.map(r => { const f = r.fields; return { id: r.id, origen: s1(f.fldA3mlzf0ZkPy3nM), cantidad: n(f.fldm87g7J9lHhI8pM), enGuarda: n(f.fldMTLDQLjYDZQRa2), fecha: String(f.fld9RAJzfNv0du6iW ?? ''), pagado: n(f.fldv4njMaHOaG2yOY), sugerido: n(f.fldDzDpsRhlBVetGQ), valorEst: n(f.fldDj8MZ9uvXAHtbf), gananciaEstiba: n(f.fld3TVr6pcCoNFBdW), icono: !!f.fld63GBOOkGiUMg0V, formato: s1(f.fld1BEs0Q3KVb3Na6), vino: String(f.fldUZflAbSpmIdK20 ?? ''), anada: String(f.fldKC7gp51yfg7wtF ?? ''), bodega: s1(f.fldsFEvABrBwU5fBn), cepa: s1(f.fldL0kHShpmW0EHc1) }; });
const hoy = new Date().toISOString().slice(0, 10);
const cf = c1.fields;
const informe = calcularValor(filas, [], hoy);
const compras = calcularCompras(filas, hoy, { cuota: cf.fldfcZ0QRQmCQkWYo ?? null, saldoInicial: Number(cf.fldMPx4VJUx6kHPPr) || 0, saldoDesde: String(cf.fldspJQEGYiEkmr8J ?? '').slice(0, 7) });
const CAVA = { id: c1.id, nombre: 'Club EDB #001', tipo: 'Grupo', miembros: 7 };
const cero = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const montosBody = { moneda: 'USD', cava: CAVA, esAdmin: false, compras, informe: { ...informe, presupuestoMes: cf.fldfcZ0QRQmCQkWYo ?? null, tuParte: { valorCava: 0, compras: 0 } }, total: cero, tuParte: cero, porEtiqueta: {} };
const m0 = compras.mesActual;
console.log('  mes en curso:', JSON.stringify(m0));

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
  const tj = await p.locator('[data-cm="mes"]').innerText().catch(() => '');
  const pctBarra = await p.locator('[data-cm="barra"]').getAttribute('data-pct').catch(() => null);
  check('1. tarjeta del mes: cuota, para gastar y barra',
    !!m0 && tj.includes('Cuota del mes') && tj.includes(fmt(m0.cuota)) && tj.includes('Para gastar en') && tj.includes(fmt(m0.disponible)) && tj.includes(`asignados de ${fmt(m0.disponible)}`) && pctBarra !== null, tj.replace(/\n/g, ' | '));
  if (SHOTS) await p.screenshot({ path: join(SHOTS, 'compras-arriba.png') });

  const primero = p.locator('.acc-item').first();
  const mesKey = await primero.getAttribute('data-mes');
  await primero.locator('.acc-btn').click();
  const cuerpo = await primero.locator('.acc-cuerpo').innerText();
  const d = compras.porMes[mesKey];
  check('2. mes abierto: Al costo, A precio sugerido y Ahorro club del mes',
    cuerpo.includes('Al costo') && cuerpo.includes(fmt(d.costo)) && cuerpo.includes('A precio sugerido') && cuerpo.includes(fmt(d.sugerido)) && cuerpo.includes('Ahorro club del mes') && cuerpo.includes(fmt(d.sugerido - d.costo)), cuerpo.replace(/\n/g, ' | ').slice(0, 200));

  const club = await p.locator('[data-cm="club"]').innerText().catch(() => '');
  const k = compras.club;
  check('3. lo que compró el club: la cuenta y "Tu parte"',
    club.includes(fmt(k.sugerido)) && club.includes(`− ${fmt(k.costo)}`) && club.includes('Ahorro club') && club.includes(fmt(k.sugerido - k.costo)) && club.includes('TU PARTE · 1 DE 7') && club.includes('Tu ahorro club') && club.includes(fmt((k.sugerido - k.costo) / 7)), club.replace(/\n/g, ' | '));
  if (SHOTS) { await p.locator('[data-cm="club"]').scrollIntoViewIfNeeded(); await p.screenshot({ path: join(SHOTS, 'compras-club.png') }); }
  await c.close();

  const { ctx: c2, page: p2 } = await abrir(false);
  const body = await p2.locator('body').innerText();
  const hayTarjeta = await p2.locator('[data-cm]').count();
  check('4. sin login: ningún monto en Compras', hayTarjeta === 0 && !/USD\s*\d/.test(body), body.match(/USD\s*\d[^\n]*/)?.[0] ?? '');
  await c2.close();

  const j = JSON.stringify(cavaBody);
  check('5. api/cava.ts público no devuelve cuota ni montos', !/cuota/i.test(j) && !/"saldo/i.test(j) && !/\bUSD\b/.test(j) && !j.includes('"pagad'), (j.match(/.{20}(cuota|USD).{20}/i) ?? [''])[0]);
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
