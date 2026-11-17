// Selector con flechas: el mismo en la tarjeta del mes y el año de Mes por mes (Compras) y en las juntadas (Consumos).
// A la izquierda el texto (un rótulo en mayúsculas chicas, o el año en serif) y, si hace falta, un renglón de dato debajo; a la derecha las dos
// flechas juntas. Nada va centrado: todo arranca del borde izquierdo de la tarjeta. La flecha sin destino queda al 35 %.
import type { ReactNode } from 'react';
import './selector-flechas.css';

// tono: 'oscuro' = sobre un fondo oscuro (blanco al 12 %); 'claro' = sobre un fondo claro (bordó al 10 %)
// variante: 'rotulo' = mayúsculas chicas; 'anio' = serif grande
export default function SelectorFlechas({ variante, tono, rotulo, dato, onPrev, onNext, sinPrev, sinNext, etiquetaPrev, etiquetaNext, data = {}, ns = 'cm', onTouchStart, onTouchEnd }: {
  variante: 'rotulo' | 'anio'; tono: 'oscuro' | 'claro'; rotulo: ReactNode; dato?: ReactNode;
  onPrev: () => void; onNext: () => void; sinPrev: boolean; sinNext: boolean; etiquetaPrev: string; etiquetaNext: string;
  data?: { rotulo?: string; dato?: string; prev?: string; next?: string };
  ns?: 'cm' | 'cj';   // prefijo de los data-*: data-cm (Compras) o data-cj (Juntadas)
  onTouchStart?: React.TouchEventHandler; onTouchEnd?: React.TouchEventHandler;
}) {
  const at = (v?: string) => (v ? { [`data-${ns}`]: v } : {});
  return (
    <div className="sf" data-sf={variante} data-tono={tono} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="sf-txt">
        <div className={variante === 'anio' ? 'sf-anio' : 'sf-rot'} {...at(data.rotulo)}>{rotulo}</div>
        {dato !== undefined && dato !== null && dato !== false && <div className="sf-dato" {...at(data.dato)}>{dato}</div>}
      </div>
      <div className="sf-flechas">
        <button type="button" className="sf-flecha" aria-label={etiquetaPrev} {...at(data.prev)} disabled={sinPrev} onClick={onPrev}>
          <i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14.5 6 8.5 12l6 6" /></svg></i>
        </button>
        <button type="button" className="sf-flecha" aria-label={etiquetaNext} {...at(data.next)} disabled={sinNext} onClick={onNext}>
          <i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6" /></svg></i>
        </button>
      </div>
    </div>
  );
}
