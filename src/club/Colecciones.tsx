// Colecciones de la cava: verticales (mismo vino, distintas añadas) y horizontales (misma línea y añada,
// distintos vinos). Las arma api/cava.ts; acá sólo se dibujan. Más la oferta de relevamiento de precios.
import { useState } from 'react';
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
        {nH > 0 && <span className="col-t-hor"><b>{fmtN(nH)}</b> {plural(nH, 'horizontal', 'horizontales')}</span>}
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
export function BloqueVerticales({ lista, onFicha }: { lista: Vertical[]; onFicha: AbrirFicha }) {
  if (!lista.length) return null;
  const todos = lista.flatMap(v => v.anios.map(a => a.an));
  const min = Math.min(...todos), max = Math.max(...todos);
  const span = Math.max(max - min, 1);
  const pos = (an: number) => `${((an - min) / span) * 100}%`;
  const anios = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="tpanel col-bloque" data-bloque="verticales">
      <h3>Colecciones verticales <span>El mismo vino guardado a lo largo de los años.</span></h3>
      <div className="col-fila col-regla" aria-hidden="true">
        <div className="col-eje"><div className="col-pista">
          {anios.filter((_, i) => i % 2 === 0).map(a => <span key={a} style={{ left: pos(a) }}>{a}</span>)}
        </div></div>
      </div>
      <Desplegable clase="col-lista" items={lista} fila={v => {
        const ini = v.anios[0].an, fin = v.anios[v.anios.length - 1].an;
        return (
          <div key={v.vino} className="col-fila" data-col="vertical">
            <div className="col-nom">
              <b>{v.vino}</b>
              <span>{v.bodega} · {fmtN(v.anios.length)} añadas · {fmtN(v.diff)} {plural(v.diff, 'año', 'años')}</span>
            </div>
            <div className="col-eje" data-col="eje"><div className="col-pista">
              <div className="col-base" />
              {anios.map(a => <i key={a} className="col-marca" style={{ left: pos(a) }} />)}
              <div className="col-tramo" style={{ left: pos(ini), width: `${((fin - ini) / span) * 100}%`, background: v.color }} />
              {v.anios.map(a => {
                const d = Math.min(30, 14 + 3 * a.n);
                return (
                  <button key={a.an} type="button" className="col-punto" data-an={a.an} style={{ left: pos(a.an) }}
                    aria-label={`${v.vino} ${a.an}, ${a.n} ${plural(a.n, 'botella', 'botellas')}`} onClick={() => onFicha(a.vino, a.an)}>
                    <span className="col-bolita" style={{ width: d, height: d, background: v.color }}>{a.n > 1 ? a.n : ''}</span>
                    <em>{a.an}</em>
                  </button>
                );
              })}
            </div></div>
          </div>
        );
      }} />
    </div>
  );
}

// ── Cepas y estilos: Colecciones horizontales (barra de cepas) ──
export function BloqueHorizontales({ lista, onFicha }: { lista: Horizontal[]; onFicha: AbrirFicha }) {
  if (!lista.length) return null;
  return (
    <div className="tpanel col-bloque" data-bloque="horizontales">
      <h3>Colecciones horizontales <span>Misma línea y añada, distintas cepas o viñedos.</span></h3>
      <Desplegable clase="col-grilla" items={lista} fila={h => (
        <div key={`${h.linea}|${h.an}`} className="col-tarj" data-col="horizontal">
          <div className="col-an">{h.an}</div>
          <div className="col-linea-n">{h.linea}</div>
          <div className="col-sub">{h.bodega} · {fmtN(h.vinos.length)} vinos</div>
          <div className="col-barra" data-col="barra">
            {h.vinos.map(v => (
              <button key={v.vino} type="button" className="col-parte" style={{ background: v.color }}
                title={`${v.cepa} · ${v.vino}`} onClick={() => onFicha(v.vino, h.an)}>
                <span>{v.nombre}</span>
              </button>
            ))}
          </div>
          <div className="col-leyenda">
            {h.vinos.map(v => (
              <span key={v.vino}><i style={{ background: v.color }} />{v.cepa}{v.n > 1 ? ` ×${v.n}` : ''}</span>
            ))}
          </div>
        </div>
      )} />
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
