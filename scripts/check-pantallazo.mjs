#!/usr/bin/env node
// Humo de "consistencia del primer pantallazo". Local en Chromium, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-pantallazo.mjs [--shots <carpeta>]
// /api/cava sale de correr api/cava.ts real con un Airtable simulado: las botellas del respaldo de la #001 (src/club/data/cava-001.json).
// La sesión y /api/montos se contestan desde el navegador.
//   1. a 390 y a 1200 px, el primer bloque de Inicio, Mi cava, Consumos, Compras y Valor está a la misma distancia de la cabecera que la
//      ficha del grupo (24 px), y el primer recuadro de cada subsección a esa misma distancia de la barra de pestañas
//   2. ficha del grupo, tarjeta del carrusel, Cuotas, recuadro de resumen, buscador y filtros del Catálogo: el mismo radio
//   3. Catálogo: recuadro de resumen en grafito, con botellas, etiquetas, calibres e íconos iguales a los de /api/cava; sin filtro no
//      está el renglón "N botellas · N etiquetas" y con una búsqueda sí
//   4. a 320 px, al entrar a cada subsección la pestaña activa se ve entera, fuera de los dos degradés
//   5. "Mi cava" de la barra de abajo en el bordó activo (#6B1E2E) dentro de cada subsección
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4219, BASE = `http://localhost:${PUERTO}`;
const ID = 'rec7kgfT9LXzYPy6a';
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };
const SUBS = ['catalogo', 'cepas', 'geografia', 'anadas', 'calidad', 'colecciones'];

// ── /api/cava: api/cava.ts real, con Airtable simulado a partir del respaldo de la #001 ──
const fuente = readFileSync(join(ROOT, 'api/cava.ts'), 'utf8');
const campo = (obj, k) => new RegExp(`\\b${k}:\\s*'(fld\\w+)'`).exec(new RegExp(`const ${obj} = \\{([\\s\\S]*?)\\n\\}`).exec(fuente)[1])[1];
const F = k => campo('F', k), FC = k => campo('FC', k), FU = k => campo('FU', k);
const g = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8')).data.grupal;
const MES = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };
const FORMATO = { 2: 'Magnum 1.5', 4: 'Jeroboam 3', 8: '6 L', 12: 'Salmanazar 9' };
const bots = [], consumos = [];
g.forEach((w, i) => {
  const id = 'recB' + String(i).padStart(13, '0');
  const ing = w.start ? `${w.start[0]}-${String(w.start[1] + 1).padStart(2, '0')}-10` : '2021-05-10';
  const n = (w.consd ?? []).length;
  bots.push({ id, fields: {
    [F('vino')]: w.vino, [F('bodega')]: w.bod, [F('anada')]: w.an, [F('cepa')]: w.cepa, [F('region')]: w.reg, [F('provPais')]: w.pais,
    [F('tipo')]: (w.tipo ?? '').replace(/^./, c => c.toUpperCase()), [F('cantComp')]: w.qty + n, [F('vivino')]: w.vivino ?? (i % 5 === 4 ? null : Math.round((3.6 + ((i * 37) % 10) / 10) * 10) / 10),
    [F('fechaIng')]: ing, [F('icono')]: i % 23 === 0, [F('enGuarda')]: w.qty, [F('eq750')]: w.eq, [F('cava')]: [ID], [F('origen')]: 'Compra club', [F('consumidas')]: n,
    [F('formato')]: FORMATO[w.eq / w.qty] ?? '750',
  } });
  (w.consd ?? []).forEach((c, k) => { const [m, y] = c.split(' '); consumos.push({ id: `recC${String(i).padStart(7, '0')}${String(k).padStart(6, '0')}`, fields: { [FC('botella')]: [id], [FC('cantidad')]: 1, [FC('fecha')]: `${y}-${MES[m]}-15` } }); });
});
const uvas = [...new Set(g.map(w => w.cepa))].map((c, i) => ({ id: 'recU' + String(i).padStart(13, '0'), fields: { [FU('nombre')]: c, [FU('color')]: '#6B1E2E', [FU('esUva')]: true } }));
const TABLAS = { tblZIXNa2Ck3DNCwS: bots, tblvfDCiHNUXo1ZFQ: consumos, tblXjEG9P1VZEEcpE: [], tblbweXp5Dj6xKL5Q: uvas };
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  const u = new URL(String(url));
  if (u.hostname === 'api.airtable.com') return new Response(JSON.stringify({ records: TABLAS[u.pathname.split('/').pop()] ?? [] }), { status: 200 });
  return fetchReal(url, op);
};
process.env.AIRTABLE_TOKEN = 'simulado';
const { build } = await import('esbuild');
const bundle = await build({ entryPoints: [join(ROOT, 'api/cava.ts')], bundle: true, platform: 'node', format: 'esm', write: false });
const tmp = join(tmpdir(), `pantallazo-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
writeFileSync(tmp, bundle.outputFiles[0].text, 'utf8');
let API = null;
await (await import(pathToFileURL(tmp).href)).default({ method: 'GET', query: {}, headers: {} }, { setHeader() {}, status() { return this; }, json(b) { API = b; return this; }, end() { return this; } });
globalThis.fetch = fetchReal;
if (!API?.stats) { console.error('api/cava.ts no devolvió stats:', JSON.stringify(API).slice(0, 200)); process.exit(1); }
const CAVA_API = { ...API, compras: [{ mes: '2021-05', botellas: 569, etiquetas: [] }, { mes: '2026-09', botellas: 14, etiquetas: [] }], ultimaCompra: { mes: '2026-09', botellas: 14 } };

// ── /api/montos: lo justo para Compras (con Cuotas) y Valor ──
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const MONTOS = {
  dolar: { mes: '2026-11', valor: 1475 }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { meses: [{ mes: '2026-11', botellas: 0, cuota: 350, asignado: 0, saldoAnterior: null, disponible: 350, queda: 350, arrastre: false, cerrado: false, dolar: 1475 }], porMes: {}, ultimas: [],
    club: { botellas: 583, desde: '2021-05', costo: 11400, sugerido: 12600 }, regalos: [],
    cuotas: { cuotaSocio: 60, desde: '2025-10', alDia: 6, total: 7, socios: [{ id: 'a', nombre: 'Toto', alDia: true, meses: 0, debe: 0, aFavor: 0 }], vos: 'a', mes: '2026-11', cuotaPesos: 88500, guardaPesos: 10000, totalPesos: 98500, enUsd: false } },
  informe: {
    valorCava: 15400, compras: 11400, porcentaje: 35, guarda: 900, tomado: 4200, ahorro: 1200, enGuardaTodas: 300, abiertasTodas: 280, botellasTomadas: 280, botellasEnCava: 300,
    tuParte: { valorCava: 2200, compras: 1630 }, presupuestoMes: 350, mesEnCurso: '2026-11', asignadoMes: 0, comprasPorMes: {},
    serie: ['2025-11', '2026-02', '2026-05', '2026-08', '2026-11'].map((mes, i) => ({ mes, compras: 5000 + i * 1600, tomado: 1000 + i * 800, cava: 6000 + i * 2300 })),
    descuento: { pct: 34, costo: 11400, sugerido: 17000, ahorro: 5600, botellas: 583, porAnio: [{ anio: 2025, pct: 33, botellas: 100 }] }, crecieron: [], crecieronN: 0, plan: 'Gran Reserva', topePlan: 40,
  },
  cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7 }, total: Z, tuParte: Z, porEtiqueta: {},
};
const SESION = { sesion: true, usuario: { nombre: 'Toto', email: 'toto@example.com', admin: false },
  cavas: [{ id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }] };

async function lanzar() {
  try { return await chromium.launch({ headless: true }); }
  catch (e) { if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); throw e; }
}
const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await lanzar();
  const abrir = async (hash, ancho = 390) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID);
    await ctx.route('**/api/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: CAVA_API });
      if (u.pathname === '/api/montos') return r.fulfill({ json: MONTOS });
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.tab-top', { timeout: 40000 });
    await p.waitForTimeout(1200);
    return { ctx, p };
  };
  const distancia = (p, sel) => p.evaluate(sel => {
    const ref = document.querySelector('.sec-back-bar') ?? document.querySelector('.tab-top'), e = document.querySelector(sel);
    return e ? Math.round(e.getBoundingClientRect().top - ref.getBoundingClientRect().bottom) : null;
  }, sel);

  // ── 1 · distancia desde la cabecera ──
  const PRIMERO = { '': '.ficha-grupo', cava: '.sum-cards .sec-card', consumos: '.cs-cab', compras: '.sec-hero-num', valor: '[data-vi="cava"]', ...Object.fromEntries(SUBS.map(s => [s, '.cab'])) };
  const D = {};
  for (const w of [390, 1200]) for (const [h, sel] of Object.entries(PRIMERO)) {
    const { ctx, p } = await abrir(h ? '#' + h : '', w);
    D[`${h || 'inicio'}@${w}`] = await distancia(p, sel);
    if (SHOTS && w === 390) await p.screenshot({ path: join(SHOTS, `${h || 'inicio'}-390.png`), clip: { x: 0, y: 0, width: 390, height: 520 } });
    await ctx.close();
  }
  const ref = D['inicio@390'];
  check('1. el primer bloque de Inicio, Mi cava, Consumos, Compras y Valor, y el primer recuadro de cada subsección, a la distancia de la ficha del grupo (390 y 1200 px)',
    ref === 24 && Object.values(D).every(v => v === ref), JSON.stringify(D));

  // ── 2 · radios ──
  const radio = async (h, sels) => {
    const { ctx, p } = await abrir(h ? '#' + h : '', 390);
    const r = await p.evaluate(sels => Object.fromEntries(sels.map(s => [s, document.querySelector(s) ? getComputedStyle(document.querySelector(s)).borderRadius : null])), sels);
    await ctx.close();
    return r;
  };
  const R = { ...(await radio('', ['.ficha-grupo', '.num-card'])), ...(await radio('compras', ['[data-cm="cuotas"]'])), ...(await radio('cepas', ['.cab', '.tpanel'])), ...(await radio('catalogo', ['.bt-buscador input', '.bt-fbtn'])) };
  check('2. ficha del grupo, tarjeta del carrusel, Cuotas, recuadros de las subsecciones, buscador y filtros del Catálogo: el mismo radio que la tarjeta del carrusel',
    !!R['.num-card'] && Object.values(R).every(v => v === R['.num-card']), JSON.stringify(R));

  // ── 3 · Catálogo ──
  const { ctx: cc, p: pc } = await abrir('#catalogo', 390);
  if (SHOTS) await pc.screenshot({ path: join(SHOTS, 'catalogo-390.png'), clip: { x: 0, y: 0, width: 390, height: 640 } });
  const cat = await pc.evaluate(() => {
    const t = s => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
    return { bg: getComputedStyle(document.querySelector('.cab[data-cab="catalogo"]')).backgroundColor, num: [t('.cab[data-cab="catalogo"] .cab-num b'), t('.cab[data-cab="catalogo"] .cab-num span')].join(' '), sub: t('.cab[data-cab="catalogo"] .cab-sub'),
      datos: [...document.querySelectorAll('.cab[data-cab="catalogo"] .cab-dato')].map(d => [d.dataset.dato, d.querySelector('b').textContent, d.querySelector('span').textContent]),
      cuenta: !!document.querySelector('.bt-cuenta'), enc: !!document.querySelector('.bt-enc') };
  });
  await pc.fill('.bt-buscador input', 'Malbec'); await pc.press('.bt-buscador input', 'Enter'); await pc.waitForTimeout(300);
  const conBusqueda = await pc.evaluate(() => document.querySelector('.bt-cuenta')?.textContent.trim() ?? null);
  await cc.close();
  const n = x => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const st = API.stats, fs = st.formatos ?? [];
  const detalle = fs.map(f => `${/^\d+$/.test(f.formato) ? f.formato + ' ml' : f.formato.replace(/^(\D*\D)\s+[\d.,]+$/, '$1')} ${n(f.botellas)}`).join(' · ');
  const esperado = [['etiquetas', n(st.etiquetas), 'Etiquetas distintas'], ...(fs.length ? [['calibres', n(fs.reduce((s, f) => s + f.botellas, 0)), detalle]] : []), ['iconos', n(st.iconosEnGuarda), st.iconosEnGuarda === 1 ? 'Ícono' : 'Íconos']];
  check('3. Catálogo: recuadro de resumen grafito con botellas en guarda, etiquetas, calibres e íconos de /api/cava; el renglón de la cuenta sólo con un filtro o una búsqueda',
    cat.bg === 'rgb(69, 64, 58)' && cat.num === `${n(st.enGuarda)} botellas` && cat.sub === 'en guarda' && JSON.stringify(cat.datos) === JSON.stringify(esperado) && fs.length > 0
    && !cat.cuenta && !cat.enc && /^\d[\d.]* botellas · \d[\d.]* etiquetas$/.test(conBusqueda ?? ''), JSON.stringify({ cat, esperado, conBusqueda }));

  // ── 4 y 5 · pestaña activa entera a 320 px y "Mi cava" bordó ──
  const T = {};
  for (const h of SUBS) {
    const { ctx, p } = await abrir('#' + h, 320);
    T[h] = await p.evaluate(() => {
      const wrap = document.querySelector('.sec-chipbar-wrap').getBoundingClientRect(), on = document.querySelector('.sec-chip.on').getBoundingClientRect();
      const fades = [...document.querySelectorAll('.sec-chipbar-fade')].filter(f => getComputedStyle(f).opacity !== '0').map(f => f.getBoundingClientRect().width);
      const izq = document.querySelector('.sec-chipbar-wrap.corrida') ? fades[0] : 0, der = fades[fades.length - 1];
      const mi = document.querySelector('.appbar-item.on');
      return { entera: on.left >= wrap.left + izq - 0.5 && on.right <= wrap.right - der + 0.5, sobra: [Math.round(on.left - wrap.left), Math.round(wrap.right - on.right)], mi: mi?.textContent.trim(), color: mi ? getComputedStyle(mi).color : null };
    });
    if (SHOTS) await p.screenshot({ path: join(SHOTS, `pestanas-${h}-320.png`), clip: { x: 0, y: 60, width: 320, height: 60 } });
    await ctx.close();
  }
  check('4. a 320 px, al entrar a cada subsección la pestaña activa se ve entera, fuera de los degradés', SUBS.every(h => T[h].entera), JSON.stringify(T));
  check('5. "Mi cava" de la barra de abajo en el bordó activo (#6B1E2E) dentro de cada subsección', SUBS.every(h => T[h].mi === 'Mi cava' && T[h].color === 'rgb(107, 30, 46)'), JSON.stringify(T));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
