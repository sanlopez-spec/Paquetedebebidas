// Pantalla Compras para socios: tarjeta del mes, lo último que entró y lo que compró el club.
// Todos los montos vienen de /api/montos (sólo con sesión); sin sesión esta pantalla no se arma.
import { usd } from './montos';
import type { ComprasInforme, ComprasMes } from './montos';
import './compras.css';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (ym: string) => MESES[(Number(ym.slice(5, 7)) || 1) - 1];
const mesDe = (ym: string, delta: number) => { const [a, m] = ym.split('-').map(Number); const i = a * 12 + (m - 1) + delta; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
const mesAnio = (ym: string) => `${nombreMes(ym)} ${ym.slice(0, 4)}`;
const signo = (n: number) => (n < 0 ? '− ' : '+ ') + usd(Math.abs(n));
const botellas = (n: number) => `${n} ${n === 1 ? 'botella' : 'botellas'}`;

export function TarjetaMesActual({ c }: { c: ComprasMes }) {
  const mes = nombreMes(c.mes), sig = nombreMes(mesDe(c.mes, 1));
  const pct = c.disponible > 0 ? Math.min(100, (c.asignado / c.disponible) * 100) : c.asignado > 0 ? 100 : 0;
  const pasado = c.asignado > c.disponible;
  // si se pasó: la barra queda llena, dorada hasta lo disponible y el excedente en rojo suave
  const dorado = pasado ? (Math.max(c.disponible, 0) / c.asignado) * 100 : pct;
  return (
    <div className="cm" data-cm="mes">
      <div className="cm-top">
        <span className="cm-rot">ESTE MES · {mes.toUpperCase()}</span>
        <span className="cm-bot">{botellas(c.botellas)}</span>
      </div>
      <div className="cm-filas">
        <div className="cm-f"><span>Cuota del mes</span><b>{usd(c.cuota)}</b></div>
        {c.saldoAnterior !== null && (
          <div className="cm-f"><span>Saldo de {nombreMes(mesDe(c.mes, -1))}</span><b className={c.saldoAnterior < 0 ? 'neg' : ''}>{signo(c.saldoAnterior)}</b></div>
        )}
        <div className="cm-f cm-total"><span>Para gastar en {mes}</span><b data-cm="disponible">{usd(c.disponible)}</b></div>
      </div>
      <div className="cm-num"><b>{usd(c.asignado)}</b><span>asignados de {usd(c.disponible)}</span></div>
      <div className="cm-barra" data-cm="barra" data-pct={Math.round(pasado ? 100 : pct)}>
        <i style={{ width: `${dorado}%` }} />
        {pasado && <i className="exc" style={{ width: `${100 - dorado}%` }} />}
      </div>
      <div className={'cm-queda' + (c.queda < 0 ? ' neg' : '')}>
        {c.queda < 0
          ? `Te pasaste ${usd(-c.queda)} · se descuenta en ${sig}`
          : `Queda: ${usd(c.queda)} · pasa a ${sig} si no se usa`}
      </div>
    </div>
  );
}

export function LoUltimoQueEntro({ ultimas, onVer }: { ultimas: ComprasInforme['ultimas']; onVer: () => void }) {
  if (!ultimas.length) return null;
  return (
    <div className="tpanel" data-cm="ultimo">
      <h3>Lo último que entró <button type="button" className="cm-link" onClick={onVer}>Ver en Mi cava ›</button></h3>
      <div className="cm-lista">
        {ultimas.map((e, i) => (
          <div key={i} className="cm-it">
            <span className="cm-cuad">{e.botellas}</span>
            <span className="cm-it-txt">
              <b>{e.vino}{e.anada ? ` · ${e.anada}` : ''}</b>
              <small>{[e.bodega, e.cepa].filter(Boolean).join(' · ')}</small>
            </span>
            <span className="cm-nuevo">NUEVO</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoQueCompro({ club, miembros, conParte }: { club: ComprasInforme['club']; miembros: number; conParte: boolean }) {
  if (!club.botellas) return null;
  const ahorro = club.sugerido - club.costo;
  const n = Math.max(1, miembros);
  return (
    <div className="tpanel" data-cm="club">
      <h3>Lo que compró el club <span>{club.botellas} botellas{club.desde ? ` desde ${mesAnio(club.desde)}` : ''}</span></h3>
      <div className="cm-cuenta">
        <div className="cm-c"><span>A precio sugerido</span><b>{usd(club.sugerido)}</b></div>
        <div className="cm-c"><span>Al costo de compra</span><b>− {usd(club.costo)}</b></div>
        <div className="cm-c cm-ahorro"><span>Ahorro club</span><b data-cm="ahorro">{usd(ahorro)}</b></div>
      </div>
      {conParte && (
        <div className="cm-parte" data-cm="parte">
          <div className="cm-parte-t">TU PARTE · 1 DE {n}</div>
          <div className="cm-pf"><span>A precio sugerido</span><b>{usd(club.sugerido / n)}</b></div>
          <div className="cm-pf"><span>Al costo de compra</span><b>− {usd(club.costo / n)}</b></div>
          <div className="cm-pf cm-pf-t"><span>Tu ahorro club</span><b>{usd(ahorro / n)}</b></div>
        </div>
      )}
      <p className="cm-pie">Lo que costarían en góndola, menos lo que pagó el club.</p>
    </div>
  );
}
