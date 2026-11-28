#!/usr/bin/env node
// Humo de "Primer pantallazo 1: nada arriba y avisos con acción". Local en Chromium, con la API simulada (no toca el Airtable de producción).
// Mes en curso: noviembre 2026.
//   NODE_OPTIONS=--max-old-space-size=8192 npx vite build && node scripts/check-avisos.mjs
//   1. Compras: Kaiken Ultra Cab. Sauv. 2007 (6 botellas, Vivino 3,7) + Salentein 2021 (4,6) → "¡Wow! Este mes te asignamos 6 botellas 2007 (19 años)."; "Ver el vino" abre la ficha; al volver y al recargar no está
//   2. Compras: noviembre 4,4 / 2018 → Vivino 4,4; octubre 4,2 / 2022 → "Ya están tus vinos de octubre."; septiembre → sin aviso; sin el número grande y el primer bloque a 24 px
//   3. Valor (grupal): sin el bloque suelto; "Lo que vale hoy" primero con "$43,5 M ▲ 35%" y "TU PARTE" en la misma línea; a 320 y 390 px, en $ y en USD, nada se parte ni se superpone
//   4. Valor: con $30 M guardado y hoy $43,5 M → "¡Tu cava pasó los $40 M!"; tras la × no vuelve al recargar; sin nada guardado no aparece
//   5. Consumos: con una programada y 4 vinos por puntuar de la anterior → aviso; "Puntuar" lleva a esa juntada y el aviso se va; sin programada no hay aviso
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4252, BASE = `http://localhost:${PUERTO}`;
const check = (n, ok, d = '') => { console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}${ok || !d ? '' : '  →  ' + d}`); return ok; };
const resultados = [];

const HOY = '2026-11-28', MESHOY = '2026-11', ID = 'rec7kgfT9LXzYPy6a', EMAIL = 'toto@example.com';
const DOLAR = 1570;
const PUB = JSON.parse(readFileSync(join(ROOT, 'src/club/data/cava-001.json'), 'utf8'));
const et = (vino, anada, botellas, vivino) => ({ vino, anada, bodega: 'Bodega', botellas, vivino });
const fila = (vino, an, vivino, qty) => ({ an, vino, bod: 'Bodega', pais: 'Argentina', reg: 'Mendoza', tipo: 'tinto', cepa: 'Malbec', vivino, qty, start: null, eq: qty, cons: 0, consd: [] });
const mes = (m, etiquetas) => ({ mes: m, botellas: etiquetas.reduce((s, e) => s + e.botellas, 0), etiquetas });

const informe = {
  valorCava: 43500000 / DOLAR, compras: 20000, porcentaje: 35, guarda: 5000, tomado: 1000, ahorro: 6000, botellasTomadas: 10, botellasEnCava: 100,
  serie: [{ mes: '2026-10', cava: 20000, tomado: 500, compras: 18000 }, { mes: '2026-11', cava: 27700, tomado: 1000, compras: 20000 }],
  enGuardaTodas: 100, abiertasTodas: 10, descuento: { pct: 45, sugerido: 0, botellas: 0, porAnio: [] }, crecieron: [], crecieronN: 0,
  plan: 'Gran Reserva', topePlan: 40, mesEnCurso: MESHOY, asignadoMes: 0, comprasPorMes: {}, presupuestoMes: 350, tuParte: { valorCava: 6200000 / DOLAR, compras: 1 } };
const Z = { pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 };
const MONTOS = { dolar: { mes: MESHOY, valor: DOLAR }, compraDe: {}, consumos: [], fueraDelClub: [], posiciones: {},
  compras: { meses: [], porMes: {}, filasMes: {}, ultimas: [{ vino: 'Vino Nuevo', anada: '2021', bodega: 'B', cepa: 'Malbec', botellas: 2 }], club: { botellas: 27, desde: '2026-08', costo: 1, sugerido: 2 }, regalos: [], cuotas: null },
  informe, cava: { id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7 }, total: Z, tuParte: Z, porEtiqueta: {} };
const SESION = { sesion: true, usuario: { nombre: 'Toto', email: EMAIL, admin: false }, cavas: [{ id: ID, nombre: 'Cava #001', tipo: 'Grupal', miembros: 7, propia: true, dueno: '', titulo: 'B', avatar: false, puedeAvatar: false }] };

// Consumos: la anterior (votación abierta, 4 vinos sin puntuar) y, a veces, una programada
const consumo = i => ({ id: `recC${i}`, botella: `recB${i}`, vino: `Vino ${i}`, anada: 2018, cepa: 'Malbec', tipo: 'tinto', bodega: 'B', fecha: '2026-10-24', orden: i, vivino: 4.0, mio: false });
const jBase = { asistentes: [], fotos: 0, portadaPor: '', maridaje: '', notas: '', exacto: true, puedeEditar: false, puedeFotos: false, asistentesNombres: [], sede: '', hora: '', designados: [],
  van: [], noVan: [], miRespuesta: null, puedeResponder: false, puedeEmpezar: false, puedeBorrar: false };
const anterior = { ...jBase, id: 'recJ1', nombre: 'Juntada octubre 2026', fecha: '2026-10-24', abierta: true, soyAsistente: true, consumos: [1, 2, 3, 4].map(consumo), programada: false };
const programada = { ...jBase, id: 'recJ2', nombre: 'Juntada de diciembre', fecha: '2026-12-05', abierta: false, soyAsistente: false, consumos: [], programada: true, sede: 'Casa de Juan', hora: '21:00', puedeResponder: true };
const estado = conProgramada => ({ yo: 'recU1', individual: false, puedeArmar: false, esDueno: false, hoy: HOY, totalSocios: 7, soySocio: true, socios: [], guarda: [], individuales: [],
  juntadas: conProgramada ? [anterior, programada] : [anterior], puntajes: {}, guia: { partes: {}, franjas: [] }, partes: [] });

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  try { browser = await chromium.launch({ headless: true }); } catch (e) { if (existsSync('/opt/pw-browsers/chromium')) browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' }); else throw e; }
  // un navegador nuevo; "sembrar" deja cosas en localStorage una sola vez (no en cada recarga)
  const abrir = async (hash, { compras = [], ancho = 390, usd = false, sembrar = {}, programadaOn = true } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 } });
    await ctx.addInitScript(([id, usd, sem]) => {
      try {
        localStorage.setItem('edb_cava', id);
        if (usd) localStorage.setItem('edb-club-moneda', 'USD');
        if (!sessionStorage.getItem('sembrado')) { sessionStorage.setItem('sembrado', '1'); for (const [k, v] of Object.entries(sem)) localStorage.setItem(k, v); }
      } catch {}
    }, [ID, usd, sembrar]);
    const cavaApi = { ...PUB, dolar: { mes: MESHOY, valor: DOLAR }, compras, otrasEntradas: [], consumos: { juntadas: [] },
      data: { grupal: [...PUB.data.grupal, fila('Kaiken Ultra Cab. Sauv.', 2007, 3.7, 6), fila('Salentein Gran VU Blend', 2021, 4.6, 1)] } };
    await ctx.route('**/api/**', async r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/api/auth') return r.fulfill({ json: SESION });
      if (u.pathname === '/api/cava') return r.fulfill({ json: cavaApi });
      if (u.pathname === '/api/montos') return r.fulfill({ json: MONTOS });
      if (u.pathname === '/api/juntadas') return r.fulfill({ json: estado(programadaOn) });
      return r.fulfill({ status: 404, json: { error: 'no hay' } });
    });
    const p = await ctx.newPage();
    await p.goto(BASE + '/club/cava' + hash, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    return { ctx, p };
  };
  const primero = p => p.evaluate(() => {
    const t = document.querySelector('.tshell'), h = t.previousElementSibling.getBoundingClientRect(), f = t.firstElementChild.getBoundingClientRect();
    const av = document.querySelector('[data-aviso="compras"]'), sig = av?.nextElementSibling;
    return { grande: !!document.querySelector('.sec-hero-num'), aDist: Math.round(f.top - h.bottom), titulo: av?.querySelector('.som-t')?.textContent ?? null, texto: av?.querySelector('.som-x')?.textContent ?? null,
      boton: av?.querySelector('[data-aviso-boton]')?.textContent ?? null, rotulo: av?.querySelector('.som-rot')?.textContent ?? null,
      gap: av && sig ? Math.round(sig.getBoundingClientRect().top - av.getBoundingClientRect().bottom) : null };
  });

  // ── 1 ──
  const comp1 = [mes('2026-11', [et('Kaiken Ultra Cab. Sauv.', 2007, 6, 3.7), et('Salentein Gran VU Blend', 2021, 1, 4.6), et('Otro', 2019, 2, 3.9)])];
  const a1 = await abrir('#compras', { compras: comp1 });
  const v1 = await primero(a1.p);
  await a1.p.locator('[data-aviso="compras"] [data-aviso-boton]').click();
  await a1.p.waitForSelector('.bt-raiz', { state: 'attached', timeout: 8000 });
  const fichaAbierta = await a1.p.locator('.bt-raiz').textContent();
  await a1.p.keyboard.press('Escape');
  await a1.p.waitForTimeout(400);
  const trasVolver = await a1.p.locator('[data-aviso="compras"]').count();
  await a1.p.reload({ waitUntil: 'domcontentloaded' }); await a1.p.waitForTimeout(2500);
  const trasRecargar = await a1.p.locator('[data-aviso="compras"]').count();
  resultados.push(check('1. Compras: "¡Wow! Este mes te asignamos 6 botellas 2007 (19 años)." + "Kaiken Ultra Cab. Sauv." + "Ver el vino" (abre esa ficha); al volver y al recargar ya no está',
    v1.titulo === '¡Wow! Este mes te asignamos 6 botellas 2007 (19 años).' && v1.texto === 'Kaiken Ultra Cab. Sauv.' && v1.boton === 'Ver el vino' && v1.rotulo === 'COMPRAS DEL CLUB'
      && /Kaiken/i.test(fichaAbierta) && trasVolver === 0 && trasRecargar === 0 && v1.gap === 10, JSON.stringify({ v1, fichaAbierta: fichaAbierta.slice(0, 60), trasVolver, trasRecargar })));
  await a1.ctx.close();

  // ── 2 ──
  const caso = async compras => { const c = await abrir('#compras', { compras }); const v = await primero(c.p); await c.ctx.close(); return v; };
  const vA = await caso([mes('2026-11', [et('Uno', 2018, 3, 4.4), et('Dos', 2021, 1, 4.0)])]);
  const vB = await caso([mes('2026-10', [et('Uno', 2022, 2, 4.2), et('Dos', 2021, 2, 4.0)])]);
  const vC = await caso([mes('2026-09', [et('Uno', 2007, 2, 4.6), et('Dos', 2021, 2, 4.0)])]);
  resultados.push(check('2. Compras: noviembre 4,4 → "Felicitaciones… 4,4 en Vivino"; octubre 4,2 → "Ya están tus vinos de octubre." + "Entraron 4 botellas a tu cava."; septiembre → sin aviso; sin número grande y el primer bloque a 24 px',
    vA.titulo === '¡Felicitaciones! Este mes recibiste una etiqueta 4,4 en Vivino.' && vA.texto === 'Uno 2018' && vB.titulo === 'Ya están tus vinos de octubre.' && vB.texto === 'Entraron 4 botellas a tu cava.' && vB.boton === 'Ver cuáles'
      && vC.titulo === null && [vA, vB, vC].every(v => !v.grande && Math.abs(v.aDist - 24) <= 1), JSON.stringify({ vA, vB, vC })));

  // ── 3 ──
  const medir = p => p.evaluate(() => {
    const b1 = document.querySelector('[data-banda="1"]'), cab = document.querySelector('[data-vi="cabecera"]'), hoy = b1?.querySelector('[data-vi="hoy"]');
    const val = document.querySelector('[data-vi="valor"]'), pct = document.querySelector('[data-vi="valor-pct"]'), par = document.querySelector('[data-vi="parte-n"]'), parte = document.querySelector('[data-vi="parte"]');
    const r = e => e.getBoundingClientRect();
    const linea = e => { const cs = getComputedStyle(e), lh = cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) * 1.3 : parseFloat(cs.lineHeight); return r(e).height <= lh * 1.5 + 2; };
    const piezas = [cab, val, pct, par, parte.querySelector('.vi-rot')].filter(Boolean);
    const choca = (a, b) => !(r(a).right <= r(b).left + 1 || r(b).right <= r(a).left + 1 || r(a).bottom <= r(b).top + 1 || r(b).bottom <= r(a).top + 1);
    const pares = [[val, par], [pct, par], [val, parte]].filter(([a, b]) => a && b);
    return { sueltoArriba: !!document.querySelector('.vi-cava.bloque') || [...document.querySelectorAll('.vi-rot')].some(e => e.textContent === 'VALOR DE LA CAVA' && !e.closest('.av-card')), primero: !!hoy, cab: cab?.textContent,
      texto: document.querySelector('[data-vi="cava"]').innerText.replace(/\s+/g, ' '), partidos: piezas.filter(e => !linea(e)).map(e => e.textContent), choques: pares.filter(([a, b]) => choca(a, b)).length,
      scroll: document.documentElement.scrollWidth > innerWidth, misma: Math.abs(r(val).bottom - r(par).bottom) <= 3 };
  });
  const filas3 = [];
  for (const w of [320, 390]) for (const usd of [false, true]) {
    const c = await abrir('#valor', { ancho: w, usd, sembrar: { [`edb-club-valor-hito:${EMAIL}:${ID}`]: '40000000' } });
    filas3.push({ w, usd, ...(await medir(c.p)) }); await c.ctx.close();
  }
  const peso = filas3[0];
  resultados.push(check('3. Valor (grupal): sin el bloque suelto; "Lo que vale hoy" primero con "$43,5 M ▲ 35%" y "TU PARTE" en la misma línea; a 320 y 390 px, en $ y en USD, nada se parte ni se superpone',
    filas3.every(f => !f.sueltoArriba && f.primero && f.cab === 'LO QUE VALE HOY' && !f.partidos.length && !f.choques && !f.scroll) && /\$43,5 M ▲ 35% TU PARTE \$6,2 M/.test(peso.texto) && filas3.filter(f => f.w === 390).every(f => f.misma), JSON.stringify(filas3)));

  // ── 4 ──
  const clave = `edb-club-valor-hito:${EMAIL}:${ID}`;
  const c4 = await abrir('#valor', { sembrar: { [clave]: '30000000' } });
  const t4 = await c4.p.locator('[data-aviso="valor"] .som-t').textContent().catch(() => null);
  await c4.p.locator('[data-aviso="valor"] [data-aviso-x]').click();
  await c4.p.waitForTimeout(300);
  const guardado = await c4.p.evaluate(k => localStorage.getItem(k), clave);
  await c4.p.reload({ waitUntil: 'domcontentloaded' }); await c4.p.waitForTimeout(2500);
  const vuelve = await c4.p.locator('[data-aviso="valor"]').count();
  await c4.ctx.close();
  const c4b = await abrir('#valor');
  const sinNada = await c4b.p.locator('[data-aviso="valor"]').count();
  const primeraVez = await c4b.p.evaluate(k => localStorage.getItem(k), clave);
  await c4b.ctx.close();
  resultados.push(check('4. Valor: con $30 M guardado y hoy $43,5 M → "¡Tu cava pasó los $40 M!"; tras la × no vuelve al recargar; sin nada guardado no aparece (y guarda $40 M)',
    t4 === '¡Tu cava pasó los $40 M!' && guardado === '40000000' && vuelve === 0 && sinNada === 0 && primeraVez === '40000000', JSON.stringify({ t4, guardado, vuelve, sinNada, primeraVez })));

  // ── 5 ──
  const c5 = await abrir('#consumos', { programadaOn: true });
  const sel = '[data-aviso="juntadas"]';
  const t5 = await c5.p.locator(`${sel} .som-t`).textContent().catch(() => null);
  const x5 = await c5.p.locator(`${sel} .som-x`).textContent().catch(() => null);
  await c5.p.locator(`${sel} [data-aviso-boton]`).click();
  await c5.p.waitForTimeout(600);
  const despues = await c5.p.locator(sel).count();
  const tarjeta = await c5.p.locator('.cons-sec').first().innerText();
  await c5.ctx.close();
  const c5b = await abrir('#consumos', { programadaOn: false });
  const sinProg = await c5b.p.locator(sel).count();
  await c5b.ctx.close();
  resultados.push(check('5. Consumos: con una programada y 4 vinos por puntuar de la anterior → "Tenés 4 vinos para puntuar."; "Puntuar" lleva a esa juntada y el aviso se va; sin programada no hay aviso',
    t5 === 'Tenés 4 vinos para puntuar.' && x5 === 'Juntada octubre 2026' && despues === 0 && /24\/10/.test(tarjeta) && !/diciembre/i.test(tarjeta.slice(0, 120)) && sinProg === 0, JSON.stringify({ t5, x5, despues, sinProg, tarjeta: tarjeta.slice(0, 200) })));
} finally { await browser?.close().catch(() => {}); srv.kill(); }
const ok = resultados.filter(Boolean).length;
console.log(`\n${ok}/5`);
process.exit(ok === 5 ? 0 : 1);
