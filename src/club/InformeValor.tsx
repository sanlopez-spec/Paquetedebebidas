// Pantalla #valor: el informe de Valor de la cava, sólo para socios de esa cava. Todo sale de /api/montos (informe).
// De arriba hacia abajo: valor de la cava · lo que vale hoy · descuento · descuento año por año · las que más crecieron en guarda · pie.
// Es una sección más de la app: la cabecera con el menú (desktop) y la barra de abajo (celular) las pone ClubCava, igual que en Compras.
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

// 2.1 · el descuento del club: el número más importante de la pantalla (sin barra ni gráfico). Dos partes en la misma caja: arriba el % a la
// izquierda y, a la derecha, "menos que el precio sugerido" con el plan y, chico, "✓ por encima"; abajo, pegada al borde, la franja verde del
// ahorro (el verde de "Al día"). El ahorro sale de la cuenta de "Lo que vale hoy": es el mismo número en toda la pantalla.
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
          <div className="vi-big">
            <span className="tv-num" data-vi="pct">{x} %</span>
            <div className="vi-der">
              <span className="vi-menos">menos que el precio sugerido</span>
              <small className="vi-plan" data-vi="plan">Tu plan: hasta {tope} %{x > tope && <span data-vi="encima"> · ✓ por encima</span>}</small>
            </div>
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

// 2.2 · descuento año por año en barras horizontales compactas: un renglón por año (del más viejo al más nuevo), 12 px de alto y 4 px
// entre renglones; nunca se estiran. Escala fija 0–60 % (si un año o el plan pasan el 60 %, sube al múltiplo de 10 siguiente). La línea
// punteada del % del plan cruza todos los renglones, con "tu plan N %" arriba.
const ESCALA_MIN = 60;
function PorAnio({ inf }: { inf: InformeValor }) {
  const plan = inf.plan ?? 'Reserva';
  const tope = inf.topePlan ?? TOPES[plan];
  const anios = [...inf.descuento.porAnio].sort((a, b) => a.anio - b.anio);
  const mayor = Math.max(tope, ...anios.map(a => a.pct));
  const escala = mayor > ESCALA_MIN ? Math.ceil(mayor / 10) * 10 : ESCALA_MIN;
  const x = (p: number) => `${(Math.max(0, Math.min(p, escala)) / escala) * 100}%`;
  const xTope = (tope / escala) * 100;
  // el rótulo va centrado sobre la línea; cerca de los bordes se alinea para no salirse de la pista
  const rotT = xTope > 80 ? 'translateX(-100%)' : xTope < 20 ? 'none' : 'translateX(-50%)';
  return (
    <div className="bloque" data-vi="anios">
      <div className="bloque-head"><h2 className="bloque-t">Descuento año por año</h2></div>
      <div className="tarjeta-clara valor-graf" data-vi="anios-caja">
        <div className="vi-h" role="img" aria-label="Descuento de cada año contra el % de tu plan">
          <div className="vi-h-cab"><div className="vi-h-pista"><span className="vi-tope-t" data-vi="tope-t" style={{ left: `${xTope}%`, transform: rotT }}>tu plan {tope} %</span></div></div>
          <div className="vi-h-filas">
            <div className="vi-h-capa" aria-hidden="true"><i className="vi-tope" data-vi="tope" style={{ left: `${xTope}%` }} /></div>
            {anios.map(a => (
              <div key={a.anio} className="vi-h-fila" data-vi="anio" data-anio={a.anio}>
                <span className="vi-h-anio">{a.anio}</span>
                <span className="vi-h-pista"><i className="vi-barra" style={{ width: x(a.pct) }} /></span>
                <span className="vi-pct" data-vi="anio-pct">{a.pct} %</span>
              </div>
            ))}
          </div>
        </div>
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
              <span className="vi-nom"><span className="vi-nom-v">{e.vino}</span>{e.anada ? <span className="vi-nom-a">{`\u00a0· ${e.anada}`}</span> : null}</span>
              <small>{e.anios} {e.anios === 1 ? 'año' : 'años'} en guarda · {botellas(e.botellas)}</small>
            </span>
            <b className="vi-monto">+{d.fmt(e.suma)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// 1 · Valor de la cava, arriba y grande: el rótulo como "EL CLUB COMPRA CON DESCUENTO", el valor con la tipografía del "583 botellas" de
// Compras y el ▲ % como en la tarjeta dorada del Inicio. Debajo, sólo en grupales, "Tu parte" con el componente de la cuenta.
// Desde 1 millón de pesos va "$43,5 millones"; abajo de eso y en USD, el número completo. Sigue al botón $ / USD de "Lo que vale hoy".
function ValorCava({ inf, nombre, miembros, grupal }: { inf: InformeValor; nombre: string; miembros: number; grupal: boolean }) {
  const d = useDinero(true);
  const enPesos = d.moneda === 'ARS' && !!d.dolar;
  const pesos = enPesos ? Math.round((inf.valorCava * d.dolar!.valor) / 100) * 100 : 0;
  const millones = enPesos && Math.abs(pesos) >= 1e6;
  const rotulo = `Valor de la cava · ${nombre}${inf.plan ? ` · plan ${inf.plan}` : ''}`.toUpperCase();
  return (
    <div className="bloque" data-vi="cava">
      <div className="vi-rot" data-vi="cabecera">{rotulo}</div>
      <div className="vi-valor tv-big">
        <span className="sec-hero-num" data-vi="valor">
          {millones ? <>${(pesos / 1e6).toFixed(1).replace('.', ',')} <span className="vi-mill">millones</span></> : d.fmt(inf.valorCava)}
        </span>
        {inf.porcentaje > 0 && <span className="tv-pct" data-vi="valor-pct">{`▲ ${inf.porcentaje}%`}</span>}
      </div>
      {grupal && (
        <div className="tv-parte vi-parte" data-tv="parte">
          <div className="tv-parte-t">TU PARTE · 1 DE {miembros}</div>
          <div className="tv-parte-d"><div className="tv-parte-n">{d.fmt(inf.tuParte.valorCava)}</div></div>
        </div>
      )}
    </div>
  );
}

export default function PantallaValor({ nombre, afuera }: { nombre: string; afuera: number }) {
  const m = useMontos();
  const datos = m.estado === 'listo' ? m.datos : null;
  const inf = datos?.informe ?? null;
  const grupal = !!datos && datos.cava.tipo.toLowerCase().includes('grup');
  // los bloques que corresponden (con sus mínimos), en orden; las bandas alternan desde la primera
  const bloques: ReactNode[] = [];
  if (datos && inf) {
    bloques.push(<ValorCava key="v" inf={inf} nombre={nombre} miembros={datos.cava.miembros} grupal={grupal && datos.cava.miembros > 1} />);
    bloques.push(<ValorHoy key="h" afuera={afuera} />);
    if (inf.descuento.sugerido > 0) bloques.push(<Descuento key="d" inf={inf} grupal={grupal} />);
    if (inf.descuento.porAnio.length >= 1) bloques.push(<PorAnio key="a" inf={inf} />);
    if (inf.crecieronN >= 3) bloques.push(<Crecieron key="c" inf={inf} />);
  }
  const mensaje = !inf && m.estado !== 'cargando'
    ? (m.estado === 'error' ? 'No pudimos cargar el informe. Probá de nuevo en unos minutos.' : 'Entrá con tu mail para ver el informe de valor de la cava.')
    : null;
  const banda = (i: number) => (i % 2 === 0 ? 'banda-a' : 'banda-b');
  return (
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
  );
}
