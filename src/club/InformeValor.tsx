// Pantalla #valor: el informe de Valor de la cava, sólo para socios de esa cava. Todo sale de /api/montos (informe).
// De arriba hacia abajo: valor de la cava · lo que vale hoy · descuento · descuento año por año · las que más crecieron en guarda · pie.
// Es una sección más de la app: la cabecera con el menú (desktop) y la barra de abajo (celular) las pone ClubCava, igual que en Compras.
// Las bandas alternan como en el Inicio (la primera es banda-a).
import { useEffect, useState, type ReactNode } from 'react';
import { enMillones, useDinero, useMontos } from './montos';
import type { InformeValor } from './montos';
import { MessageCircle, PiggyBank } from 'lucide-react';
import { useSesion } from './Sesion';
import { WA } from './Colecciones';
import { MontoGrande, ValorHoy, cuentaDeValor } from './TarjetaValor';
import AvisoSeccion, { guardarHito, leerHito } from './AvisoSeccion';
import { hitoTxt, hitoValor } from './avisos';
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
        </div>
        <div className="vi-franja" data-vi="franja">
          <span className="vi-chancho" aria-hidden="true"><PiggyBank size={20} strokeWidth={1.7} /></span>
          <div className="vi-franja-txt">
            <div className="tv-parte-t">{grupal ? 'EL CLUB AHORRÓ' : 'AHORRASTE'}</div>
            <div className="tv-parte-n" data-vi="ahorro"><MontoGrande texto={enMillones(cuentaDeValor(inf, d).filas[1])} /></div>
            <div className="tv-parte-s">en {botellas(inf.descuento.botellas)}</div>
          </div>
        </div>
      </div>
      {plan === 'Reserva' && inf.presupuestoMes != null && <InvitacionGranReserva />}
    </div>
  );
}

// 2.1b · la invitación a Gran Reserva: sólo en plan Reserva (la regla de api/_lib/plan.ts) y en cavas con cuota; nunca para visitantes
// (esta pantalla sólo existe con sesión). Repite la forma del descuento de arriba: el 40 % debajo del % y, en desktop, el botón debajo de
// la franja del ahorro. La × la oculta 90 días en este navegador, por persona; si el navegador no deja guardar, la tarjeta se muestra.
const OCULTA_DIAS = 90;
const MENSAJE_GR = 'Hola Santiago, quiero pasar mi cava a Gran Reserva.';
const claveOculta = (quien: string) => `edb-club-gr-oculta:${quien}`;
function ocultaHasta(quien: string): number { try { return Number(localStorage.getItem(claveOculta(quien))) || 0; } catch { return 0; } }
function InvitacionGranReserva() {
  const ses = useSesion();
  const quien = (ses.usuario?.email ?? '').toLowerCase() || 'anon';
  const [oculta, setOculta] = useState(() => ocultaHasta(quien) > Date.now());
  if (oculta) return null;
  const ocultar = () => {
    try { localStorage.setItem(claveOculta(quien), String(Date.now() + OCULTA_DIAS * 86400_000)); } catch { /* sin almacenamiento: sólo por ahora */ }
    setOculta(true);
  };
  return (
    <div className="vi-gr" data-vi="gran-reserva">
      <div className="vi-gr-izq">
        <div className="vi-rot vi-gr-marca"><svg className="vi-gr-escudo" aria-hidden="true"><use href="#crest" /></svg>GRAN RESERVA</div>
        <div className="vi-big vi-gr-fila">
          <span className="vi-gr-num"><small>hasta</small><span className="tv-num" data-vi="gr-pct">40 %</span></span>
          <div className="vi-der">
            <span className="vi-menos vi-gr-t">de descuento en tu vino</span>
            <small className="vi-plan vi-gr-s">y prioridad en las etiquetas que no alcanzan para todos.</small>
          </div>
        </div>
      </div>
      <div className="vi-gr-acc">
        <a className="vi-gr-btn" data-vi="gr-wa" href={`https://wa.me/${WA}?text=${encodeURIComponent(MENSAJE_GR)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={17} strokeWidth={2} aria-hidden="true" />Quiero pasar a Gran Reserva
        </a>
        <p className="vi-gr-letra">Desde USD 100 por mes en compras.</p>
      </div>
      <button type="button" className="vi-gr-x" data-vi="gr-x" aria-label="Ocultar por ahora" onClick={ocultar}>×</button>
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
  return (
    <div className="bloque" data-vi="anios">
      <div className="bloque-head"><h2 className="bloque-t">Descuento año por año</h2></div>
      <div className="tarjeta-clara valor-graf" data-vi="anios-caja">
        <div className="vi-h" role="img" aria-label="Descuento de cada año contra el % de tu plan">
          <div className="vi-h-cab"><div className="vi-h-pista"><span className="vi-tope-t" data-vi="tope-t" style={{ left: `${xTope}%` }}>tu plan {tope} %</span></div></div>
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

export default function PantallaValor({ afuera }: { nombre: string; afuera: number }) {
  const m = useMontos();
  const datos = m.estado === 'listo' ? m.datos : null;
  const inf = datos?.informe ?? null;
  const grupal = !!datos && datos.cava.tipo.toLowerCase().includes('grup');
  // el aviso de los números redondos: el valor en pesos (el mismo que se muestra) contra el más alto ya pasado, que se guarda por persona y cava
  const ses = useSesion(), din = useDinero(true), email = ses.usuario?.email;
  const [cerrado, setCerrado] = useState(false);
  const hito = inf && din.dolar ? hitoValor(inf.valorCava * din.dolar.valor) : 0;
  const saved = hito > 0 ? leerHito(email, ses.cavaId) : null;
  useEffect(() => { if (hito > 0 && leerHito(email, ses.cavaId) === null) guardarHito(email, ses.cavaId, hito); }, [hito, email, ses.cavaId]);
  // los bloques que corresponden (con sus mínimos), en orden; las bandas alternan desde la primera
  const bloques: ReactNode[] = [];
  if (datos && inf) {
    bloques.push(<ValorHoy key="h" afuera={afuera} grupal={grupal && datos.cava.miembros > 1}
      aviso={hito > 0 && saved !== null && hito > saved && !cerrado ? (
        <AvisoSeccion a={{ rotulo: 'VALOR DE LA CAVA', titulo: `¡Tu cava pasó los ${hitoTxt(hito)}!`, dato: 'valor' }}
          onCerrar={() => { guardarHito(email, ses.cavaId, hito); setCerrado(true); }} />
      ) : undefined} />);
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
