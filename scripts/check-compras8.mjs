#!/usr/bin/env node
// Humo de "Compras ronda 8: el presupuesto pasa a ser una cuenta corriente". Local en Chromium, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-compras8.mjs
// (reemplaza los chequeos de Compras que dependían de "mes cerrado" 95–110 %: esa regla ya no existe)
//   1. un mes al 112 % pasa su excedente al mes siguiente (calcularCompras); un mes al 80 % pasa lo que sobró
//   2. un mes sin compras pasa la cuota entera (más lo que traía) y el mes en curso arranca con ese saldo
//   3. la cadena de la tarjeta: "Se pasó $X · se descuenta de septiembre" = "incluye −$X de agosto" del mes siguiente; un mes terminado sin compras dice "Sobró $X · pasa a …"
//   4. el aviso "Saldo muy alto / muy negativo" aparece sólo en el Panel Admin y sólo con más de 1,5 cuotas (y no en la pantalla del socio)
//   5. el mes en curso no pasa saldo: dice "Faltan $X · seguimos eligiendo" (sin "pasa a") y, sin compras, "Estamos eligiendo tus vinos de este mes."
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4231, BASE = `http://localhost:${PUERTO}`, ID = 'rec7kgfT9LXzYPy6a';
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); return ok; };
const resultados = [];
async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `c8-${Date.now()}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularCompras, calcularValor } = await cargarTs('api/_lib/valor.ts');

const HOY = '2026-11-15', CUOTA = 350;
const DOLARES = { '2026-08': 1504, '2026-09': 1518, '2026-10': 1550, '2026-11': 1570 };
const bot = (mes, usd) => ({ id: 'z' + mes, origen: 'Compra club', cantidad: 10, enGuarda: 10, fecha: `${mes}-10`, pagado: usd / 10, sugerido: 0, valorEst: 0, gananciaEstiba: 0, icono: false, formato: '750' });
// agosto 392 (112 % de 350), septiembre 100, octubre sin compras, noviembre (en curso) 200
const compras = (asig, hoy = HOY) => calcularCompras(Object.entries(asig).map(([m, u]) => bot(m, u)), hoy, { cuota: CUOTA, saldoInicial: 0, saldoDesde: '2026-08', dolares: DOLARES });
const C = compras({ '2026-08': 392, '2026-09': 100, '2026-11': 200 });
const M = Object.fromEntries(C.meses.map(m => [m.mes, m]));
const near = (a, b) => Math.abs(a - b) < 0.01;

// ── 1 y 2 · la regla ──
resultados.push(check('1. un mes al 112 % pasa su excedente (−USD 42) y uno que sobró pasa lo que sobró (USD 208), sin importar el porcentaje',
  near(M['2026-08'].queda, -42) && near(M['2026-09'].saldoAnterior, -42) && near(M['2026-09'].queda, 208) && !('cerrado' in M['2026-08']), JSON.stringify({ ago: M['2026-08'], sep: M['2026-09'] })));
resultados.push(check('2. un mes sin compras (octubre) pasa la cuota entera más lo que traía (USD 558) y noviembre arranca con ese saldo',
  near(M['2026-10'].asignado, 0) && near(M['2026-10'].queda, 350 + 208) && near(M['2026-11'].saldoAnterior, 558) && near(M['2026-11'].disponible, 908), JSON.stringify({ oct: M['2026-10'], nov: M['2026-11'] })));

// ── la pantalla ──
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const informe = calcularValor([], [], HOY);
const MONTOS = (cmp) => ({ dolar: { mes: '2026-11', valor: DOLARES['2026-11'] }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { ...cmp, porMes: {}, filasMes: {}, ultimas: [], club: { botellas: 38, desde: '2026-08', costo: 1, sugerido: 2 }, regalos: [], cuotas: null },
  informe: { ...informe, plan: 'Gran Reserva', topePlan: 40, presupuestoMes: CUOTA, tuParte: { valorCava: 1, compras: 1 } },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7 }, total: Z, tuParte: Z, porEtiqueta: {} });
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const API_CAVA = { ...CAVA, compras: [{ mes: '2026-09', botellas: 10, etiquetas: [] }], ultimaCompra: { mes: '2026-09', botellas: 10 } };
const SESION = (admin) => ({ sesion: true, usuario: { nombre: 'Toto', email: 'toto@example.com', admin }, cavas: [{ id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'B', avatar: false, puedeAvatar: false }] });
const HOYM = HOY.slice(0, 7);
const fichaCon = queda => ({ dolar: { mes: HOYM, valor: 1570 }, hoy: HOY, mesHoy: HOYM, usuarios: [], pagos: [],
  cava: { id: ID, numero: '#001', nombre: 'Barraquitas', tipo: 'grupal', fundacion: '2021-04-01', plan: 'Gran Reserva', cuotaUsd: CUOTA, socios: [], enGuarda: 10, deuda: { n: 0, ars: 0, meses: 0 },
    mesActual: { asignado: 0, disponible: queda, queda, saldoAnterior: null, botellas: 0, arrastre: true, mes: HOYM, cuota: CUOTA, dolar: 1570 },
    cuotaSocioUsd: 50, saldoInicial: 0, saldoDesde: '2026-08', cuotasDesde: '2026-08', notas: '', grupoId: null, mesesArs: [], guarda: [] } });

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  try { browser = await chromium.launch({ headless: true }); } catch (e) { if (existsSync('/opt/pw-browsers/chromium')) browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); else throw e; }
  const abrir = async (hash, espera, { admin = false, cmp = C, ficha = null } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID);
    await ctx.route('**/api/**', r => {
      const u = new URL(r.request().url()), a = u.searchParams.get('action');
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION(admin) });
      if (u.pathname === '/api/cava') return r.fulfill({ json: API_CAVA });
      if (u.pathname === '/api/montos') return r.fulfill({ json: MONTOS(cmp) });
      if (u.pathname === '/api/admin-cavas' && ficha) {
        if (a === 'detail') return r.fulfill({ json: ficha });
        if (a === 'list') return r.fulfill({ json: { dolar: ficha.dolar, mesHoy: HOYM, cavas: [], usuarios: [], totales: { cavas: 0, grupales: 0, individuales: 0, catalogo: 0, socios: 0, cuotaUsd: 0, deudaArs: 0, deudores: 0 } } });
        if (a === 'comprasMes') return r.fulfill({ json: { cava: ID, mes: HOYM, meses: [], dolar: 1570, lineas: [], presupuesto: null, opciones: { cepa: [], region: [], provincia: [], tipo: [], formato: [] } } });
      }
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector(espera, { timeout: 40000 });
    await p.waitForTimeout(600);
    return { ctx, p };
  };
  // ── 3 y 5 · la tarjeta del mes, de noviembre hacia atrás ──
  const { ctx, p } = await abrir('#compras', '[data-cm="mes"]');
  const T = {};
  const total = C.meses.length;
  for (let k = 0; k < total; k++) {
    const t = await p.evaluate(() => document.querySelector('[data-cm="queda"]').textContent.trim());
    T[C.meses[total - 1 - k].mes] = t;
    if (k < total - 1) await p.locator('[data-cm="prev"]').click();
  }
  const x = t => Number((t.match(/(?:Se pasó|Sobró|Faltan) \$([\d.]+)/) ?? [])[1]?.replace(/\./g, ''));
  const inc = t => Number((t.match(/incluye [−+]?\$([\d.]+)/) ?? [])[1]?.replace(/\./g, ''));
  resultados.push(check('3. cadena: agosto "Se pasó $X · se descuenta de septiembre" = "incluye −$X de agosto" en septiembre; septiembre "Sobró $Y · pasa a octubre" = "incluye +$Y de septiembre"; octubre sin compras "Sobró $Z · pasa a noviembre"',
    /^Se pasó \$[\d.]+ · se descuenta de septiembre$/.test(T['2026-08']) && /^Sobró \$[\d.]+ · pasa a octubre · incluye −\$[\d.]+ de agosto$/.test(T['2026-09']) && inc(T['2026-09']) === x(T['2026-08'])
      && /^Sobró \$[\d.]+ · pasa a noviembre · incluye \+\$[\d.]+ de septiembre$/.test(T['2026-10']) && inc(T['2026-10']) === x(T['2026-09']), JSON.stringify(T)));
  await ctx.close();
  const sin = await abrir('#compras', '[data-cm="mes"]', { cmp: compras({ '2026-08': 392, '2026-09': 100 }) });
  const t11 = await sin.p.evaluate(() => document.querySelector('[data-cm="queda"]').textContent.trim());
  const sinNoSocio = await sin.p.evaluate(() => /Saldo muy/.test(document.body.innerText));
  await sin.ctx.close();

  resultados.push(check('5. el mes en curso no pasa saldo: con compras dice "Faltan $X · seguimos eligiendo · incluye +$ de octubre" (sin "pasa a") y, sin compras, "Estamos eligiendo tus vinos de este mes."',
    /^Faltan \$[\d.]+ · seguimos eligiendo · incluye \+\$[\d.]+ de octubre$/.test(T['2026-11']) && inc(T['2026-11']) === x(T['2026-10']) && !/pasa a|se descuenta/.test(T['2026-11']) && /^Estamos eligiendo tus vinos de este mes\. · incluye \+\$[\d.]+ de octubre$/.test(t11), JSON.stringify({ conCompras: T['2026-11'], sinCompras: t11 })));

  // ── 4 · el aviso, sólo en el Panel Admin ──
  const alto = await abrir(`#admin/${ID}`, '[data-adm="compras-mes"]', { admin: true, ficha: fichaCon(600) });
  await alto.p.waitForTimeout(400);
  const avAlto = await alto.p.evaluate(() => document.querySelector('[data-adm="aviso-saldo"]')?.textContent ?? '');
  await alto.ctx.close();
  const neg = await abrir(`#admin/${ID}`, '[data-adm="compras-mes"]', { admin: true, ficha: fichaCon(-600) });
  const avNeg = await neg.p.evaluate(() => document.querySelector('[data-adm="aviso-saldo"]')?.textContent ?? '');
  await neg.ctx.close();
  const normal = await abrir(`#admin/${ID}`, '[data-adm="compras-mes"]', { admin: true, ficha: fichaCon(500) });
  const avNormal = await normal.p.evaluate(() => document.querySelector('[data-adm="aviso-saldo"]')?.textContent ?? '');
  await normal.ctx.close();
  resultados.push(check('4. con más de 1,5 cuotas a favor el panel avisa "Saldo muy alto: conviene comprar"; a la inversa, "Saldo muy negativo: conviene frenar"; con 1,43 cuotas no avisa; el socio no lo ve',
    avAlto === 'Saldo muy alto: conviene comprar' && avNeg === 'Saldo muy negativo: conviene frenar' && avNormal === '' && !sinNoSocio, JSON.stringify({ avAlto, avNeg, avNormal, sinNoSocio })));
} finally { await browser?.close().catch(() => {}); srv.kill(); }
const ok = resultados.filter(Boolean).length;
console.log(`\n${ok}/5`);
process.exit(ok === 5 ? 0 : 1);
