// Valor de la cava. En el Inicio, sólo la tarjeta dorada (socios con sus montos reales; el visitante, con el monto tapado).
// El gráfico, la cuenta y "Tu parte" viven en el informe de Valor (InformeValor.tsx), que usa ValorHoy.
// Los números salen de /api/montos (informe); acá sólo se dibujan.
import { useState } from 'react';
import { MONTO_TAPADO, useDinero, useMontos } from './montos';
import type { InformeValor } from './montos';
import { monoCurves, moveTo } from './curvas';
import { urlRelevamiento } from './Colecciones';
import { SelectorMoneda } from './Dinero';
import './tarjeta-valor.css';

// los colores de lo que está en guarda y de lo abierto: el dorado de "abiertas" del carrusel (el gris carbón es de la tarjeta Catálogo)
const COLOR_GUARDA = '#732D3E';
const COLOR_ABIERTAS = '#C8922A';        // áreas, leyenda y puntos
const COLOR_ABIERTAS_TEXTO = '#85631E';  // el mismo dorado, para texto sobre fondo claro
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

// Las alturas se calculan a mano: el dorado de abiertas llega hasta cava + tomado, el bordó hasta cava, y se dibuja encima;
// la línea de compras va al frente. Del fondo al frente: gris → bordó → línea.
export function Grafico({ inf, conBoton }: { inf: InformeValor; conBoton: boolean }) {
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

// La tarjeta dorada del Inicio: "VALOR DE LA CAVA · Ver ›" con el monto, el ▲ % y la frase.
export default function TarjetaValor({ onVerInforme }: { onVerInforme: () => void }) {
  const m = useMontos();
  const d = useDinero();
  const inf = m.estado === 'listo' ? m.datos.informe : null;
  const tapado = m.estado === 'cargando' ? '…' : MONTO_TAPADO;
  return (
    <button type="button" className="sec-card sec-card-ancha t-valor tv-cab" data-tv="cabecera" onClick={onVerInforme}>
      <span className="sec-card-label">Valor de la cava</span>
      <div className="sec-card-big tv-big">
        <b data-tv="valor">{inf ? d.fmt(inf.valorCava) : tapado}</b>
        {inf && inf.porcentaje > 0 && <> <span className="tv-pct" data-tv="pct">{`▲ ${inf.porcentaje}%`}</span></>}
      </div>
      {inf && inf.porcentaje > 0 && (
        <div className="sec-card-sub" data-tv="mas">Lo que queda en la cava vale más que todo lo que se pagó.</div>
      )}
      <span className="sec-card-pill">Ver ›</span>
    </button>
  );
}

// La cuenta que cierra: compras + ahorro club + guarda − abiertas = en la cava hoy (en USD; al convertir, el ahorro absorbe el redondeo).
// La usan "Lo que vale hoy" y la tarjeta de descuento: así el ahorro club es UN solo número en toda la pantalla.
export function cuentaDeValor(inf: InformeValor, d: ReturnType<typeof useDinero>) {
  const ahorro = inf.ahorro ?? inf.valorCava - inf.compras - inf.guarda + inf.tomado;
  return d.cuenta([inf.compras, ahorro, inf.guarda, -inf.tomado], inf.valorCava, 1);
}

// "Lo que vale hoy" del informe: el gráfico de valor tal cual, la cuenta que cierra, la nota de las botellas sin precio y
// "Tu parte" (una sola vez, sólo en grupales). El total ya está en la última fila de la cuenta. El botón $ | USD va en el título del bloque.
export function ValorHoy({ afuera = 0 }: { afuera?: number }) {
  const m = useMontos();
  const d = useDinero(true);
  const datos = m.estado === 'listo' ? m.datos : null;
  const inf = datos?.informe ?? null;
  if (!datos || !inf) return null;
  const conParte = datos.cava.tipo.toLowerCase().includes('grup') && datos.cava.miembros > 1;
  const cuenta = cuentaDeValor(inf, d);
  const abiertasTodas = inf.abiertasTodas ?? inf.botellasTomadas;
  const bot = (n: number) => `${n} ${n === 1 ? 'botella' : 'botellas'}`;
  return (
    <div className="bloque" data-vi="hoy">
      <div className="bloque-head">
        <h2 className="bloque-t">Lo que vale hoy</h2>
        <SelectorMoneda color="#6B1E2E" />
      </div>
      <div className="tv tv-informe" data-tv="tarjeta" data-estado="socio">
        <div className="tv-leyenda">
          <span><i className="sq" style={{ background: COLOR_GUARDA }} />En guarda</span>
          <span><i className="sq" style={{ background: COLOR_ABIERTAS }} />Abiertas</span>
          <span><i className="ln" />Compras</span>
        </div>
        <Grafico inf={inf} conBoton />
        <div className="tv-sep" />
        <div className="tv-filas" data-tv="cuenta">
          <div className="tv-f" data-tv-fila="compras"><span>Costaron las compras</span><b style={{ color: '#5A4A40' }}>{cuenta.filas[0]}</b></div>
          <div className="tv-f" data-tv-fila="ahorro"><span>Ahorro club</span><b style={{ color: '#5E6B3A' }}>{cuenta.filas[1]}</b></div>
          <div className="tv-f" data-tv-fila="guarda"><span>Sumó la guarda <small className="tv-est">estimado</small></span><b style={{ color: '#6B1E2E' }}>{cuenta.filas[2]}</b></div>
          <div className="tv-f" data-tv-fila="abiertas"><span>Abiertas · {inf.botellasTomadas} de {abiertasTodas}</span><b style={{ color: COLOR_ABIERTAS_TEXTO }}>{cuenta.filas[3]}</b></div>
          <div className="tv-f tv-f-total" data-tv-fila="total"><span>En la cava hoy · {bot(inf.botellasEnCava)}</span><b>{cuenta.total}</b></div>
        </div>
        {conParte && (
          <div className="tv-parte" data-tv="parte">
            <div className="tv-parte-t">TU PARTE · 1 DE {datos.cava.miembros}</div>
            <div className="tv-parte-d"><div className="tv-parte-n">{d.fmt(inf.tuParte.valorCava)}</div></div>
          </div>
        )}
        {afuera > 0 && (
          <p className="tv-afuera" data-tv="afuera">
            Tus {afuera} botellas de afuera no tienen valor cargado · <a href={urlRelevamiento(afuera)} target="_blank" rel="noopener noreferrer">Pedir relevamiento</a>
          </p>
        )}
      </div>
    </div>
  );
}
