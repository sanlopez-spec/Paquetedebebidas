#!/usr/bin/env node
// Humo de "Panel Admin 3: compras del mes editables en la ficha de la cava". Local en Chromium, SIN tocar Airtable de producción:
// el Airtable es una base en memoria (se intercepta fetch) y las acciones son las reales de api/_lib/compras-admin.ts.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-admin-compras.mjs
//   1. la sección Compras aparece con las líneas del último mes y, con ‹, las del mes anterior; los totales suman las filas
//   2. editar un costo manda updateLinea y guarda pesos con el Tipo de cambio del mes y los USD históricos vacíos (la fila deja de estar marcada)
//   3. cantidad por debajo de las abiertas: 409 con el mensaje, el valor vuelve atrás, nada se escribe y el tachito está deshabilitado
//   4. el buscador devuelve vinos existentes y "+ Vino nuevo"; agregar uno existente copia sus datos y crea la línea en el mes
//   5. a 320 px: tarjetas sin scroll horizontal ni rótulos partidos (y a 390 px lo mismo)
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4221, BASE = `http://localhost:${PUERTO}`;
process.env.AIRTABLE_TOKEN = 'pat-de-prueba'; process.env.AIRTABLE_WRITE_TOKEN = 'pat-de-prueba';
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); return ok; };
const resultados = [];

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `admc-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}

// ── el Airtable en memoria ──
const CAVA = 'recCava0000000001', OTRA = 'recCava0000000002', TC = { '2026-08': 'recTCagosto0000a', '2026-09': 'recTCseptiem0000', [new Date().toISOString().slice(0, 7)]: 'recTChoy00000000' };
const DOL = { '2026-08': 1504, '2026-09': 1518, [new Date().toISOString().slice(0, 7)]: 1570 };
const F = { vino: 'fldUZflAbSpmIdK20', cava: 'fldekIJ54IKI1gd2R', bodega: 'fldsFEvABrBwU5fBn', anada: 'fldKC7gp51yfg7wtF', cepa: 'fldL0kHShpmW0EHc1', region: 'fldB48PO4izRD88LR', tipo: 'fldwvWtMUaBgKcsQP',
  formato: 'fld1BEs0Q3KVb3Na6', cantidad: 'fldm87g7J9lHhI8pM', fecha: 'fld9RAJzfNv0du6iW', pagadoArs: 'fld7kmHUsYsQrMPxv', sugeridoArs: 'fldhhYrxkUpjTKEb9', consumidas: 'fldD5WKffD2MD03z8',
  mesTc: 'fld8zKmDSDftsrf2K', tcValor: 'fldhi9rlfEJdnylCY', pagadoUsd: 'fldv4njMaHOaG2yOY', sugeridoUsd: 'fldDzDpsRhlBVetGQ', costoHist: 'fldJPYJKSz31wkRj5', sugeridoHist: 'fldFGPcRrjiciZyk7',
  origen: 'fldA3mlzf0ZkPy3nM', provincia: 'fld4xdlvVVkMasePd', linea: 'fldjrlB7S79dZzU00', icono: 'fld63GBOOkGiUMg0V', enGuarda: 'fldMTLDQLjYDZQRa2' };
const T = { botellas: 'tblZIXNa2Ck3DNCwS', cavas: 'tblMlk7zZG5WreEL5', cambio: 'tbl22foumsLmMopOs' };
let seq = 0;
const bot = (id, mes, vino, anada, cant, arsC, arsS, extra = {}, cava = CAVA) => ({ id, createdTime: '2026-01-01', fields: { [F.vino]: vino, [F.cava]: [cava], [F.bodega]: 'Kaiken', [F.anada]: anada, [F.cepa]: 'Cabernet Sauvignon', [F.region]: 'Mendoza',
  [F.provincia]: 'Mendoza', [F.tipo]: 'Tinto', [F.formato]: '750', [F.cantidad]: cant, [F.fecha]: `${mes}-01`, [F.origen]: 'Compra club', [F.mesTc]: [TC[mes]], [F.consumidas]: 0,
  ...(arsC ? { [F.pagadoArs]: arsC, [F.sugeridoArs]: arsS } : {}), ...extra } });
const DB = {
  [T.botellas]: [
    bot('recB0000000000001', '2026-08', 'Kaiken Ultra Cab. Sauv.', 2007, 6, 33800, 67700, { [F.consumidas]: 2 }),
    bot('recB0000000000002', '2026-08', 'Casa Yague Chardonnay', 2021, 3, 83100, 55400),
    bot('recB0000000000003', '2026-08', 'Kaiken Ultra Cab. Sauv.', 2015, 1, 0, 0, { [F.costoHist]: 22.5, [F.sugeridoHist]: 45 }),
    bot('recB0000000000004', '2026-08', 'Casa Yague Malbec', 2019, 2, 30000, 60000),
    bot('recB0000000000005', '2026-09', 'Nicasia', 2019, 4, 31000, 62000),
    bot('recB0000000000006', '2026-05', 'Kaiken Ultra Malbec', 2011, 1, 30000, 60000, { [F.cepa]: 'Malbec', [F.linea]: 'Ultra', [F.icono]: true }, OTRA),
  ],
  [T.cavas]: [{ id: CAVA, createdTime: '2026-01-01', fields: { fldfcZ0QRQmCQkWYo: 350, fldMPx4VJUx6kHPPr: 0, fldspJQEGYiEkmr8J: '2026-08-01' } }],
  [T.cambio]: Object.entries(TC).map(([mes, id]) => ({ id, createdTime: `2026-01-0${1 + Object.keys(TC).indexOf(mes)}`, fields: { fldQqnVlVgkMedg35: mes, fldUQpfvTQ5CzYSDC: DOL[mes] } })),
};
const escrituras = [];
// las fórmulas de Airtable que importan: TC valor, Pagado USD y Sugerido USD
function recalcular(r) {
  const f = r.fields, mes = String(f[F.fecha] ?? '').slice(0, 7), tc = f[F.mesTc]?.length ? DOL[Object.entries(TC).find(([, id]) => id === f[F.mesTc][0])?.[0]] : undefined;
  if (tc) f[F.tcValor] = tc; else delete f[F.tcValor];
  const usd = (hist, ars) => (hist ? hist : ars && tc ? ars / tc : undefined);
  const pu = usd(f[F.costoHist], f[F.pagadoArs]), su = usd(f[F.sugeridoHist], f[F.sugeridoArs]);
  if (pu !== undefined) f[F.pagadoUsd] = pu; else delete f[F.pagadoUsd];
  if (su !== undefined) f[F.sugeridoUsd] = su; else delete f[F.sugeridoUsd];
  f[F.enGuarda] = (f[F.cantidad] ?? 0) - (f[F.consumidas] ?? 0);
  void mes;
}
DB[T.botellas].forEach(recalcular);
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== 'api.airtable.com') return fetchReal(url, init);
  const [, , , tabla, id] = u.pathname.split('/');
  const filas = DB[tabla] ?? [];
  const metodo = init.method ?? 'GET';
  const resp = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'Content-Type': 'application/json' } });
  if (metodo === 'GET') {
    const fm = u.searchParams.get('filterByFormula') ?? '';
    const m1 = fm.match(/^RECORD_ID\(\)='(rec\w+)'$/), m2 = fm.match(/^\{Mes\}='([\d-]+)'$/);
    const sel = filas.filter(r => (m1 ? r.id === m1[1] : m2 ? r.fields.fldQqnVlVgkMedg35 === m2[1] : true));
    return resp({ records: sel.map(r => JSON.parse(JSON.stringify(r))) });
  }
  if (metodo === 'DELETE') { escrituras.push({ metodo, tabla, id }); DB[tabla] = filas.filter(r => r.id !== id); return resp({ id, deleted: true }); }
  const body = JSON.parse(init.body);
  const out = [];
  for (const rec of body.records) {
    escrituras.push({ metodo, tabla, id: rec.id, fields: rec.fields });
    if (metodo === 'PATCH') { const r = filas.find(x => x.id === rec.id); for (const [k, v] of Object.entries(rec.fields)) { if (v === null) delete r.fields[k]; else r.fields[k] = v; } if (tabla === T.botellas) recalcular(r); out.push(r); }
    else { const r = { id: `recNuevo${String(++seq).padStart(7, '0')}`, createdTime: new Date().toISOString(), fields: { ...rec.fields, [F.consumidas]: 0 } }; filas.push(r); if (tabla === T.botellas) recalcular(r); out.push(r); }
  }
  return resp({ records: out });
};

const M = await cargarTs('api/_lib/compras-admin.ts');
const err = e => ({ status: e?.estado ?? 500, error: e instanceof Error ? e.message : String(e) });

const SESION = { sesion: true, usuario: { nombre: 'Santiago', email: 'admin@example.com', admin: true }, cavas: [{ id: CAVA, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }] };
const HOY = new Date().toISOString().slice(0, 7);
const FICHA = { dolar: { mes: HOY, valor: 1570 }, hoy: `${HOY}-15`, mesHoy: HOY, usuarios: [], pagos: [],
  cava: { id: CAVA, numero: '#001', nombre: 'Barraquitas', tipo: 'grupal', fundacion: '2021-04-01', plan: 'Gran Reserva', cuotaUsd: 350, socios: [], enGuarda: 10, deuda: { n: 0, ars: 0, meses: 0 }, mesActual: null,
    cuotaSocioUsd: 50, saldoInicial: 0, saldoDesde: '2026-08', cuotasDesde: '2026-08', notas: '', grupoId: null, mesesArs: [], guarda: [] } };
const CAVA_PUB = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const pedidos = [];

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  try { browser = await chromium.launch({ headless: true }); } catch (e) { if (existsSync('/opt/pw-browsers/chromium')) browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); else throw e; }
  const abrir = async ancho => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, CAVA);
    await ctx.route('**/api/**', async r => {
      const u = new URL(r.request().url()), a = u.searchParams.get('action');
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: CAVA_PUB });
      if (u.pathname === '/api/admin-cavas') {
        const cuerpo = r.request().postData() ? JSON.parse(r.request().postData()) : null;
        if (cuerpo) pedidos.push({ a, cuerpo });
        try {
          if (a === 'detail') return r.fulfill({ json: FICHA });
          if (a === 'list') return r.fulfill({ json: { dolar: FICHA.dolar, mesHoy: HOY, cavas: [], usuarios: [], totales: { cavas: 0, grupales: 0, individuales: 0, catalogo: 0, socios: 0, cuotaUsd: 0, deudaArs: 0, deudores: 0 } } });
          if (a === 'comprasMes') return r.fulfill({ json: await M.comprasMes(u.searchParams.get('cava'), u.searchParams.get('mes') || undefined) });
          if (a === 'vinos') return r.fulfill({ json: await M.vinos(u.searchParams.get('q')) });
          if (a === 'updateLinea') return r.fulfill({ json: await M.updateLinea(cuerpo.id, cuerpo.campo, cuerpo.valor) });
          if (a === 'addLinea') return r.fulfill({ json: await M.addLinea(cuerpo) });
          if (a === 'deleteLinea') return r.fulfill({ json: await M.deleteLinea(cuerpo.id) });
        } catch (e) { const x = err(e); return r.fulfill({ status: x.status, json: { error: x.error } }); }
      }
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/club/cava#admin/${CAVA}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-adm="compras-mes-sec"] [data-linea]', { timeout: 40000 });
    await p.waitForTimeout(400);
    return { ctx, p };
  };
  const sec = '[data-adm="compras-mes-sec"]';
  const num = t => Number(String(t).replace(/[^\d]/g, ''));
  const { ctx, p } = await abrir(1200);

  // ── 1 ──
  const sep = await p.evaluate(s => ({ rot: document.querySelector(s + ' [data-cm="rot"]').textContent, filas: document.querySelectorAll(s + ' [data-linea]').length }), sec);
  await p.locator(`${sec} [data-cm="prev"]`).click();
  await p.waitForFunction(s => /AGOSTO/.test(document.querySelector(s + ' [data-cm="rot"]').textContent), sec);
  await p.waitForSelector(`${sec} [data-linea]`);
  const ago = await p.evaluate(s => {
    const filas = [...document.querySelectorAll(s + ' tbody tr')].map(t => ({ c: Number(t.querySelector('[data-celda="cant"]').value), co: t.querySelector('[data-celda="costo"]').value, su: t.querySelector('[data-celda="sugerido"]').value }));
    const tot = [...document.querySelectorAll(s + ' tfoot td')].map(x => x.textContent);
    return { rot: document.querySelector(s + ' [data-cm="rot"]').textContent, filas, tot, aho: document.querySelector(s + ' [data-fila="ahorro"]').textContent, pie: document.querySelector(s + ' [data-fila="pie"]').textContent };
  }, sec);
  const n = x => num(x);
  const sumaC = ago.filas.reduce((t, f) => t + f.c * n(f.co), 0), sumaS = ago.filas.reduce((t, f) => t + f.c * n(f.su), 0);
  resultados.push(check('1. la sección Compras arranca en el último mes (septiembre), con ‹ muestra agosto con sus 4 líneas, y el total del mes = suma de las filas (con presupuesto al pie)',
    /SEPTIEMBRE 2026 · 4 BOTELLAS/.test(sep.rot) && sep.filas === 1 && /AGOSTO 2026 · 12 BOTELLAS/.test(ago.rot) && ago.filas.length === 4 && n(ago.tot[3]) === sumaC && n(ago.tot[4]) === sumaS
      && /^Ahorro club/.test(ago.aho) && /Presupuesto de agosto/.test(ago.pie) && /asignado \d+ %/.test(ago.pie), JSON.stringify({ sep, ago, sumaC, sumaS })));

  // ── 2 ── editar el costo de Casa Yague (el error de carga)
  const fila = p.locator(`${sec} [data-linea="recB0000000000002"]`);
  const antes = await fila.evaluate(t => ({ alerta: t.classList.contains('alerta'), desc: t.querySelector('[data-desc]').textContent }));
  await fila.locator('[data-celda="costo"]').click();
  await fila.locator('[data-celda="costo"]').fill('$27.700');
  await fila.locator('[data-celda="costo"]').press('Enter');
  await p.waitForFunction(() => document.querySelector('[data-linea="recB0000000000002"] [data-celda="costo"]').value.includes('27.700'));
  await p.waitForTimeout(300);
  const despues = await fila.evaluate(t => ({ alerta: t.classList.contains('alerta'), desc: t.querySelector('[data-desc]').textContent, valor: t.querySelector('[data-celda="costo"]').value }));
  const pedido = pedidos.find(x => x.a === 'updateLinea' && x.cuerpo.id === 'recB0000000000002');
  const patch = escrituras.find(e => e.metodo === 'PATCH' && e.id === 'recB0000000000002');
  resultados.push(check('2. editar un costo manda updateLinea (pesos), guarda Pagado/Sugerido ARS con el Tipo de cambio del mes y vacía los USD históricos; la fila deja de estar marcada y recalcula el descuento',
    pedido?.cuerpo.campo === 'costo' && pedido.cuerpo.valor === 27700 && patch?.fields[F.pagadoArs] === 27700 && patch.fields[F.sugeridoArs] === 55400 && patch.fields[F.mesTc]?.[0] === TC['2026-08']
      && patch.fields[F.costoHist] === null && patch.fields[F.sugeridoHist] === null && antes.alerta && !despues.alerta && despues.desc !== antes.desc,
    JSON.stringify({ pedido, patch, antes, despues })));

  // ── 3 ── cantidad por debajo de las abiertas
  const kai = p.locator(`${sec} [data-linea="recB0000000000001"]`);
  const nEscr = escrituras.length;
  await kai.locator('[data-celda="cant"]').click();
  await kai.locator('[data-celda="cant"]').fill('1');
  await kai.locator('[data-celda="cant"]').press('Enter');
  await p.waitForSelector(`${sec} [data-linea-err="recB0000000000001"]`);
  const e3 = await p.evaluate(s => ({ msg: document.querySelector(s + ' [data-linea-err]').textContent, valor: document.querySelector(s + ' [data-linea="recB0000000000001"] [data-celda="cant"]').value,
    tachoOff: document.querySelector(s + ' [data-linea="recB0000000000001"] [data-accion="borrar"]').disabled, tachoTitulo: document.querySelector(s + ' [data-linea="recB0000000000001"] [data-accion="borrar"]').title }), sec);
  let r409 = null; try { await M.updateLinea('recB0000000000001', 'cantidad', 1); } catch (e) { r409 = { estado: e.estado, msg: e.message }; }
  resultados.push(check('3. cantidad por debajo de las abiertas: 409 "Ya se abrieron 2 botellas de esta línea", el valor vuelve a 6, no se escribe nada y el tachito está deshabilitado con el motivo',
    r409?.estado === 409 && /Ya se abrieron 2 botellas de esta línea/.test(e3.msg) && e3.valor === '6' && escrituras.length === nEscr && e3.tachoOff && /Ya se abrieron 2/.test(e3.tachoTitulo), JSON.stringify({ r409, e3 })));

  // ── 4 ── buscador y agregar
  await p.locator(`${sec} [data-accion="agregar"]`).click();
  await p.locator(`${sec} [aria-label="Buscar vino"]`).fill('kaiken ultra');
  await p.waitForSelector(`${sec} [data-accion="vino-nuevo"]`);
  const res = await p.evaluate(s => ({ vinos: [...document.querySelectorAll(s + ' .ac-res-i:not(.nuevo)')].map(x => x.textContent), nuevo: document.querySelector(s + ' .ac-res-i.nuevo').textContent }), sec);
  await p.locator(`${sec} [data-vino-ref="recB0000000000006"]`).click();
  await p.locator(`${sec} [data-nueva="anada"]`).fill('2012');
  await p.locator(`${sec} [data-nueva="cantidad"]`).fill('2');
  await p.locator(`${sec} [data-nueva="costo"]`).fill('35000');
  await p.locator(`${sec} [data-nueva="sugerido"]`).fill('70000');
  await p.locator(`${sec} [data-adm="fila-nueva"] button[type="submit"]`).click();
  await p.waitForSelector(`${sec} tbody tr:nth-child(5)`, { timeout: 3000 }).catch(() => {});
  const alta = escrituras.find(e => e.metodo === 'POST' && e.tabla === T.botellas);
  resultados.push(check('4. el buscador devuelve vinos existentes (con bodega · cepa · región) y "+ Vino nuevo"; al elegir uno se crea la línea en el mes con su nombre exacto y sus datos copiados',
    res.vinos.some(v => /Kaiken Ultra Malbec/.test(v) && /Kaiken · Malbec · Mendoza/.test(v)) && /Vino nuevo/.test(res.nuevo)
      && alta?.fields[F.vino] === 'Kaiken Ultra Malbec' && alta.fields[F.fecha] === '2026-08-01' && alta.fields[F.origen] === 'Compra club' && alta.fields[F.cepa] === 'Malbec' && alta.fields[F.linea] === 'Ultra'
      && alta.fields[F.icono] === true && alta.fields[F.pagadoArs] === 35000 && alta.fields[F.mesTc]?.[0] === TC['2026-08'] && alta.fields[F.cava]?.[0] === CAVA, JSON.stringify({ res, alta })));
  await ctx.close();

  // ── 5 ── celular
  const vistas = [];
  for (const w of [320, 390]) {
    const { ctx: c2, p: p2 } = await abrir(w);
    await p2.locator(`${sec} [data-cm="prev"]`).click();
    await p2.waitForFunction(s => /AGOSTO/.test(document.querySelector(s + ' [data-cm="rot"]').textContent), sec);
    await p2.waitForSelector(`${sec} .ac-lin`);
    vistas.push({ w, ...(await p2.evaluate(s => {
      const rotulos = [...document.querySelectorAll(s + ' .ac-grid label span, ' + s + ' .sf-rot')];
      return { scroll: document.documentElement.scrollWidth > innerWidth, tarjetas: document.querySelectorAll(s + ' .ac-lin').length, tabla: !!document.querySelector(s + ' .ac-tabla'),
        partidos: rotulos.filter(e => e.getBoundingClientRect().height > 1.6 * parseFloat(getComputedStyle(e).fontSize) * 1.2).map(e => e.textContent),
        fuera: [...document.querySelectorAll(s + ' .ac-lin .ac-e, ' + s + ' .ac-aho, ' + s + ' .mp-l')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).length,
        pie: [...document.querySelectorAll(s + ' .mp-l span')].map(x => x.textContent) };
    }, sec)) });
    await c2.close();
  }
  resultados.push(check('5. a 320 y 390 px: una tarjeta por línea, sin tabla, sin scroll horizontal, nada fuera de pantalla ni rótulos partidos, y el pie con "A precio sugerido" y "Al costo"',
    vistas.every(v => !v.scroll && v.tarjetas === 5 && !v.tabla && v.partidos.length === 0 && v.fuera === 0 && v.pie.join('|') === 'A precio sugerido|Al costo'), JSON.stringify(vistas)));
} finally { await browser?.close().catch(() => {}); srv.kill(); }
const ok = resultados.filter(Boolean).length;
console.log(`\n${ok}/5`);
process.exit(ok === 5 ? 0 : 1);
