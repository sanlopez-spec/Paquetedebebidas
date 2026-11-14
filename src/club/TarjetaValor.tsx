// Tarjeta "Valor de la cava": la ven los socios con sus montos reales; el visitante la ve con los montos tapados y sin gráfico.
// Los números salen de /api/montos (informe); acá sólo se dibujan. Lo mismo en el Inicio y en la pantalla del informe.
import { useState } from 'react';
import { MONTO_TAPADO, useDinero, useMontos } from './montos';
import type { InformeValor } from './montos';
import { monoCurves, moveTo } from './curvas';
import { urlRelevamiento } from './Colecciones';
import { LineaDolar, SelectorMoneda } from './Dinero';
import './tarjeta-valor.css';

// los colores de lo que está en guarda y de lo abierto (gris carbón: el mismo de abiertas en toda la app)
const COLOR_GUARDA = '#732D3E';
const COLOR_ABIERTAS = '#4A4340';
// paso "redondo" del eje (1, 2 o 5 × 10^k) para que entren unas 4 a 6 líneas
function pasoRedondo(tope: number): number {
  const crudo = tope / 5;
  const p = 10 ** Math.floor(Math.log10(crudo));
  return [1, 2, 5, 10].map(k => k * p).find(x => x >= crudo) ?? 10 * p;
}
const ALTO = 1000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesLargo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const pct = (v: number) => `${(v / 10).toFixed(2)}%`;

// Las alturas se calculan a mano: el gris de abiertas llega hasta cava + tomado, el bordó hasta cava, y se dibuja encima;
// la línea de compras va al frente. Del fondo al frente: gris → bordó → línea.
function Grafico({ inf, conBoton }: { inf: InformeValor; conBoton: boolean }) {
  const [hov, setHov] = useState<number | null>(null);
  const d = useDinero(conBoton);
  const s = inf.serie, N = s.length;
  if (N < 2) return null;
  // el eje va en la moneda que se muestra: los pasos se eligen redondos en esa moneda (f = pesos por dólar, o 1)
  const f = d.moneda === 'ARS' && d.dolar ? d.dolar.valor : 1;
  const tope = Math.max(...s.map(p => Math.max(p.cava + p.tomado, p.compras)), 1);
  const paso = pasoRedondo(tope * f) / f;
  const max = Math.ceil(tope / paso) * paso;
  const xs = s.map((_, i) => (i / (N - 1)) * 1000);
  const py = (v: number) => (1 - v / max) * ALTO;
  const area = (alto: (p: typeof s[number]) => number) => {
    const pts: [number, number][] = s.map((p, i) => [xs[i], py(alto(p))]);
    return `${moveTo(pts[0])} ${monoCurves(pts)} L1000,${ALTO} L0,${ALTO} Z`;
  };
  const lineaPts: [number, number][] = s.map((p, i) => [xs[i], py(p.compras)]);
  const linea = `${moveTo(lineaPts[0])} ${monoCurves(lineaPts)}`;
  const ticks = Array.from({ length: Math.round(max / paso) + 1 }, (_, i) => i * paso);
  // eje X: sólo los eneros; el año del primer punto, únicamente si faltan 6 meses o más hasta el primer enero
  const mesIni = Number(s[0].mes.slice(5, 7));
  const rotularPrimero = 13 - mesIni >= 6;
  const anios = s.flatMap((p, i) => ((i === 0 && rotularPrimero) || p.mes.endsWith('-01') ? [{ a: p.mes.slice(0, 4), x: xs[i] }] : []));
  const cur = hov !== null ? s[hov] : null;
  const mover = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHov(Math.max(0, Math.min(N - 1, Math.round(((e.clientX - r.left) / r.width) * (N - 1)))));
  };
  const ult = s[N - 1];
  return (
    <div className="tv-graf">
      <div className="tv-tt" aria-live="polite">
        {cur && <>
          <b>{mesLargo(cur.mes)}</b>
          <span className="c1">En guarda {d.fmt(cur.cava)}</span>
          <span className="c2">Abiertas {d.fmt(cur.tomado)}</span>
          <span className="c3">Compras {d.fmt(cur.compras)}</span>
        </>}
      </div>
      <div className="tv-plot-wrap">
        <div className="tv-yaxis" aria-hidden="true">
          {ticks.map(t => <span key={t} style={{ top: pct(py(t)) }}>{t === 0 ? '0' : d.corto(t)}</span>)}
        </div>
        <div className="tv-plot" data-tv="grafico" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHov(null)}>
          <svg viewBox={`0 0 1000 ${ALTO}`} preserveAspectRatio="none" className="tv-svg" aria-hidden="true">
            {ticks.map(t => <line key={t} x1="0" x2="1000" y1={py(t)} y2={py(t)} stroke="#E3D8C4" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            <path data-tv-capa="tomado" data-tope={ult.cava + ult.tomado} d={area(p => p.cava + p.tomado)} fill={COLOR_ABIERTAS} />
            <path data-tv-capa="cava" data-tope={ult.cava} d={area(p => p.cava)} fill={COLOR_GUARDA} />
            <path data-tv-capa="compras" data-tope={ult.compras} d={linea} fill="none" stroke="#231419" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {hov !== null && <line x1={xs[hov]} x2={xs[hov]} y1="0" y2={ALTO} stroke="rgba(35,20,25,.45)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          </svg>
          {hov !== null && [
            { v: s[hov].cava + s[hov].tomado, c: COLOR_ABIERTAS }, { v: s[hov].cava, c: COLOR_GUARDA }, { v: s[hov].compras, c: '#231419' },
          ].map(d => <i key={d.c} className="tv-dot" style={{ left: pct(xs[hov]), top: pct(py(d.v)), background: d.c }} />)}
          {anios.map(a => <span key={a.a} className="tv-x" style={{ left: pct(a.x) }}>{a.a}</span>)}
        </div>
      </div>
    </div>
  );
}

// conBoton: la pantalla Valor (con el botón $ | USD); en el Inicio va siempre en pesos.
// onVerInforme (Inicio): el bloque abre con la cabecera de color, como Consumos y Compras.
// La cuenta cierra: compras + ahorro club + guarda − abiertas = en la cava hoy (en USD; al convertir, el ahorro absorbe el redondeo).
export default function TarjetaValor({ onVerInforme, afuera = 0, conBoton = false }: { onVerInforme?: () => void; afuera?: number; conBoton?: boolean }) {
  const m = useMontos();
  const d = useDinero(conBoton);
  const datos = m.estado === 'listo' ? m.datos : null;
  const inf = datos?.informe ?? null;
  const cargando = m.estado === 'cargando';
  const candado = !inf && !cargando;
  const conParte = !!datos && datos.cava.tipo.toLowerCase().includes('grup') && datos.cava.miembros > 1;
  const tapado = cargando ? '…' : MONTO_TAPADO;
  const ahorro = inf ? (inf.ahorro ?? inf.valorCava - inf.compras - inf.guarda + inf.tomado) : 0;
  const cuenta = inf ? d.cuenta([inf.compras, ahorro, inf.guarda, -inf.tomado], inf.valorCava, 1) : null;
  const fila = (i: number) => (cuenta ? cuenta.filas[i] : tapado);
  // con y sin precio: lo que entró como regalo o aporte no tiene precio y no entra en la cuenta
  const enGuardaTodas = inf?.enGuardaTodas ?? inf?.botellasEnCava ?? 0;
  const abiertasTodas = inf?.abiertasTodas ?? inf?.botellasTomadas ?? 0;
  const sinPrecio = inf ? [
    enGuardaTodas - inf.botellasEnCava > 0 ? `${enGuardaTodas - inf.botellasEnCava} en guarda` : null,
    abiertasTodas - inf.botellasTomadas > 0 ? `${abiertasTodas - inf.botellasTomadas} ${abiertasTodas - inf.botellasTomadas === 1 ? 'abierta' : 'abiertas'}` : null,
  ].filter(Boolean) : [];
  return (
    <>
      {onVerInforme && (
        <button type="button" className="sec-card sec-card-ancha t-valor tv-cab" data-tv="cabecera" onClick={onVerInforme}>
          <span className="sec-card-label">Valor de la cava</span>
          <span className="sec-card-pill">Ver informe ›</span>
        </button>
      )}
      <div className={'tv' + (onVerInforme ? ' tv-con-cab' : '')} data-tv="tarjeta" data-estado={inf ? 'socio' : cargando ? 'cargando' : 'demo'}>
        {!onVerInforme && (
          <div className="tv-head">
            <h3 className="tv-t">Valor de la cava</h3>
            {conBoton && inf && <SelectorMoneda color="#6B1E2E" />}
          </div>
        )}
        <div className="tv-fila">
          <span className="tv-num" data-tv="valor">{inf ? d.fmt(inf.valorCava) : tapado}</span>
        </div>
        {inf && inf.porcentaje > 0 && (
          <p className="tv-mas" data-tv="mas">Lo que queda en la cava vale {inf.porcentaje} % más que todo lo que se pagó.</p>
        )}
        <p className="tv-baj">{inf
          ? `${inf.botellasEnCava} ${inf.botellasEnCava === 1 ? 'botella' : 'botellas'} con precio · de ${enGuardaTodas} en guarda`
          : cargando ? '…' : 'Botellas en guarda'}</p>
        {inf && <>
          <div className="tv-leyenda">
            <span><i className="sq" style={{ background: COLOR_GUARDA }} />En guarda</span>
            <span><i className="sq" style={{ background: COLOR_ABIERTAS }} />Abiertas</span>
            <span><i className="ln" />Compras</span>
          </div>
          <Grafico inf={inf} conBoton={conBoton} />
        </>}
        {cargando && <div className="tv-graf-espera" aria-hidden="true" />}
        <div className="tv-sep" />
        <div className="tv-filas" data-tv="cuenta">
          <div className="tv-f" data-tv-fila="compras"><span>Costaron las compras</span><b style={{ color: '#5A4A40' }}>{fila(0)}</b></div>
          <div className="tv-f" data-tv-fila="ahorro"><span>Ahorro club</span><b style={{ color: '#85631E' }}>{fila(1)}</b></div>
          <div className="tv-f" data-tv-fila="guarda"><span>Sumó la guarda</span><b style={{ color: '#6B1E2E' }}>{fila(2)}</b></div>
          <div className="tv-f" data-tv-fila="abiertas"><span>Abiertas{inf ? ` · ${inf.botellasTomadas} de ${abiertasTodas}` : ''}</span><b style={{ color: COLOR_ABIERTAS }}>{fila(3)}</b></div>
          <div className="tv-f tv-f-total" data-tv-fila="total"><span>En la cava hoy{inf ? ` · ${inf.botellasEnCava} ${inf.botellasEnCava === 1 ? 'botella' : 'botellas'}` : ''}</span><b>{cuenta ? cuenta.total : tapado}</b></div>
        </div>
        {sinPrecio.length > 0 && (
          <p className="tv-sinprecio" data-tv="sin-precio">Las botellas que entraron como regalo o aporte no tienen precio cargado: {sinPrecio.join(' y ')}.</p>
        )}
        {conParte && datos && inf && (
          <div className="tv-parte" data-tv="parte">
            <div>
              <div className="tv-parte-t">TU PARTE · 1 DE {datos.cava.miembros}</div>
              <div className="tv-parte-s">tu parte de las compras {d.fmt(inf.tuParte.compras)}</div>
            </div>
            <div className="tv-parte-d">
              <div className="tv-parte-n">{d.fmt(inf.tuParte.valorCava)}</div>
            </div>
          </div>
        )}
        {candado && (
          <p className="tv-candado">
            <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>
            Disponible para miembros del club
          </p>
        )}
        {inf && afuera > 0 && (
          <p className="tv-afuera" data-tv="afuera">
            Tus {afuera} botellas de afuera no tienen valor cargado · <a href={urlRelevamiento(afuera)} target="_blank" rel="noopener noreferrer">Pedir relevamiento</a>
          </p>
        )}
        <p className="tv-nota">Valores a precio sugerido de góndola.</p>
        {inf && <LineaDolar conBoton={conBoton} />}
      </div>
    </>
  );
}
