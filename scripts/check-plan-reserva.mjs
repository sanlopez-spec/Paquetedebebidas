#!/usr/bin/env node
// Humo de "Valor ronda 7: plan por persona e invitación a Gran Reserva". Local, sin Airtable ni producción.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-plan-reserva.mjs [--shots <carpeta>]
// Corre api/montos.ts y el Panel Admin (api/_lib/panel.ts) reales con un Airtable simulado y una sesión firmada acá (clave de prueba).
// La pantalla se prueba en Chromium con /api/montos contestado desde el navegador.
//   1. Bruno pone USD 50 en Barraquitas (350 / 7) y USD 50 en su cava personal: su cava personal es Gran Reserva (tope 40 %) en
//      /api/montos y en el Panel Admin
//   2. una cava individual de USD 50 cuyo dueño no tiene otras cavas: Reserva (tope 30 %), en /api/montos y en el panel
//   3. la tarjeta de Gran Reserva aparece en plan Reserva y no en Gran Reserva ni en una cava sin cuota; ya no está "Subí de plan"
//   4. el botón abre WhatsApp de EDB con "Hola Santiago, quiero pasar mi cava a Gran Reserva." en pestaña nueva; la × la oculta y
//      sigue oculta al volver a entrar
//   5. a 320 px nada partido ni superpuesto: "de descuento en tu vino", el 40 %, el botón y la marca en un renglón; la × no pisa la
//      marca; sin scroll horizontal
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4221, BASE = `http://localhost:${PUERTO}`;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargar(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `plan-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}

// ── Airtable simulado: Barraquitas (grupal, USD 350, 7 miembros), la cava personal de Bruno (USD 50) y la de Sole (USD 50, sin otras) ──
process.env.SESSION_SECRET = 'clave-de-prueba-local-'.padEnd(40, 'x');
process.env.AIRTABLE_TOKEN = 'simulado';
const S = await cargar('api/_lib/sesion.ts');
const { FLD, TBL } = S;
const id = s => ('rec' + s).padEnd(17, 'x').slice(0, 17);
const U = { bruno: id('Bruno'), sole: id('Sole') }, G1 = id('GrupoBarraq'), C = { barraq: id('CavaBarraq'), bruno: id('CavaBruno'), sole: id('CavaSole') };
const TABLAS = {
  [TBL.usuarios]: [{ id: U.bruno, fields: { [FLD.uNombre]: 'Bruno', [FLD.uEmail]: 'bruno@example.com' } }, { id: U.sole, fields: { [FLD.uNombre]: 'Sole', [FLD.uEmail]: 'sole@example.com' } }],
  [TBL.grupos]: [{ id: G1, fields: { [FLD.gMiembros]: 7, [FLD.gNombre]: 'Barraquitas' } }],
  [TBL.membresias]: [{ id: id('Memb1'), fields: { [FLD.mUsuario]: [U.bruno], [FLD.mGrupo]: [G1], [FLD.mRol]: 'Miembro' } },
    ...Array.from({ length: 6 }, (_, i) => ({ id: id('MembOtro' + i), fields: { [FLD.mUsuario]: [id('Socio' + i)], [FLD.mGrupo]: [G1], [FLD.mRol]: 'Miembro' } }))],
  [TBL.cavas]: [
    { id: C.barraq, fields: { [FLD.cNombre]: 'Cava #001', [FLD.cTipo]: 'Grupal', [FLD.cGrupo]: [G1], [FLD.cCuota]: 350 } },
    { id: C.bruno, fields: { [FLD.cNombre]: 'Cava #014', [FLD.cTipo]: 'Individual', [FLD.cUsuario]: [U.bruno], [FLD.cCuota]: 50 } },
    { id: C.sole, fields: { [FLD.cNombre]: 'Cava #015', [FLD.cTipo]: 'Individual', [FLD.cUsuario]: [U.sole], [FLD.cCuota]: 50 } },
  ],
};
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== 'api.airtable.com') return new Response('sin red en la prueba', { status: 503 });
  if (String(op.method ?? 'GET').toUpperCase() !== 'GET') return new Response(JSON.stringify({ records: [] }), { status: 200 });
  let recs = TABLAS[u.pathname.split('/').pop()] ?? [];
  const f = u.searchParams.get('filterByFormula') ?? '';
  const ids = [...f.matchAll(/RECORD_ID\(\)='(\w+)'/g)].map(m => m[1]);
  if (ids.length) recs = recs.filter(r => ids.includes(r.id)); else if (f === 'FALSE()') recs = [];
  return new Response(JSON.stringify({ records: recs }), { status: 200 });
};
const montos = (await cargar('api/montos.ts')).default;
const panel = await cargar('api/_lib/panel.ts');
const pedir = async (usuario, cava) => {
  const cookie = `${S.COOKIE_SESION}=${encodeURIComponent(S.firmar({ u: usuario, x: Date.now() + 3600_000 }, 'sesion'))}`;
  let estado = 200, cuerpo = null;
  await montos({ method: 'GET', query: { cava }, headers: { cookie } }, { setHeader() {}, status(e) { estado = e; return this; }, json(b) { cuerpo = b; return this; }, end() { return this; } });
  return { estado, plan: cuerpo?.informe?.plan, tope: cuerpo?.informe?.topePlan, presupuesto: cuerpo?.informe?.presupuestoMes, error: cuerpo?.error };
};
const brunoPersonal = await pedir(U.bruno, C.bruno), brunoGrupal = await pedir(U.bruno, C.barraq), sole = await pedir(U.sole, C.sole);
const base = await panel.cargarBase().catch(e => ({ error: String(e) }));
const planPanel = cid => base.cavas?.find(c => c.id === cid)?.plan;
globalThis.fetch = fetchReal;
check('1. Bruno (USD 50 en Barraquitas + USD 50 propios): su cava personal es Gran Reserva, tope 40 %, en /api/montos y en el panel',
  brunoPersonal.estado === 200 && brunoPersonal.plan === 'Gran Reserva' && brunoPersonal.tope === 40 && brunoPersonal.presupuesto === 50
  && brunoGrupal.plan === 'Gran Reserva' && planPanel(C.bruno) === 'Gran Reserva', JSON.stringify({ brunoPersonal, brunoGrupal, panel: planPanel(C.bruno), err: base.error }));
check('2. una individual de USD 50 sin otras cavas: Reserva, tope 30 %, en /api/montos y en el panel',
  sole.estado === 200 && sole.plan === 'Reserva' && sole.tope === 30 && planPanel(C.sole) === 'Reserva', JSON.stringify({ sole, panel: planPanel(C.sole) }));

// ── la pantalla ──
const ID = 'rec7kgfT9LXzYPy6a';
const CAVA = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const informe = (plan, tope, cuota) => ({
  valorCava: 15400, compras: 11400, porcentaje: 35, guarda: 900, tomado: 4200, ahorro: 1200, enGuardaTodas: 300, abiertasTodas: 280, botellasTomadas: 280, botellasEnCava: 300,
  tuParte: { valorCava: 15400, compras: 11400 }, presupuestoMes: cuota, mesEnCurso: '2026-11', asignadoMes: 0, comprasPorMes: {},
  serie: ['2025-11', '2026-02', '2026-05', '2026-08', '2026-11'].map((mes, i) => ({ mes, compras: 5000 + i * 1600, tomado: 1000 + i * 800, cava: 6000 + i * 2300 })),
  descuento: { pct: 31, costo: 11400, sugerido: 16500, ahorro: 5100, botellas: 120, porAnio: [{ anio: 2025, pct: 31, botellas: 120 }] }, crecieron: [], crecieronN: 0, plan, topePlan: tope,
});
const MONTOS = (plan, tope, cuota) => ({ dolar: { mes: '2026-11', valor: 1475 }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { meses: [], porMes: {}, ultimas: [], club: { botellas: 120, desde: '2024-05', costo: 11400, sugerido: 16500 }, regalos: [], cuotas: null },
  informe: informe(plan, tope, cuota), cava: { id: ID, nombre: 'Cava #014', tipo: 'Individual', miembros: 1 }, total: Z, tuParte: Z, porEtiqueta: {} });
const SESION = { sesion: true, usuario: { nombre: 'Bruno', email: 'bruno@example.com', admin: false },
  cavas: [{ id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }] };
// (la pantalla se abre en la #001, la cava pública: con otra cava la app vuelve al Inicio al cambiar de cava. El plan lo decide /api/montos.)

async function lanzar() {
  try { return await chromium.launch({ headless: true }); }
  catch (e) { if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); throw e; }
}
const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await lanzar();
  const abrir = async (montosJson, ancho = 390, ctxPrevio = null) => {
    const ctx = ctxPrevio ?? await browser.newContext({ viewport: { width: ancho, height: 900 } });
    if (!ctxPrevio) {
      await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID);   // cada contexto arranca con el almacenamiento vacío
      await ctx.route('**/api/**', r => {
        const u = new URL(r.request().url());
        if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
        if (u.pathname === '/api/cava') return r.fulfill({ json: CAVA });
        if (u.pathname === '/api/montos') return r.fulfill({ json: ctx.montos });
        return r.fulfill({ status: 404, json: { error: 'no hay' } });
      });
    }
    ctx.montos = montosJson;
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava#valor', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-vi="descuento"]', { timeout: 40000 });
    await p.waitForTimeout(500);
    return { ctx, p };
  };
  const hay = p => p.evaluate(() => ({ tarjeta: !!document.querySelector('[data-vi="gran-reserva"]'), subir: !!document.querySelector('[data-vi="subir"]') || /Subí de plan/.test(document.body.innerText) }));

  // ── 3 · cuándo aparece ──
  const enReserva = await abrir(MONTOS('Reserva', 30, 50));
  const r = await hay(enReserva.p); await enReserva.ctx.close();
  const enGran = await abrir(MONTOS('Gran Reserva', 40, 50));
  const g = await hay(enGran.p); await enGran.ctx.close();
  const sinCuota = await abrir(MONTOS('Reserva', 30, null));
  const s = await hay(sinCuota.p); await sinCuota.ctx.close();
  check('3. la tarjeta aparece en plan Reserva y no en Gran Reserva ni en una cava sin cuota; ya no está "Subí de plan"',
    r.tarjeta && !g.tarjeta && !s.tarjeta && !r.subir && !g.subir && !s.subir, JSON.stringify({ reserva: r, gran: g, sinCuota: s }));

  // ── 4 · WhatsApp y × ──
  const { ctx: c4, p: p4 } = await abrir(MONTOS('Reserva', 30, 50));
  const link = await p4.evaluate(() => { const a = document.querySelector('[data-vi="gr-wa"]'); return { href: a.href, target: a.target, rel: a.rel, alto: Math.round(a.getBoundingClientRect().height) }; });
  await p4.click('[data-vi="gr-x"]'); await p4.waitForTimeout(200);
  const trasX = await p4.evaluate(() => !!document.querySelector('[data-vi="gran-reserva"]'));
  await p4.close();
  const { p: p4b } = await abrir(MONTOS('Reserva', 30, 50), 390, c4);
  const alVolver = await p4b.evaluate(() => !!document.querySelector('[data-vi="gran-reserva"]'));
  await c4.close();
  const esperado = `https://wa.me/5491165803342?text=${encodeURIComponent('Hola Santiago, quiero pasar mi cava a Gran Reserva.')}`;
  check('4. el botón abre WhatsApp de EDB con el mensaje en pestaña nueva (44 px de alto); la × la oculta y sigue oculta al volver a entrar',
    link.href === esperado && link.target === '_blank' && /noopener/.test(link.rel) && link.alto === 44 && !trasX && !alVolver, JSON.stringify({ link, esperado, trasX, alVolver }));

  // ── 5 · 320 px ──
  const { ctx: c5, p: p5 } = await abrir(MONTOS('Reserva', 30, 50), 320);
  await p5.addStyleTag({ content: '.appbar{display:none!important}' });
  if (SHOTS) await p5.locator('[data-vi="descuento"]').screenshot({ path: join(SHOTS, 'gran-reserva-320.png') });
  const m = await p5.evaluate(() => {
    const R = s => document.querySelector(s).getBoundingClientRect();
    const renglones = s => { const e = document.querySelector(s); return Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)); };
    const marca = R('.vi-gr-marca'), x = R('[data-vi="gr-x"]');
    // el texto de la marca (no su caja): el rango de sus letras
    const rg = document.createRange(); rg.selectNodeContents(document.querySelector('.vi-gr-marca')); const letras = rg.getBoundingClientRect();
    return { titulo: renglones('.vi-gr-t'), pct: Math.round(R('[data-vi="gr-pct"]').height), pctLinea: Math.round(parseFloat(getComputedStyle(document.querySelector('[data-vi="gr-pct"]')).lineHeight)),
      boton: Math.round(R('[data-vi="gr-wa"]').height), marca: Math.round(marca.height), xPisa: letras.right > x.left, chica: renglones('.vi-gr-s'),
      letra: renglones('.vi-gr-letra'), desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  await c5.close();
  check('5. a 320 px nada partido ni superpuesto: título, 40 %, botón, marca y letra chica en su renglón; la × no pisa la marca; sin scroll horizontal',
    m.titulo === 1 && m.pct <= m.pctLinea + 1 && m.boton === 44 && m.marca <= 18 && !m.xPisa && m.chica === 2 && m.letra === 1 && !m.desborda, JSON.stringify(m));
} catch (e) { console.error('Error del script:', e.message); results.push(false); }
finally {
  if (browser) await browser.close().catch(() => {});
  try { srv.kill(); } catch {}
  const bien = results.length === 5 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  process.exit(bien ? 0 : 1);
}
