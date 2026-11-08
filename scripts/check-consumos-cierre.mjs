#!/usr/bin/env node
// Humo del cierre de Consumos v2 (local en Chromium, nada en producción), en 390×844 (táctil) y 1440×900 (mouse).
//
//   npx vite build && node scripts/check-consumos-cierre.mjs
//
// Levanta `vite preview` sobre dist/, ejecuta api/cava.ts (con AIRTABLE_TOKEN de .env.local) para la #001 y se la sirve a la página con
// una sesión simulada de Santiago. Las capturas quedan en shots/consumos/cierre/.
// Chequeos (cada uno en los dos tamaños): (1) la tarjeta de la juntada mide lo mismo (±4 px) en la última y en la anterior, y la foto
// (o su lugar) es 3:2; (2) la lista tiene tantas filas numeradas como vinos manda la API para esa juntada, con los espumantes al final;
// (3) filtro: destildar "Todos los años" y elegir 2025 → el título dice "2025" y la caja de botellas coincide con la API;
// (4) en ningún carrusel hay más de 24 px entre filas seguidas; en escritorio están las flechas y en celular no;
// (5) ningún nombre de bodega o región queda recortado y no hay scroll horizontal.

import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { tmpdir } from 'os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 4183, BASE = `http://localhost:${PUERTO}`;
const ID_001 = 'rec7kgfT9LXzYPy6a';
const SHOTS = join(ROOT, 'shots', 'consumos', 'cierre');
mkdirSync(SHOTS, { recursive: true });

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m) process.env[m[1]] ??= m[2];
}
if (!process.env.AIRTABLE_TOKEN) { console.error('Falta AIRTABLE_TOKEN en .env.local'); process.exit(1); }

const { transform } = await import('esbuild');
const { code } = await transform(readFileSync(join(ROOT, 'api/cava.ts'), 'utf8'), { loader: 'ts', format: 'esm' });
const tmp = join(tmpdir(), `cierre-${Date.now()}.mjs`);
writeFileSync(tmp, code, 'utf8');
const { servir } = await import(pathToFileURL(tmp).href);
let cava001 = null;
await servir({ query: {} }, { setHeader() {}, status() { return this; }, json(b) { cava001 = b; return this; } }, null);
const J = cava001.consumos.juntadas;
const cavas = [{ id: ID_001, nombre: 'Club EDB #001', tipo: 'Grupo', miembros: 7, propia: true, dueno: '', titulo: 'Barraquitas', avatar: false, puedeAvatar: false }];

const res = { 1: [], 2: [], 3: [], 4: [], 5: [] };
const anotar = (n, ok, d) => res[n].push({ ok, d });

const srv = spawn(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PUERTO), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
let browser, error = null;
try {
  for (let i = 0; i < 40; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ headless: true });
  for (const [ancho, alto, celu] of [[390, 844, true], [1440, 900, false]]) {
    const t = celu ? '390' : '1440';
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, ...(celu ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}) });
    await ctx.addInitScript(id => { try { localStorage.setItem('edb_cava', id); } catch {} }, ID_001);
    const p = await ctx.newPage();
    await p.route('**/api/cava*', r => r.fulfill({ json: cava001 }));
    await p.route('**/api/auth*', r => r.fulfill({ json: { sesion: true, usuario: { nombre: 'Santiago', email: 'santiago@estaciondebebidas.com', admin: true }, cavas } }));
    await p.route('**/api/montos*', r => r.fulfill({ status: 401, json: { error: 'no' } }));
    await p.goto(`${BASE}/club/cava`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.sum-cards .sec-card', { timeout: 30000 });
    await p.locator('nav.appbar').getByText('Consumos', { exact: true }).click();
    await p.waitForSelector('[data-cons="raiz"]', { timeout: 20000 });
    await p.waitForTimeout(600);

    // 1. alto fijo y foto 3:2
    const medida = () => p.evaluate(() => {
      const c = document.querySelector('[data-cj="tarjeta"]').getBoundingClientRect(), f = document.querySelector('[data-cj="foto"]').getBoundingClientRect();
      return { alto: c.height, ratio: f.width / f.height };
    });
    const m1 = await medida();
    await p.locator('[data-cj="tarjeta"]').screenshot({ path: join(SHOTS, `${t}-juntada-ultima.png`) });
    // 2. filas de la última juntada
    const ult = J[J.length - 1];
    const filas = await p.locator('[data-cj="tarjeta"] .cj-vinos li').evaluateAll(ls => ls.map(l => ({ n: l.querySelector('.cj-num')?.textContent, tipo: l.dataset.tipo })));
    const numeradas = filas.every((f, i) => f.n === String(i + 1));
    const primeraEsp = filas.findIndex(f => f.tipo === 'espumante');
    const espUltimos = primeraEsp < 0 || filas.slice(primeraEsp).every(f => f.tipo === 'espumante');
    // ¿alguna juntada con espumante y otros? se mira también una así, para que el orden se pruebe de verdad
    const conEsp = J.map((j, i) => ({ j, i })).filter(x => x.j.filas.some(f => f.tipo === 'espumante') && x.j.filas.some(f => f.tipo !== 'espumante')).pop();
    await p.locator('[data-cj="prev"]').click();
    await p.waitForTimeout(300);
    const m2 = await medida();
    anotar(1, Math.abs(m1.alto - m2.alto) <= 4 && Math.abs(m1.ratio - 1.5) < 0.02 && Math.abs(m2.ratio - 1.5) < 0.02, `${t}: ${m1.alto.toFixed(1)} vs ${m2.alto.toFixed(1)}, foto ${m1.ratio.toFixed(3)}`);
    let espOtra = true, detEsp = '';
    if (conEsp) {
      // ir a esa juntada: el año con el selector y el punto
      const anio = conEsp.j.mes.slice(0, 4);
      for (let k = 0; k < 10 && (await p.locator('[data-cj="anio"]').innerText()) !== anio; k++) await p.locator('[data-cj="anio-prev"]').click();
      await p.locator(`.cj-punto[data-j="${conEsp.i}"]`).click();
      await p.waitForTimeout(300);
      const fs = await p.locator('[data-cj="tarjeta"] .cj-vinos li').evaluateAll(ls => ls.map(l => l.dataset.tipo));
      const k0 = fs.indexOf('espumante');
      espOtra = fs.length === conEsp.j.filas.length && fs.slice(k0).every(x => x === 'espumante');
      detEsp = ` | ${conEsp.j.mes}: ${fs.join(',')}`;
      const m3 = await medida();
      if (Math.abs(m3.alto - m1.alto) > 4) anotar(1, false, `${t}: ${conEsp.j.mes} mide ${m3.alto.toFixed(1)}`);
    }
    anotar(2, filas.length === ult.filas.length && numeradas && espUltimos && espOtra, `${t}: ${filas.length} filas / API ${ult.filas.length}, numeradas ${numeradas}${detEsp}`);

    // 3. filtro: destildar Todos, elegir 2025
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator('[data-cons="informe"]').click();
    await p.locator('[data-anio-op="todos"]').click();
    await p.locator('[data-anio-op="2025"]').click();
    const periodo = (await p.locator('[data-cons="periodo"]').innerText()).trim();
    const botellas = (await p.locator('[data-cons="cajas"] > div').first().innerText()).split('\n')[0].replace(/\./g, '');
    const api2025 = J.filter(j => j.mes.startsWith('2025')).reduce((s, j) => s + j.filas.reduce((a, f) => a + f.n, 0), 0);
    anotar(3, periodo === '2025' && Number(botellas) === api2025, `${t}: título "${periodo}", botellas ${botellas} / API ${api2025}`);
    await p.keyboard.press('Escape');
    // vuelta a todos los años
    await p.locator('[data-cons="informe"]').click();
    await p.locator('[data-anio-op="todos"]').click();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(300);

    // 4. filas seguidas sin huecos; flechas sólo en escritorio
    const huecos = await p.evaluate(() => {
      const malos = [];
      for (const card of document.querySelectorAll('[data-car] .cc-card')) {
        for (const lista of card.querySelectorAll('.tr-lista, .ae-lista, .cs-vet, .pd-filas, .cj-vinos')) {
          const filas = [...lista.children].filter(e => e.getBoundingClientRect().height > 0);
          for (let i = 1; i < filas.length; i++) {
            const gap = filas[i].getBoundingClientRect().top - filas[i - 1].getBoundingClientRect().bottom;
            if (gap > 24) malos.push(`${card.dataset.card}: ${Math.round(gap)} px`);
          }
        }
      }
      return malos;
    });
    const flechas = await p.locator('.cc-fl').count();
    anotar(4, huecos.length === 0 && (celu ? flechas === 0 : flechas > 0), `${t}: huecos [${huecos.slice(0, 4).join(', ')}], flechas ${flechas}`);

    // 5. nombres enteros y sin scroll horizontal
    const cortes = await p.evaluate(() => {
      const malos = [...document.querySelectorAll('.cs-2r .tr-rot')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
      return { malos, scroll: document.scrollingElement.scrollWidth - window.innerWidth };
    });
    anotar(5, cortes.malos.length === 0 && cortes.scroll <= 0, `${t}: recortados [${cortes.malos.join(', ')}], scroll ${cortes.scroll}`);

    // capturas para mirar
    await p.screenshot({ path: join(SHOTS, `${t}-pantalla.png`), fullPage: true });
    for (const car of ['ritmo', 'cepas', 'geografia', 'anadas', 'calidad']) {
      const cards = p.locator(`[data-car="${car}"] .cc-card`);
      for (let i = 0; i < await cards.count(); i++) {
        const c = cards.nth(i);
        const k = await c.getAttribute('data-card');
        await c.scrollIntoViewIfNeeded(); await p.waitForTimeout(150);
        await c.screenshot({ path: join(SHOTS, `${t}-${car}-${k}.png`) });
      }
    }
    await ctx.close();
  }
} catch (e) { error = e; console.error('Error del script:', e.message); }
finally {
  if (browser) await browser.close().catch(() => {});
  const nombres = {
    1: 'la tarjeta de la juntada mide lo mismo (±4 px) en la última y en la anterior; la foto es 3:2',
    2: 'la lista tiene una fila numerada por vino de la API y los espumantes van últimos',
    3: 'filtro: sin "Todos" y con 2025, el título dice "2025" y las botellas coinciden con la API',
    4: 'ningún hueco de más de 24 px entre filas; flechas en escritorio y no en celular',
    5: 'ningún nombre de bodega o región recortado y sin scroll horizontal',
  };
  let bien = !error;
  for (const n of [1, 2, 3, 4, 5]) {
    const ok = res[n].length >= 2 && res[n].every(x => x.ok);
    bien &&= ok;
    console.log(`  ${ok ? 'OK   ' : 'FALLA'}  ${n}. ${nombres[n]}${ok ? '' : '  →  ' + res[n].map(x => x.d).join(' ;; ')}`);
  }
  console.log(bien ? '\nTodo bien.' : '\nHay chequeos que fallan.');
  try { srv.kill(); } catch {}
  process.exit(bien ? 0 : 1);
}
