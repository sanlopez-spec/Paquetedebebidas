// Sección "Compras" de la ficha de la cava (Panel Admin): las líneas de compra de un mes, editables en la misma celda.
// Cantidad, costo y sugerido se corrigen tocando el valor (se guarda solo al salir de la celda o con Enter; Esc deshace).
// El vino y la añada no se editan: definen la etiqueta. Montos en pesos del mes de compra; el USD es el de ese mes.
import { useEffect, useRef, useState } from 'react';
import SelectorFlechas from './SelectorFlechas';
import { estadoMes } from './Compras';
import { formatPesos } from './montos';
import { Campo, Guardar, Hoja, useEnvio } from './Admin';
import './admin-compras.css';

interface Linea { id: string; vino: string; anada: number | null; bodega: string; cepa: string; cantidad: number; abiertas: number; costoArs: number; sugeridoArs: number }
interface Opciones { cepa: string[]; region: string[]; provincia: string[]; tipo: string[]; formato: string[] }
export interface Presupuesto { mes: string; botellas: number; cuota: number; asignado: number; saldoAnterior: number | null; disponible: number; queda: number; arrastre: boolean; dolar: number | null }
export interface Datos { cava: string; mes: string; meses: { mes: string; botellas: number }[]; dolar: number | null; lineas: Linea[]; presupuesto: Presupuesto | null; opciones: Opciones }
interface VinoRef { ref: string; vino: string; bodega: string; cepa: string; region: string }

async function pedirC<T = any>(action: string, cuerpo?: object, query = ''): Promise<T> {
  const r = await fetch(`/api/admin-cavas?action=${action}${query}`, cuerpo
    ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
    : { credentials: 'same-origin' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'No pudimos completar el pedido. Probá de nuevo.');
  return d as T;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesNombre = (ym: string) => MESES[(Number(ym.slice(5, 7)) || 1) - 1] ?? '';
const puntos = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const pesos = (n: number) => `$${puntos(n)}`;
const usd = (ars: number, dolar: number | null) => (dolar ? `USD ${(ars / dolar).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '');
// "83100", "83.100" o "$83.100" → 83100
export const leerMonto = (s: string) => Number(s.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.'));
const desc = (l: Linea) => (l.sugeridoArs > 0 ? Math.round((1 - l.costoArs / l.sugeridoArs) * 100) : 0);
const descRaro = (l: Linea) => { const d = desc(l); return d < 25 || d > 60; };
// Los números del mes, en pesos exactos (sin redondear a la centena) y todos de la misma suma de las líneas: los usan la tarjeta azul de la
// ficha, el total de la tabla y el renglón del presupuesto. Devuelve null si la cava no tiene presupuesto.
export function numerosMes(d: Datos) {
  const p = d.presupuesto;
  if (!p || !d.dolar) return null;
  const asignado = d.lineas.reduce((t, l) => t + l.cantidad * l.costoArs, 0);
  const disponible = Math.round(p.disponible * d.dolar), saldo = p.saldoAnterior !== null ? Math.round(p.saldoAnterior * d.dolar) : null;
  return { asignado, disponible, queda: disponible - asignado, saldo, fmt: (u: number) => formatPesos(Math.round(u * d.dolar!)) };
}
// Aviso sólo para el Admin: el saldo que pasa al mes siguiente (USD) supera 1,5 cuotas a favor o en contra. No bloquea nada.
export function avisoSaldo(queda: number, cuota: number): string | null {
  if (!(cuota > 0)) return null;
  return queda > 1.5 * cuota ? 'Saldo muy alto: conviene comprar' : queda < -1.5 * cuota ? 'Saldo muy negativo: conviene frenar' : null;
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

function useAncha() {
  const q = '(min-width: 900px)';
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const f = () => setV(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  return v;
}

// una celda que se ve como texto y se edita en el lugar
function Celda({ valor, mostrar, aTexto, leer, onGuardar, etiqueta, tipo, sub }: {
  valor: number; mostrar: (n: number) => string; aTexto: (n: number) => string; leer: (s: string) => number;
  onGuardar: (n: number) => Promise<void>; etiqueta: string; tipo: 'cant' | 'costo' | 'sugerido'; sub?: string;
}) {
  const [txt, setTxt] = useState<string | null>(null);   // null = no se está editando
  const ref = useRef<HTMLInputElement>(null);
  const cerrar = () => { setTxt(null); ref.current?.blur(); };
  async function salir() {
    if (txt === null) return;
    const n = leer(txt);
    setTxt(null);
    if (!Number.isFinite(n) || n === valor || txt.trim() === '') return;
    try { await onGuardar(n); } catch { /* la fila muestra el error y el valor vuelve atrás */ }
  }
  return (
    <>
      <input ref={ref} className={'ac-e' + (txt !== null ? ' foco' : '')} data-celda={tipo} aria-label={etiqueta} inputMode={tipo === 'cant' ? 'numeric' : 'decimal'}
        value={txt ?? mostrar(valor)} onFocus={e => { setTxt(aTexto(valor)); const t = e.currentTarget; setTimeout(() => t.select(), 0); }}
        onChange={e => setTxt(e.target.value)} onBlur={salir}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ref.current?.blur(); } else if (e.key === 'Escape') { e.preventDefault(); cerrar(); } }} />
      {sub && <span className="ac-sub">{sub}</span>}
    </>
  );
}

export default function AdminCompras({ cavaId, mesHoy, mesInicial, inicial, onDatos }: { cavaId: string; mesHoy: string; mesInicial?: string; inicial?: Datos | null; onDatos?: (d: Datos) => void }) {
  const [d, setD0] = useState<Datos | null>(inicial ?? null);
  const setD = (n: Datos) => { setD0(n); onDatos?.(n); };
  const [error, setError] = useState('');
  const [est, setEst] = useState<Record<string, { e: 'g' | 'ok' | 'err'; msg?: string }>>({});
  const [agregar, setAgregar] = useState<null | { t: 'buscar' } | { t: 'fila'; v: VinoRef } | { t: 'nuevo'; sembrar?: string }>(null);
  const ancha = useAncha();
  const cargar = (mes?: string) => {
    setError('');
    pedirC<Datos>('comprasMes', undefined, `&cava=${encodeURIComponent(cavaId)}${mes ? `&mes=${mes}` : ''}`).then(setD).catch(e => setError(e.message));
  };
  useEffect(() => { setAgregar(null); setEst({}); if (!(inicial && inicial.cava === cavaId)) { setD0(null); cargar(mesInicial); } /* eslint-disable-next-line */ }, [cavaId]);

  const marcar = (id: string, e: { e: 'g' | 'ok' | 'err'; msg?: string }) => setEst(p => ({ ...p, [id]: e }));
  async function guardar(id: string, campo: 'cantidad' | 'costo' | 'sugerido', valor: number) {
    marcar(id, { e: 'g' });
    try {
      const nuevo = await pedirC<Datos>('updateLinea', { id, campo, valor });
      setD(nuevo); marcar(id, { e: 'ok' });
      setTimeout(() => setEst(p => (p[id]?.e === 'ok' ? { ...p, [id]: undefined as any } : p)), 2500);
    } catch (e) { marcar(id, { e: 'err', msg: e instanceof Error ? e.message : 'No se pudo guardar.' }); throw e; }
  }
  async function borrar(l: Linea) {
    if (!window.confirm(`¿Borrar ${l.vino}${l.anada ? ' ' + l.anada : ''} (${l.cantidad} ${l.cantidad === 1 ? 'botella' : 'botellas'}) de este mes?`)) return;
    marcar(l.id, { e: 'g' });
    try { setD(await pedirC<Datos>('deleteLinea', { id: l.id })); } catch (e) { marcar(l.id, { e: 'err', msg: e instanceof Error ? e.message : 'No se pudo borrar.' }); }
  }

  if (error && !d) return <div className="tpanel ac" data-adm="compras-mes-sec"><h3>Compras</h3><p className="ses-error" role="alert">{error} <button type="button" className="ses-link" onClick={() => cargar()}>Reintentar</button></p></div>;
  if (!d) return <div className="tpanel ac" data-adm="compras-mes-sec"><h3>Compras</h3><p className="adm-gris adm-cargando" role="status">Cargando…</p></div>;

  const ls = d.lineas;
  const bot = ls.reduce((t, l) => t + l.cantidad, 0);
  const costo = ls.reduce((t, l) => t + l.cantidad * l.costoArs, 0), sug = ls.reduce((t, l) => t + l.cantidad * l.sugeridoArs, 0);
  const pct = sug > 0 ? Math.round((1 - costo / sug) * 100) : 0;
  const prom = bot > 0 ? costo / bot : 0;
  const alerta = (l: Linea) => descRaro(l) || (prom > 0 && l.costoArs > 1.5 * prom);
  // los meses del selector: los que tienen compras más el de la tarjeta azul (el mes en curso), ordenados y sin repetir
  const lista = [...new Set([...d.meses.map(m => m.mes), mesInicial ?? mesHoy])].sort();
  const antes = [...lista].reverse().find(m => m < d.mes), despues = lista.find(m => m > d.mes);
  const hayFlechas = lista.length > 1;
  const rotulo = `${mesNombre(d.mes).toUpperCase()} ${d.mes.slice(0, 4)}${bot > 0 ? ` · ${bot} ${bot === 1 ? 'BOTELLA' : 'BOTELLAS'}` : ''}`;
  const ir = (k: number) => { const m = k < 0 ? antes : despues; if (m) cargar(m); };
  const dolar = d.dolar;
  const p = d.presupuesto;
  const nm = numerosMes(d);
  const estado = p && nm ? estadoMes(p as any, d.mes === mesHoy, nm.fmt, { queda: nm.queda, saldo: nm.saldo }).estado : '';
  const asignadoPct = nm && nm.disponible > 0 ? Math.round((nm.asignado / nm.disponible) * 100) : 0;

  const agregarUI = (
    <>
    {agregar === null && <button type="button" className="ac-mas" data-accion="agregar" onClick={() => setAgregar({ t: 'buscar' })}>+ Agregar vino</button>}
    {agregar?.t === 'buscar' && <Buscador onCancelar={() => setAgregar(null)} onElegir={v => setAgregar({ t: 'fila', v })} onNuevo={q => setAgregar({ t: 'nuevo', sembrar: q })} />}
    {agregar?.t === 'fila' && <FilaNueva v={agregar.v} mes={d.mes} cava={cavaId} onCancelar={() => setAgregar(null)} onGuardado={n => { setD(n); setAgregar(null); }} />}
    {agregar?.t === 'nuevo' && <HojaVinoNuevo mes={d.mes} cava={cavaId} opciones={d.opciones} sembrar={agregar.sembrar ?? ''} onCerrar={() => setAgregar(null)}
      onUsar={v => setAgregar({ t: 'fila', v })} onGuardado={n => { setD(n); setAgregar(null); }} />}

    </>
  );
  const celdas = (l: Linea) => ({
    cant: (
      <Celda valor={l.cantidad} mostrar={n => String(n)} aTexto={n => String(n)} leer={s => Number(s.trim())} tipo="cant" etiqueta={`Cantidad de ${l.vino}`} onGuardar={n => guardar(l.id, 'cantidad', n)} />
    ),
    costo: (
      <Celda valor={l.costoArs} mostrar={pesos} aTexto={n => String(n)} leer={leerMonto} tipo="costo" etiqueta={`Costo por botella de ${l.vino}`} onGuardar={n => guardar(l.id, 'costo', n)} sub={ancha ? usd(l.costoArs, dolar) : undefined} />
    ),
    sug: (
      <Celda valor={l.sugeridoArs} mostrar={pesos} aTexto={n => String(n)} leer={leerMonto} tipo="sugerido" etiqueta={`Sugerido por botella de ${l.vino}`} onGuardar={n => guardar(l.id, 'sugerido', n)} sub={ancha ? usd(l.sugeridoArs, dolar) : undefined} />
    ),
  });
  const Estado = ({ l }: { l: Linea }) => { const e = est[l.id]; return <span className={'ac-est ' + (e?.e ?? '')} data-estado={e?.e ?? ''} role="status">{e?.e === 'g' ? '…' : e?.e === 'ok' ? '✓' : ''}</span>; };
  const Tacho = ({ l }: { l: Linea }) => (
    <button type="button" className="ac-tacho" data-accion="borrar" disabled={l.abiertas > 0} aria-label={`Borrar ${l.vino}`}
      title={l.abiertas > 0 ? `Ya se abrieron ${l.abiertas} ${l.abiertas === 1 ? 'botella' : 'botellas'} de esta línea` : 'Borrar la línea'} onClick={() => borrar(l)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
    </button>
  );
  const MsgErr = ({ l }: { l: Linea }) => est[l.id]?.e === 'err' ? <div className="ac-err" role="alert" data-linea-err={l.id}>{est[l.id]!.msg}</div> : null;

  return (
    <div className="tpanel ac" data-adm="compras-mes-sec" data-mes={d.mes}>
      <div className="ac-cab">
        <h3>Compras</h3>
        {hayFlechas
          ? <SelectorFlechas variante="rotulo" tono="claro" rotulo={rotulo}
            data={{ rotulo: 'rot', prev: 'prev', next: 'next' }} onPrev={() => ir(-1)} onNext={() => ir(1)} sinPrev={!antes} sinNext={!despues}
            etiquetaPrev="Mes anterior" etiquetaNext="Mes siguiente" />
          : <div className="sf" data-sf="rotulo" data-tono="claro"><div className="sf-txt"><div className="sf-rot" data-cm="rot">{rotulo}</div></div></div>}
      </div>
      {error && <p className="ses-error" role="alert">{error}</p>}

      {ancha && (
        <table className="ac-tabla">
          <thead><tr><th className="v">Vino</th><th>Añada</th><th className="n">Cant.</th><th className="n">Costo c/u</th><th className="n">Sugerido c/u</th><th className="n">Desc.</th><th /><th /></tr></thead>
          <tbody>
            {ls.map(l => (
              <tr key={l.id} className={alerta(l) ? 'alerta' : ''} data-linea={l.id}>
                <td className="v"><span className="ac-fijo">{l.vino}</span><MsgErr l={l} /></td>
                <td className="a"><span className="ac-fijo">{l.anada ?? ''}</span></td>
                <td className="n c1">{celdas(l).cant}</td>
                <td className="n c2">{celdas(l).costo}</td>
                <td className="n c2">{celdas(l).sug}</td>
                <td className="d"><span className={'ac-calc' + (descRaro(l) ? ' raro' : '')} data-desc>{desc(l)} %</span></td>
                <td className="x"><Estado l={l} /></td>
                <td className="x"><Tacho l={l} /></td>
              </tr>
            ))}
            {!ls.length && <tr><td colSpan={8} className="ac-vacio">No hay compras cargadas este mes.</td></tr>}
            <tr className="ac-agregar"><td colSpan={8}>{agregarUI}</td></tr>
          </tbody>
          <tfoot><tr data-fila="total"><td className="v">Total del mes</td><td /><td className="n">{bot}</td><td className="n">{pesos(costo)}</td><td className="n">{pesos(sug)}</td><td className="n">{pct} %</td><td /><td /></tr></tfoot>
        </table>
      )}
      {!ancha && (
        <div className="ac-lineas">
          {ls.map(l => (
            <div key={l.id} className={'ac-lin' + (alerta(l) ? ' alerta' : '')} data-linea={l.id}>
              <div className="r1"><b>{l.vino}{l.anada ? ` · ${l.anada}` : ''}</b><Estado l={l} /><Tacho l={l} /></div>
              <div className="ac-grid">
                <label><span>Cant.</span>{celdas(l).cant}</label>
                <label><span>Costo c/u</span>{celdas(l).costo}</label>
                <label><span>Sugerido c/u</span>{celdas(l).sug}</label>
              </div>
              <div className="ac-desc"><span className={descRaro(l) ? 'raro' : ''}>Desc. {desc(l)} %</span>{alerta(l) && !descRaro(l) ? <span className="raro"> · costo muy alto para el mes</span> : null}</div>
              <MsgErr l={l} />
            </div>
          ))}
          {!ls.length && <p className="adm-gris ac-vacio">No hay compras cargadas este mes.</p>}
          {agregarUI}
        </div>
      )}

      {(
        <>
          {!ancha && (
            <div className="mp-pie ac-pie-cel">
              <div className="mp-l"><span>A precio sugerido</span><b data-fila="sugerido">{pesos(sug)}</b></div>
              <div className="mp-l"><span>Al costo</span><b data-fila="costo">{pesos(costo)}</b></div>
            </div>
          )}
          <div className="mp-aho ac-aho" data-fila="ahorro"><span>Ahorro club<em>{pct} %</em></span><b>{pesos(sug - costo)}</b></div>
          <div className="ac-pie" data-fila="pie">
            {p && nm ? <span>Presupuesto de {mesNombre(d.mes)}: <b>{pesos(nm.disponible)}</b> · asignado <b>{asignadoPct} %</b> · {estado}</span> : <span>Esta cava no tiene presupuesto mensual.</span>}
            {p && avisoSaldo(p.queda, p.cuota) && <span className="ac-aviso" data-adm="aviso-saldo">{avisoSaldo(p.queda, p.cuota)}</span>}
            <span>Montos en pesos del mes de compra</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── buscador de vinos existentes ──
function Buscador({ onCancelar, onElegir, onNuevo }: { onCancelar: () => void; onElegir: (v: VinoRef) => void; onNuevo: (q: string) => void }) {
  const [q, setQ] = useState(''), [res, setRes] = useState<VinoRef[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (norm(q).length < 2) { setRes(null); return; }
    let vivo = true;
    const t = setTimeout(() => { pedirC<{ vinos: VinoRef[] }>('vinos', undefined, `&q=${encodeURIComponent(q)}`).then(r => { if (vivo) { setRes(r.vinos); setError(''); } }).catch(e => vivo && setError(e.message)); }, 200);
    return () => { vivo = false; clearTimeout(t); };
  }, [q]);
  return (
    <div className="ac-busca" data-adm="buscador">
      <input className="ac-busca-in" autoFocus placeholder="Buscá un vino que ya exista…" aria-label="Buscar vino" value={q} onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancelar(); }} />
      {error && <p className="ses-error" role="alert">{error}</p>}
      {res !== null && (
        <div className="ac-res" role="listbox">
          {res.map(v => (
            <button key={v.ref} type="button" role="option" className="ac-res-i" data-vino-ref={v.ref} onClick={() => onElegir(v)}>
              <b>{v.vino}</b><small>{[v.bodega, v.cepa, v.region].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
          <button type="button" className="ac-res-i nuevo" data-accion="vino-nuevo" onClick={() => onNuevo(q.trim())}>+ Vino nuevo (no está en la lista)</button>
        </div>
      )}
      <button type="button" className="ac-cancelar" onClick={onCancelar}>Cancelar</button>
    </div>
  );
}

// ── la fila nueva de un vino elegido de la lista ──
function FilaNueva({ v, mes, cava, onCancelar, onGuardado }: { v: VinoRef; mes: string; cava: string; onCancelar: () => void; onGuardado: (d: Datos) => void }) {
  const [anada, setAnada] = useState(''), [cant, setCant] = useState('1'), [costo, setCosto] = useState(''), [sug, setSug] = useState('');
  const { trabajando, error, enviar } = useEnvio(async () => {
    onGuardado(await pedirC<Datos>('addLinea', { cava, mes, fuente: v.ref, anada: anada.trim() === '' ? null : Number(anada), cantidad: Number(cant), costo: leerMonto(costo), sugerido: leerMonto(sug) }));
  });
  return (
    <form className="ac-nueva" data-adm="fila-nueva" onSubmit={enviar}>
      <div className="ac-nueva-v"><b>{v.vino}</b><small>{[v.bodega, v.cepa, v.region].filter(Boolean).join(' · ')}</small></div>
      <div className="ac-nueva-g">
        <label><span>Añada</span><input className="ac-e campo" inputMode="numeric" value={anada} onChange={e => setAnada(e.target.value)} data-nueva="anada" /></label>
        <label><span>Cant.</span><input className="ac-e campo" inputMode="numeric" value={cant} onChange={e => setCant(e.target.value)} data-nueva="cantidad" /></label>
        <label><span>Costo c/u</span><input className="ac-e campo" inputMode="decimal" placeholder="$" value={costo} onChange={e => setCosto(e.target.value)} data-nueva="costo" /></label>
        <label><span>Sugerido c/u</span><input className="ac-e campo" inputMode="decimal" placeholder="$" value={sug} onChange={e => setSug(e.target.value)} data-nueva="sugerido" /></label>
      </div>
      <div className="ac-nueva-acc">
        <button type="button" className="ac-cancelar" onClick={onCancelar}>Cancelar</button>
        <div><Guardar trabajando={trabajando} error={error} /></div>
      </div>
    </form>
  );
}

// ── "+ Vino nuevo" ──
function HojaVinoNuevo({ mes, cava, opciones, sembrar, onCerrar, onUsar, onGuardado }: {
  mes: string; cava: string; opciones: Opciones; sembrar: string; onCerrar: () => void; onUsar: (v: VinoRef) => void; onGuardado: (d: Datos) => void;
}) {
  const [f, setF] = useState({ vino: sembrar, bodega: '', cepa: '', region: '', provincia: '', tipo: '', formato: opciones.formato.includes('750') ? '750' : '', linea: '', anada: '', cant: '1', costo: '', sug: '' });
  const [parecido, setParecido] = useState<VinoRef | null>(null), [descartado, setDescartado] = useState<string[]>([]);
  const poner = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }));
  const { trabajando, error, enviar } = useEnvio(async () => {
    // antes de crear: ¿ya hay uno parecido?
    const k = norm(f.vino);
    if (k && !descartado.includes(k)) {
      const r = await pedirC<{ vinos: VinoRef[] }>('vinos', undefined, `&q=${encodeURIComponent(f.vino)}`);
      const p = r.vinos.find(x => { const n = norm(x.vino); return n.includes(k) || k.includes(n); });
      if (p) { setParecido(p); return; }
    }
    onGuardado(await pedirC<Datos>('addLinea', { cava, mes, nuevo: { vino: f.vino, bodega: f.bodega, cepa: f.cepa, region: f.region, provincia: f.provincia, tipo: f.tipo, formato: f.formato, linea: f.linea },
      anada: f.anada.trim() === '' ? null : Number(f.anada), cantidad: Number(f.cant), costo: leerMonto(f.costo), sugerido: leerMonto(f.sug) }));
  });
  const sel = (k: 'cepa' | 'region' | 'provincia' | 'tipo' | 'formato', rotulo: string) => (
    <Campo rotulo={rotulo}>
      <select className="ses-input" value={f[k]} onChange={poner(k)} aria-label={rotulo}>
        <option value="">{k === 'formato' ? '—' : 'Elegí'}</option>
        {opciones[k].map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </Campo>
  );
  return (
    <Hoja titulo="Vino nuevo" onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar} data-adm="vino-nuevo">
        <Campo rotulo="Nombre del vino"><input className="ses-input" value={f.vino} onChange={e => { poner('vino')(e); setParecido(null); }} autoComplete="off" /></Campo>
        {parecido && (
          <div className="ac-parecido" role="alert" data-adm="parecido">
            <b>¿Es «{parecido.vino}»?</b>
            <div><button type="button" className="adm-boton" onClick={() => onUsar(parecido)}>Sí, usar ese</button>
              <button type="button" className="adm-boton adm-boton-claro" onClick={() => { setDescartado(d => [...d, norm(f.vino)]); setParecido(null); }}>No, es otro</button></div>
          </div>
        )}
        <Campo rotulo="Bodega"><input className="ses-input" value={f.bodega} onChange={poner('bodega')} autoComplete="off" /></Campo>
        <div className="jt-fila2">{sel('cepa', 'Cepa')}{sel('tipo', 'Tipo')}</div>
        <div className="jt-fila2">{sel('region', 'Región')}{sel('provincia', 'Provincia / país')}</div>
        <div className="jt-fila2">{sel('formato', 'Formato')}<Campo rotulo="Línea (opcional)"><input className="ses-input" value={f.linea} onChange={poner('linea')} autoComplete="off" /></Campo></div>
        <div className="jt-fila2"><Campo rotulo="Añada"><input className="ses-input" inputMode="numeric" value={f.anada} onChange={poner('anada')} /></Campo><Campo rotulo="Cantidad"><input className="ses-input" inputMode="numeric" value={f.cant} onChange={poner('cant')} /></Campo></div>
        <div className="jt-fila2"><Campo rotulo="Costo c/u ($)"><input className="ses-input" inputMode="decimal" value={f.costo} onChange={poner('costo')} /></Campo><Campo rotulo="Sugerido c/u ($)"><input className="ses-input" inputMode="decimal" value={f.sug} onChange={poner('sug')} /></Campo></div>
        <Guardar trabajando={trabajando} error={error} texto="Crear vino y línea" />
      </form>
    </Hoja>
  );
}
