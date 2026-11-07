// Colecciones de la cava: verticales (mismo vino, distintas añadas) y horizontales (misma línea y añada,
// distintos vinos). Las arma api/cava.ts; acá sólo se dibujan. Más la oferta de relevamiento de precios.
import { useState, useRef, useEffect } from 'react';
import './colecciones.css';

export interface Vertical { vino: string; bodega: string; cepa: string; color: string; anios: { an: number; n: number; vino: string }[]; diff: number }
export interface Horizontal { linea: string; an: number; bodega: string; vinos: { nombre: string; cepa: string; color: string; n: number; vino: string }[] }
export interface ColeccionesApi { verticales: Vertical[]; horizontales: Horizontal[] }
export type AbrirFicha = (vino: string, an: number) => void;

const fmtN = (n: number) => new Intl.NumberFormat('es-AR').format(n);
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const VISIBLES = 6;

export function resumenColecciones(c?: ColeccionesApi | null) {
  const v = c?.verticales ?? [], h = c?.horizontales ?? [];
  if (!v.length && !h.length) return null;
  const top = [...v].sort((a, b) => b.diff - a.diff || b.anios.length - a.anios.length)[0] ?? null;
  return { nV: v.length, nH: h.length, top };
}

// ── tarjeta del carrusel del Inicio ──
export function TarjetaColecciones({ c, onVer }: { c: NonNullable<ReturnType<typeof resumenColecciones>>; onVer: () => void }) {
  const { nV, nH, top } = c;
  return (
    <button type="button" className="col-tarjeta" data-col="tarjeta" onClick={onVer}>
      <h3>Tus colecciones</h3>
      <div className="col-t-fila">
        {nV > 0 && <><b className="col-t-num">{fmtN(nV)}</b><span className="col-t-txt">{plural(nV, 'colección vertical', 'colecciones verticales')}</span></>}
        {nH > 0 && (nV > 0
          ? <span className="col-t-hor"><b>{fmtN(nH)}</b> {plural(nH, 'horizontal', 'horizontales')}</span>
          : <><b className="col-t-num">{fmtN(nH)}</b><span className="col-t-txt">{plural(nH, 'colección horizontal', 'colecciones horizontales')}</span></>)}
      </div>
      {top && (
        <p className="col-t-top">
          {top.vino} · {top.anios[0].an} → {top.anios[top.anios.length - 1].an} · {fmtN(top.diff)} {plural(top.diff, 'año', 'años')} de diferencia
        </p>
      )}
    </button>
  );
}

// Las primeras 6 filas y un "Ver las N →" que despliega el resto debajo, en el mismo formato.
function Desplegable<T>({ items, fila, clase }: { items: T[]; fila: (x: T) => React.ReactNode; clase: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <div className={clase}>{items.slice(0, VISIBLES).map(fila)}</div>
      {items.length > VISIBLES && (
        <>
          {abierto && <div className={clase + ' col-resto'} data-col="resto">{items.slice(VISIBLES).map(fila)}</div>}
          <button type="button" className="col-mas" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
            {abierto ? 'Ver menos' : `Ver las ${fmtN(items.length)} →`}
          </button>
        </>
      )}
    </>
  );
}

// ── Añadas: Colecciones verticales (línea de tiempo con escala común) ──
const SEPARACION_ETIQ = 24;   // px mínimos entre dos etiquetas de año de la misma fila

function useMovil() {
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const f = () => setMovil(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return movil;
}

// Cada fila mide su eje en píxeles y reparte las etiquetas: abajo si entra, si no arriba, si no ninguna.
function FilaVertical({ v, min, span, anios, movil, onFicha }: {
  v: Vertical; min: number; span: number; anios: number[]; movil: boolean; onFicha: AbrirFicha;
}) {
  const pistaRef = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const n = pistaRef.current; if (!n) return;
    const medir = () => setAncho(n.clientWidth);
    medir();
    const ro = new ResizeObserver(medir); ro.observe(n);
    return () => ro.disconnect();
  }, []);
  const pos = (an: number) => `${((an - min) / span) * 100}%`;
  const ini = v.anios[0].an, fin = v.anios[v.anios.length - 1].an;
  const sitios = new Map<number, 'abajo' | 'arriba' | null>();
  let ultAbajo = -Infinity, ultArriba = -Infinity;
  for (const a of v.anios) {
    const x = ((a.an - min) / span) * ancho;
    if (x - ultAbajo >= SEPARACION_ETIQ) { sitios.set(a.an, 'abajo'); ultAbajo = x; }
    else if (x - ultArriba >= SEPARACION_ETIQ) { sitios.set(a.an, 'arriba'); ultArriba = x; }
    else sitios.set(a.an, null);
  }
  return (
    <div className="col-fila" data-col="vertical">
      <div className="col-nom">
        <b>{v.vino}</b>
        <span>{v.bodega} · {fmtN(v.anios.length)} añadas · {fmtN(v.diff)} {plural(v.diff, 'año', 'años')}</span>
      </div>
      <div className="col-eje" data-col="eje"><div className="col-pista" ref={pistaRef}>
        <div className="col-base" />
        {anios.map(a => <i key={a} className="col-marca" style={{ left: pos(a) }} />)}
        <div className="col-tramo" style={{ left: pos(ini), width: `${((fin - ini) / span) * 100}%`, background: v.color }} />
        {v.anios.map(a => {
          const d = movil ? Math.min(18, 10 + 2 * a.n) : Math.min(30, 14 + 3 * a.n);
          const sitio = sitios.get(a.an);
          const lado = sitio === 'arriba' ? { bottom: `calc(50% + ${d / 2 + 2}px)` } : { top: `calc(50% + ${d / 2 + 2}px)` };
          return (
            <button key={a.an} type="button" className="col-punto" data-an={a.an} style={{ left: pos(a.an) }}
              aria-label={`${v.vino} ${a.an}, ${a.n} ${plural(a.n, 'botella', 'botellas')}`} onClick={() => onFicha(a.vino, a.an)}>
              <span className="col-bolita" style={{ width: d, height: d, background: v.color, fontSize: movil ? 9 : 11 }}>{a.n > 1 ? a.n : ''}</span>
              {sitio && <em className="col-anio" data-sitio={sitio} style={lado}>&apos;{String(a.an).slice(-2)}</em>}
            </button>
          );
        })}
      </div></div>
    </div>
  );
}

export function BloqueVerticales({ lista, onFicha }: { lista: Vertical[]; onFicha: AbrirFicha }) {
  const movil = useMovil();
  if (!lista.length) return null;
  const todos = lista.flatMap(v => v.anios.map(a => a.an));
  const min = Math.min(...todos), max = Math.max(...todos);
  const span = Math.max(max - min, 1);
  const anios = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  // regla de arriba: años completos cada 2; en celular cada 4 si la escala abarca más de 12 años
  const paso = movil && span > 12 ? 4 : 2;
  return (
    <div className="tpanel col-bloque" data-bloque="verticales">
      <h3>Colecciones verticales <span>El mismo vino guardado a lo largo de los años.</span></h3>
      <div className="col-fila col-regla" aria-hidden="true">
        <div className="col-eje"><div className="col-pista">
          {anios.filter((_, i) => i % paso === 0).map(a => <span key={a} style={{ left: `${((a - min) / span) * 100}%` }}>{a}</span>)}
        </div></div>
      </div>
      <Desplegable clase="col-lista" items={lista} fila={v => (
        <FilaVertical key={v.vino} v={v} min={min} span={span} anios={anios} movil={movil} onFicha={onFicha} />
      )} />
    </div>
  );
}

// ── Cepas y estilos: Colecciones horizontales (filas con un bloque por vino) ──
const palabras = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.\-]/g, ' ').split(/\s+/).filter(Boolean);
// ¿el nombre corto ya dice la cepa (completa o abreviada: "Cab. Franc", "Malbec")?
const yaDiceLaCepa = (corto: string, cepa: string) => {
  const ct = palabras(corto);
  return palabras(cepa).every(p => ct.some(c => c.length >= 3 && (p.startsWith(c) || c.startsWith(p))));
};

export function BloqueHorizontales({ lista, onFicha }: { lista: Horizontal[]; onFicha: AbrirFicha }) {
  if (!lista.length) return null;
  return (
    <div className="tpanel col-bloque" data-bloque="horizontales">
      <h3>Colecciones horizontales <span>Misma línea y añada, distintas cepas o viñedos.</span></h3>
      <Desplegable clase="col-lista" items={lista} fila={h => {
        const todas = h.vinos.every(v => v.cepa === h.vinos[0].cepa);
        const k = h.vinos.length === 4 ? 2 : 3;   // celular: 4 vinos en 2×2, el resto en filas de 3
        return (
          <div key={`${h.linea}|${h.an}`} className="col-fila col-hfila" data-col="horizontal">
            <div className="col-hizq">
              <div className="col-an">{h.an}</div>
              <div className="col-linea-n">{h.linea}</div>
              <div className="col-sub">{h.bodega} · {fmtN(h.vinos.length)} vinos{todas ? ` · todos ${h.vinos[0].cepa}` : ''}</div>
            </div>
            <div className="col-hbarra" data-col="barra" style={{ ['--k' as string]: k }}>
              {h.vinos.map(v => (
                <button key={v.vino} type="button" className="col-bloque-vino" data-vino={v.nombre} style={{ background: v.color }}
                  title={`${v.cepa} · ${v.vino}`} onClick={() => onFicha(v.vino, h.an)}>
                  <span className="col-bv-nom">{v.nombre}{v.n > 1 ? ` ×${v.n}` : ''}</span>
                  {!todas && !yaDiceLaCepa(v.nombre, v.cepa) && <span className="col-bv-cepa">{v.cepa}</span>}
                </button>
              ))}
            </div>
          </div>
        );
      }} />
    </div>
  );
}

// ── Inicio: relevamiento de precios ──
const WA = '5491165803342';   // el mismo número de EDB que usa la landing del club
export const urlRelevamiento = (n: number) =>
  `https://wa.me/${WA}?text=${encodeURIComponent(`Hola, quiero pedir el relevamiento de precios de mi cava (${n} botellas).`)}`;

export function TarjetaRelevamiento({ n }: { n: number }) {
  return (
    <div className="tv col-rel" data-tv="relevamiento">
      <h3 className="tv-t">¿Cuánto vale tu cava hoy?</h3>
      <p className="col-rel-txt">Relevamos el precio de mercado actual de tus {fmtN(n)} botellas, una por una.</p>
      <a className="col-rel-btn" href={urlRelevamiento(n)} target="_blank" rel="noopener noreferrer">Pedir relevamiento</a>
    </div>
  );
}
