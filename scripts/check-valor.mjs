#!/usr/bin/env node
// Humo de la tarjeta "Valor de la cava" (Inicio). Una corrida local en Chromium, nada en producción.
//
//   npx vite build && node scripts/check-valor.mjs
//
// Levanta `vite preview` sobre dist/, ejecuta api/cava.ts y las cuentas reales de api/_lib/valor.ts
// (con AIRTABLE_TOKEN de .env.local) y se las sirve a la página como /api/cava y /api/montos.
// Más: eje X sólo con eneros (y el año inicial si faltan 6+ meses), Presupuesto/Asignado y monto por mes en Compras.
// Chequeos 1 a 5: (1) socio ve USD 27.339 y +35%; (2) el último punto de la serie = valorCava;
// (3) el tope del bordó queda por encima de Compras y el del verde llega a bordó + tomado;
// (4) la línea Compras se dibuja por encima de las dos áreas; (5) sin sesión no hay montos ni gráfico.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4181;
const BASE = `http://localhost:${PUERTO}`;
const CAVA_ID = 'recAAAAAAAAAAAAAA';

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2];
}
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); };

async function cargarTs(ruta) {
  const { transform } = await import('esbuild');
  const { code } = await transform(readFileSync(join(ROOT, ruta), 'utf8'), { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `valor-${Date.now()}-${Math.random().toString(36).slice(2)}.mjs`);
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

// ── datos reales: /api/cava y el informe de valor ──
const { default: cavaHandler } = await cargarTs('api/cava.ts');
let cavaBody = null;
await cavaHandler({}, { setHeader() {}, status() { return this; }, json(b) { cavaBody = b; return this; } });
const { calcularValor } = await cargarTs('api/_lib/valor.ts');
const s1 = v => Array.isArray(v) ? String(v[0] ?? '') : (v && v.name) || String(v ?? '');
const n = v => Number(Array.isArray(v) ? v[0] : v) || 0;
const B = await listar('tblZIXNa2Ck3DNCwS', ['fldA3mlzf0ZkPy3nM', 'fldm87g7J9lHhI8pM', 'fldMTLDQLjYDZQRa2', 'fld9RAJzfNv0du6iW', 'fldv4njMaHOaG2yOY', 'fldDzDpsRhlBVetGQ', 'fldDj8MZ9uvXAHtbf', 'fld3TVr6pcCoNFBdW', 'fld63GBOOkGiUMg0V', 'fld1BEs0Q3KVb3Na6']);
const C = await listar('tblvfDCiHNUXo1ZFQ', ['fldxtM9Sk5kjFthch', 'fldst9TObn0RlTmZQ', 'fld9C1dM0eAorQ2VG', 'fld8lNfHLXYI7sUmv']);
const informe = calcularValor(
  B.map(r => { const f = r.fields; return { id: r.id, origen: s1(f.fldA3mlzf0ZkPy3nM), cantidad: n(f.fldm87g7J9lHhI8pM), enGuarda: n(f.fldMTLDQLjYDZQRa2), fecha: String(f.fld9RAJzfNv0du6iW ?? ''), pagado: n(f.fldv4njMaHOaG2yOY), sugerido: n(f.fldDzDpsRhlBVetGQ), valorEst: n(f.fldDj8MZ9uvXAHtbf), gananciaEstiba: n(f.fld3TVr6pcCoNFBdW), icono: !!f.fld63GBOOkGiUMg0V, formato: s1(f.fld1BEs0Q3KVb3Na6) }; }),
  C.map(r => { const f = r.fields; return { botella: (f.fldxtM9Sk5kjFthch ?? [])[0], cantidad: n(f.fldst9TObn0RlTmZQ), fecha: String(f.fld9C1dM0eAorQ2VG ?? ''), sugeridoHist: n(f.fld8lNfHLXYI7sUmv) }; }),
  new Date().toISOString().slice(0, 10));
const MIEMBROS = 7;
const cero = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const montosBody = {
  moneda: 'USD', cava: { id: CAVA_ID, nombre: 'Club EDB #001', tipo: 'Grupo', miembros: MIEMBROS }, esAdmin: false,
  informe: { ...informe, presupuestoMes: 50 * MIEMBROS, tuParte: { valorCava: Math.round(informe.valorCava / MIEMBROS), compras: Math.round(informe.compras / MIEMBROS) } },
  total: cero, tuParte: cero, porEtiqueta: {},
};
const fmt = x => 'USD ' + String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ── servidor y navegador ──
const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
const terminar = code => { try { srv.kill(); } catch {} process.exit(code); };
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });

  async function abrir(conSesion) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.route('**/api/cava', r => r.fulfill({ json: cavaBody }));
    await page.route('**/api/auth*', r => r.fulfill({ json: conSesion
      ? { sesion: true, usuario: { nombre: 'Prueba Socio', email: 'prueba@example.com', admin: false }, cavas: [montosBody.cava] }
      : { sesion: false } }));
    await page.route('**/api/montos*', r => conSesion ? r.fulfill({ json: montosBody }) : r.fulfill({ status: 401, json: { error: 'no' } }));
    await page.goto(`${BASE}/club/cava`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-tv="tarjeta"]:not([data-estado="cargando"])', { timeout: 20000 });
    return { ctx, page };
  }

  // ── con sesión de miembro ──
  const { ctx: c1, page: p1 } = await abrir(true);
  await p1.waitForSelector('[data-tv="grafico"]', { timeout: 10000 });
  const texto = await p1.locator('[data-tv="tarjeta"]').innerText();
  const parte = await p1.locator('[data-tv="parte"]').innerText().catch(() => '');
  check('1. socio: la tarjeta dice USD 27.339, +35% y la caja Tu parte',
    texto.includes(fmt(informe.valorCava)) && texto.includes(`▲ ${informe.porcentaje}%`) && /TU PARTE · 1 DE 7/.test(parte) && parte.includes(fmt(informe.valorCava / MIEMBROS)),
    `${informe.valorCava} / ${informe.porcentaje}% / ${parte.replace(/\n/g, ' ')}`);

  const ult = informe.serie.at(-1);
  const capas = await p1.evaluate(() => {
    const el = k => document.querySelector(`[data-tv-capa="${k}"]`);
    const r = k => { const b = el(k).getBoundingClientRect(); return { top: b.top, tope: Number(el(k).getAttribute('data-tope')) }; };
    const orden = [...document.querySelectorAll('[data-tv-capa]')].map(e => e.getAttribute('data-tv-capa'));
    return { tomado: r('tomado'), cava: r('cava'), compras: r('compras'), orden };
  });
  check('2. el último punto de la serie: cava = valorCava y compras = compras',
    ult.cava === informe.valorCava && ult.compras === informe.compras && capas.cava.tope === informe.valorCava,
    JSON.stringify(ult));
  check('3. último mes: bordó (27.339) por encima de Compras (20.240) y verde = bordó + tomado',
    capas.cava.tope > capas.compras.tope && capas.cava.top < capas.compras.top && capas.tomado.tope === informe.valorCava + informe.tomado && capas.tomado.top < capas.cava.top,
    JSON.stringify(capas));
  check('4. del fondo al frente: verde → bordó → línea Compras',
    capas.orden.join('>') === 'tomado>cava>compras', capas.orden.join('>'));
  const ejeX = await p1.locator(".tv-x").allInnerTexts();
  console.log("  eje X:", ejeX.join(" "), "| mes en curso:", informe.mesEnCurso, "asignado", informe.asignadoMes);
  const inicioTxt = await p1.locator(".montos").first().innerText().catch(() => "");
  const meses = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = meses[Number(informe.mesEnCurso.slice(5, 7))];
  const primero = Number(informe.serie[0].mes.slice(5, 7));
  const esperadoX = [...(13 - primero >= 6 || primero === 1 ? [informe.serie[0].mes.slice(0, 4)] : []),
    ...informe.serie.filter(p => p.mes.endsWith('-01') && p !== informe.serie[0]).map(p => p.mes.slice(0, 4))];
  check('6. eje X: sólo eneros (y el año inicial si faltan 6+ meses)', ejeX.join() === esperadoX.join(), `${ejeX.join(' ')} vs ${esperadoX.join(' ')}`);
  check('7. Inicio: Presupuesto del mes USD 350 y Asignado a la cava · mes en curso, sin candado',
    inicioTxt.includes(fmt(50 * MIEMBROS)) && inicioTxt.includes(`Asignado a la cava · ${nombreMes}`) && inicioTxt.includes(fmt(informe.asignadoMes)) && !inicioTxt.includes('Montos visibles'),
    inicioTxt.replace(/\n/g, ' | '));
  await p1.goto(`${BASE}/club/cava#compras`, { waitUntil: 'domcontentloaded' });
  await p1.waitForSelector('.acc-item', { timeout: 15000 }).catch(() => {});
  const filas = await p1.locator('.acc').first().locator('.acc-item').evaluateAll(els => els.map(e => ({ mes: e.getAttribute('data-mes'), txt: e.querySelector('.acc-bot').innerText })));
  const malas = filas.filter(f => !f.txt.includes(' · ' + fmt(informe.comprasPorMes[f.mes] ?? 0)));
  console.log('  filas de Compras:', filas.slice(0, 3).map(f => f.txt).join(' / '), '... total', filas.length);
  check('8. Compras: cada mes dice "N botellas · USD monto"', filas.length > 0 && malas.length === 0, JSON.stringify(malas.slice(0, 2)));
  await c1.close();

  // ── sin sesión ──
  const { ctx: c2, page: p2 } = await abrir(false);
  const demo = await p2.locator('[data-tv="tarjeta"]').innerText();
  const hayGrafico = await p2.locator('[data-tv="grafico"], [data-tv-capa]').count();
  const cuerpo = await p2.locator('body').innerText();
  check('5. sin sesión: ningún monto ni gráfico, sólo ••••',
    hayGrafico === 0 && !/USD\s*\d/.test(demo) && !cuerpo.includes('27.339') && demo.includes('••••') && !/%\s*$/m.test(demo.replace(/••/g, '')),
    demo.replace(/\n/g, ' | '));
  await c2.close();
} catch (e) {
  console.error('Error del script:', e.message);
  results.push(false);
} finally {
  if (browser) await browser.close().catch(() => {});
  const bien = results.length === 8 && results.every(Boolean);
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  terminar(bien ? 0 : 1);
}
