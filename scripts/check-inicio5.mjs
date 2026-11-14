#!/usr/bin/env node
// Humo de la ronda "Bugs Inicio 5": caja de Compras sin compras, tarjeta Valor con las medidas de Compras, caja del gráfico
// de Valor sin hueco arriba y "Ver ›" centrado con el rótulo. Local en Chromium, cava #001.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-inicio5.mjs
// No usa Airtable: la sesión, /api/cava (el JSON de respaldo de la #001 con sus compras) y /api/montos se contestan acá,
// con el caso que hizo volver la caja vieja: la cava sin cuota cargada (compras.meses vacío) y nada asignado en noviembre.
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4205, BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

const M = { pagaste: 10000, valorHoy: 13500, ahorroClub: 1200, sumaGuarda: 900 };
const MONTOS = {
  dolar: { mes: '2026-11', valor: 1475 }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { meses: [], porMes: {}, ultimas: [], club: { botellas: 583, desde: '2021-05', costo: 11400, sugerido: 12600 }, regalos: [], cuotas: null },
  informe: {
    valorCava: 15400, compras: 11400, porcentaje: 35, guarda: 900, tomado: 4200, ahorro: 1200, enGuardaTodas: 300, abiertasTodas: 280,
    botellasTomadas: 280, botellasEnCava: 300, tuParte: { valorCava: 2200, compras: 1630 }, presupuestoMes: null, mesEnCurso: '2026-11', asignadoMes: 0, comprasPorMes: {},
    serie: ['2025-11', '2026-02', '2026-05', '2026-08', '2026-11'].map((mes, i) => ({ mes, compras: 5000 + i * 1600, tomado: 1000 + i * 800, cava: 6000 + i * 2300 })),
  },
  cava: { id: ID_001, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7 }, total: M, tuParte: M, porEtiqueta: {},
};
const CAVA_API = {
  ...CAVA,
  compras: [{ mes: '2021-05', botellas: 569, etiquetas: [] }, { mes: '2026-09', botellas: 14, etiquetas: [] }],
  ultimaCompra: { mes: '2026-09', botellas: 14 },
  ultimaJuntada: { mes: '2026-10', botellas: 3, resto: 0, vinos: [{ vino: 'Mastrantonio 63 Premium Petit Verdot', anada: 2015, vivino: 4.1 }] },
};
const SESION = { sesion: true, usuario: { nombre: 'Prueba', email: 'prueba@example.com', admin: false },
  cavas: [{ id: ID_001, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }] };

async function lanzar() {
  try { return await chromium.launch({ headless: true }); }
  catch (e) { if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); throw e; }
}

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await lanzar();
  async function medir(ancho) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 844 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
    await ctx.route('**/api/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: CAVA_API });
      if (u.pathname === '/api/montos') return r.fulfill({ json: MONTOS });
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => /\d/.test(document.querySelector('[data-tv="cabecera"] b')?.textContent ?? ''), null, { timeout: 40000 });
    await p.waitForSelector('[data-bloque="compras"] .sec-card', { timeout: 40000 });
    await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      const R = e => e.getBoundingClientRect(), cs = e => getComputedStyle(e);
      const comp = document.querySelector('[data-bloque="compras"] .sec-card');
      const cab = document.querySelector('[data-tv="cabecera"]');
      const caja = comp.nextElementSibling;
      const tv = document.querySelector('.tv.tv-con-cab'), ley = tv.querySelector('.tv-leyenda');
      const n583 = comp.querySelector('.sec-card-big b'), nVal = cab.querySelector('.sec-card-big b');
      const tarjetas = [...document.querySelectorAll('.sec-card')].filter(c => c.offsetParent && c.querySelector(':scope > .sec-card-pill'));
      const centros = tarjetas.map(c => {
        const l = c.querySelector('.sec-card-label'), pl = c.querySelector(':scope > .sec-card-pill');
        return { t: l.textContent.trim(), d: Math.abs((R(pl).top + R(pl).height / 2) - (R(l).top + R(l).height / 2)) };
      });
      return {
        cajaTxt: caja.textContent.trim(),
        f583: [cs(n583).fontSize, cs(n583).lineHeight], fVal: [cs(nVal).fontSize, cs(nVal).lineHeight],
        leyTop: R(ley).top - R(tv).top - parseFloat(cs(tv).borderTopWidth), padLat: parseFloat(cs(tv).paddingLeft),
        centros,
        desb: [cab, ...cab.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth).map(e => `${e.className || e.tagName} ${e.scrollWidth}/${e.clientWidth}`),
      };
    });
    await ctx.close();
    return m;
  }
  const a = await medir(390), b = await medir(320);
  console.log(`  "583" ${a.f583.join(' / ')} · monto Valor ${a.fVal.join(' / ')} · leyenda a ${a.leyTop}px (padding lateral ${a.padLat}px) · tarjetas con "Ver ›": ${a.centros.length}`);
  check('1. la caja de Compras dice "Estamos eligiendo tus vinos de este mes." y no "Presupuesto del mes"',
    a.cajaTxt.includes('Estamos eligiendo tus vinos de este mes.') && !a.cajaTxt.includes('Presupuesto del mes'), a.cajaTxt);
  check('2. el monto de Valor tiene el font-size y el line-height del "583"', a.fVal[0] === a.f583[0] && a.fVal[1] === a.f583[1], `${a.fVal} vs ${a.f583}`);
  check('3. la leyenda del gráfico de Valor arranca a la distancia del padding lateral (±2 px)', Math.abs(a.leyTop - a.padLat) <= 2, `${a.leyTop} vs ${a.padLat}`);
  const malos = a.centros.filter(c => c.d > 1);
  check('4. en las 9 tarjetas del Inicio el óvalo "Ver ›" está centrado con el rótulo (≤ 1 px)', a.centros.length === 9 && malos.length === 0,
    `${a.centros.length} tarjetas; ${malos.map(c => `${c.t} ${c.d.toFixed(2)}`).join(', ')}`);
  check('5. a 320 px nada de la tarjeta Valor desborda', b.desb.length === 0, b.desb.join(', '));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
