// Regla de layout común a todos los check-*.mjs, y el navegador de iPhone (WebKit).
//
//   import { reglaDeLayout, abrirIphone } from './lib/layout.mjs';
//   const r = await reglaDeLayout(page, { enUnaLinea: '.x, .y', sinRecortar: '.x', sinPisar: ['.x', '.y'] });
//   const { browser, ctx } = await abrirIphone();     // Safari de iPhone 13, 390 px
//
// reglaDeLayout devuelve las infracciones como textos (lista vacía = todo bien):
//   partidos   : textos en dos renglones o más
//   recortados : textos cortados con "…" o desbordados
//   pisados    : textos de un mismo selector que se superponen
//   scroll     : la página es más ancha que la pantalla
// La función corre dentro de la página, así que sirve igual en Chromium y en WebKit.

import { chromium, webkit, devices } from 'playwright';

export async function reglaDeLayout(page, { enUnaLinea = '', sinRecortar = '', sinPisar = [] } = {}) {
  return page.evaluate(({ enUnaLinea, sinRecortar, sinPisar }) => {
    const txt = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const rect = e => e.getBoundingClientRect();
    const lineas = e => {
      const r = document.createRange(); r.selectNodeContents(e);
      return new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size;
    };
    const partidos = enUnaLinea
      ? [...document.querySelectorAll(enUnaLinea)].filter(e => txt(e) && lineas(e) > 1).map(e => `${e.className?.baseVal ?? e.className}:"${txt(e)}"`) : [];
    const recortados = sinRecortar
      ? [...document.querySelectorAll(sinRecortar)].filter(e => txt(e) && e.scrollWidth > e.clientWidth + 1).map(e => `${e.className?.baseVal ?? e.className}:"${txt(e)}"`) : [];
    const pisados = [];
    for (const sel of sinPisar) {
      const els = [...document.querySelectorAll(sel)].filter(e => txt(e)).map(e => ({ e, r: rect(e) }));
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = els[i].r, b = els[j].r;
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) pisados.push(`${sel}:"${txt(els[i].e)}"×"${txt(els[j].e)}"`);
      }
    }
    return { partidos, recortados, pisados, scroll: { s: document.documentElement.scrollWidth, i: window.innerWidth } };
  }, { enUnaLinea, sinRecortar, sinPisar });
}

export const sinInfracciones = r => r.partidos.length === 0 && r.recortados.length === 0 && r.pisados.length === 0 && r.scroll.s <= r.scroll.i;
export const textoInfracciones = r => [...r.partidos, ...r.recortados, ...r.pisados].slice(0, 5).join(' | ') + (r.scroll.s > r.scroll.i ? ` scroll ${r.scroll.s}/${r.scroll.i}` : '');

// Safari de iPhone 13 (390 × 664), en un contexto táctil.
export async function abrirIphone() {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  return { browser, ctx };
}

export async function abrirChromium(viewport) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport });
  return { browser, ctx };
}
