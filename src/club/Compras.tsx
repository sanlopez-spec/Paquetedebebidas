// Pantalla Compras para socios: tarjeta del mes (navegable), cuotas, lo último que entró, lo que compró el club y regalos.
// Todos los montos y deudas vienen de /api/montos (sólo con sesión); sin sesión esta pantalla no se arma.
import { useRef, useState } from 'react';
import { useDinero } from './montos';
import type { ComprasInforme, ComprasMes, CuotasInforme } from './montos';
import { LineaDolar } from './Dinero';
import './compras.css';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (ym: string) => MESES[(Number(ym.slice(5, 7)) || 1) - 1];
const mesDe = (ym: string, delta: number) => { const [a, m] = ym.split('-').map(Number); const i = a * 12 + (m - 1) + delta; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
const mesAnio = (ym: string) => `${nombreMes(ym)} ${ym.slice(0, 4)}`;
// saldo con signo: "+$12.300" / "−$12.300"
const conSigno = (fmt: (n: number) => string, n: number) => (n < 0 ? fmt(n) : '+' + fmt(n));
const botellas = (n: number) => `${n} ${n === 1 ? 'botella' : 'botellas'}`;
const mesesTxt = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`;

// Las compras siguen aunque haya deuda (lo que no se envía son las botellas): no hay "pausa" en la app.
export function TarjetaMeses({ meses }: { meses: ComprasMes[] }) {
  const [i, setI] = useState(meses.length - 1);          // siempre arranca en el mes actual
  const toque = useRef<number | null>(null);
  const { fmt } = useDinero();
  const ir = (d: number) => setI(x => Math.min(meses.length - 1, Math.max(0, x + d)));
  const c = meses[i];
  if (!c) return null;
  const esActual = i === meses.length - 1;
  const mes = nombreMes(c.mes), sig = nombreMes(mesDe(c.mes, 1));
  const disp = c.disponible;
  const pasado = c.asignado > disp;
  const pct = disp > 0 ? Math.min(100, (c.asignado / disp) * 100) : c.asignado > 0 ? 100 : 0;
  const dorado = pasado ? (Math.max(disp, 0) / c.asignado) * 100 : pct;
  return (
    <div className="cm" data-cm="mes" data-mes={c.mes}
      onTouchStart={e => { toque.current = e.touches[0].clientX; }}
      onTouchEnd={e => {
        if (toque.current === null) return;
        const dx = e.changedTouches[0].clientX - toque.current; toque.current = null;
        if (Math.abs(dx) > 50) ir(dx > 0 ? -1 : 1);
      }}>
      <div className="cm-top">
        <button type="button" className="cm-flecha" aria-label="Mes anterior" data-cm="prev" disabled={i === 0} onClick={() => ir(-1)}>‹</button>
        <span className="cm-rot" data-cm="rot">{esActual ? 'ESTE MES · ' : ''}{mes.toUpperCase()} {c.mes.slice(0, 4)}</span>
        <button type="button" className="cm-flecha" aria-label="Mes siguiente" data-cm="next" disabled={esActual} onClick={() => ir(1)}>›</button>
      </div>
      <div className="cm-bot">{botellas(c.botellas)}</div>
      <div className="cm-filas">
        <div className="cm-f"><span>Cuota del mes</span><b>{fmt(c.cuota)}</b></div>
        {c.saldoAnterior !== null && (
          <div className="cm-f"><span>Saldo de {nombreMes(mesDe(c.mes, -1))}</span><b className={c.saldoAnterior < 0 ? 'neg' : ''}>{conSigno(fmt, c.saldoAnterior)}</b></div>
        )}
        <div className="cm-f cm-total"><span>Para gastar en {mes}</span><b data-cm="disponible">{fmt(disp)}</b></div>
      </div>
      <div className="cm-num"><b>{fmt(c.asignado)}</b><span>asignados de {fmt(disp)}</span></div>
      <div className="cm-barra" data-cm="barra" data-pct={Math.round(pasado ? 100 : pct)}>
        <i style={{ width: `${dorado}%` }} />
        {pasado && <i className="exc" style={{ width: `${100 - dorado}%` }} />}
      </div>
      <div className={'cm-queda' + (c.queda < 0 ? ' neg' : '')} data-cm="queda">
        {esActual
          ? (c.queda < 0 ? `Te pasaste ${fmt(-c.queda)} · se descuenta en ${sig}` : `Queda: ${fmt(c.queda)} · pasa a ${sig} si no se usa`)
          : `${c.queda < 0 ? `Se pasó ${fmt(-c.queda)}` : `Sobró ${fmt(c.queda)}`}${c.arrastre ? ` · pasó a ${sig}` : ''}`}
      </div>
      <LineaDolar />
    </div>
  );
}

export function BloqueCuotas({ c, grupal }: { c: CuotasInforme; grupal: boolean }) {
  const { fmt } = useDinero();
  const estado = (s: CuotasInforme['socios'][number], yo: boolean) => s.alDia
    ? (s.aFavor > 0 ? `A favor ${fmt(s.aFavor)}` : 'Al día')
    : `${yo && !grupal ? 'Debés' : 'Debe'} ${mesesTxt(s.meses)} · ${fmt(s.debe)}`;
  if (!grupal) {
    const s = c.socios[0];
    if (!s) return null;
    const mia = !c.vos || c.vos === s.id;   // un admin que mira la cava de otra persona ve el nombre del dueño
    return (
      <div className="tpanel" data-cm="cuotas">
        <h3>Cuotas</h3>
        <div className={'cm-yo' + (s.alDia ? ' ok' : ' debe')}>{s.alDia ? `${mia ? 'Tu cuota' : `Cuota de ${s.nombre}`}: ${s.aFavor > 0 ? `al día · a favor ${fmt(s.aFavor)}` : 'al día'}` : estado(s, mia)}</div>
        <LineaDolar />
      </div>
    );
  }
  return (
    <div className="tpanel" data-cm="cuotas">
      <h3>Cuotas <span>{c.alDia} de {c.total} al día</span></h3>
      <div className="cm-socios">
        {c.socios.map(s => {
          const yo = s.id === c.vos;
          return (
            <div key={s.id} className="cm-socio" data-socio={s.id}>
              <span className="cm-socio-n">{s.nombre}{yo && <i className="cm-vos">Vos</i>}</span>
              <b className={s.alDia ? 'ok' : 'debe'}>{estado(s, yo)}</b>
            </div>
          );
        })}
      </div>
      <p className="cm-pie">Cuota de cada socio: {fmt(c.cuotaSocio)} por mes, desde {mesAnio(c.desde)}.</p>
      <LineaDolar />
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

export function LoQueCompro({ club, miembros, conParte, propio = false }: { club: ComprasInforme['club']; miembros: number; conParte: boolean; propio?: boolean }) {
  const { fmt } = useDinero();
  if (!club.botellas) return null;
  const ahorro = club.sugerido - club.costo;
  const n = Math.max(1, miembros);
  return (
    <div className="tpanel" data-cm="club">
      <h3>{propio ? 'Lo que compraste' : 'Lo que compró el club'} <span>{club.botellas} botellas{club.desde ? ` desde ${mesAnio(club.desde)}` : ''}</span></h3>
      <div className="cm-cuenta">
        <div className="cm-c"><span>A precio sugerido</span><b>{fmt(club.sugerido)}</b></div>
        <div className="cm-c"><span>Al costo de compra</span><b>− {fmt(club.costo)}</b></div>
        <div className="cm-c cm-ahorro"><span>Ahorro club</span><b data-cm="ahorro">{fmt(ahorro)}</b></div>
      </div>
      {conParte && (
        <div className="cm-parte" data-cm="parte">
          <div className="cm-parte-t">TU PARTE · 1 DE {n}</div>
          <div className="cm-pf"><span>A precio sugerido</span><b>{fmt(club.sugerido / n)}</b></div>
          <div className="cm-pf"><span>Al costo de compra</span><b>− {fmt(club.costo / n)}</b></div>
          <div className="cm-pf cm-pf-t"><span>Tu ahorro club</span><b>{fmt(ahorro / n)}</b></div>
        </div>
      )}
      <p className="cm-pie">Lo que costarían en góndola, menos lo que {propio ? 'pagaste' : 'pagó el club'}.</p>
      <LineaDolar />
    </div>
  );
}

// Botellas que no son compra del club (regalos y aportes): lista simple, de la más nueva a la más vieja, sin montos.
export function RegalosYAportes({ items }: { items: ComprasInforme['regalos'] }) {
  const [todos, setTodos] = useState(false);
  if (!items.length) return null;
  const total = items.reduce((s, e) => s + e.botellas, 0);
  const visibles = todos ? items : items.slice(0, 8);
  return (
    <div className="tpanel" data-cm="regalos">
      <h3>Regalos y aportes <span>· {botellas(total)}</span></h3>
      <div className="cm-lista">
        {visibles.map((e, i) => (
          <div key={i} className="cm-reg">
            <span className="cm-it-txt">
              <b>{e.vino}{e.anada ? ` · ${e.anada}` : ''}</b>
              <small>{[e.bodega, e.cepa].filter(Boolean).join(' · ')}</small>
              <em className="cm-origen">{e.origen}</em>
            </span>
            <span className="cm-reg-n">{e.botellas}</span>
          </div>
        ))}
      </div>
      {!todos && items.length > 8 && <button type="button" className="acc-todos" onClick={() => setTodos(true)}>Ver las {total} ›</button>}
    </div>
  );
}
