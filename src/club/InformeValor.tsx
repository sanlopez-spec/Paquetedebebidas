// Pantalla #valor: el informe de Valor de la cava, sólo para socios de esa cava. Todo sale de /api/montos (informe).
// De arriba hacia abajo: descuento · descuento año por año · lo que vale hoy · las que más crecieron en guarda · pie.
// Las bandas alternan como en el Inicio (la primera es banda-a).
import type { ReactNode } from 'react';
import { useDinero, useMontos } from './montos';
import type { InformeValor } from './montos';
import { PiggyBank } from 'lucide-react';
import { ValorHoy, cuentaDeValor } from './TarjetaValor';
import { LineaDolar } from './Dinero';

const fmtN = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const botellas = (n: number) => `${fmtN(n)} ${n === 1 ? 'botella' : 'botellas'}`;
const TOPES = { Reserva: 30, 'Gran Reserva': 40 } as const;

// 2.1 · el descuento del club: el número más importante de la pantalla (sin barra ni gráfico). Dos partes en la misma caja: arriba el %
// y las píldoras; abajo, pegada al borde, la franja bordó del ahorro (como "Tu parte"). El ahorro sale de la cuenta de "Lo que vale hoy".
function Descuento({ inf, grupal }: { inf: InformeValor; grupal: boolean }) {
  const d = useDinero(true);
  const plan = inf.plan ?? 'Reserva';
  const tope = inf.topePlan ?? TOPES[plan];
  const x = inf.descuento.pct;
  return (
    <div className="bloque" data-vi="descuento">
      <div className="tarjeta-clara vi-desc">
        <div className="vi-arriba" data-vi="arriba">
          <div className="vi-rot">EL CLUB COMPRA CON DESCUENTO</div>
          <div className="vi-big"><span className="tv-num" data-vi="pct">{x} %</span><span>menos que el<br />precio sugerido</span></div>
          <div className="vi-pildoras">
            <span className="tv-pill vi-pildora" data-vi="plan">Tu plan {plan}: hasta {tope} %</span>
            {x > tope && <span className="tv-pill vi-pildora vi-pildora-ok" data-vi="encima">✓ Estás por encima</span>}
          </div>
          {plan === 'Reserva' && <a className="vi-link" href="/club#planes" data-vi="subir">Con Gran Reserva, hasta 40 % · Subí de plan ›</a>}
        </div>
        <div className="vi-franja" data-vi="franja">
          <span className="vi-chancho" aria-hidden="true"><PiggyBank size={20} strokeWidth={1.7} /></span>
          <div className="vi-franja-txt">
            <div className="tv-parte-t">{grupal ? 'EL CLUB AHORRÓ' : 'AHORRASTE'}</div>
            <div className="tv-parte-n" data-vi="ahorro">{cuentaDeValor(inf, d).filas[1]}</div>
            <div className="tv-parte-s">en {botellas(inf.descuento.botellas)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 2.2 · una barra por año con el descuento de ese año y la línea punteada del tope del plan. El rótulo "tu plan" va arriba de la línea,
// en una columna a la derecha del gráfico donde no hay barras: nunca queda encima de una.
function PorAnio({ inf }: { inf: InformeValor }) {
  const plan = inf.plan ?? 'Reserva';
  const tope = inf.topePlan ?? TOPES[plan];
  const anios = inf.descuento.porAnio;
  const max = Math.max(tope, ...anios.map(a => a.pct), 1);
  const ALTO = 110;                                           // px de las barras; arriba queda el aire para los %
  return (
    <div className="bloque" data-vi="anios">
      <div className="bloque-head"><h2 className="bloque-t">Descuento año por año</h2></div>
      <div className="tarjeta-clara valor-graf">
        <div className="vi-plot" role="img" aria-label="Descuento de cada año contra el tope de tu plan">
          <div className="vi-tope" data-vi="tope" style={{ bottom: `${(tope / max) * ALTO}px` }}><span data-vi="tope-t">tu plan: {tope} %</span></div>
          {anios.map(a => (
            <div key={a.anio} className="vi-col" data-anio={a.anio}>
              <span className="vi-pct" data-vi="anio-pct">{a.pct} %</span>
              <span className="vi-barra" style={{ height: `${Math.max(0, (a.pct / max) * ALTO)}px` }} />
            </div>
          ))}
        </div>
        <div className="vi-anios">{anios.map(a => <span key={a.anio}>{a.anio}</span>)}</div>
      </div>
    </div>
  );
}

// 2.4 · las 5 etiquetas en guarda a las que más les sumó la guarda
function Crecieron({ inf }: { inf: InformeValor }) {
  const d = useDinero(true);
  return (
    <div className="bloque" data-vi="crecieron">
      <div className="bloque-head"><h2 className="bloque-t">Las que más crecieron en guarda</h2></div>
      <div className="tarjeta-clara valor-rank">
        {inf.crecieron.map((e, i) => (
          <div key={i} className="vr-fila" data-vi="fila">
            <span className="vi-fila-et">
              <span className="vi-nom">{e.vino}{e.anada ? ` · ${e.anada}` : ''}</span>
              <small>{e.anios} {e.anios === 1 ? 'año' : 'años'} en guarda · {botellas(e.botellas)}</small>
            </span>
            <b>+{d.fmt(e.suma)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PantallaValor({ nombre, afuera, onVolver }: { nombre: string; afuera: number; onVolver: () => void }) {
  const m = useMontos();
  const inf = m.estado === 'listo' ? m.datos.informe : null;
  // los bloques que corresponden (con sus mínimos), en orden; las bandas alternan desde la primera
  const bloques: ReactNode[] = [];
  if (inf) {
    if (inf.descuento.sugerido > 0) bloques.push(<Descuento key="d" inf={inf} grupal={!!m.estado && m.estado === 'listo' && m.datos.cava.tipo.toLowerCase().includes('grup')} />);
    if (inf.descuento.porAnio.length >= 2) bloques.push(<PorAnio key="a" inf={inf} />);
    bloques.push(<ValorHoy key="h" afuera={afuera} />);
    if (inf.crecieronN >= 3) bloques.push(<Crecieron key="c" inf={inf} />);
  }
  const mensaje = !inf && m.estado !== 'cargando'
    ? (m.estado === 'error' ? 'No pudimos cargar el informe. Probá de nuevo en unos minutos.' : 'Entrá con tu mail para ver el informe de valor de la cava.')
    : null;
  const banda = (i: number) => (i % 2 === 0 ? 'banda-a' : 'banda-b');
  return (
    <>
      <header className="tab-top valor-top">
        <div className="tab-top-in">
          <button className="tab-back" type="button" onClick={onVolver} aria-label="Volver al inicio">←</button>
          <b>Valor de la cava</b>
          <span className="valor-top-sub" data-vi="cabecera">{nombre}{inf?.plan ? ` · plan ${inf.plan}` : ''}</span>
        </div>
      </header>
      <div className="inicio" data-vi="pantalla">
        {bloques.map((b, i) => (
          <section key={i} className={`banda ${banda(i)}`} data-banda={i + 1}><div className="banda-in">{b}</div></section>
        ))}
        {mensaje && <section className="banda banda-a" data-banda="1"><div className="banda-in"><p className="tnote">{mensaje}</p></div></section>}
        {inf && (
          <section className={`banda ${banda(bloques.length)}`} data-banda={bloques.length + 1}>
            <div className="banda-in">
              <p className="tnote" data-vi="pie">El precio sugerido es el de bodega en dólares al momento de la compra. Lo que suma la guarda es una estimación, no un precio de venta.</p>
              <LineaDolar />
            </div>
          </section>
        )}
      </div>
    </>
  );
}
