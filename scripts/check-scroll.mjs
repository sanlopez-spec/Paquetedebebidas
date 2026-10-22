#!/usr/bin/env node
// Verifica que el scroll del tablero nunca se trabe.
//
//   node scripts/check-scroll.mjs                             (local: vite preview)
//   node scripts/check-scroll.mjs --base https://edb.com.ar   (producción)
//
// Recorre el tablero (modal y standalone) y, después de CADA paso, comprueba:
//   a) que una rueda (escritorio) o un swipe real (celular, vía CDP) mueve el scroll
//      del contenedor que corresponde — el modal o la página;
//   b) el overflow de <html> y <body>: con el modal cerrado no puede quedar nada
//      bloqueado, y con el modal abierto sólo lo bloquea el modal;
//   c) que document.elementFromPoint en el centro de la pantalla cae en el
//      contenido visible y no en una capa invisible (overlay con opacity 0).
//
// Sale con código 1 si falla cualquier chequeo.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const BASE     = (arg('base', 'http://localhost:4173')).replace(/\/+$/, '');
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const VUELTAS  = Number(arg('vueltas', 2)); // cada recorrido, varias veces seguidas

// Las pantallas de "Mi cava": las 4 primeras salen de la grilla de tarjetas y
// "botellas" del renglón "Ver las N botellas".
const SECCIONES = ['cepas', 'geografia', 'anadas', 'calidad', 'botellas'];
// Todas las pantallas que tienen hash propio.
const PANTALLAS = ['cava', ...SECCIONES, 'consumos', 'compras', 'valor'];
// Los ítems de la barra de abajo.
const NAV = ['inicio', 'cava', 'consumos', 'compras'];

const VIEWPORTS = [
  { w: 390,  h: 844, label: 'celular',    file: 'mob', touch: true  },
  { w: 1440, h: 900, label: 'escritorio', file: 'dsk', touch: false },
];

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${name}${ok || !detail ? '' : '  →  ' + detail}`);
}

// ── api/cava.ts en local ──────────────────────────────────────────
async function apiLocal() {
  const envFile = join(ROOT, '.env.local');
  if (existsSync(envFile) && !process.env.AIRTABLE_TOKEN) {
    for (const linea of readFileSync(envFile, 'utf8').split('\n')) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
      if (m) process.env[m[1]] ??= m[2];
    }
  }
  if (!process.env.AIRTABLE_TOKEN) {
    console.error('Falta AIRTABLE_TOKEN (ponelo en .env.local).'); process.exit(1);
  }
  const { transform } = await import('esbuild');
  const { code } = await transform(readFileSync(join(ROOT, 'api', 'cava.ts'), 'utf8'),
    { loader: 'ts', format: 'esm' });
  const tmp = join(tmpdir(), `cava-api-${Date.now()}.mjs`);
  writeFileSync(tmp, code, 'utf8');
  const { default: handler } = await import(pathToFileURL(tmp).href);
  let body = null;
  await handler({}, { setHeader() {}, status() { return this; }, json(b) { body = b; return this; } });
  if (!body || body.error) { console.error('api/cava.ts falló:', JSON.stringify(body).slice(0, 200)); process.exit(1); }
  return JSON.stringify(body);
}

async function waitForServer(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { const r = await fetch(url, { method: 'GET' }); if (r.ok || r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

// ── sondas dentro de la página ────────────────────────────────────
// El contenedor que tiene que scrollear: el cuerpo del modal si está abierto,
// o el documento si no.
const LEER_ESTADO = () => {
  const modal = document.querySelector('.tablero-modal-body');
  const el = modal ?? document.scrollingElement;
  const cs = n => getComputedStyle(n);
  const htmlS = cs(document.documentElement), bodyS = cs(document.body);
  const cx = Math.round(window.innerWidth / 2), cy = Math.round(window.innerHeight / 2);
  const hit = document.elementFromPoint(cx, cy);
  const overlay = document.querySelector('.tablero-overlay');
  return {
    cual: modal ? 'modal' : 'pagina',
    top: el.scrollTop,
    alcance: el.scrollHeight - el.clientHeight,
    html: { overflow: htmlS.overflow, overflowY: htmlS.overflowY, position: htmlS.position },
    body: { overflow: bodyS.overflow, overflowY: bodyS.overflowY, position: bodyS.position },
    modalAbierto: !!document.querySelector('.tablero-overlay'),
    overlayOpacity: overlay ? cs(overlay).opacity : null,
    overlayPointer: overlay ? cs(overlay).pointerEvents : null,
    // ¿en qué caigo al tocar el centro de la pantalla?
    hitTag: hit ? hit.tagName.toLowerCase() : null,
    hitClase: hit ? (hit.className?.baseVal ?? String(hit.className ?? '')).slice(0, 60) : null,
    hitInvisible: hit ? (() => {
      for (let n = hit; n && n !== document.documentElement; n = n.parentElement) {
        const s = cs(n);
        if (Number(s.opacity) === 0 || s.visibility === 'hidden') return true;
      }
      return false;
    })() : true,
    ruta: location.pathname + location.hash,
  };
};

async function estado(page) { return page.evaluate(LEER_ESTADO); }

// Un gesto real en el punto (x, y): rueda en escritorio, swipe táctil en celular.
// El swipe se manda como eventos de toque de verdad (Input.dispatchTouchEvent),
// así pasa por touch-action y por los listeners igual que un dedo.
async function gestoEn(page, cdp, vp, x, y, dy) {
  if (vp.touch) {
    const pasos = 12;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= pasos; i++) {
      await cdp.send('Input.dispatchTouchEvent',
        { type: 'touchMove', touchPoints: [{ x, y: y - dy * i / pasos }] });
      await new Promise(r => setTimeout(r, 12));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, dy);
  }
  await quieto(page);
}

async function gesto(page, cdp, vp, dy) {
  const y = Math.round(vp.h / 2);
  // en celular arranco el swipe lejos de los bordes (gestos del sistema)
  await gestoEn(page, cdp, vp, Math.round(vp.w / 2), dy > 0 ? Math.min(y + 120, vp.h - 90) : y, dy);
}

// Gesto sobre un punto concreto (el gráfico, un mapa…).
async function gestoSobre(page, cdp, vp, selector, dy) {
  const caja = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!caja) return false;
  const x = Math.round(caja.x + caja.width / 2);
  const y = Math.round(Math.min(Math.max(caja.y + caja.height / 2, 90), vp.h - 90));
  await gestoEn(page, cdp, vp, x, y, dy);
  return true;
}

// Espera a que frene la inercia del scroll (si no, Playwright ve el DOM "inestable").
async function quieto(page, intentos = 25) {
  let previo = null;
  for (let i = 0; i < intentos; i++) {
    await page.waitForTimeout(120);
    const t = await page.evaluate(() => {
      const m = document.querySelector('.tablero-modal-body');
      return (m ?? document.scrollingElement).scrollTop;
    }).catch(() => null);
    if (t !== null && t === previo) return;
    previo = t;
  }
}

// ── el chequeo que corre después de cada paso ─────────────────────
async function revisar(page, cdp, vp, nombre, opciones = {}) {
  const { sobre = null } = opciones;
  const fallas = [];

  const antes = await estado(page);

  // a) un gesto tiene que mover el scroll.
  // Ojo: si el contenido entra entero en la pantalla no hay nada que mover y
  // no es una falla — pero sí lo sería que el alcance sea cero porque algo
  // bloqueó el <body>, y de eso se encarga el chequeo (b).
  const arranque = antes.top;
  const bloq = s => s.overflow === 'hidden' || s.overflowY === 'hidden' || s.position === 'fixed';
  // Menos de 40 px de recorrido = el contenido entra en la pantalla y no hay
  // scroll real que probar. Eso sí: un alcance chico porque algo bloqueó el
  // documento es falla, y eso lo mira igual el chequeo de overflow.
  const MIN_RECORRIDO = 40;
  if (antes.alcance < MIN_RECORRIDO) {
    if (!antes.modalAbierto && (bloq(antes.body) || bloq(antes.html))) {
      fallas.push(`alcance ${antes.alcance} px porque el documento está bloqueado (body ${JSON.stringify(antes.body)})`);
    }
  } else {
    // si ya estoy abajo de todo, pruebo para arriba
    const haciaAbajo = arranque < antes.alcance - 8;
    const dy = haciaAbajo ? 400 : -400;
    if (sobre) await gestoSobre(page, cdp, vp, sobre, dy);
    else await gesto(page, cdp, vp, dy);
    const despues = await estado(page);
    if (Math.abs(despues.top - arranque) < 8) {
      fallas.push(`el scroll no se movió (${antes.cual}: ${arranque} → ${despues.top}, alcance ${antes.alcance}${sobre ? `, gesto sobre ${sobre}` : ''})`);
    }
  }

  const ahora = await estado(page);

  // b) overflow de html y body
  const bloqueado = s => s.overflow === 'hidden' || s.overflowY === 'hidden' || s.position === 'fixed';
  if (!ahora.modalAbierto) {
    if (bloqueado(ahora.body)) fallas.push(`modal cerrado pero <body> bloqueado (${JSON.stringify(ahora.body)})`);
    if (bloqueado(ahora.html)) fallas.push(`modal cerrado pero <html> bloqueado (${JSON.stringify(ahora.html)})`);
  }

  // c) ¿el centro de la pantalla cae en una capa invisible?
  if (ahora.hitInvisible) {
    fallas.push(`el centro de la pantalla cae en una capa invisible (<${ahora.hitTag} class="${ahora.hitClase}">)`);
  }
  if (!ahora.modalAbierto && ahora.overlayOpacity !== null) {
    fallas.push('quedó un .tablero-overlay en el DOM con el modal cerrado');
  }

  check(`${vp.file}: ${nombre}`, fallas.length === 0,
    `${fallas.join(' | ')} [ruta ${ahora.ruta}]`);
  return fallas.length === 0;
}

// ── acciones ──────────────────────────────────────────────────────
// El panel del modal usa 100dvh y en celular el alto se reacomoda; para que
// Playwright no vea el botón "inestable", clickeo por coordenadas una vez quieto.
async function clickFirme(page, locator) {
  await quieto(page);
  // al centro de la pantalla, así la barra fija de abajo no se come el click
  await locator.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
    .catch(() => {});
  await quieto(page);
  const caja = await locator.boundingBox();
  if (!caja) throw new Error('no encontré el elemento para clickear');
  await page.mouse.click(Math.round(caja.x + caja.width / 2), Math.round(caja.y + caja.height / 2));
}

async function abrirModal(page) {
  await clickFirme(page, page.getByRole('button', { name: 'Abrir el tablero' }).first());
  await page.waitForSelector('.tablero-modal-body .sec-card, .tablero-modal-body .tpanel', { timeout: 20000 });
  await page.waitForTimeout(600);
}

// Un ítem de la barra de abajo.
async function irNav(page, pantalla) {
  await clickFirme(page, page.locator(`.appbar-item[data-pantalla="${pantalla}"]`));
  await page.waitForTimeout(550);
}

async function entrarSeccion(page, i) {
  if (SECCIONES[i] === 'botellas') {
    await clickFirme(page, page.locator('.link-botellas').first());
  } else {
    await clickFirme(page, page.locator('.sec-card').nth(i));
  }
  await page.waitForTimeout(550);
}

// "← Volver" vuelve a Mi cava, que también tiene la grilla de tarjetas.
async function volver(page) {
  await clickFirme(page, page.locator('.sec-back-btn').first());
  await page.waitForTimeout(550);
}

// Navega y espera de verdad: la respuesta de /api/cava (hasta 15 s) y, si la
// pantalla es el Inicio, que ya tenga los números cargados. Nada de esperas a
// ojo: con la API en frío un tiempo fijo alcanza o no según el día.
async function irA(page, url) {
  const api = page.waitForResponse(
    r => /\/api\/cava(\?|$)/.test(r.url()) && r.ok(), { timeout: 15000 }).catch(() => null);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await api;
  await esperarNumeros(page, url);
}
// En el Inicio, "cargado" = las tarjetas de Mi cava ya muestran un número.
async function esperarNumeros(page, url) {
  const u = new URL(url);
  if (!u.pathname.endsWith('/club/cava') || u.hash) return;
  await page.waitForFunction(
    () => /\d/.test(document.querySelector('.sec-card-big b')?.textContent ?? ''),
    null, { timeout: 15000 }).catch(() => {});
}

// El servidor de preview se cierra esperando a que salga de verdad, y el código
// de salida del script depende sólo de los chequeos.
async function detener(server) {
  if (!server || server.exitCode !== null) return;
  await new Promise(res => { server.once('exit', res); server.kill(); setTimeout(res, 5000); });
}

// ── arranque ──────────────────────────────────────────────────────
let server = null, apiBody = null;
if (IS_LOCAL) {
  console.log('Corriendo api/cava.ts contra Airtable…');
  apiBody = await apiLocal();
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteBin)) { console.error('No encuentro vite en node_modules.'); process.exit(1); }
  console.log('Levantando vite preview en 4173…');
  server = spawn(process.execPath, [viteBin, 'preview', '--port', '4173', '--strictPort'],
                 { cwd: ROOT, stdio: 'ignore' });
  if (!await waitForServer(BASE + '/', 30000)) {
    console.error('El preview local no respondió.'); await detener(server); process.exit(1);
  }
}

console.log(`\nVerificando el scroll en ${BASE}/club\n`);
const browser = await chromium.launch({ headless: true });

try {
  for (const vp of VIEWPORTS) {
    console.log(`── ${vp.label} (${vp.w}×${vp.h}${vp.touch ? ', táctil' : ''}) ──`);
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.touch, isMobile: vp.touch,
      deviceScaleFactor: vp.touch ? 2 : 1,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    const errores = [];
    page.on('pageerror', e => errores.push(e.message));
    if (apiBody) {
      await page.route('**/api/cava', r =>
        r.fulfill({ status: 200, contentType: 'application/json', body: apiBody }));
    }

    // ── A. modal: entrar y salir de las pantallas de Mi cava ───────
    for (let v = 1; v <= VUELTAS; v++) {
      await irA(page, BASE + '/club');
      await revisar(page, cdp, vp, `A${v}. la landing /club scrollea`);
      await abrirModal(page);
      await revisar(page, cdp, vp, `A${v}. el Inicio del modal scrollea`);
      await irNav(page, 'cava');
      await revisar(page, cdp, vp, `A${v}. «Mi cava» scrollea`);
      for (let i = 0; i < SECCIONES.length; i++) {
        await entrarSeccion(page, i);
        await revisar(page, cdp, vp, `A${v}. sección «${SECCIONES[i]}» desde Mi cava`);
        await volver(page);
        await revisar(page, cdp, vp, `A${v}. «← Volver» desde «${SECCIONES[i]}»`);
      }
    }

    // ── A2. la barra de abajo: cada ítem y después scrollear ───────
    for (let v = 1; v <= VUELTAS; v++) {
      await irA(page, BASE + '/club');
      await abrirModal(page);
      for (const n of NAV) {
        await irNav(page, n);
        await revisar(page, cdp, vp, `A2.${v} barra → «${n}»`);
      }
    }
    // lo mismo en la página directa
    await irA(page, BASE + '/club/cava');
    for (const n of NAV) {
      await irNav(page, n);
      await revisar(page, cdp, vp, `A2. barra → «${n}» en /club/cava`);
    }

    // ── B. saltar entre secciones con los chips ────────────────────
    await irA(page, BASE + '/club');
    await abrirModal(page);
    await irNav(page, 'cava');
    await entrarSeccion(page, 0);
    for (let v = 1; v <= VUELTAS; v++) {
      for (let i = 0; i < SECCIONES.length; i++) {
        await clickFirme(page, page.locator('.sec-chip').nth(i));
        await page.waitForTimeout(400);
        await revisar(page, cdp, vp, `B${v}. chip → «${SECCIONES[i]}»`);
      }
    }

    // ── C. "atrás" del navegador desde una sección ─────────────────
    for (let v = 1; v <= VUELTAS; v++) {
      await irA(page, BASE + '/club');
      await abrirModal(page);
      await irNav(page, 'cava');
      await entrarSeccion(page, v % 4);
      await page.goBack();
      await page.waitForTimeout(700);
      await revisar(page, cdp, vp, `C${v}. "atrás" del navegador desde una sección`);
      await page.goBack().catch(() => {});
      await page.waitForTimeout(700);
      await revisar(page, cdp, vp, `C${v}. segundo "atrás" seguido`);
    }

    // ── D. link directo a cada hash ────────────────────────────────
    for (const s of PANTALLAS) {
      await irA(page, `${BASE}/club/cava#${s}`);
      await revisar(page, cdp, vp, `D. link directo /club/cava#${s}`);
    }

    // ── E. gestos sobre el gráfico de Evolución ────────────────────
    await irA(page, BASE + '/club/cava');
    const hayPlot = await page.locator('.evo-plot').count();
    if (hayPlot) {
      if (vp.touch) await page.locator('.evo-plot').first().tap({ position: { x: 60, y: 60 } }).catch(() => {});
      else await page.locator('.evo-plot').first().hover().catch(() => {});
      await page.waitForTimeout(300);
      await revisar(page, cdp, vp, 'E. scrollear con el dedo/rueda encima del gráfico', { sobre: '.evo-plot' });
    } else {
      check(`${vp.file}: E. scrollear encima del gráfico`, false, 'no encontré .evo-plot');
    }

    // ── E2. el carrusel: deslizarlo y después scrollear vertical ───
    await irA(page, BASE + '/club/cava');
    if (await page.locator('.num-carrusel').count()) {
      const caja = await page.locator('.num-carrusel').boundingBox();
      const x = Math.round(caja.x + caja.width / 2);
      const y = Math.round(Math.min(Math.max(caja.y + caja.height / 2, 90), vp.h - 120));
      // deslizar de costado: con el dedo en celular, con la rueda en escritorio
      if (vp.touch) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 12; i++) {
          await cdp.send('Input.dispatchTouchEvent',
            { type: 'touchMove', touchPoints: [{ x: x - 200 * i / 12, y }] });
          await new Promise(r => setTimeout(r, 12));
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(x, y);
        await page.mouse.wheel(300, 0);
      }
      await quieto(page);
      await revisar(page, cdp, vp, 'E2. después de deslizar el carrusel, la página scrollea',
        { sobre: '.num-carrusel' });
      await revisar(page, cdp, vp, 'E2. scrollear vertical desde encima del carrusel',
        { sobre: '.num-card' });
    } else {
      check(`${vp.file}: E2. existe el carrusel`, false, 'no encontré .num-carrusel');
    }

    // ── J. el panel "Cargar": abrir y cerrar de las tres maneras ───
    for (const [comoCierra, cerrar] of [
      ['la X',          async () => { await clickFirme(page, page.locator('.cargar-x')); }],
      ['tocando afuera', async () => {
        await page.locator('.cargar-back').click({ position: { x: 5, y: 5 } });
      }],
      ['el "atrás"',    async () => { await page.goBack(); }],
    ]) {
      for (const desde of ['el "+" de la barra', 'el botón de Consumos']) {
        await irA(page, BASE + '/club/cava');
        if (desde === 'el botón de Consumos') {
          await irNav(page, 'consumos');
          await clickFirme(page, page.locator('.btn-cargar').first());
        } else {
          await clickFirme(page, page.locator('.appbar-mas-btn'));
        }
        await page.waitForSelector('.cargar-sheet', { timeout: 10000 });
        await page.waitForTimeout(500);
        await cerrar();
        await page.waitForTimeout(800);
        const quedo = await page.locator('.cargar-sheet').count();
        check(`${vp.file}: J. el panel abierto desde ${desde} se cierra con ${comoCierra}`,
          quedo === 0, `${quedo} paneles abiertos`);
        await revisar(page, cdp, vp, `J. scroll libre tras cerrar con ${comoCierra} (${desde})`);
      }
    }

    // ── J2. lo mismo dentro del modal: cerrar el panel no cierra el tablero ──
    for (const [comoCierra, cerrar] of [
      ['la X',           async () => { await clickFirme(page, page.locator('.cargar-x')); }],
      ['tocando afuera', async () => {
        await page.locator('.cargar-back').click({ position: { x: 5, y: 5 } });
      }],
      ['el "atrás"',     async () => { await page.goBack(); }],
    ]) {
      await irA(page, BASE + '/club');
      await abrirModal(page);
      await clickFirme(page, page.locator('.appbar-mas-btn'));
      await page.waitForSelector('.cargar-sheet', { timeout: 10000 });
      await page.waitForTimeout(500);
      await cerrar();
      await page.waitForTimeout(800);
      const est = await page.evaluate(() => ({
        panel: document.querySelectorAll('.cargar-sheet').length,
        modal: document.querySelectorAll('.tablero-modal-body').length,
      }));
      check(`${vp.file}: J2. en el modal, cerrar el panel con ${comoCierra} no cierra el tablero`,
        est.panel === 0 && est.modal === 1, JSON.stringify(est));
      await revisar(page, cdp, vp, `J2. el modal scrollea tras cerrar el panel con ${comoCierra}`);
    }

    // ── K. entrar y salir de #valor, y la tarjeta de la juntada ────
    for (const base of [BASE + '/club/cava', BASE + '/club']) {
      const enModal = base.endsWith('/club');
      await irA(page, base);
      if (enModal) await abrirModal(page); else await page.waitForTimeout(900);
      await clickFirme(page, page.locator('.valor-card-pill'));
      await page.waitForTimeout(700);
      await revisar(page, cdp, vp, `K. #valor scrollea (${enModal ? 'modal' : 'directa'})`);
      await clickFirme(page, page.locator('.valor-top .tab-back'));
      await page.waitForTimeout(700);
      await revisar(page, cdp, vp, `K. volver del valor al Inicio (${enModal ? 'modal' : 'directa'})`);
      if (await page.locator('.junta').count()) {
        await clickFirme(page, page.locator('.junta').first());
        await page.waitForTimeout(900);
        await revisar(page, cdp, vp, `K. tocar la juntada y scrollear (${enModal ? 'modal' : 'directa'})`);
      } else {
        check(`${vp.file}: K. existe la tarjeta de la juntada`, false, 'no la encontré');
      }
    }

    // ── F. Geografía: mapas, modos, lugares, acordeón ──────────────
    await irA(page, BASE + '/club/cava#geografia');
    await page.waitForTimeout(1200);
    // Nada de saltear en silencio: si un control no está, es falla.
    async function tocar(locator, queEs) {
      if (!(await locator.count())) { check(`${vp.file}: F. existe ${queEs}`, false, 'no lo encontré'); return false; }
      try { await clickFirme(page, locator); } catch (e) {
        check(`${vp.file}: F. tocar ${queEs}`, false, e.message.slice(0, 90)); return false;
      }
      await page.waitForTimeout(700);
      return true;
    }

    for (const [nombre, sel] of [['mundo', 0], ['argentina', 1], ['mendoza', 2]]) {
      await tocar(page.locator('.geo-tab').nth(sel), `la pestaña «${nombre}»`);
      await revisar(page, cdp, vp, `F. mapa «${nombre}»`);
      await revisar(page, cdp, vp, `F. scrollear con el dedo sobre el mapa «${nombre}»`, { sobre: '.geo-svg' });
    }
    await tocar(page.locator('.geo-mode').nth(1), 'el modo «Consumidas»');
    await revisar(page, cdp, vp, 'F. modo «Consumidas»');
    await tocar(page.locator('.geo-mode').nth(0), 'el modo «En guarda»');
    await revisar(page, cdp, vp, 'F. volver al modo «En guarda»');
    const lugar = page.locator('.geo-svg path').nth(3);
    if (await lugar.count()) { await lugar.click({ force: true }).catch(() => {}); await page.waitForTimeout(600); }
    else check(`${vp.file}: F. existe un lugar en el mapa`, false, 'no encontré .geo-svg path');
    await revisar(page, cdp, vp, 'F. tocar un lugar del mapa');

    // el acordeón de regiones: arranco de una carga limpia de la sección
    await irA(page, BASE + '/club/cava#geografia');
    await page.waitForTimeout(1400);
    const grupo = page.locator('.reg-grupo-btn').first();
    if (await tocar(grupo, 'el acordeón de regiones')) {
      await revisar(page, cdp, vp, 'F. acordeón de regiones abierto');
      await tocar(grupo, 'el acordeón de regiones (cerrar)');
      await revisar(page, cdp, vp, 'F. acordeón de regiones cerrado');
    }

    // ── G. cerrar el modal desde dentro de una sección y reabrir ───
    for (let v = 1; v <= VUELTAS; v++) {
      await irA(page, BASE + '/club');
      await abrirModal(page);
      await irNav(page, 'cava');
      await entrarSeccion(page, 2);
      await clickFirme(page, page.locator('.tablero-modal-close'));
      await page.waitForTimeout(800);
      await revisar(page, cdp, vp, `G${v}. cerrar el modal estando en una sección`);
      await abrirModal(page);
      await revisar(page, cdp, vp, `G${v}. reabrir el modal y scrollear`);
      await page.locator('.tablero-overlay').click({ position: { x: 5, y: 5 } }).catch(() => {});
      await page.waitForTimeout(800);
      await revisar(page, cdp, vp, `G${v}. cerrar tocando fuera del panel`);
    }

    check(`${vp.file}: sin errores de consola`, errores.length === 0, errores.slice(0, 3).join(' | '));

    await ctx.close();
    console.log('');
  }
} finally {
  await browser.close();
  await detener(server);
}

const fallas = results.filter(r => !r.ok);
console.log('═'.repeat(64));
console.log(`${results.length - fallas.length}/${results.length} chequeos OK`);
if (fallas.length) {
  console.log(`\n${fallas.length} FALLA(S):`);
  fallas.forEach(f => console.log(`  ✗ ${f.name}${f.detail ? '  →  ' + f.detail : ''}`));
  process.exit(1);
}
console.log('TODO OK ✓');
process.exit(0);
