// La línea del dólar (debajo de cada bloque con montos) y el botón $ | USD (sólo en Valor, la tarjeta Valor de Consumos y las fichas).
import { elegirMoneda, nombreMesDolar, useDinero } from './montos';
import './dinero.css';

// Línea chica de las páginas públicas: de qué dólar salen los pesos. Sin dólar no se muestra (los montos van en USD).
export function LineaComercial({ texto }: { texto: 'landing' | 'condiciones' }) {
  const { dolar } = useDinero();
  if (!dolar) return null;
  const mes = nombreMesDolar(dolar);
  return (
    <p className="din-linea" data-din="linea-comercial">
      {texto === 'landing'
        ? `Montos en pesos al dólar oficial de ${mes}. La cuota se define en dólares (USD 50 y USD 100) y se ajusta sola cada mes.`
        : `Pesos al dólar oficial de ${mes}`}
    </p>
  );
}

export function LineaDolar({ conBoton = false }: { conBoton?: boolean }) {
  const d = useDinero(conBoton);
  return <p className="din-linea" data-din="linea">{d.linea}</p>;
}

// color: el de la sección (fondo de la opción activa); si no se pasa, el --sec-c de la pantalla
export function SelectorMoneda({ color }: { color?: string }) {
  const d = useDinero(true);
  if (!d.hayDolar) return null;
  return (
    <div className="din-sel" role="group" aria-label="Moneda" data-din="selector" style={color ? { ['--din-c' as string]: color } : undefined}>
      {(['ARS', 'USD'] as const).map(m => (
        <button key={m} type="button" className={d.moneda === m ? 'on' : ''} aria-pressed={d.moneda === m} data-moneda={m}
          onClick={e => { e.stopPropagation(); elegirMoneda(m); }}>
          {m === 'ARS' ? '$' : 'USD'}
        </button>
      ))}
    </div>
  );
}
