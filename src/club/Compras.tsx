// Pantalla Compras para socios: tarjeta del mes (navegable), cuotas, lo último que entró, lo que compró el club y regalos.
// Todos los montos y deudas vienen de /api/montos (sólo con sesión); sin sesión esta pantalla no se arma.
import { useRef, useState } from 'react';
import { formatMonto, formatPesos, useDinero } from './montos';
import type { ComprasInforme, ComprasMes, CuotasInforme } from './montos';
import SelectorFlechas from './SelectorFlechas';
import './compras.css';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (ym: string) => MESES[(Number(ym.slice(5, 7)) || 1) - 1];
const mesDe = (ym: string, delta: number) => { const [a, m] = ym.split('-').map(Number); const i = a * 12 + (m - 1) + delta; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
const mesAnio = (ym: string) => `${nombreMes(ym)} ${ym.slice(0, 4)}`;
// saldo con signo: "+$12.300" / "−$12.300" (la tarjeta del mes lo usa en "incluye +$… de {mes}")
const conSigno = (fmt: (n: number) => string, n: number) => (n < 0 ? fmt(n) : '+' + fmt(n));
// USD → pesos como los muestra formatMonto (centenas, la mitad para arriba, con signo), para sumar montos ya redondeados
const aPesos = (usd: number, dolar: number) => Math.sign(usd) * Math.floor((Math.abs(usd) * dolar) / 100 + 0.5 + 1e-9) * 100;
const botellas = (n: number) => `${n} ${n === 1 ? 'botella' : 'botellas'}`;
const mesesTxt = (n: number) => `${n} ${n === 1 ? 'mes' : 'meses'}`;

// Cuánto del presupuesto del mes ya está asignado. Lo usan la tarjeta del mes (sección Compras) y la caja de Compras del Inicio.
// "Completo" = la barra llena: lo asignado alcanzó lo que hay para gastar en el mes.
export function progresoMes(c: ComprasMes) {
  const disp = c.disponible;
  const pasado = c.asignado > disp;
  const pct = disp > 0 ? Math.min(100, (c.asignado / disp) * 100) : c.asignado > 0 ? 100 : 0;
  const dorado = pasado ? (Math.max(disp, 0) / c.asignado) * 100 : pct;
  return { disp, pasado, pct, dorado, completo: c.asignado > 0 && pct >= 100 };
}

// "$X de $Y" y la barra: la misma en la sección Compras y en el Inicio.
// dispTexto: el "de $Y" ya armado (la tarjeta del mes lo pasa cuando el mes trae saldo del anterior, con cada parte a su dólar)
export function BarraAsignado({ c, formato, dispTexto }: { c: ComprasMes; formato?: (usd: number) => string; dispTexto?: string }) {
  const d = useDinero();
  const fmt = formato ?? d.fmt;   // la tarjeta del mes pasa el formato con el dólar de ESE mes; el Inicio usa el del mes en curso
  const { disp, pasado, pct, dorado } = progresoMes(c);
  return (
    <>
      <div className="cm-num"><b>{fmt(c.asignado)}</b><span>de {dispTexto ?? fmt(disp)}</span></div>
      <div className="cm-barra" data-cm="barra" data-pct={Math.round(pasado ? 100 : pct)}>
        <i style={{ width: `${dorado}%` }} />
        {pasado && <i className="exc" style={{ width: `${100 - dorado}%` }} />}
      </div>
    </>
  );
}

// El renglón de estado de la tarjeta del mes (debajo de la barra), con la línea "incluye ±$X de {mes}" si el mes arranca con saldo.
// Lo usan la sección Compras y la ficha del Panel Admin: así el Admin lee exactamente lo mismo que el socio.
// vistos: lo que queda y el saldo que trae, en los pesos que se ven en la tarjeta (pesosVistos). Con ellos, "Sobró/Se pasó/Faltan $X" =
// comprado − "de $Y" tal como se leen, y el "incluye" es el mismo $X del mes anterior. El saldo que pasa se decide en USD.
// Sin vistos (Admin, o en USD), cada monto se formatea con fmt.
export function estadoMes(c: ComprasMes, esActual: boolean, fmt: (usd: number) => string, vistos?: { queda: number; saldo: number | null }): { pie: string; estado: string; sinCompras: boolean } {
  const mes = nombreMes(c.mes), sig = nombreMes(mesDe(c.mes, 1));
  // Los cinco casos (el alto es el mismo en todos, sin renglones reservados): el rótulo lleva el mes y, si hay, las botellas; abajo de la barra
  // SIEMPRE el estado, y el mes que arranca con saldo del anterior suma "incluye ±$X de {mes}" al final de ese mismo renglón.
  const sinCompras = esActual && c.asignado === 0;
  const q = vistos ? vistos.queda : c.queda;
  const f = vistos ? (n: number) => formatPesos(n) : fmt;
  const saldo = vistos ? vistos.saldo : c.saldoAnterior;
  const estado = !esActual   // mes terminado: pase lo que pase, su saldo pasa al mes siguiente (cuenta corriente)
    ? (q >= 0
      ? `Sobró ${f(q)}${c.arrastre ? ` · pasa a ${sig}` : ''}`
      : `Se pasó ${f(-q)}${c.arrastre ? ` · se descuenta de ${sig}` : ''}`)
    : sinCompras ? `Estamos eligiendo tus vinos de este mes.`
    : q < 0 ? `Se pasó ${f(-q)}` : `Faltan ${f(q)} · seguimos eligiendo`;   // el mes en curso todavía no pasa nada
  const pie = c.saldoAnterior !== null && saldo !== null ? `${estado} · incluye ${conSigno(f, saldo)} de ${nombreMes(mesDe(c.mes, -1))}` : estado;
  return { pie, estado, sinCompras };
}

// Los pesos que se ven en la tarjeta de cada mes, en cadena desde el primero: comprado y la cuota al dólar de ese mes (como formatMonto);
// el "de $Y" = cuota + el saldo que trae, y ese saldo es el "queda" en pesos del mes anterior (el mismo $X que se leyó allá). Así cada
// tarjeta cierra con lo que muestra: queda = de $Y − comprado. Sin dólar (o en USD), null.
function pesosVistos(meses: ComprasMes[], dolarHoy: number | null): ({ asignado: number; disp: number; queda: number; saldo: number | null } | null)[] {
  let quedaAnt: number | null = null;
  return meses.map(c => {
    const d = c.dolar ?? dolarHoy;
    if (!d) { quedaAnt = null; return null; }
    const saldo = c.saldoAnterior !== null ? (quedaAnt ?? aPesos(c.saldoAnterior, d)) : null;
    const asignado = aPesos(c.asignado, d);
    const disp = saldo !== null ? aPesos(c.disponible - (c.saldoAnterior ?? 0), d) + saldo : aPesos(c.disponible, d);
    const queda = disp - asignado;
    quedaAnt = queda;
    return { asignado, disp, queda, saldo };
  });
}

// Las compras siguen aunque haya deuda (lo que no se envía son las botellas): no hay "pausa" en la app.
export function TarjetaMeses({ meses }: { meses: ComprasMes[] }) {
  const [i, setI] = useState(meses.length - 1);          // siempre arranca en el mes actual
  const toque = useRef<number | null>(null);
  const din = useDinero();
  const ir = (d: number) => setI(x => Math.min(meses.length - 1, Math.max(0, x + d)));
  const c = meses[i];
  if (!c) return null;
  const esActual = i === meses.length - 1;
  const mes = nombreMes(c.mes);
  // cada mes en pesos con el dólar de ese mes (los meses pasados quedan fijos aunque cambie el dólar); sin dólar de ese mes, el de siempre
  const dolarMes = c.dolar ? { mes: c.mes, valor: c.dolar } : din.dolar;
  const fmt = (usd: number) => formatMonto(usd, { moneda: din.moneda, dolar: dolarMes });
  // en pesos, la tarjeta cierra con lo que muestra: "de $Y" − comprado = "Sobró/Se pasó $X", y el saldo que pasa es ese mismo $X en los dos
  // meses (pesosVistos). El cierre y el % siguen en USD.
  const v = din.moneda === 'ARS' ? pesosVistos(meses, din.dolar?.valor ?? null)[i] : null;
  const dispTexto = v ? formatPesos(v.disp) : undefined;
  const { pie, sinCompras } = estadoMes(c, esActual, fmt, v ?? undefined);
  const rotulo = `${esActual ? 'ESTE MES · ' : ''}${mes.toUpperCase()} ${c.mes.slice(0, 4)}${c.botellas > 0 ? ` · ${c.botellas} ${c.botellas === 1 ? 'BOTELLA' : 'BOTELLAS'}` : ''}`;
  return (
    <>
    <div className="cm" data-cm="mes" data-mes={c.mes} data-estado={!esActual ? (c.queda >= 0 ? 'sobro' : 'paso') : sinCompras ? 'eligiendo' : 'medias'}>
      <SelectorFlechas variante="rotulo" tono="oscuro" rotulo={rotulo} data={{ rotulo: 'rot', prev: 'prev', next: 'next' }}
        onPrev={() => ir(-1)} onNext={() => ir(1)} sinPrev={i === 0} sinNext={esActual} etiquetaPrev="Mes anterior" etiquetaNext="Mes siguiente"
        onTouchStart={e => { toque.current = e.touches[0].clientX; }}
        onTouchEnd={e => {
          if (toque.current === null) return;
          const dx = e.changedTouches[0].clientX - toque.current; toque.current = null;
          if (Math.abs(dx) > 50) ir(dx > 0 ? -1 : 1);
        }} />
      <BarraAsignado c={c} formato={fmt} dispTexto={dispTexto} />
      <div className={'cm-queda' + (!esActual && c.queda < 0 ? ' neg' : '')} data-cm="queda">{pie}</div>
    </div>
    <p className="din-linea" data-cm="dolar-mes">Cada mes, al dólar oficial de ese mes</p>
    </>
  );
}

export function BloqueCuotas({ c, grupal }: { c: CuotasInforme; grupal: boolean }) {
  // debe y aFavor ya vienen en pesos (exactos); sin dólar vienen en USD
  const $ = (n: number) => formatPesos(n, c.enUsd);
  const estado = (s: CuotasInforme['socios'][number], yo: boolean) => s.alDia
    ? (s.aFavor > 0 ? `A favor ${$(s.aFavor)}` : 'Al día')
    : `${yo && !grupal ? 'Debés' : 'Debe'} ${mesesTxt(s.meses)} · ${$(s.debe)}`;
  if (!grupal) {
    const s = c.socios[0];
    if (!s) return null;
    const mia = !c.vos || c.vos === s.id;   // un admin que mira la cava de otra persona ve el nombre del dueño
    return (
      <div className="tpanel" data-cm="cuotas">
        <h3>Cuotas</h3>
        <div className={'cm-yo' + (s.alDia ? ' ok' : ' debe')}>{s.alDia ? `${mia ? 'Tu cuota' : `Cuota de ${s.nombre}`}: ${s.aFavor > 0 ? `al día · a favor ${$(s.aFavor)}` : 'al día'}` : estado(s, mia)}</div>
      </div>
    );
  }
  return (
    <div className="tpanel" data-cm="cuotas">
      <h3>Cuotas <span>{c.alDia} de {c.total} al día</span></h3>
      <p className="cm-sub" data-cm="cuotas-sub">{formatMonto(c.cuotaSocio, { moneda: 'USD', dolar: null, redondeo: 'cuota' })} por mes cada uno</p>
      <div className="acc-cajas" data-cm="cuotas-cajas">
        <div className="acc-caja"><span>Cuota para compras</span><b data-cm="cuota-compras">{$(c.cuotaPesos)}</b></div>
        <div className="acc-caja"><span>Guarda</span><b data-cm="cuota-guarda">{$(c.guardaPesos)}</b></div>
      </div>
      <div className="cm-totsoc" data-cm="cuota-total"><span>Total por mes, cada uno</span><b>{$(c.totalPesos)}</b></div>
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

// Botellas que no son compra del club (regalos y aportes), sin montos. Las 4 más recientes en una grilla de 2 × 2; con más de 4
// etiquetas, "Ver las N ›" abre la lista completa (de la más nueva a la más vieja). Con 1 a 4 se muestran las que haya y sin botón.
export function RegalosYAportes({ items }: { items: ComprasInforme['regalos'] }) {
  const [todos, setTodos] = useState(false);
  if (!items.length) return null;
  const total = items.reduce((s, e) => s + e.botellas, 0);
  const hayMas = items.length > 4;
  return (
    <div className="tpanel" data-cm="regalos">
      <h3>Regalos y aportes <span>{botellas(total)}</span></h3>
      {todos ? (
        <div className="cm-lista" data-cm="regalos-lista">
          {items.map((e, i) => (
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
      ) : (
        <div className="cm-reg-grilla" data-cm="regalos-grilla">
          {items.slice(0, 4).map((e, i) => (
            <div key={i} className="cm-reg-card">
              <em className="cm-origen">{e.origen}</em>
              <b className="cm-reg-vino">{e.vino}{e.anada ? ` · ${e.anada}` : ''}</b>
              <small>{[e.bodega, e.cepa].filter(Boolean).join(' · ')}</small>
              {e.botellas > 1 && <span className="cm-reg-n">{e.botellas}</span>}
            </div>
          ))}
        </div>
      )}
      {hayMas && <button type="button" className="acc-todos" data-cm="regalos-ver" onClick={() => setTodos(t => !t)}>{todos ? 'Ver menos ›' : `Ver las ${total} ›`}</button>}
    </div>
  );
}
