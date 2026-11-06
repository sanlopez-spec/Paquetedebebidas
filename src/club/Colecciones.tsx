// Colecciones de la cava: verticales (mismo vino, distintas añadas) y horizontales (misma línea y añada,
// distintos vinos). Las arma api/cava.ts; acá sólo se dibujan. Más la oferta de relevamiento de precios.
import { useState } from 'react';
import './colecciones.css';

export interface Vertical { vino: string; bodega: string; anios: { an: number; n: number; vino: string }[]; diff: number }
export interface Horizontal { linea: string; an: number; vinos: { nombre: string; cepa: string; color: string; n: number; vino: string }[] }
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

// Las primeras 6 filas y un "Ver las N" que despliega el resto debajo, a todo el ancho.
function Desplegable<T>({ items, fila }: { items: T[]; fila: (x: T) => React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <div className="col-lista">{items.slice(0, VISIBLES).map(fila)}</div>
      {items.length > VISIBLES && (
        <>
          <button type="button" className="col-mas" aria-expanded={abierto} onClick={() => setAbierto(v => !v)}>
            {abierto ? 'Ver menos' : `Ver las ${fmtN(items.length)}`}
          </button>
          {abierto && <div className="col-lista col-resto" data-col="resto">{items.slice(VISIBLES).map(fila)}</div>}
        </>
      )}
    </>
  );
}

// ── Añadas: Colecciones verticales ──
export function BloqueVerticales({ lista, onFicha }: { lista: Vertical[]; onFicha: AbrirFicha }) {
  if (!lista.length) return null;
  return (
    <div className="tpanel col-bloque" data-bloque="verticales">
      <h3>Colecciones verticales <span>El mismo vino guardado en distintas añadas.</span></h3>
      <Desplegable items={lista} fila={v => (
        <div key={v.vino} className="col-fila" data-col="vertical">
          <div className="col-nom"><b>{v.vino}</b> <span>{v.bodega}</span></div>
          <div className="col-linea">
            {v.anios.map(a => (
              <button key={a.an} type="button" className="col-ficha" onClick={() => onFicha(a.vino, a.an)}>
                {a.an}{a.n > 1 && <i> ×{a.n}</i>}
              </button>
            ))}
          </div>
        </div>
      )} />
    </div>
  );
}

// ── Cepas y estilos: Colecciones horizontales ──
export function BloqueHorizontales({ lista, onFicha, textoSobre }: { lista: Horizontal[]; onFicha: AbrirFicha; textoSobre: (hex: string) => string }) {
  if (!lista.length) return null;
  return (
    <div className="tpanel col-bloque" data-bloque="horizontales">
      <h3>Colecciones horizontales <span>Misma línea y añada, distintas cepas o viñedos.</span></h3>
      <Desplegable items={lista} fila={h => (
        <div key={`${h.linea}|${h.an}`} className="col-fila col-hor" data-col="horizontal">
          <div className="col-nom"><b>{h.linea} · {h.an}</b></div>
          <div className="col-linea">
            {h.vinos.map(v => (
              <button key={v.vino} type="button" className="col-ficha col-cepa" title={v.cepa}
                style={{ background: v.color, color: textoSobre(v.color) }} onClick={() => onFicha(v.vino, h.an)}>
                {v.nombre}
              </button>
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
