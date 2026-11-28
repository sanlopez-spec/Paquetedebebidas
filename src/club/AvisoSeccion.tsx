// El aviso de arriba de una sección: la tarjeta de "El sommelier sugiere" (rótulo dorado, título en Fraunces, una línea y, si tiene, el botón
// píldora bordó) con una × opcional. Sólo para socios logueados con datos de la cava (quien lo usa decide cuándo mostrarlo).
// Lo que se cierra se guarda por persona y cava (email + id de la cava) en localStorage; si el navegador no deja guardar, el aviso se muestra.
import { useCallback, useState } from 'react';
import './sommelier.css';

export interface DatosAviso { rotulo: string; titulo: string; texto?: string; boton?: string; dato?: string }

export default function AvisoSeccion({ a, onBoton, onCerrar }: { a: DatosAviso; onBoton?: () => void; onCerrar?: () => void }) {
  return (
    <aside className={'som-card av-card' + (onCerrar ? ' av-cerrable' : '')} data-aviso={a.dato ?? ''} aria-label={a.rotulo}>
      <div className="som-cuerpo">
        <span className="som-rot">{a.rotulo}</span>
        <h3 className="som-t">{a.titulo}</h3>
        {a.texto && <p className="som-x">{a.texto}</p>}
      </div>
      {a.boton && onBoton && <button type="button" className="som-cta" data-aviso-boton onClick={onBoton}>{a.boton}</button>}
      {onCerrar && <button type="button" className="av-x" data-aviso-x aria-label="Cerrar el aviso" onClick={onCerrar}>×</button>}
    </aside>
  );
}

const claveLS = (tipo: string, quien: string, cavaId: string) => `edb-club-${tipo}:${quien.toLowerCase() || 'anon'}:${cavaId}`;
function leer(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function guardar(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento: el aviso se muestra */ } }

// los avisos cerrados de esta persona en esta cava (por clave); si no se puede guardar, igual quedan cerrados hasta recargar.
// La sesión llega después de que la pantalla arranca: la lista se vuelve a leer cuando cambia la persona o la cava.
const leerLista = (k: string): string[] => { try { const v = JSON.parse(leer(k) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
export function useCerrados(email: string | undefined, cavaId: string | null | undefined): [(clave: string) => boolean, (clave: string) => void] {
  const k = claveLS('aviso', email ?? '', cavaId ?? '');
  const [est, setEst] = useState(() => ({ k, lista: leerLista(k) }));
  const lista = est.k === k ? est.lista : leerLista(k);
  const cerrado = useCallback((c: string) => lista.includes(c), [lista]);
  const cerrar = useCallback((c: string) => setEst(p => {
    const base = p.k === k ? p.lista : leerLista(k);
    if (base.includes(c)) return p;
    const n = [...base, c]; guardar(k, JSON.stringify(n)); return { k, lista: n };
  }), [k]);
  return [cerrado, cerrar];
}

// el número redondo más alto de Valor ya pasado (por persona y cava); null = nunca se guardó
export function leerHito(email: string | undefined, cavaId: string | null | undefined): number | null {
  const v = leer(claveLS('valor-hito', email ?? '', cavaId ?? ''));
  return v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
}
export function guardarHito(email: string | undefined, cavaId: string | null | undefined, n: number) { guardar(claveLS('valor-hito', email ?? '', cavaId ?? ''), String(n)); }
