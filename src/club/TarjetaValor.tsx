// Tarjeta "Valor de la cava": la ven los socios con sus montos reales; el visitante la ve con los montos tapados y sin gráfico.
// Los números salen de /api/montos (informe); acá sólo se dibujan. Lo mismo en el Inicio y en la pantalla del informe.
import { useState } from 'react';
import { useMontos, usd } from './montos';
import type { InformeValor } from './montos';
import { monoCurves, moveTo } from './curvas';
import './tarjeta-valor.css';

const TAPADO = '••••';
const ALTO = 1000;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesLargo = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const pct = (v: number) => `${(v / 10).toFixed(2)}%`;

function Variacion({ p, clase }: { p: number; clase: string }) {
  return <span className={`${clase} ${p < 0 ? 'neg' : 'pos'}`}>{p < 0 ? '▼' : '▲'} {Math.abs(p)}%</span>;
}

// Las alturas se calculan a mano: el verde llega hasta cava + tomado, el bordó hasta cava, y se dibuja encima;
// la línea de compras va al frente. Del fondo al frente: verde → bordó → línea.
function Grafico({ inf }: { inf: InformeValor }) {
  const [hov, setHov] = useState<number | null>(null);
  const s = inf.serie, N = s.length;
  if (N < 2) return null;
  const tope = Math.max(...s.map(p => Math.max(p.cava + p.tomado, p.compras)), 1);
  const paso = tope > 60000 ? 20000 : 10000;
  const max = Math.ceil(tope / paso) * paso;
  const xs = s.map((_, i) => (i / (N - 1)) * 1000);
  const py = (v: number) => (1 - v / max) * ALTO;
  const area = (alto: (p: typeof s[number]) => number) => {
    const pts: [number, number][] = s.map((p, i) => [xs[i], py(alto(p))]);
    return `${moveTo(pts[0])} ${monoCurves(pts)} L1000,${ALTO} L0,${ALTO} Z`;
  };
  const lineaPts: [number, number][] = s.map((p, i) => [xs[i], py(p.compras)]);
  const linea = `${moveTo(lineaPts[0])} ${monoCurves(lineaPts)}`;
  const ticks = Array.from({ length: max / paso + 1 }, (_, i) => i * paso);
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
          <span className="c1">En la cava {usd(cur.cava)}</span>
          <span className="c2">Se tomaron {usd(cur.tomado)}</span>
          <span className="c3">Compras {usd(cur.compras)}</span>
        </>}
      </div>
      <div className="tv-plot-wrap">
        <div className="tv-yaxis" aria-hidden="true">
          {ticks.map(t => <span key={t} style={{ top: pct(py(t)) }}>{t / 1000}k</span>)}
        </div>
        <div className="tv-plot" data-tv="grafico" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setHov(null)}>
          <svg viewBox={`0 0 1000 ${ALTO}`} preserveAspectRatio="none" className="tv-svg" aria-hidden="true">
            {ticks.map(t => <line key={t} x1="0" x2="1000" y1={py(t)} y2={py(t)} stroke="#E3D8C4" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            <path data-tv-capa="tomado" data-tope={ult.cava + ult.tomado} d={area(p => p.cava + p.tomado)} fill="#6E8A4E" />
            <path data-tv-capa="cava" data-tope={ult.cava} d={area(p => p.cava)} fill="#732D3E" />
            <path data-tv-capa="compras" data-tope={ult.compras} d={linea} fill="none" stroke="#231419" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {hov !== null && <line x1={xs[hov]} x2={xs[hov]} y1="0" y2={ALTO} stroke="rgba(35,20,25,.45)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
          </svg>
          {hov !== null && [
            { v: s[hov].cava + s[hov].tomado, c: '#6E8A4E' }, { v: s[hov].cava, c: '#732D3E' }, { v: s[hov].compras, c: '#231419' },
          ].map(d => <i key={d.c} className="tv-dot" style={{ left: pct(xs[hov]), top: pct(py(d.v)), background: d.c }} />)}
          {anios.map(a => <span key={a.a} className="tv-x" style={{ left: pct(a.x) }}>{a.a}</span>)}
        </div>
      </div>
    </div>
  );
}

export default function TarjetaValor({ onVerInforme }: { onVerInforme?: () => void }) {
  const m = useMontos();
  const datos = m.estado === 'listo' ? m.datos : null;
  const inf = datos?.informe ?? null;
  const cargando = m.estado === 'cargando';
  const candado = !inf && !cargando;
  const conParte = !!datos && datos.cava.tipo.toLowerCase().includes('grup') && datos.cava.miembros > 1;
  const v = (n: number | undefined) => (inf && n !== undefined ? usd(n) : cargando ? '…' : 'USD ' + TAPADO);
  return (
    <div className="tv" data-tv="tarjeta" data-estado={inf ? 'socio' : cargando ? 'cargando' : 'demo'}>
      <div className="tv-head">
        <h3 className="tv-t">Valor de la cava</h3>
        {onVerInforme && <button className="tv-pill" type="button" onClick={onVerInforme}>Ver informe ›</button>}
      </div>
      <div className="tv-fila">
        <span className="tv-num" data-tv="valor">{v(inf?.valorCava)}</span>
        {inf ? <Variacion p={inf.porcentaje} clase="tv-var" /> : <span className="tv-var tapado">{cargando ? '…' : '▲ ' + TAPADO}</span>}
      </div>
      <p className="tv-baj">{inf ? `${inf.botellasEnCava} botellas · sobre el total aportado` : cargando ? '…' : 'Botellas · sobre el total aportado'}</p>
      {inf && <>
        <div className="tv-leyenda">
          <span><i className="sq" style={{ background: '#732D3E' }} />En la cava</span>
          <span><i className="sq" style={{ background: '#6E8A4E' }} />Se tomaron</span>
          <span><i className="ln" />Compras</span>
        </div>
        <Grafico inf={inf} />
      </>}
      {cargando && <div className="tv-graf-espera" aria-hidden="true" />}
      <div className="tv-sep" />
      <div className="tv-filas">
        <div className="tv-f"><span>Costaron las compras</span><b style={{ color: '#5A4A40' }}>{v(inf?.compras)}</b></div>
        <div className="tv-f"><span>Sumó la guarda</span><b style={{ color: '#6B1E2E' }}>{v(inf?.guarda)}</b></div>
        <div className="tv-f"><span>Se tomaron{inf ? ` · ${inf.botellasTomadas} botellas` : ''}</span><b style={{ color: '#4E6B34' }}>{v(inf?.tomado)}</b></div>
      </div>
      {conParte && datos && inf && (
        <div className="tv-parte" data-tv="parte">
          <div>
            <div className="tv-parte-t">TU PARTE · 1 DE {datos.cava.miembros}</div>
            <div className="tv-parte-s">tus compras {usd(inf.tuParte.compras)}</div>
          </div>
          <div className="tv-parte-d">
            <div className="tv-parte-n">{usd(inf.tuParte.valorCava)}</div>
            <Variacion p={inf.porcentaje} clase="tv-parte-v" />
          </div>
        </div>
      )}
      {candado && (
        <p className="tv-candado">
          <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>
          Disponible para miembros del club
        </p>
      )}
      <p className="tv-nota">Valores a precio sugerido de góndola.</p>
    </div>
  );
}
