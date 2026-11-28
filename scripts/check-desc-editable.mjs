#!/usr/bin/env node
// Humo de "Panel Admin 6: el descuento se edita y el costo se calcula solo". Local en Chromium, SIN Airtable real (base en memoria + acciones reales de api/_lib/compras-admin.ts).
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-desc-editable.mjs
//   1. sugerido $145.200 + Desc. 45 → manda costo 79.860
//   2. "47,5" con sugerido $80.000 → manda costo 42.000
//   3. sin sugerido, Desc. muestra "—" y no se edita
//   4. en celular (320 y 390 px) el campo de Desc. entra sin partir nada
//   5. en "+ Agregar vino", sugerido 80.000 + Desc. 50 → el costo se completa en 40.000
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4251, BASE = `http://localhost:${PUERTO}`;
process.env.AIRTABLE_TOKEN = 'pat-de-prueba'; process.env.AIRTABLE_WRITE_TOKEN = 'pat-de-prueba';
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); return ok; };
const resultados = [];

async function cargarTs(ruta) {
  const { build } = await import('esbuild');
  const r = await build({ entryPoints: [join(ROOT, ruta)], bundle: true, platform: 'node', format: 'esm', write: false });
  const tmp = join(tmpdir(), `dsc-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(tmp, r.outputFiles[0].text, 'utf8');
  return import(pathToFileURL(tmp).href);
}

// ── el Airtable en memoria ──
const CAVA = 'recCava0000000001', OTRA = 'recCava0000000002', CAVA3 = 'recCava0000000003', TC = { '2026-10': 'recTCoctubre0000', '2026-08': 'recTCagosto0000a', '2026-09': 'recTCseptiem0000', [new Date().toISOString().slice(0, 7)]: 'recTChoy00000000' };
const DOL = { '2026-10': 1550, '2026-08': 1504, '2026-09': 1518, [new Date().toISOString().slice(0, 7)]: 1570 };
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
    bot('recB0000000000001', new Date().toISOString().slice(0, 7), 'Casa Uno', 2020, 2, 100000, 145200),
    bot('recB0000000000002', new Date().toISOString().slice(0, 7), 'Casa Dos', 2019, 1, 50000, 80000),
    bot('recB0000000000003', new Date().toISOString().slice(0, 7), 'Casa Sin Sugerido', 2018, 1, 0, 0),
    bot('recB0000000000004', new Date().toISOString().slice(0, 7), 'Casa Vino de Lista', 2017, 1, 30000, 60000),
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
  cava: { id: CAVA, numero: '#001', nombre: 'Barraquitas', tipo: 'grupal', fundacion: '2021-04-01', plan: 'Gran Reserva', cuotaUsd: 350, socios: [], enGuarda: 10, deuda: { n: 0, ars: 0, meses: 0 }, mesActual: { asignado: 340, disponible: 350, queda: 10, saldoAnterior: null, botellas: 12, arrastre: true, mes: '2026-08', cuota: 350, cerrado: true, dolar: 1504 },
    cuotaSocioUsd: 50, saldoInicial: 0, saldoDesde: '2026-08', cuotasDesde: '2026-08', notas: '', grupoId: null, mesesArs: [], guarda: [] } };
const CAVA_PUB = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const pedidos = [];

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetchReal(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  try { browser = await chromium.launch({ headless: true }); } catch (e) { if (existsSync('/opt/pw-browsers/chromium')) browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); else throw e; }
  const abrir = async (ancho, cavaId = CAVA) => {
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
          if (a === 'detail') return r.fulfill({ json: u.searchParams.get('cava') === CAVA3 ? { ...FICHA, cava: { ...FICHA.cava, id: CAVA3, mesActual: { ...FICHA.cava.mesActual, mes: HOY } } } : FICHA });
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
    await p.goto(`${BASE}/club/cava#admin/${cavaId}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('[data-adm="compras-mes"]', { timeout: 40000 });
    await p.waitForTimeout(400);
    return { ctx, p };
  };
  const sec = '[data-adm="compras-mes-sec"]';
  const abrirSec = async pg => { await pg.locator('[data-adm="compras-mes"]').click(); await pg.waitForSelector(`${sec} [data-linea]`, { timeout: 8000 }).catch(async e => { console.log(await pg.locator("body").innerText().then(t => t.slice(0, 600))); throw e; }); await pg.waitForTimeout(300); };
  const num = t => Number(String(t).replace(/[^\d]/g, ''));
  const costos = () => pedidos.filter(x => x.a === 'updateLinea' && x.cuerpo.campo === 'costo').map(x => [x.cuerpo.id, x.cuerpo.valor]);
  // ── 1 y 2 · compu: Desc. editable ──
  const { ctx, p } = await abrir(1200);
  await abrirSec(p);
  const f1 = p.locator(`${sec} [data-linea="recB0000000000001"]`), f2 = p.locator(`${sec} [data-linea="recB0000000000002"]`);
  const antes = await f1.locator('[data-celda="desc"]').inputValue();
  await f1.locator('[data-celda="desc"]').click(); await f1.locator('[data-celda="desc"]').fill('45'); await f1.locator('[data-celda="desc"]').press('Enter');
  await p.waitForFunction(() => document.querySelector('[data-linea="recB0000000000001"] [data-celda="costo"]').value.includes('79.860'));
  const d1 = await f1.locator('[data-celda="desc"]').inputValue();
  resultados.push(check('1. sugerido $145.200 + Desc. 45 → manda costo 79.860 (la fila muestra $79.860 y 45 %)',
    JSON.stringify(costos()) === JSON.stringify([['recB0000000000001', 79860]]) && antes === '31 %' && d1 === '45 %', JSON.stringify({ c: costos(), antes, d1 })));
  await f2.locator('[data-celda="desc"]').click();
  const foco = await f2.locator('[data-celda="desc"]').inputValue();
  await f2.locator('[data-celda="desc"]').fill('47,5'); await f2.locator('[data-celda="desc"]').press('Enter');
  await p.waitForFunction(() => document.querySelector('[data-linea="recB0000000000002"] [data-celda="costo"]').value.includes('42.000'));
  const fuera = costos().length;
  await f2.locator('[data-celda="desc"]').click(); await f2.locator('[data-celda="desc"]').fill('100'); await f2.locator('[data-celda="desc"]').press('Enter');
  await p.waitForTimeout(400);
  const volvio = await f2.locator('[data-celda="desc"]').inputValue();
  resultados.push(check('2. "47,5" con sugerido $80.000 → manda costo 42.000 (al tocar muestra 37,5; 100 no guarda y vuelve atrás)',
    costos()[1]?.[1] === 42000 && foco === '37,5' && fuera === 2 && costos().length === 2 && volvio === '48 %', JSON.stringify({ c: costos(), foco, volvio })));
  const f3 = p.locator(`${sec} [data-linea="recB0000000000003"] [data-desc]`);
  resultados.push(check('3. sin sugerido, Desc. muestra "—" y no es un campo editable',
    (await f3.textContent()).trim() === '—' && (await f3.locator('input').count()) === 0, await f3.innerHTML()));
  // ── 5 · + Agregar vino ──
  await p.locator(`${sec} [data-accion="agregar"]`).click();
  await p.locator(`${sec} .ac-busca-in`).fill('Casa Vino');
  await p.locator(`${sec} [data-vino-ref]`).first().click();
  await p.waitForSelector(`${sec} [data-adm="fila-nueva"]`);
  await p.locator('[data-nueva="sugerido"]').fill('80.000'); await p.locator('[data-nueva="desc"]').fill('50');
  const c5 = await p.locator('[data-nueva="costo"]').inputValue();
  await p.locator('[data-nueva="costo"]').fill('60.000');
  const d5 = await p.locator('[data-nueva="desc"]').inputValue();
  resultados.push(check('5. en "+ Agregar vino": sugerido 80.000 + Desc. 50 → costo 40.000; si se escribe el costo ($60.000) Desc. pasa a 25',
    c5 === '40000' && d5 === '25', JSON.stringify({ c5, d5 })));
  await ctx.close();
  // ── 4 · celular ──
  const vistas = [];
  for (const w of [320, 390]) {
    const { ctx: c, p: pc } = await abrir(w);
    await abrirSec(pc);
    vistas.push(await pc.evaluate(s => {
      const l = document.querySelector(s + ' [data-linea="recB0000000000002"]'), e = l.querySelector('[data-celda="desc"]'), r = l.getBoundingClientRect(), er = e.getBoundingClientRect();
      const lab = l.querySelector('.ac-desc label'), sp = lab.querySelector('span');
      return { scroll: document.documentElement.scrollWidth > innerWidth, dentro: er.left >= r.left && er.right <= r.right + 1 && er.width > 30, alto: Math.round(er.height), rotulo: Math.round(sp.getBoundingClientRect().height), fila: Math.round(lab.getBoundingClientRect().height),
        otros: [...l.querySelectorAll('.ac-grid input')].every(i => i.getBoundingClientRect().right <= r.right + 1) };
    }, sec));
    await c.close();
  }
  resultados.push(check('4. en celular, a 320 y 390 px, el campo de Desc. entra en la tarjeta, sin scroll ni rótulo partido y la grilla de Cant./Costo/Sugerido sigue adentro',
    vistas.every(v => !v.scroll && v.dentro && v.otros && v.rotulo < 20), JSON.stringify(vistas)));
} finally { await browser?.close().catch(() => {}); srv.kill(); }
const ok = resultados.filter(Boolean).length;
console.log(`\n${ok}/5`);
process.exit(ok === 5 ? 0 : 1);
