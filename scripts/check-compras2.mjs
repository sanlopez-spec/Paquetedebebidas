#!/usr/bin/env node
// Humo de la ronda "Compras: tarjeta del mes y bloque Cuotas". Local en Chromium 390×844, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-compras2.mjs [--shots <carpeta>]
// (Se llama check-compras2 porque scripts/check-compras.mjs es el de la ronda anterior y esa ronda pedía no tocarlo.)
// Usa las funciones reales de api/_lib/valor.ts con un fixture local (la cava de la planilla de noviembre 2026) y contesta
// la sesión, /api/cava y /api/montos desde el navegador.
//   1. los cinco casos de la tarjeta del mes muestran sus textos (con "incluye … de" y sin filas de desglose)
//   2. un mes al 90 % sigue abierto; al 96 % cierra y pasa el sobrante; al 105 % cierra y descuenta
//   3. Cuotas: subtítulo en USD, las dos columnas, el total por socio
//   4. la deuda de cada socio en pantalla coincide con la API (y con la planilla de referencia: si no, AVISO)
//   5. la línea del dólar aparece una sola vez
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4206, BASE = `http://localhost:${PUERTO}`;
const ID = 'rec7kgfT9LXzYPy6a';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };
const aviso = t => console.log(`  AVISO  ${t}`);

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `compras2-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularCompras, calcularCuotas, presupuestoUsdDe } = await cargarTs('api/_lib/valor.ts');
const pesos = n => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const aCien = n => pesos(Math.round(n / 100) * 100);   // la tarjeta redondea a centenas, como todo el Inicio

// ── fixture: 7 socios, cuota del grupo USD 350 (USD 50 cada uno), dólar $1.500 en todos los meses ──
const HOY = '2026-11-15', DOLAR = 1500, CUOTA_GRUPO = 350, N = 7;
const bot = (mes, usd) => ({ id: 'b' + mes, origen: 'Compra club', cantidad: 10, enGuarda: 10, fecha: `${mes}-10`, pagado: usd / 10, sugerido: 0, valorEst: 0, gananciaEstiba: 0, icono: false, formato: '750' });
// asignado por mes (USD): 96 % → cierra y sobra 14; 105 % de lo disponible → cierra y se pasa; 50 % y 90 % → siguen abiertos; 0 → eligiendo
const ASIGNADO = { '2026-05': 336, '2026-06': 382.2, '2026-07': 175, '2026-08': 315, '2026-09': 336 };
const filas = Object.entries(ASIGNADO).map(([m, u]) => bot(m, u));
const dolares = Object.fromEntries(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map(m => [m, DOLAR]));
const planMeses = { filas: {}, dolares, cuotaUsdSocio: CUOTA_GRUPO / N };
const compras = calcularCompras(filas, HOY, { cuota: CUOTA_GRUPO, saldoInicial: 0, saldoDesde: '2026-05', presupuestoMes: m => presupuestoUsdDe(m, planMeses, N, CUOTA_GRUPO) });
const M = Object.fromEntries(compras.meses.map(m => [m.mes, m]));

// ── fixture de cuotas: la planilla de noviembre 2026 (cuota $77.400, guarda de cada mes por socio) ──
const GUARDA = { '2026-08': 21249, '2026-09': 18000, '2026-10': 21140, '2026-11': 21700 };
const planCuotas = {
  filas: Object.fromEntries(Object.entries(GUARDA).map(([mes, guarda]) => [mes, { mes, cuotaSocio: 77400, guarda }])),
  dolares: { '2026-08': 1500, '2026-09': 1500, '2026-10': 1500, '2026-11': 1570 }, cuotaUsdSocio: 50,
};
const socios = [['mati', 'Mati', '2026-08'], ['toto', 'Toto Belmaña', '2026-09'], ['pato', 'Pato', '2026-08'], ['fede', 'Fede', '2026-08'], ['nano', 'Nano Ricchetti', '2026-08'], ['bruno', 'Bruno', '2026-08'], ['santi', 'Santiago', '2026-08']];
const miembros = socios.map(([id, nombre, desde]) => ({ id, nombre, desde }));
// pagos en USD 50 por mes: Bruno y Santiago hasta noviembre; Pato, Fede y Nano hasta octubre; Toto y Mati, nada
const pagos = [];
for (const id of ['bruno', 'santi']) for (const mes of ['2026-08', '2026-09', '2026-10', '2026-11']) pagos.push({ usuario: id, mes, monto: 50 });
for (const id of ['pato', 'fede', 'nano']) for (const mes of ['2026-08', '2026-09', '2026-10']) pagos.push({ usuario: id, mes, monto: 50 });
const cuotas = { ...calcularCuotas({ cuota: CUOTA_GRUPO, cuotasDesde: '2026-08', miembros, pagos, hoy: HOY, plan: planCuotas }), vos: 'toto' };
const REF = { Mati: 391689, 'Toto Belmaña': 293040, Pato: 99100, Fede: 99100, 'Nano Ricchetti': 99100 };

const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const MONTOS = {
  dolar: { mes: '2026-11', valor: DOLAR }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...compras, porMes: {}, ultimas: [], club: { botellas: 50, desde: '2026-05', costo: 1000, sugerido: 1200 }, regalos: [], cuotas },
  informe: {
    valorCava: 15400, compras: 11400, porcentaje: 35, guarda: 900, tomado: 4200, ahorro: 1200, enGuardaTodas: 300, abiertasTodas: 280, botellasTomadas: 280, botellasEnCava: 300,
    tuParte: { valorCava: 2200, compras: 1630 }, presupuestoMes: CUOTA_GRUPO, mesEnCurso: '2026-11', asignadoMes: 0, comprasPorMes: {},
    serie: ['2025-11', '2026-05', '2026-11'].map((mes, i) => ({ mes, compras: 5000 + i * 1600, tomado: 1000 + i * 800, cava: 6000 + i * 2300 })),
  },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: N }, total: Z, tuParte: Z, porEtiqueta: {},
};
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const SESION = { sesion: true, usuario: { nombre: 'Toto', email: 'toto@example.com', admin: false }, cavas: [{ id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: N, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }] };

async function lanzar() {
  try { return await chromium.launch({ headless: true }); }
  catch (e) { if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); throw e; }
}
const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await lanzar();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID);
  await ctx.route('**/api/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
    if (u.pathname === '/api/cava') return r.fulfill({ json: { ...CAVA, compras: [{ mes: '2026-09', botellas: 10, etiquetas: [] }], ultimaCompra: { mes: '2026-09', botellas: 10 } } });
    if (u.pathname === '/api/montos') return r.fulfill({ json: MONTOS });
    return r.fulfill({ status: 404, json: { error: 'no hay' } });
  });
  const p = await ctx.newPage();
  await p.goto(BASE + '/club/cava#compras', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-cm="mes"]', { timeout: 40000 });
  await p.waitForSelector('[data-cm="cuotas"]', { timeout: 10000 });
  if (SHOTS) await p.screenshot({ path: join(SHOTS, 'compras-nov.png') });

  // la tarjeta del mes, de noviembre hacia atrás
  const tarjeta = async () => ({
    rot: await p.locator('[data-cm="rot"]').innerText(), txt: (await p.locator('[data-cm="mes"]').innerText()).replace(/\s*\n\s*/g, ' | '),
    estado: await p.locator('[data-cm="mes"]').getAttribute('data-estado'), filas: await p.locator('.cm-f, .cm-filas, .cm-total').count(),
  });
  const T = {};
  for (const mes of ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']) {
    T[mes] = await tarjeta();
    if (SHOTS) await p.locator('[data-cm="mes"]').screenshot({ path: join(SHOTS, `mes-${mes}.png`) });
    if (mes !== '2026-05') await p.locator('[data-cm="prev"]').click();
  }
  for (const [mes, t] of Object.entries(T)) console.log(`    ${mes}: ${t.txt}`);
  const incl = M['2026-07'].saldoAnterior;
  const e1 = T['2026-11'].txt.includes('Estamos eligiendo tus vinos de este mes.') && T['2026-11'].txt.includes(`${pesos(0)} | de ${aCien(CUOTA_GRUPO * DOLAR)}`) && !/asignados/.test(T['2026-11'].txt)
    && T['2026-10'].txt.includes('Estamos eligiendo tus vinos de octubre.') && !T['2026-11'].txt.includes('Faltan');                        // caso 1
  const e2 = T['2026-07'].txt.includes('10 botellas') && T['2026-07'].txt.includes(`Faltan ${aCien(M['2026-07'].queda * DOLAR)} · seguimos eligiendo`);  // caso 2
  const e3 = T['2026-09'].txt.includes(`Sobró ${aCien(M['2026-09'].queda * DOLAR)} · pasa a octubre`);                                                   // caso 3
  const e4 = T['2026-06'].txt.includes(`Se pasó ${aCien(-M['2026-06'].queda * DOLAR)} · se descuenta de julio`);                                         // caso 4
  const e5 = T['2026-06'].txt.includes(`incluye +${aCien(M['2026-06'].saldoAnterior * DOLAR)} de mayo`) && incl < 0 && T['2026-07'].txt.includes(`incluye −${aCien(-incl * DOLAR)} de junio`);   // caso 5
  const sinFilas = Object.values(T).every(t => t.filas === 0) && !Object.values(T).some(t => /Cuota del mes|Saldo de|Para gastar/.test(t.txt));
  check('1. los cinco casos de la tarjeta (eligiendo, a medias, sobró, se pasó, incluye ± de) y sin filas de desglose',
    e1 && e2 && e3 && e4 && e5 && sinFilas, JSON.stringify({ e1, e2, e3, e4, e5, sinFilas }));

  // ── 2. abierto / cierra / descuenta, con las cuentas del servidor ──
  const prueba = usd => { const c = calcularCompras([bot('2026-11', usd), bot('2026-10', 0)], HOY, { cuota: 100, saldoInicial: 0, saldoDesde: '2026-10' }); return c.meses.find(m => m.mes === '2026-11'); };
  const a90 = prueba(90), a96 = prueba(96), a105 = prueba(105);
  const sig = (usd, previo) => { const c = calcularCompras([bot('2026-10', previo), bot('2026-11', usd)], HOY, { cuota: 100, saldoInicial: 0, saldoDesde: '2026-10' }); return c.meses.find(m => m.mes === '2026-11'); };
  const tras96 = sig(0, 96), tras105 = sig(0, 105), tras90 = sig(0, 90);
  check('2. 90 % sigue abierto y no pasa nada; 96 % cierra y pasa el sobrante; 105 % cierra y descuenta',
    !a90.cerrado && a96.cerrado && a96.queda === 4 && a105.cerrado && a105.queda === -5
    && tras96.saldoAnterior === 4 && tras96.disponible === 104 && tras105.saldoAnterior === -5 && tras105.disponible === 95 && tras90.saldoAnterior === null && tras90.disponible === 100,
    JSON.stringify({ a90: a90.cerrado, a96: [a96.cerrado, a96.queda], a105: [a105.cerrado, a105.queda], tras96: [tras96.saldoAnterior, tras96.disponible], tras105: [tras105.saldoAnterior, tras105.disponible], tras90: [tras90.saldoAnterior, tras90.disponible] }));

  // ── 3. Cuotas ──
  const cu = await p.locator('[data-cm="cuotas"]').innerText();
  const sub = await p.locator('[data-cm="cuotas-sub"]').innerText();
  const cajas = (await p.locator('[data-cm="cuotas-cajas"] .acc-caja').allInnerTexts()).map(t => t.replace(/\s*\n\s*/g, ' '));
  const tot = (await p.locator('[data-cm="cuota-total"]').innerText()).replace(/\s*\n\s*/g, ' ');
  check('3. Cuotas: subtítulo en USD, "Cuota para compras" y "Guarda" por socio, y el total por mes',
    sub === 'USD 50 por mes cada uno · desde agosto 2026' && cajas.length === 2 && cajas[0] === `Cuota para compras ${pesos(77400)}` && cajas[1] === `Guarda ${pesos(21700)}`
    && tot === `Total por mes, cada uno ${pesos(99100)}` && cu.includes('Cuotas') && /\d de 7 al día/.test(cu), JSON.stringify({ sub, cajas, tot }));
  if (SHOTS) { await p.locator('[data-cm="cuotas"]').scrollIntoViewIfNeeded(); await p.screenshot({ path: join(SHOTS, 'compras-cuotas.png') }); }

  // ── 4. la deuda de cada socio en pantalla = la de la API (y = la planilla de referencia, si no, AVISO) ──
  const filasCu = await p.locator('.cm-socio').allInnerTexts();
  const enPantalla = Object.fromEntries(await p.locator('.cm-socio').evaluateAll(els => els.map(e => [e.querySelector('.cm-socio-n').firstChild.textContent.trim(), e.querySelector('b').textContent.trim()])));
  const esperado = s => s.alDia ? 'Al día' : `Debe ${s.meses} ${s.meses === 1 ? 'mes' : 'meses'} · ${pesos(s.debe)}`;
  const coincide = cuotas.socios.every(s => enPantalla[s.nombre] === esperado(s));
  const vos = (await p.locator('.cm-socio', { has: p.locator('.cm-vos') }).getAttribute('data-socio').catch(() => null)) === 'toto';
  check('4. la deuda de cada socio (cuota + guarda de cada mes adeudado) en pantalla es la de la API', coincide && vos && filasCu.length === 7, JSON.stringify(enPantalla));
  const dif = cuotas.socios.filter(s => REF[s.nombre] !== undefined && REF[s.nombre] !== s.debe);
  if (dif.length) aviso('la planilla de referencia no coincide: ' + dif.map(s => `${s.nombre} API ${pesos(s.debe)} vs planilla ${pesos(REF[s.nombre])}`).join(' · '));
  else aviso('la planilla de noviembre coincide: ' + Object.entries(REF).map(([n, v]) => `${n} ${pesos(v)}`).join(' · '));

  // ── 5. una sola línea del dólar, al final ──
  const lineas = await p.locator('[data-din="linea"]').count();
  const alFinal = await p.evaluate(() => { const l = document.querySelector('[data-din="linea"]'); const ult = [...document.querySelectorAll('[data-cm]')].pop(); return !!l && !!ult && !!(ult.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING || ult === l); });
  check('5. la línea del dólar aparece una sola vez en la pantalla Compras, al final', lineas === 1 && alFinal, `líneas: ${lineas}, al final: ${alFinal}`);
  if (SHOTS) { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.screenshot({ path: join(SHOTS, 'compras-final.png') }); }
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
