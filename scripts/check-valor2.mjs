#!/usr/bin/env node
// Humo del informe de Valor (#valor) y de la tarjeta dorada del Inicio. Local en Chromium 390×844, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-valor2.mjs [--shots <carpeta>]
// (Se llama check-valor2 porque scripts/check-valor.mjs es el de la tarjeta del Inicio de rondas anteriores y no se toca.)
// Usa las cuentas reales de api/_lib/valor.ts con un fixture local y contesta la sesión, /api/cava y /api/montos desde el navegador.
//   1. el Inicio ya no tiene el gráfico de valor ni la cuenta; sí la tarjeta dorada con "Ver ›"
//   2. en #valor, el % de descuento (total y por año) y el ahorro coinciden con la cuenta, y no hay barra en el bloque de descuento
//   3. con un fixture Reserva aparece "Subí de plan"; con Gran Reserva, no
//   4. "TU PARTE" aparece una sola vez y no hay ningún "●" en la pantalla
//   5. la línea del dólar aparece una sola vez y no hay scroll horizontal a 390 px
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4207, BASE = `http://localhost:${PUERTO}`;
const ID = 'rec7kgfT9LXzYPy6a';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `valor2-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}
const { calcularValor } = await cargarTs('api/_lib/valor.ts');

// ── fixture: ocho compras del club en cinco años, con lo que pagó el club y el precio sugerido de cada botella (USD) ──
const HOY = '2026-11-15', DOLAR = 1500, N = 7;
const anios = (d, h) => { const [a1, m1, d1] = d.split('-').map(Number), [a2, m2, d2] = h.split('-').map(Number); let n = a2 - a1; if (m2 < m1 || (m2 === m1 && d2 < d1)) n--; return Math.max(0, n); };
const COMPRAS = [
  ['b1', 'Gran Enemigo', '2016', '2022-04-10', 6, 6, 70, 100], ['b2', 'Cheval des Andes', '2017', '2022-09-05', 4, 4, 55, 80],
  ['b3', 'Rutini Apartado', '2018', '2023-05-12', 6, 5, 45, 70], ['b4', 'Nicasia', '2019', '2023-11-20', 12, 10, 20, 32],
  ['b5', 'Catena Zapata', '2019', '2024-06-03', 6, 6, 60, 95], ['b6', 'Cobos Bramare', '2020', '2024-10-14', 4, 4, 80, 120],
  ['b7', 'Trapiche Iscay', '2018', '2025-04-22', 6, 6, 50, 75], ['b8', 'Zuccardi Aluvional', '2021', '2026-03-30', 12, 12, 30, 48],
];
const filas = COMPRAS.map(([id, vino, anada, fecha, cantidad, enGuarda, pagado, sugerido]) => {
  const valorEst = sugerido * Math.pow(1.075, Math.min(anios(fecha, HOY), 10));
  return { id, origen: 'Compra club', cantidad, enGuarda, fecha, pagado, sugerido, valorEst, gananciaEstiba: valorEst - sugerido, icono: false, formato: '750', vino, anada };
});
const informe = calcularValor(filas, [{ botella: 'b3', cantidad: 1, fecha: '2025-12-20', sugeridoHist: 70 }], HOY);
// lo que se espera, hecho a mano e independiente de api/_lib/valor.ts
const costo = filas.reduce((s, b) => s + b.cantidad * b.pagado, 0), sug = filas.reduce((s, b) => s + b.cantidad * b.sugerido, 0);
const PCT = Math.round((1 - costo / sug) * 100);
const porAnio = {};
for (const b of filas) { const a = b.fecha.slice(0, 4), x = porAnio[a] ?? (porAnio[a] = { c: 0, s: 0 }); x.c += b.cantidad * b.pagado; x.s += b.cantidad * b.sugerido; }
const PCT_ANIO = Object.entries(porAnio).map(([a, x]) => [Number(a), Math.round((1 - x.c / x.s) * 100)]);
const AHORRO = Math.round(sug - costo), BOTS = filas.reduce((s, b) => s + b.cantidad, 0);
const fmt = usd => '$' + String(Math.round(usd * DOLAR / 100) * 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const montos = (cuota, plan, tope, miembros = N) => ({
  dolar: { mes: '2026-11', valor: DOLAR }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { meses: [], porMes: {}, ultimas: [], club: { botellas: BOTS, desde: '2022-04', costo, sugerido: sug }, regalos: [], cuotas: null },
  informe: { ...informe, plan, topePlan: tope, presupuestoMes: cuota, tuParte: { valorCava: Math.round(informe.valorCava / miembros), compras: Math.round(informe.compras / miembros) } },
  cava: { id: ID, nombre: 'Cava #001', tipo: miembros > 1 ? 'Grupal' : 'Individual', miembros }, total: Z, tuParte: Z, porEtiqueta: {},
});
const RESERVA = montos(50, 'Reserva', 30), GRAN = montos(350, 'Gran Reserva', 40);
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
  const abrir = async (m, hash) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID);
    await ctx.route('**/api/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: CAVA });
      if (u.pathname === '/api/montos') return r.fulfill({ json: m });
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector(hash ? '[data-vi="pie"]' : '[data-tv="cabecera"] b', { timeout: 40000 });
    await p.waitForTimeout(700);
    return { ctx, p };
  };

  // ── 1. Inicio ──
  const { ctx: ci, p: pi } = await abrir(RESERVA, '');
  const inicio = await pi.evaluate(() => ({
    caja: !!document.querySelector('.tv, [data-tv="tarjeta"], [data-tv="cuenta"], [data-tv="grafico"], [data-tv="parte"]'),
    txt: document.body.innerText, pill: document.querySelector('[data-tv="cabecera"] .sec-card-pill')?.textContent,
    valor: document.querySelector('[data-tv="cabecera"] b')?.textContent, pct: document.querySelector('[data-tv="pct"]')?.textContent,
  }));
  check('1. el Inicio ya no tiene el gráfico de valor ni la cuenta ni "Tu parte"; sí la tarjeta dorada con el monto, el ▲ % y "Ver ›"',
    !inicio.caja && !/Costaron las compras|TU PARTE|Tu parte/.test(inicio.txt) && inicio.pill === 'Ver ›' && inicio.valor === fmt(informe.valorCava) && /^▲ \d+%$/.test(inicio.pct ?? ''), JSON.stringify(inicio).slice(0, 300));
  if (SHOTS) await pi.screenshot({ path: join(SHOTS, 'inicio.png'), fullPage: true });
  await ci.close();

  // ── 2. #valor: descuento total y por año, ahorro, sin barra en el bloque de descuento ──
  const { ctx: c1, p } = await abrir(RESERVA, '#valor');
  if (SHOTS) await p.screenshot({ path: join(SHOTS, 'valor-reserva.png'), fullPage: true });
  const v = await p.evaluate(() => {
    const t = s => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim();
    const d = document.querySelector('[data-vi="descuento"]');
    return {
      cab: t('[data-vi="cabecera"]'), pct: t('[data-vi="pct"]'), plan: t('[data-vi="plan"]'), ahorro: t('[data-vi="ahorro"]'),
      rot: t('.vi-rot'), barrasEnDescuento: d ? d.querySelectorAll('.vi-barra, svg, canvas, [class*="barra"], progress').length : -1,
      anios: [...document.querySelectorAll('[data-vi="anios"] .vi-col')].map(c => [Number(c.dataset.anio), t(`[data-vi="anios"] .vi-col[data-anio="${c.dataset.anio}"] .vi-pct`)]),
      tope: t('[data-vi="tope"]'), frase: t('[data-vi="frase"]'), orden: [...document.querySelectorAll('[data-vi="pantalla"] > section')].map(s => s.className.replace('banda ', '')),
      top: [...document.querySelectorAll('[data-vi="fila"]')].map(f => f.textContent.replace(/\s+/g, ' ').trim()),
    };
  });
  const sinBarra = v.barrasEnDescuento === 0;
  const anioOk = v.anios.length === PCT_ANIO.length && PCT_ANIO.every(([a, pc], i) => v.anios[i][0] === a && v.anios[i][1] === `${pc} %`);
  const fraseEsperada = PCT_ANIO.every(([, pc]) => pc >= 30);
  check('2. en #valor, el % de descuento (total y por año) y el ahorro coinciden con la cuenta; sin barra ni gráfico en el bloque de descuento; el tope y la frase salen bien',
    v.pct === `${PCT} %` && v.rot === 'EL CLUB COMPRA CON DESCUENTO' && v.plan.startsWith('Tu plan Reserva: hasta 30 %.') && v.plan.includes('Estás por encima.') === (PCT > 30)
    && v.ahorro === `El club ahorró ${fmt(AHORRO)} en ${BOTS} botellas.` && sinBarra && anioOk && v.tope === 'tu plan: 30 %' && (!!v.frase === fraseEsperada) && v.cab === 'Barraquitas · plan Reserva',
    JSON.stringify({ esperado: { PCT, PCT_ANIO, AHORRO, BOTS }, v }));
  console.log(`    top 5 (fixture): ${v.top.join(' | ')}`);

  // ── 3. Reserva: "Subí de plan"; Gran Reserva: no ──
  const sube = await p.locator('[data-vi="subir"]').count(), subeTxt = await p.locator('[data-vi="subir"]').innerText().catch(() => ''), href = await p.locator('[data-vi="subir"]').getAttribute('href').catch(() => null);
  const { ctx: c2, p: p2 } = await abrir(GRAN, '#valor');
  const sube2 = await p2.locator('[data-vi="subir"]').count();
  const plan2 = await p2.locator('[data-vi="plan"]').innerText(), cab2 = await p2.locator('[data-vi="cabecera"]').innerText();
  const frase2 = await p2.locator('[data-vi="frase"]').count();
  if (SHOTS) await p2.screenshot({ path: join(SHOTS, 'valor-gran.png'), fullPage: true });
  await c2.close();
  check('3. con un fixture Reserva aparece "Subí de plan" (hacia /club#planes); con Gran Reserva, no, y el tope es 40 %',
    sube === 1 && subeTxt === 'Con Gran Reserva, hasta 40 % · Subí de plan ›' && href === '/club#planes' && sube2 === 0 && plan2.startsWith('Tu plan Gran Reserva: hasta 40 %.') && !plan2.includes('Estás por encima') && cab2 === 'Barraquitas · plan Gran Reserva' && frase2 === 0,
    JSON.stringify({ sube, subeTxt, href, sube2, plan2, cab2, frase2 }));

  // ── 4. "TU PARTE" una vez, sin "●", sin lo que salió ──
  const txt = await p.locator('body').innerText();
  const partes = (txt.match(/TU PARTE/gi) ?? []).length;
  check('4. "TU PARTE" aparece una sola vez, no hay ningún "●" y no queda nada de lo que sale (Lo que significa, Cuotas y compras por año, PDF, "Disponible para miembros")',
    partes === 1 && !txt.includes('●') && !/Lo que significa|Cuotas y compras por año|Las que más valor sumaron|Descargar el informe|Disponible para miembros/.test(txt), `TU PARTE ×${partes}`);

  // ── 5. línea del dólar una sola vez y sin scroll horizontal ──
  const lineas = await p.locator('[data-din="linea"]').count();
  const desborda = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const nota = await p.locator('[data-vi="pie"]').innerText();
  check('5. la línea del dólar aparece una sola vez (con la nota del pie) y no hay scroll horizontal a 390 px', lineas === 1 && !desborda && nota.startsWith('El precio sugerido es el de bodega en dólares'), `líneas ${lineas}, desborda ${desborda}`);
  await c1.close();
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
