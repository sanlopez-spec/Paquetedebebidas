// Piezas del informe de Consumos que se reutilizan entre secciones: el detalle (‹ Volver + ✕), la lista de lo abierto, las cajitas,
// los puntos por botella, "¿Se toma o se guarda?", el calendario y la ficha de una botella abierta.
// Nada de plata acá: lo de Valor se arma en Consumos.tsx con lo que llega de /api/montos.
import { fmtN, mesLargo, plural } from './ClubCava';
import { Hoja } from './Juntadas';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// ── el detalle: "‹ Volver" · lo elegido en grande · ✕ (los dos botones hacen lo mismo) ──
export function DetalleBarra({ titulo, onVolver }: { titulo: string; onVolver: () => void }) {
  return (
    <div className="dt-bar" data-cons="detalle-barra">
      <button type="button" className="dt-volver" data-cons="volver" onClick={onVolver}>‹ Volver</button>
      <h3 className="dt-t">{titulo}</h3>
      <button type="button" className="dt-x" data-cons="cerrar-detalle" aria-label="Cerrar el detalle" onClick={onVolver}>✕</button>
    </div>
  );
}
// tres cajitas con fondo suave del color de la sección
export function Cajitas({ items }: { items: { n: string; l: string }[] }) {
  return (
    <div className="dt-cajas" data-cons="cajitas">
      {items.map(c => <div key={c.l}><b>{c.n}</b><span>{c.l}</span></div>)}
    </div>
  );
}

// ── lo abierto ──
export type Abierta = { vino: string; anada: number | null; cepa: string; tipo: string; bodega: string; vivino: number | null; mes: string; clave: string };
// "oct 2026"
export const mesCorto = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1] ?? ''} ${mes.slice(0, 4)}`;
// La lista de lo que se abrió (no hay nada de lo que está en guarda): vino y añada · mes y año · Vivino. Tocar un renglón abre su ficha.
export function ListaAbiertas({ filas, onPick }: { filas: (Abierta & { n?: number })[]; onPick: (a: Abierta) => void }) {
  const orden = [...filas].sort((a, b) => b.mes.localeCompare(a.mes) || a.vino.localeCompare(b.vino, 'es'));
  return (
    <div className="lab" data-cons="lista-abiertas">
      {orden.map((f, i) => (
        <button key={`${f.vino}|${f.anada}|${f.mes}|${i}`} type="button" className="lab-fila" data-lab onClick={() => onPick(f)}>
          <span className="lab-v">{f.vino}<span className="lab-a">{f.anada ? ` · ${f.anada}` : ''}{(f.n ?? 1) > 1 ? ` ×${f.n}` : ''}</span></span>
          <span className="lab-m">{mesCorto(f.mes)}</span>
          <span className="lab-viv">{f.vivino != null ? fmtN(f.vivino, 1) : ''}</span>
        </button>
      ))}
    </div>
  );
}
// un renglón por juntada: mes · un punto por botella · cantidad. Tocar lleva a esa juntada.
export function PuntosJuntadas({ filas, onPick }: { filas: { clave: string; mes: string; n: number }[]; onPick: (clave: string) => void }) {
  return (
    <div className="pj" data-cons="puntos-juntadas">
      {filas.map(f => (
        <button key={f.clave} type="button" className="pj-fila" data-clave={f.clave} onClick={() => onPick(f.clave)}>
          <span className="pj-mes">{mayus(NOMBRES_MES[Number(f.mes.slice(5, 7)) - 1] ?? '')}</span>
          <span className="pj-puntos" aria-hidden="true">{Array.from({ length: f.n }, (_, i) => <i key={i} />)}</span>
          <span className="pj-n">{fmtN(f.n)}</span>
        </button>
      ))}
    </div>
  );
}

// ── ¿Se toma o se guarda? Siempre el total histórico desde el inicio de la cava ──
export function TomaGuarda({ abiertas, enGuarda, compradasPorAnio, abiertasPorAnio, abiertas12 }: {
  abiertas: number; enGuarda: number; compradasPorAnio: Record<string, number>; abiertasPorAnio: Record<string, number>; abiertas12: number;
}) {
  const compradas = Object.values(compradasPorAnio).reduce((a, b) => a + b, 0) || abiertas + enGuarda;
  const pct = compradas ? Math.round(abiertas / compradas * 100) : 0;
  const R = 49, C = 2 * Math.PI * R;
  const largo = Math.min(1, abiertas / Math.max(1, compradas)) * C;
  const anios = [...new Set([...Object.keys(compradasPorAnio), ...Object.keys(abiertasPorAnio)])].sort((a, b) => Number(b) - Number(a));
  const desde = Object.keys(compradasPorAnio).sort()[0] ?? anios[anios.length - 1];
  const tope = Math.max(1, ...anios.flatMap(y => [compradasPorAnio[y] ?? 0, abiertasPorAnio[y] ?? 0]));
  const autonomia = abiertas12 > 0 ? Math.round(enGuarda / abiertas12) : null;
  const barra = (n: number, clase: string) => (
    <span className="tg-linea"><i className={clase} style={{ width: `calc(${n / tope} * (100% - 34px))` }} /><b>{fmtN(n)}</b></span>
  );
  return (
    <div className="tg" data-cons="toma-guarda">
      <div className="tg-cab">
        <div className="tg-anillo" data-cons="anillo">
          <svg viewBox="0 0 118 118" width="118" height="118" role="img" aria-label={`${pct} % tomado`}>
            <circle cx="59" cy="59" r={R} fill="none" strokeWidth="20" className="tg-guarda" />
            <circle cx="59" cy="59" r={R} fill="none" strokeWidth="20" className="tg-abierto" strokeDasharray={`${largo} ${C - largo}`} transform="rotate(-90 59 59)" />
          </svg>
          <div className="tg-centro"><b>{fmtN(pct)} %</b><span>tomado</span></div>
        </div>
        <div className="tg-leyenda">
          <span><i className="tg-abierto-bg" /> <b>{fmtN(abiertas)}</b> {plural(abiertas, 'abierta', 'abiertas')}</span>
          <span><i className="tg-guarda-bg" /> <b>{fmtN(enGuarda)}</b> en guarda</span>
          <small>de {fmtN(compradas)} que entraron desde {desde}</small>
        </div>
      </div>
      {autonomia != null && (
        <div className="tg-autonomia" data-cons="autonomia">
          Al ritmo de los últimos 12 meses ({fmtN(abiertas12)} {plural(abiertas12, 'botella', 'botellas')}), lo que hay en guarda alcanza para <b>{fmtN(autonomia)} {plural(autonomia, 'año', 'años')}</b>.
        </div>
      )}
      <div className="tg-t">compradas y abiertas por año</div>
      <div className="tg-filas">
        {anios.map(y => (
          <div key={y} className="tg-fila" data-anio={y}>
            <span className="tg-anio">{y}</span>
            <div className="tg-barras">{barra(compradasPorAnio[y] ?? 0, 'tg-b-comp')}{barra(abiertasPorAnio[y] ?? 0, 'tg-b-ab')}</div>
          </div>
        ))}
      </div>
      <div className="tg-pie"><span><i className="tg-guarda-bg" /> compradas</span><span><i className="tg-abierto-bg" /> abiertas</span></div>
    </div>
  );
}

// ── Calendario: una fila por año y 12 meses; un punto por juntada, más grande cuantas más botellas ──
export type PuntoCal = { clave: string; mes: string; n: number };
// "Febrero casi nunca (una vez, en 2024) y diciembre recién en 2025. Los meses más fijos: enero, abril…, con juntada en 4 de los 6 años."
export function fraseCalendario(puntos: PuntoCal[]): string {
  if (!puntos.length) return '';
  const ys = puntos.map(p => Number(p.mes.slice(0, 4)));
  const y0 = Math.min(...ys), y1 = Math.max(...ys), Y = y1 - y0 + 1;
  if (Y < 2) return '';
  const porMes: Set<number>[] = Array.from({ length: 12 }, () => new Set<number>());
  for (const p of puntos) porMes[Number(p.mes.slice(5, 7)) - 1].add(Number(p.mes.slice(0, 4)));
  const cnt = porMes.map(s => s.size);
  const lista = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] ?? '');
  const raros = cnt.map((c, m) => ({ m, c })).filter(x => x.c <= 1).sort((a, b) => a.c - b.c || a.m - b.m).slice(0, 2).map(x => {
    const nom = NOMBRES_MES[x.m];
    if (x.c === 0) return `${nom} nunca`;
    const y = [...porMes[x.m]][0];
    return y >= y1 - 1 ? `${nom} recién en ${y}` : `${nom} casi nunca (una vez, en ${y})`;
  });
  const max = Math.max(...cnt);
  const fijos = max >= 2 ? cnt.map((c, m) => ({ c, m })).filter(x => x.c === max).slice(0, 5).map(x => NOMBRES_MES[x.m]) : [];
  return [
    raros.length ? `${mayus(lista(raros))}.` : '',
    fijos.length ? `Los meses más fijos: ${lista(fijos)}, con juntada en ${max} de los ${Y} años.` : '',
  ].filter(Boolean).join(' ');
}
export function Calendario({ puntos, onPick, individual }: { puntos: PuntoCal[]; onPick: (clave: string) => void; individual: boolean }) {
  const ys = puntos.map(p => Number(p.mes.slice(0, 4)));
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const anios = Array.from({ length: y1 - y0 + 1 }, (_, i) => y1 - i);
  const frase = individual ? '' : fraseCalendario(puntos);
  return (
    <div className="cal" data-cons="calendario">
      <div className="cal-grilla" style={{ ['--cal-n' as string]: anios.length }}>
        <span />
        {MESES_CORTOS.map((m, i) => <span key={m} className="cal-mes">{'EFMAMJJASOND'[i]}</span>)}
        {anios.map(y => (
          <div key={y} className="cal-fila" data-anio={y}>
            <span className="cal-anio">&apos;{String(y).slice(2)}</span>
            {Array.from({ length: 12 }, (_, i) => {
              const mes = `${y}-${String(i + 1).padStart(2, '0')}`;
              const ps = puntos.filter(p => p.mes === mes);
              return (
                <span key={i} className="cal-celda">
                  {ps.length ? ps.map(p => (
                    <button key={p.clave + p.mes} type="button" className="cal-punto" data-cal-punto data-clave={p.clave} aria-label={`${mayus(NOMBRES_MES[i])} ${y}: ${p.n} ${plural(p.n, 'botella', 'botellas')}`}
                      style={{ width: 6 + 1.6 * p.n, height: 6 + 1.6 * p.n }} onClick={() => onPick(p.clave)} />
                  )) : <i className="cal-vacio" />}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {frase && <p className="cal-frase" data-cons="calendario-frase">{frase}</p>}
    </div>
  );
}

// ── la ficha de una botella que se abrió: cuándo, en qué juntada, su Vivino y el puntaje del club (nada de la guarda) ──
export function FichaAbierta({ a, juntadaN, club, onVerJuntada, onCerrar }: {
  a: Abierta; juntadaN: number | null; club: number | null; onVerJuntada: (() => void) | null; onCerrar: () => void;
}) {
  return (
    <Hoja titulo={`${a.vino}${a.anada ? ` · ${a.anada}` : ''}`} onCerrar={onCerrar} clase="fa-hoja">
      <div className="fa" data-cons="ficha-abierta">
        <p className="fa-sub">{[a.bodega, a.cepa, a.tipo].filter(Boolean).join(' · ')}</p>
        <p className="fa-abierta" data-cons="fa-abierta">
          Abierta en {mesLargo(a.mes)}{juntadaN ? ` · juntada ${fmtN(juntadaN)}` : ''}
          {onVerJuntada && <> · <button type="button" className="ses-link" data-cons="ver-juntada" onClick={onVerJuntada}>Ver la juntada</button></>}
        </p>
        <div className="fa-datos">
          {a.vivino != null && <div><b>{fmtN(a.vivino, 1)}</b><span>Vivino</span></div>}
          {club != null && <div><b>{fmtN(club, 1)}</b><span>Puntaje del club</span></div>}
        </div>
      </div>
    </Hoja>
  );
}
