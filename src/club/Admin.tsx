// Panel Admin del Club EDB (sólo el Admin): lista de cavas y ficha de cada una. Todo viene y va por /api/admin-cavas.
// Rutas: #admin (lista) y #admin/{recordId de la cava} (ficha). La barra de arriba es la de siempre (la pone ClubCava).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LineaDolar } from './Dinero';
import { estadoMes } from './Compras';
import { formatMonto, ponerDolar, useDinero } from './montos';
import { elegirCava, recargarOtras, useSesion } from './Sesion';
import './compras.css';
import './juntadas.css';
import AdminCompras, { avisoSaldo, numerosMes, type Datos as ComprasDatos } from './AdminCompras';
import SelectorFlechas from './SelectorFlechas';
import './admin.css';

// ── tipos (lo que devuelve api/admin-cavas) ──
type Tipo = 'grupal' | 'individual' | 'catalogo';
interface Resumen {
  id: string; numero: string; nombre: string; tipo: Tipo; fundacion: string; plan: string | null; cuotaUsd: number | null;
  socios: number; sociosNombres: string[]; enGuarda: number; deuda: { n: number; ars: number; meses: number };
  mesActual: MesActual | null;
}
interface MesActual { asignado: number; disponible: number; queda: number; saldoAnterior: number | null; botellas: number; arrastre: boolean; mes: string; cuota: number; dolar: number | null }
interface Persona { id: string; nombre: string; email: string }
interface Lista { dolar: { mes: string; valor: number } | null; mesHoy: string; cavas: Resumen[]; usuarios: Persona[];
  totales: { cavas: number; grupales: number; individuales: number; catalogo: number; socios: number; cuotaUsd: number; deudaArs: number; deudores: number } }
interface Socio { id: string; nombre: string; email: string; telefono: string; notas: string; rol: string; desde: string; membresia: string | null;
  alDia: boolean; meses: number; debeArs: number; aFavorUsd: number; adeudados: string[]; otras: string[] }
interface MesArs { mes: string; cuotaArs: number; guardaArs: number; totalArs: number; dolarUsado: number }
interface Pago { id: string; usuario: string; usuarioNombre: string; mes: string; usd: number; ars: number | null; dolar: number | null; medio: string; fecha: string; notas: string }
interface CavaFicha extends Omit<Resumen, 'mesActual' | 'socios' | 'sociosNombres'> {
  mesActual: MesActual | null; cuotaSocioUsd: number; saldoInicial: number; saldoDesde: string; cuotasDesde: string; notas: string; grupoId: string | null;
  socios: Socio[]; mesesArs: MesArs[]; guarda: { id: string; mes: string; cuotaArs: number | null; guardaArs: number }[];
}
interface Ficha { dolar: Lista['dolar']; hoy: string; mesHoy: string; usuarios: Persona[]; pagos: Pago[];
  cava: CavaFicha }

// ── pedidos ──
async function pedir<T = any>(action: string, cuerpo?: object, query = ''): Promise<T> {
  const r = await fetch(`/api/admin-cavas?action=${action}${query}`, cuerpo
    ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
    : { credentials: 'same-origin' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'No pudimos completar el pedido. Probá de nuevo.');
  return d as T;
}

// ── formatos ──
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesNombre = (ym: string) => MESES[(Number(ym.slice(5, 7)) || 1) - 1] ?? '';
const mesAnio = (ym: string) => (ym ? `${mesNombre(ym)} ${ym.slice(0, 4)}` : '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sumarMes = (ym: string, d = 1) => { const [a, m] = ym.split('-').map(Number); const i = a * 12 + (m - 1) + d; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`; };
const puntos = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const ars = (n: number) => `${n < 0 ? '−' : ''}$${puntos(Math.abs(n))}`;     // pesos exactos (los que ya están guardados en pesos)
const pl = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const fechaCorta = (f: string) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—');
const TIPO_TXT: Record<Tipo, string> = { grupal: 'Grupal', individual: 'Individual', catalogo: 'Solo catálogo' };
const planDe = (cuotaUsd: number | null) => (cuotaUsd == null ? null : cuotaUsd >= 100 ? 'Gran Reserva' : 'Reserva');
const wa = (tel: string) => { let d = tel.replace(/\D/g, '').replace(/^0+/, ''); if (!d) return ''; if (!d.startsWith('54')) d = '549' + d.replace(/^15/, ''); return `https://wa.me/${d}`; };

// ── la lista, compartida entre pantallas (se vuelve a pedir después de cada cambio) ──
let cacheLista: Lista | null = null;
function useLista() {
  const [lista, setLista] = useState<Lista | null>(cacheLista);
  const [error, setError] = useState('');
  const cargar = useCallback(() => {
    setError('');
    pedir<Lista>('list').then(d => { cacheLista = d; ponerDolar(d.dolar); setLista(d); }).catch(e => setError(e.message));
  }, []);
  useEffect(cargar, [cargar]);
  return { lista, error, recargar: cargar };
}

// ── piezas ──
export function Hoja({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCerrar]);
  return createPortal(
    <div className="ses-back jt-back" onClick={onCerrar}>
      <div className="ses-sheet jt-hoja" role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <div className="ses-handle" aria-hidden="true" />
        <button className="ses-x" type="button" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="ses-t">{titulo}</div>
        {children}
      </div>
    </div>, document.querySelector('.club-root') ?? document.body);
}
export function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="adm-campo"><span className="ses-lbl">{rotulo}</span>{children}</label>;
}
// mes y año (se guardan como día 1)
function CampoMes({ rotulo, valor, onChange, vacioOk = false }: { rotulo: string; valor: string; onChange: (v: string) => void; vacioOk?: boolean }) {
  const [a, m] = valor ? valor.split('-') : ['', ''];
  const anio = new Date().getFullYear();
  const anios = Array.from({ length: 12 }, (_, i) => anio + 2 - i);
  if (a && !anios.includes(+a)) anios.push(+a);
  const poner = (na: string, nm: string) => onChange(na && nm ? `${na}-${nm}` : '');
  return (
    <div className="adm-campo"><span className="ses-lbl">{rotulo}</span>
      <div className="jt-fila2">
        <select className="ses-input" value={m} aria-label={`${rotulo}: mes`} onChange={e => poner(a || String(anio), e.target.value)}>
          {vacioOk && <option value="">—</option>}
          {!vacioOk && !m && <option value="">Mes</option>}
          {MESES.map((n, i) => <option key={n} value={String(i + 1).padStart(2, '0')}>{cap(n)}</option>)}
        </select>
        <select className="ses-input" value={a} aria-label={`${rotulo}: año`} onChange={e => poner(e.target.value, m || '01')}>
          {vacioOk && <option value="">—</option>}
          {!vacioOk && !a && <option value="">Año</option>}
          {anios.sort((x, y) => y - x).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  );
}
export function Guardar({ trabajando, error, texto = 'Guardar', desactivado = false }: { trabajando: boolean; error: string; texto?: string; desactivado?: boolean }) {
  return (
    <>
      {error && <p className="ses-error" role="alert">{error}</p>}
      <button className="ses-principal" type="submit" disabled={trabajando || desactivado}>{trabajando ? 'Guardando…' : texto}</button>
    </>
  );
}
export function useEnvio(fn: () => Promise<void>) {
  const [trabajando, setT] = useState(false), [error, setE] = useState('');
  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (trabajando) return;
    setE(''); setT(true);
    try { await fn(); } catch (e) { setE(e instanceof Error ? e.message : 'No pudimos guardar.'); }
    setT(false);
  };
  return { trabajando, error, enviar };
}
const enteroODecimal = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

// ══════════════════════════ PARTE 1 · LISTA ══════════════════════════
function Totales({ l }: { l: Lista }) {
  const { fmt } = useDinero();
  const t = l.totales;
  return (
    <div className="adm-totales">
      <div className="adm-tot" data-adm="tot-cavas"><span>Cavas</span><b>{t.cavas}</b>
        <small className="adm-solo-pc">{t.grupales} grupal{t.grupales === 1 ? '' : 'es'} · {pl(t.individuales, 'individual', 'individuales')} · {t.catalogo} solo catálogo</small></div>
      <div className="adm-tot" data-adm="tot-socios"><span>Socios</span><b>{t.socios}</b></div>
      <div className="adm-tot" data-adm="tot-cuota"><span>Cuota mensual</span><b>{fmt(t.cuotaUsd)}</b><small>USD {puntos(t.cuotaUsd)}</small></div>
      <div className="adm-tot adm-tot-deuda" data-adm="tot-deuda"><span>Deuda</span><b>{ars(t.deudaArs)}</b><small>{pl(t.deudores, 'socio', 'socios')}</small></div>
    </div>
  );
}
function PagosCelda({ c }: { c: Resumen }) {
  if (c.cuotaUsd == null) return <span className="adm-gris">—</span>;
  if (!c.deuda.n) return <span className="adm-ok">✓ Al día</span>;
  return <><span className="adm-debe">{c.tipo === 'individual' ? `Debe ${pl(c.deuda.meses, 'mes', 'meses')}` : `${c.deuda.n} ${c.deuda.n === 1 ? 'debe' : 'deben'}`}</span><small>{ars(c.deuda.ars)}</small></>;
}
function ComprasCelda({ c }: { c: Resumen }) {
  const m = c.mesActual;   // la cuenta corriente en pesos, exactos como el resto del panel
  if (c.cuotaUsd == null || !m) return <span className="adm-gris">—</span>;
  const pct = m.disponible > 0 ? Math.min(100, (m.asignado / m.disponible) * 100) : m.asignado > 0 ? 100 : 0;
  return <><span>{ars(m.asignado)} de {ars(m.disponible)}</span><i className="adm-barra"><i style={{ width: `${pct}%` }} /></i></>;
}
const subtitulo = (c: Resumen) => c.tipo === 'catalogo' ? 'Solo catálogo' : `${TIPO_TXT[c.tipo]} · desde ${mesAnio(c.fundacion.slice(0, 7))}`;

function PantallaLista({ ir, lista, error, recargar }: { ir: (h: string) => void; lista: Lista | null; error: string; recargar: () => void }) {
  const { fmt } = useDinero();
  const [q, setQ] = useState(''), [tipo, setTipo] = useState('todos'), [plan, setPlan] = useState('todos'), [conDeuda, setConDeuda] = useState(false);
  const [nueva, setNueva] = useState(false);
  const filtradas = useMemo(() => {
    if (!lista) return [];
    const n = q.trim().toLowerCase();
    const r = lista.cavas.filter(c =>
      (tipo === 'todos' || c.tipo === tipo) && (plan === 'todos' || c.plan === plan) && (!conDeuda || c.deuda.n > 0) &&
      (!n || c.numero.toLowerCase().includes(n) || c.numero.replace('#', '').includes(n) || c.nombre.toLowerCase().includes(n) || c.sociosNombres.some(s => s.toLowerCase().includes(n))));
    return conDeuda ? [...r].sort((a, b) => b.deuda.ars - a.deuda.ars) : r;
  }, [lista, q, tipo, plan, conDeuda]);
  return (
    <div className="tshell adm-shell" data-adm="lista">
      <div className="adm-titulo"><h1>Cavas</h1><button type="button" className="adm-boton" data-adm="nueva" onClick={() => setNueva(true)}>+ Nueva cava</button></div>
      {error && !lista && <p className="ses-error" role="alert">{error} <button className="ses-link" type="button" onClick={recargar}>Reintentar</button></p>}
      {!lista && !error && <p className="adm-gris adm-cargando" role="status">Cargando…</p>}
      {lista && (
        <>
          <Totales l={lista} />
          <div className="adm-filtros">
            <input className="ses-input adm-buscar" type="search" placeholder="Buscar por número, cava o socio" aria-label="Buscar" value={q} onChange={e => setQ(e.target.value)} />
            <select className="ses-input" aria-label="Tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="todos">Tipo: Todos</option><option value="grupal">Grupal</option><option value="individual">Individual</option><option value="catalogo">Solo catálogo</option></select>
            <select className="ses-input" aria-label="Plan" value={plan} onChange={e => setPlan(e.target.value)}>
              <option value="todos">Plan: Todos</option><option>Reserva</option><option>Gran Reserva</option></select>
            <label className="adm-check"><input type="checkbox" checked={conDeuda} onChange={e => setConDeuda(e.target.checked)} /> Con deuda</label>
          </div>
          {!filtradas.length && <p className="adm-gris adm-cargando">No hay cavas con esos filtros.</p>}
          {!!filtradas.length && (
            <table className="adm-tabla" data-adm="tabla">
              <thead><tr><th>Cava</th><th>Socios</th><th>Plan y cuota</th><th>Pagos</th><th>Compras de {mesNombre(lista.mesHoy)}</th><th>En guarda</th><th /></tr></thead>
              <tbody>
                {filtradas.map(c => (
                  <tr key={c.id} data-cava={c.id} onClick={() => ir(`admin/${c.id}`)}>
                    <td><a className="adm-cava-n" href={`#admin/${c.id}`} onClick={e => e.preventDefault()}><b>{c.numero} {c.nombre}</b></a><small>{subtitulo(c)}</small></td>
                    <td>{c.socios}</td>
                    <td>{c.cuotaUsd == null ? <span className="adm-gris">Sin cuota</span> : <><span>{c.plan} · USD {puntos(c.cuotaUsd)}</span><small>{fmt(c.cuotaUsd)}</small></>}</td>
                    <td className="adm-celda"><PagosCelda c={c} /></td>
                    <td className="adm-celda"><ComprasCelda c={c} /></td>
                    <td>{puntos(c.enGuarda)}</td>
                    <td className="adm-mas">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="adm-tarjetas" data-adm="tarjetas">
            {filtradas.map(c => (
              <a key={c.id} className="adm-tarjeta" href={`#admin/${c.id}`} data-cava={c.id}>
                <div className="adm-tarjeta-top"><b>{c.numero} {c.nombre}</b><span>›</span></div>
                <small>{c.tipo === 'catalogo' ? 'Solo catálogo · sin cuota'
                  : `${TIPO_TXT[c.tipo]}${c.tipo === 'grupal' ? ` · ${pl(c.socios, 'socio', 'socios')}` : ''} · ${c.plan} · USD ${puntos(c.cuotaUsd ?? 0)}`}</small>
                <div className="adm-tres">
                  <div><em>Pagos</em>{c.cuotaUsd == null ? <b className="adm-gris">—</b>
                    : c.deuda.n ? <><b className="adm-debe">{c.tipo === 'individual' ? `Debe ${pl(c.deuda.meses, 'mes', 'meses')}` : `${c.deuda.n} ${c.deuda.n === 1 ? 'debe' : 'deben'}`}</b><small>{ars(c.deuda.ars)}</small></>
                      : <b className="adm-ok">✓ Al día</b>}</div>
                  <div><em>Compras</em>{c.cuotaUsd == null || !c.mesActual ? <b className="adm-gris">—</b> : <><b>{ars(c.mesActual.asignado)}</b><small>de {ars(c.mesActual.disponible)}</small></>}</div>
                  <div><em>En guarda</em><b>{puntos(c.enGuarda)}</b><small>botellas</small></div>
                </div>
              </a>
            ))}
          </div>
          <LineaDolar />
        </>
      )}
      {nueva && lista && <HojaNuevaCava lista={lista} onCerrar={() => setNueva(false)} onCreada={id => { setNueva(false); recargar(); ir(`admin/${id}`); }} />}
    </div>
  );
}

// ══════════════════════════ PARTE 4 · NUEVA CAVA ══════════════════════════
interface Candidato { id?: string; nombre: string; email: string; telefono: string; rol: string }
function SelectorPersona({ usuarios, valor, onChange, rotulo }: { usuarios: Persona[]; valor: Candidato; onChange: (c: Candidato) => void; rotulo: string }) {
  const nuevo = !valor.id;
  return (
    <div className="adm-persona">
      <Campo rotulo={rotulo}>
        <select className="ses-input" value={valor.id ?? ''} onChange={e => onChange({ ...valor, id: e.target.value || undefined })}>
          <option value="">+ Persona nueva</option>
          {[...usuarios].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </Campo>
      {nuevo && (
        <div className="adm-nuevo">
          <Campo rotulo="Nombre"><input className="ses-input" value={valor.nombre} onChange={e => onChange({ ...valor, nombre: e.target.value })} autoComplete="off" /></Campo>
          <Campo rotulo="Email"><input className="ses-input" type="email" value={valor.email} onChange={e => onChange({ ...valor, email: e.target.value })} autoCapitalize="none" /></Campo>
          <Campo rotulo="Teléfono"><input className="ses-input" type="tel" value={valor.telefono} onChange={e => onChange({ ...valor, telefono: e.target.value })} /></Campo>
        </div>
      )}
    </div>
  );
}
const vacioC = (rol = 'Miembro'): Candidato => ({ nombre: '', email: '', telefono: '', rol });
const pedidoPersona = (c: Candidato) => c.id ? { id: c.id, rol: c.rol } : { nuevo: { nombre: c.nombre, email: c.email, telefono: c.telefono }, rol: c.rol };

function HojaNuevaCava({ lista, onCerrar, onCreada }: { lista: Lista; onCerrar: () => void; onCreada: (id: string) => void }) {
  const hoy = lista.mesHoy;
  const [tipo, setTipo] = useState<Tipo>('individual');
  const [nombre, setNombre] = useState('');
  const [fund, setFund] = useState(hoy), [cuota, setCuota] = useState('50');
  const [cdesde, setCdesde] = useState(hoy), [sdesde, setSdesde] = useState(hoy), [sinicial, setSinicial] = useState('0');
  const [titular, setTitular] = useState<Candidato>(vacioC('Titular'));
  const [socios, setSocios] = useState<Candidato[]>([vacioC('Presidente')]);
  const cuotaN = enteroODecimal(cuota);
  const { trabajando, error, enviar } = useEnvio(async () => {
    const base = { tipo, fundacion: fund, cuotasDesde: cdesde, saldoDesde: sdesde, saldoInicial: enteroODecimal(sinicial) || 0, ...(tipo === 'catalogo' ? {} : { cuotaUsd: cuotaN }) };
    const r = tipo === 'grupal'
      ? await pedir<{ id: string }>('createCava', { ...base, nombre, socios: socios.map(pedidoPersona) })
      : await pedir<{ id: string }>('createCava', { ...base, titular: pedidoPersona({ ...titular, nombre: titular.id ? titular.nombre : (titular.nombre || nombre) }) });
    onCreada(r.id);
  });
  const plan = tipo !== 'catalogo' && cuotaN > 0 ? `Plan ${planDe(cuotaN)}` : '';
  return (
    <Hoja titulo="Nueva cava" onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar} data-adm="form-nueva">
        <Campo rotulo="Tipo">
          <select className="ses-input" value={tipo} onChange={e => setTipo(e.target.value as Tipo)}>
            <option value="individual">Individual</option><option value="grupal">Grupal</option><option value="catalogo">Solo catálogo</option></select>
        </Campo>
        {tipo === 'grupal' && <Campo rotulo="Nombre del grupo"><input className="ses-input" value={nombre} onChange={e => setNombre(e.target.value)} required /></Campo>}
        <CampoMes rotulo="Fundación" valor={fund} onChange={setFund} />
        {tipo !== 'catalogo' && (
          <Campo rotulo="Cuota mensual (USD)">
            <input className="ses-input" inputMode="decimal" value={cuota} onChange={e => setCuota(e.target.value)} required />
            {plan && <small className="adm-plan" data-adm="plan">{plan}</small>}
          </Campo>
        )}
        {tipo !== 'catalogo' && <CampoMes rotulo="Cuotas desde" valor={cdesde} onChange={setCdesde} />}
        {tipo !== 'catalogo' && <CampoMes rotulo="Saldo desde" valor={sdesde} onChange={setSdesde} />}
        {tipo !== 'catalogo' && <Campo rotulo="Saldo inicial (USD)"><input className="ses-input" inputMode="decimal" value={sinicial} onChange={e => setSinicial(e.target.value)} /></Campo>}
        {tipo !== 'grupal' && <SelectorPersona usuarios={lista.usuarios} valor={titular} onChange={setTitular} rotulo="Titular" />}
        {tipo === 'grupal' && (
          <>
            <div className="adm-sub">Socios</div>
            {socios.map((s, i) => (
              <div key={i} className="adm-socio-form">
                <SelectorPersona usuarios={lista.usuarios} valor={s} rotulo={`Socio ${i + 1}`} onChange={v => setSocios(x => x.map((y, j) => j === i ? v : y))} />
                <div className="adm-socio-acc">
                  <label className="adm-check"><input type="radio" name="pres" checked={s.rol === 'Presidente'} onChange={() => setSocios(x => x.map((y, j) => ({ ...y, rol: j === i ? 'Presidente' : 'Miembro' })))} /> Presidente</label>
                  {socios.length > 1 && <button type="button" className="ses-link" onClick={() => setSocios(x => x.filter((_, j) => j !== i))}>Quitar</button>}
                </div>
              </div>
            ))}
            <button type="button" className="ses-link adm-sumar" onClick={() => setSocios(x => [...x, vacioC()])}>+ Sumar otro socio</button>
          </>
        )}
        <Guardar trabajando={trabajando} error={error} texto="Crear cava" />
      </form>
    </Hoja>
  );
}

// ══════════════════════════ PARTE 2 · FICHA ══════════════════════════
// La tarjeta azul de la ficha: un mes (el mismo de la tabla de abajo), con la cuenta corriente de ese mes en pesos exactos.
// Toda la tarjeta abre y cierra el detalle; las flechas sólo cambian de mes.
const conSignoArs = (n: number) => (n > 0 ? '+' + ars(n) : ars(n));
function TarjetaCuenta({ mes, mesHoy, lista, d, abierto, onToggle, onIr }: {
  mes: string; mesHoy: string; lista: { mes: string; botellas: number }[]; d: ComprasDatos | null; abierto: boolean; onToggle: () => void; onIr: (mes: string) => void;
}) {
  const i = lista.findIndex(m => m.mes === mes);
  const antes = i > 0 ? lista[i - 1].mes : null, despues = i >= 0 && i < lista.length - 1 ? lista[i + 1].mes : null;
  const bot = d ? d.lineas.reduce((t, l) => t + l.cantidad, 0) : (lista[i]?.botellas ?? 0);
  const rotulo = <>{mesNombre(mes).toUpperCase()} {mes.slice(0, 4)}{bot > 0 && <span className="sf-bot"> · {bot} {bot === 1 ? 'BOTELLA' : 'BOTELLAS'}</span>}</>;
  const p = d?.presupuesto ?? null, nm = d ? numerosMes(d) : null;
  const comprado = d ? d.lineas.reduce((t, l) => t + l.cantidad * l.costoArs, 0) : null;
  const conCuenta = !!(p && p.arrastre && nm);
  const terminado = mes < mesHoy;
  const pct = conCuenta && nm!.disponible > 0 ? Math.round((nm!.asignado / nm!.disponible) * 100) : null;
  const tocar = (e: React.SyntheticEvent) => { if ((e.target as HTMLElement).closest('.sf-flechas')) return; onToggle(); };
  const celda = (rot: string, monto: string, neg: boolean, tot = false, dato?: string) =>
    <div className={'cc-t' + (tot ? ' tot' : '')} data-cc={dato}><span>{rot}</span><b className={neg ? 'neg' : undefined}>{monto}</b></div>;
  const aviso = conCuenta ? avisoSaldo(nm!.queda, p!.cuota) : null;
  // la barra de siempre: lo comprado sobre lo que había para comprar
  const disp = conCuenta ? nm!.disponible : 0, asig = nm?.asignado ?? 0, pasado = asig > disp;
  const pctBarra = disp > 0 ? Math.min(100, (asig / disp) * 100) : asig > 0 ? 100 : 0;
  const dorado = pasado ? (Math.max(disp, 0) / asig) * 100 : pctBarra;
  const mesAnt = sumarMes(mes, -1), mesSig = sumarMes(mes, 1);
  return (
    <div className={'cm adm-cm adm-cc adm-cm-tocable' + (abierto ? ' abierta' : '')} data-adm="compras-mes" data-mes={mes} role="button" tabIndex={0} aria-expanded={abierto} aria-controls="adm-compras-detalle"
      onClick={tocar} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !(e.target as HTMLElement).closest('.sf-flechas')) { e.preventDefault(); onToggle(); } }}>
      <SelectorFlechas variante="rotulo" tono="oscuro" rotulo={rotulo} data={{ rotulo: 'rot', prev: 'prev', next: 'next' }}
        onPrev={() => antes && onIr(antes)} onNext={() => despues && onIr(despues)} sinPrev={!antes} sinNext={!despues} etiquetaPrev="Mes anterior" etiquetaNext="Mes siguiente" />
      {!d ? <div className="cc-cuenta"><div className="cc-t"><span>Comprado</span><b>…</b></div></div>
        : conCuenta ? (
          <div className="cc-cuenta" data-adm="cuenta">
            {celda('Presupuesto', ars(p!.cuota), false, false, 'presupuesto')}
            {p!.saldoInicial !== null ? celda('Saldo inicial', conSignoArs(p!.saldoInicial ?? 0), (p!.saldoInicial ?? 0) < 0, false, 'saldo')
              : celda(`Saldo de ${mesNombre(mesAnt)}`, conSignoArs(p!.saldoAnterior ?? 0), (p!.saldoAnterior ?? 0) < 0, false, 'saldo')}
            {celda('Para comprar', ars(nm!.disponible), nm!.disponible < 0, true, 'para-comprar')}
            {celda(`Comprado${pct !== null ? ` · ${pct} %` : ''}`, ars(nm!.asignado), false, false, 'comprado')}
            {terminado ? celda(`Pasa a ${mesNombre(mesSig)}`, conSignoArs(nm!.queda), nm!.queda < 0, true, 'queda')
              : celda('Queda', ars(nm!.queda), nm!.queda < 0, true, 'queda')}
          </div>
        ) : (
          <div className="cc-cuenta cc-sola" data-adm="cuenta">
            {celda('Comprado', ars(comprado ?? 0), false, false, 'comprado')}
            <p className="cc-sin">{d.saldoDesde ? `Sin cuenta corriente (arranca en ${mesNombre(d.saldoDesde)} ${d.saldoDesde.slice(0, 4)})` : 'Sin cuenta corriente'}</p>
          </div>
        )}
      {conCuenta && <div className="cm-barra"><i style={{ width: `${dorado}%` }} />{pasado && <i className="exc" style={{ width: `${100 - dorado}%` }} />}</div>}
      <div className="cc-pie">
        {aviso ? <span className="adm-cm-aviso" data-adm="aviso-saldo">{aviso}</span> : <span />}
        <span className="adm-cm-ver" data-adm="compras-ver">{abierto ? 'Ocultar ▴' : 'Ver detalle ▾'}</span>
      </div>
    </div>
  );
}
function EstadoSocio({ s }: { s: Socio }) {
  return s.alDia ? <span className="adm-ok">✓ Al día</span> : <span className="adm-debe">Debe {pl(s.meses, 'mes', 'meses')} <b>{ars(s.debeArs)}</b></span>;
}
function BotonWa({ tel }: { tel: string }) {
  const url = wa(tel);
  const icono = <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8zm-3 3.9c-.2 0-.5.1-.7.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3l-1.9-.9c-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.2-1.2-.4-2.3-1.4-.8-.8-1.4-1.7-1.5-2-.2-.3 0-.4.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5z" /></svg>;
  return url
    ? <a className="adm-wa" href={url} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" onClick={e => e.stopPropagation()}>{icono}</a>
    : <button className="adm-wa" type="button" disabled aria-label="Sin teléfono">{icono}</button>;
}

function PantallaFicha({ id, recargarLista, volver }: { id: string; recargarLista: () => void; volver: () => void }) {
  const [f, setF] = useState<Ficha | null>(null);
  const [error, setError] = useState('');
  const [todos, setTodos] = useState(false);
  const [abierto, setAbierto] = useState(false);
  // el mes elegido en la tarjeta azul: la tarjeta y la tabla muestran siempre ese mes, con un solo pedido comprasMes por mes
  const [mesSel, setMesSel] = useState(''), [porMes, setPorMes] = useState<Record<string, ComprasDatos>>({});
  const [lista, setLista] = useState<{ mes: string; botellas: number }[]>([]);
  const detalleRef = useRef<HTMLDivElement>(null);
  const [hoja, setHoja] = useState<null | { t: 'config' | 'notas' | 'pago' | 'sumar' } | { t: 'socio'; s: Socio } | { t: 'guarda'; mes: string }>(null);
  const cargar = useCallback(() => {
    setError('');
    pedir<Ficha>('detail', undefined, `&cava=${encodeURIComponent(id)}`).then(d => { ponerDolar(d.dolar); setF(d); }).catch(e => setError(e.message));
  }, [id]);
  useEffect(() => { setF(null); setTodos(false); setAbierto(false); setMesSel(''); setPorMes({}); setLista([]); cargar(); }, [cargar]);
  const mesHoyF = f?.mesHoy ?? '';
  const mes = mesSel || mesHoyF;
  const poner = (d: ComprasDatos) => { setPorMes(x => ({ ...x, [d.mes]: d })); setLista(d.meses); };
  useEffect(() => {
    if (!mes || porMes[mes]) return;
    let vivo = true;
    pedir<ComprasDatos>('comprasMes', undefined, `&cava=${encodeURIComponent(id)}&mes=${mes}`).then(d => { if (vivo) poner(d); }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line
  }, [id, mes, porMes]);
  const datosMes = mes ? porMes[mes] ?? null : null;
  // la cuota mensual en pesos del mes en curso (la misma del Presupuesto de la tarjeta)
  const presupuestoHoy = mesHoyF ? porMes[mesHoyF]?.presupuesto?.cuota ?? null : null;
  useEffect(() => { if (abierto) detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [abierto]);
  const guardado = (d: Ficha) => { ponerDolar(d.dolar); setF(d); recargarLista(); };
  if (error && !f) return <div className="tshell adm-shell"><a className="adm-volver" href="#admin">← Cavas</a><p className="ses-error" role="alert">{error} <button className="ses-link" type="button" onClick={cargar}>Reintentar</button></p></div>;
  if (!f) return <div className="tshell adm-shell"><a className="adm-volver" href="#admin">← Cavas</a><p className="adm-gris adm-cargando" role="status">Cargando…</p></div>;
  const c = f.cava, grupal = c.tipo === 'grupal';
  const pagosVisibles = todos ? f.pagos : f.pagos.slice(0, 7);
  const entrar = async () => { await recargarOtras(); elegirCava(c.id); volver(); };
  const debeSocios = c.socios.reduce((t, s) => t + s.debeArs, 0), alDiaSocios = c.socios.filter(s => s.alDia).length;
  const mesCuota = c.mesesArs.find(x => x.mes === f.mesHoy) ?? c.mesesArs[c.mesesArs.length - 1];
  const montoPago = (p: Pago) => (p.ars != null && p.ars > 0 ? ars(p.ars) : `USD ${puntos(p.usd)}`);
  return (
    <div className="tshell adm-shell" data-adm="ficha" data-cava={c.id}>
      <a className="adm-volver" href="#admin">← Cavas</a>
      <div className="adm-ficha-top">
        <div>
          <h1>{c.numero} {c.nombre}</h1>
          <p className="adm-sub-t">{[TIPO_TXT[c.tipo], grupal ? pl(c.socios.length, 'socio', 'socios') : null, c.plan, c.fundacion ? `desde ${mesAnio(c.fundacion.slice(0, 7))}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="adm-ficha-acc">
          <button type="button" className="adm-boton adm-boton-claro" data-adm="entrar" onClick={entrar}>Entrar a la cava ›</button>
        </div>
      </div>

      <TarjetaCuenta mes={mes} mesHoy={f.mesHoy} lista={lista.length ? lista : [{ mes, botellas: 0 }]} d={datosMes} abierto={abierto}
        onToggle={() => setAbierto(v => !v)} onIr={m => setMesSel(m)} />

      {abierto && datosMes && (
        <div id="adm-compras-detalle" ref={detalleRef} className="adm-compras-detalle">
          <AdminCompras cavaId={c.id} datos={datosMes} onDatos={poner} />
        </div>
      )}

      <div className="adm-cols">
        <div className="adm-ancha">
          <div className="tpanel" data-adm="socios">
            <h3>{grupal ? 'Socios' : 'Titular'}{c.cuotaUsd != null && c.socios.length > 0 && <span data-adm="al-dia">{alDiaSocios} de {c.socios.length} al día</span>}{grupal && <button type="button" className="cm-link" onClick={() => setHoja({ t: 'sumar' })}>+ Sumar socio</button>}</h3>
            {c.cuotaUsd != null && (
              <p className="adm-cuotas-l" data-adm="cuotas-mes">
                {debeSocios > 0 ? <b className="adm-debe">Deben {ars(debeSocios)}</b> : <b className="adm-ok">✓ Todos al día</b>}
                {mesCuota && <span>{grupal && mesCuota.guardaArs > 0 ? `Cuota ${ars(mesCuota.cuotaArs)} + guarda ${ars(mesCuota.guardaArs)} por socio` : grupal ? `Cuota ${ars(mesCuota.cuotaArs)} por socio` : `Cuota ${ars(mesCuota.cuotaArs)}`}</span>}
              </p>
            )}
            <div className="adm-socios">
              {c.socios.map(s => (
                <div key={s.id} className="adm-socio" role="button" tabIndex={0} data-socio={s.id} onClick={() => setHoja({ t: 'socio', s })}
                  onKeyDown={e => { if (e.key === 'Enter') setHoja({ t: 'socio', s }); }}>
                  <div className="adm-socio-n"><b>{s.nombre}</b><small>{grupal ? (s.rol === 'Presidente' ? 'Presidente' : 'Socio') : 'Titular'}{s.otras.length ? ` · también en ${s.otras.join(', ')}` : ''}</small></div>
                  <div className="adm-socio-m">{s.email}</div>
                  <div className="adm-socio-e">{c.cuotaUsd == null ? <span className="adm-gris">—</span> : <EstadoSocio s={s} />}</div>
                  <BotonWa tel={s.telefono} />
                </div>
              ))}
              {!c.socios.length && <p className="adm-gris">Todavía no hay socios.</p>}
            </div>
          </div>

          <div className="tpanel" data-adm="pagos">
            <h3>Pagos{c.cuotaUsd != null && c.socios.length > 0 && <button type="button" className="cm-link" data-adm="cargar-pago" onClick={() => setHoja({ t: 'pago' })}>+ Cargar pago</button>}</h3>
            {!f.pagos.length ? <p className="adm-gris">Todavía no hay pagos.</p> : (
              <>
                <table className="adm-pagos">
                  <thead><tr><th>Fecha</th><th>Socio</th><th>Mes</th><th>Monto</th><th>Medio</th></tr></thead>
                  <tbody>{pagosVisibles.map(p => <tr key={p.id}><td>{fechaCorta(p.fecha)}</td><td>{p.usuarioNombre}</td><td>{p.mes}</td><td>{montoPago(p)}</td><td>{p.medio || '—'}</td></tr>)}</tbody>
                </table>
                <div className="adm-pagos-cel">
                  {pagosVisibles.map(p => (
                    <div key={p.id} className="adm-pago"><div><b>{p.usuarioNombre}</b><small>{p.mes}{p.medio ? ` · ${p.medio}` : ''}</small></div><div><b>{montoPago(p)}</b><small>{fechaCorta(p.fecha)}</small></div></div>
                  ))}
                </div>
                {!todos && f.pagos.length > 7 && <button type="button" className="acc-todos" onClick={() => setTodos(true)}>Ver los {f.pagos.length} pagos ›</button>}
              </>
            )}
          </div>
        </div>

        <div className="adm-angosta">
          <div className="tpanel" data-adm="config">
            <h3>Configuración<button type="button" className="cm-link" onClick={() => setHoja({ t: 'config' })}>Editar</button></h3>
            <dl className="adm-dl">
              <dt>Cuota mensual</dt><dd data-adm="cuota-mensual">{c.cuotaUsd == null ? 'Sin cuota' : `USD ${puntos(c.cuotaUsd)} · ${presupuestoHoy != null ? ars(presupuestoHoy) : '…'}`}</dd>
              <dt>Tipo</dt><dd>{TIPO_TXT[c.tipo]}</dd>
              <dt>Fundación</dt><dd>{c.fundacion ? cap(mesAnio(c.fundacion.slice(0, 7))) : '—'}</dd>
              <dt>Cuotas desde</dt><dd>{c.cuotasDesde ? cap(mesAnio(c.cuotasDesde)) : '—'}</dd>
              <dt>Saldo desde</dt><dd>{c.saldoDesde ? cap(mesAnio(c.saldoDesde)) : '—'}</dd>
              <dt>Saldo inicial</dt><dd>USD {puntos(c.saldoInicial)}</dd>
            </dl>
          </div>

          {grupal && (
            <div className="tpanel" data-adm="guarda">
              <h3>Guarda por mes</h3>
              <table className="adm-guarda">
                <thead><tr><th>Mes</th><th>Cuota</th><th>Guarda</th></tr></thead>
                <tbody>
                  {c.guarda.map(g => (
                    <tr key={g.id} tabIndex={0} onClick={() => setHoja({ t: 'guarda', mes: g.mes })} onKeyDown={e => { if (e.key === 'Enter') setHoja({ t: 'guarda', mes: g.mes }); }}>
                      <td>{cap(mesAnio(g.mes))}</td><td>{g.cuotaArs == null ? <span className="adm-gris">auto</span> : ars(g.cuotaArs)}</td><td>{ars(g.guardaArs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(() => {
                const falta = c.guarda.some(g => g.mes === f.mesHoy) ? sumarMes(c.guarda[0].mes) : f.mesHoy;   // el mes que falta
                return <button type="button" className="acc-todos" data-adm="mes-siguiente" onClick={() => setHoja({ t: 'guarda', mes: falta })}>+ {cap(mesNombre(falta))} {falta.slice(0, 4)}</button>;
              })()}
            </div>
          )}

          <div className="tpanel" data-adm="notas">
            <h3>Notas<button type="button" className="cm-link" onClick={() => setHoja({ t: 'notas' })}>Editar</button></h3>
            <p className="adm-notas">{c.notas.trim() || 'Sin notas.'}</p>
          </div>
        </div>
      </div>
      <LineaDolar />

      {hoja?.t === 'config' && <HojaConfig f={f} onCerrar={() => setHoja(null)} onGuardado={d => { guardado(d); setHoja(null); }} />}
      {hoja?.t === 'notas' && <HojaNotas f={f} onCerrar={() => setHoja(null)} onGuardado={d => { guardado(d); setHoja(null); }} />}
      {hoja?.t === 'socio' && <HojaSocio f={f} s={hoja.s} onCerrar={() => setHoja(null)} onGuardado={d => { guardado(d); setHoja(null); }} />}
      {hoja?.t === 'sumar' && <HojaSumar f={f} onCerrar={() => setHoja(null)} onGuardado={d => { guardado(d); setHoja(null); }} />}
      {hoja?.t === 'guarda' && <HojaGuarda f={f} mes={hoja.mes} onCerrar={() => setHoja(null)} onGuardado={d => { guardado(d); setHoja(null); }} />}
      {hoja?.t === 'pago' && <HojaPago f={f} onCerrar={() => setHoja(null)} onGuardado={d => { guardado(d); setHoja(null); }} />}
    </div>
  );
}

// ── editar configuración ──
function HojaConfig({ f, onCerrar, onGuardado }: { f: Ficha; onCerrar: () => void; onGuardado: (d: Ficha) => void }) {
  const c = f.cava;
  const [tipo, setTipo] = useState<'individual' | 'catalogo'>(c.tipo === 'catalogo' ? 'catalogo' : 'individual');
  const [cuota, setCuota] = useState(c.cuotaUsd == null ? '' : String(c.cuotaUsd));
  const [fund, setFund] = useState(c.fundacion.slice(0, 7)), [cd, setCd] = useState(c.cuotasDesde), [sd, setSd] = useState(c.saldoDesde);
  const [si, setSi] = useState(String(c.saldoInicial));
  const grupal = c.tipo === 'grupal';
  const { trabajando, error, enviar } = useEnvio(async () => {
    const sinCuota = !grupal && tipo === 'catalogo';
    onGuardado(await pedir<Ficha>('updateCava', { cava: c.id, cuotaUsd: sinCuota ? null : enteroODecimal(cuota), fundacion: fund, cuotasDesde: cd, saldoDesde: sd, saldoInicial: enteroODecimal(si) || 0 }));
  });
  return (
    <Hoja titulo="Configuración" onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar}>
        {grupal ? <Campo rotulo="Tipo"><input className="ses-input" value="Grupal" disabled /></Campo> : (
          <Campo rotulo="Tipo"><select className="ses-input" value={tipo} onChange={e => setTipo(e.target.value as 'individual' | 'catalogo')}><option value="individual">Individual</option><option value="catalogo">Solo catálogo</option></select></Campo>
        )}
        {(grupal || tipo === 'individual') && <Campo rotulo="Cuota mensual (USD)"><input className="ses-input" inputMode="decimal" value={cuota} onChange={e => setCuota(e.target.value)} required /></Campo>}
        <CampoMes rotulo="Fundación" valor={fund} onChange={setFund} vacioOk />
        <CampoMes rotulo="Cuotas desde" valor={cd} onChange={setCd} vacioOk />
        <CampoMes rotulo="Saldo desde" valor={sd} onChange={setSd} vacioOk />
        <Campo rotulo="Saldo inicial (USD)"><input className="ses-input" inputMode="decimal" value={si} onChange={e => setSi(e.target.value)} /></Campo>
        <Guardar trabajando={trabajando} error={error} />
      </form>
    </Hoja>
  );
}
function HojaNotas({ f, onCerrar, onGuardado }: { f: Ficha; onCerrar: () => void; onGuardado: (d: Ficha) => void }) {
  const [n, setN] = useState(f.cava.notas);
  const { trabajando, error, enviar } = useEnvio(async () => onGuardado(await pedir<Ficha>('updateCava', { cava: f.cava.id, notas: n })));
  return (
    <Hoja titulo="Notas" onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar}>
        <textarea className="ses-input adm-textarea" rows={7} value={n} onChange={e => setN(e.target.value)} aria-label="Notas" />
        <Guardar trabajando={trabajando} error={error} />
      </form>
    </Hoja>
  );
}
function HojaSocio({ f, s, onCerrar, onGuardado }: { f: Ficha; s: Socio; onCerrar: () => void; onGuardado: (d: Ficha) => void }) {
  const [nombre, setNombre] = useState(s.nombre), [email, setEmail] = useState(s.email), [tel, setTel] = useState(s.telefono), [notas, setNotas] = useState(s.notas);
  const [rol, setRol] = useState(s.rol === 'Presidente' ? 'Presidente' : 'Miembro');
  const grupal = f.cava.tipo === 'grupal';
  const { trabajando, error, enviar } = useEnvio(async () => onGuardado(await pedir<Ficha>('updateUsuario',
    { cava: f.cava.id, usuario: s.id, nombre, email, telefono: tel, notas, ...(grupal ? { rol } : {}) })));
  return (
    <Hoja titulo={s.nombre} onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar}>
        <Campo rotulo="Nombre"><input className="ses-input" value={nombre} onChange={e => setNombre(e.target.value)} required /></Campo>
        <Campo rotulo="Email"><input className="ses-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoCapitalize="none" /></Campo>
        <Campo rotulo="Teléfono"><input className="ses-input" type="tel" value={tel} onChange={e => setTel(e.target.value)} /></Campo>
        {grupal && <Campo rotulo="Rol"><select className="ses-input" value={rol} onChange={e => setRol(e.target.value)}><option value="Miembro">Socio</option><option value="Presidente">Presidente</option></select></Campo>}
        <Campo rotulo="Notas"><textarea className="ses-input adm-textarea" rows={3} value={notas} onChange={e => setNotas(e.target.value)} /></Campo>
        <Guardar trabajando={trabajando} error={error} />
      </form>
    </Hoja>
  );
}
function HojaSumar({ f, onCerrar, onGuardado }: { f: Ficha; onCerrar: () => void; onGuardado: (d: Ficha) => void }) {
  const [p, setP] = useState<Candidato>(vacioC());
  const ya = new Set(f.cava.socios.map(s => s.id));
  const { trabajando, error, enviar } = useEnvio(async () => onGuardado(await pedir<Ficha>('addSocio',
    p.id ? { cava: f.cava.id, usuario: p.id, rol: p.rol } : { cava: f.cava.id, nuevo: { nombre: p.nombre, email: p.email, telefono: p.telefono }, rol: p.rol })));
  return (
    <Hoja titulo="Sumar socio" onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar}>
        <SelectorPersona usuarios={f.usuarios.filter(u => !ya.has(u.id))} valor={p} onChange={setP} rotulo="Socio" />
        <Campo rotulo="Rol"><select className="ses-input" value={p.rol} onChange={e => setP({ ...p, rol: e.target.value })}><option value="Miembro">Socio</option><option value="Presidente">Presidente</option></select></Campo>
        <Guardar trabajando={trabajando} error={error} texto="Sumar" />
      </form>
    </Hoja>
  );
}
function HojaGuarda({ f, mes, onCerrar, onGuardado }: { f: Ficha; mes: string; onCerrar: () => void; onGuardado: (d: Ficha) => void }) {
  const fila = f.cava.guarda.find(g => g.mes === mes);
  const [cuota, setCuota] = useState(fila?.cuotaArs == null ? '' : String(fila.cuotaArs));
  const [guarda, setGuarda] = useState(String(fila?.guardaArs ?? ''));
  const { trabajando, error, enviar } = useEnvio(async () => onGuardado(await pedir<Ficha>('upsertGuarda',
    { cava: f.cava.id, mes, cuotaArs: cuota.trim() === '' ? null : enteroODecimal(cuota), guardaArs: enteroODecimal(guarda) || 0 })));
  return (
    <Hoja titulo={`Guarda · ${cap(mesAnio(mes))}`} onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar}>
        <Campo rotulo="Cuota por socio ($)"><input className="ses-input" inputMode="numeric" value={cuota} onChange={e => setCuota(e.target.value)} placeholder="Vacío: USD × dólar del mes" /></Campo>
        <Campo rotulo="Guarda por socio ($)"><input className="ses-input" inputMode="numeric" value={guarda} onChange={e => setGuarda(e.target.value)} required /></Campo>
        <Guardar trabajando={trabajando} error={error} />
      </form>
    </Hoja>
  );
}

// ══════════════════════════ PARTE 3 · CARGAR PAGO ══════════════════════════
function HojaPago({ f, onCerrar, onGuardado }: { f: Ficha; onCerrar: () => void; onGuardado: (d: Ficha) => void }) {
  const c = f.cava;
  const primero = c.socios.find(s => !s.alDia) ?? c.socios[0];
  const [uid, setUid] = useState(primero?.id ?? '');
  const socio = c.socios.find(s => s.id === uid);
  const opciones = useMemo(() => {
    const ms = new Set<string>([...(socio?.adeudados ?? []), f.mesHoy]);
    return [...ms].sort();
  }, [socio, f.mesHoy]);
  const [marcados, setMarcados] = useState<string[]>(() => primero?.adeudados[0] ? [primero.adeudados[0]] : [f.mesHoy]);
  const [medio, setMedio] = useState('Transferencia'), [fecha, setFecha] = useState(f.hoy), [notas, setNotas] = useState('');
  const totalDe = (m: string) => c.mesesArs.find(x => x.mes === m)?.totalArs ?? 0;
  const sugerido = marcados.reduce((t, m) => t + totalDe(m), 0);
  const [monto, setMonto] = useState(String(sugerido)), [tocado, setTocado] = useState(false);
  const cambiaSocio = (id: string) => {
    setUid(id);
    const s = c.socios.find(x => x.id === id);
    setMarcados(s?.adeudados[0] ? [s.adeudados[0]] : [f.mesHoy]); setTocado(false);
  };
  useEffect(() => { if (!tocado) setMonto(String(sugerido)); }, [sugerido, tocado]);
  const alternar = (m: string) => setMarcados(x => (x.includes(m) ? x.filter(y => y !== m) : [...x, m]).sort());
  const montoN = enteroODecimal(monto);
  const { trabajando, error, enviar } = useEnvio(async () => onGuardado(await pedir<Ficha>('createPago',
    { cava: c.id, usuario: uid, meses: marcados, montoArs: montoN, medio, fecha, notas })));
  return (
    <Hoja titulo="Cargar pago" onCerrar={onCerrar}>
      <form className="ses-form" onSubmit={enviar} data-adm="form-pago">
        {c.tipo === 'grupal'
          ? <Campo rotulo="Socio"><select className="ses-input" value={uid} onChange={e => cambiaSocio(e.target.value)}>{c.socios.map(s => <option key={s.id} value={s.id}>{s.nombre}{s.alDia ? '' : ` · debe ${pl(s.meses, 'mes', 'meses')}`}</option>)}</select></Campo>
          : <Campo rotulo="Socio"><input className="ses-input" value={socio?.nombre ?? ''} disabled /></Campo>}
        <div className="adm-campo"><span className="ses-lbl">Mes</span>
          <div className="adm-meses">
            {opciones.map(m => (
              <label key={m} className={'adm-mes' + (marcados.includes(m) ? ' on' : '')}>
                <input type="checkbox" checked={marcados.includes(m)} onChange={() => alternar(m)} /> {cap(mesNombre(m)).slice(0, 3)} {m.slice(0, 4)}
                <small>{ars(totalDe(m))}</small>
              </label>
            ))}
          </div>
        </div>
        <Campo rotulo="Monto en pesos"><input className="ses-input" inputMode="numeric" value={monto} onChange={e => { setMonto(e.target.value); setTocado(true); }} required /></Campo>
        {montoN > 0 && montoN < sugerido && <p className="ses-ayuda">Es menos que el total ({ars(sugerido)}): el último mes queda parcial.</p>}
        <Campo rotulo="Medio"><select className="ses-input" value={medio} onChange={e => setMedio(e.target.value)}>{['Transferencia', 'Mercado Pago', 'Efectivo', 'Otro'].map(m => <option key={m}>{m}</option>)}</select></Campo>
        <Campo rotulo="Fecha de pago"><input className="ses-input" type="date" value={fecha} onChange={e => setFecha(e.target.value)} required /></Campo>
        <Campo rotulo="Notas (opcional)"><input className="ses-input" value={notas} onChange={e => setNotas(e.target.value)} /></Campo>
        <Guardar trabajando={trabajando} error={error} texto="Guardar pago" desactivado={!marcados.length || !(montoN > 0) || !uid} />
      </form>
    </Hoja>
  );
}

// ══════════════════════════ ENTRADA ══════════════════════════
export default function AdminPanel({ cavaId, ir, volver }: { cavaId: string; ir: (hash: string) => void; volver: () => void }) {
  const { lista, error, recargar } = useLista();
  const ses = useSesion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: 'start' }); window.scrollTo(0, 0); }, [cavaId]);
  if (ses.listo && !ses.usuario?.admin) return <div className="tshell adm-shell"><p className="ses-error">Esta pantalla es sólo para el Admin.</p></div>;
  return (
    <div ref={ref} data-pantalla="admin">
      <div className="adm-bar" data-adm="barra">
        <div className="adm-bar-in">
          <button type="button" className="sec-back-btn" data-adm="volver-app" onClick={volver}>← Volver a la app</button>
          <b className="adm-bar-t">Panel Admin</b>
          <nav className="adm-tabs" aria-label="Secciones del panel">
            <button type="button" className="on" aria-current="page" onClick={() => ir('admin')}>Cavas</button>
            <button type="button" disabled>Compras · Próximamente</button>
          </nav>
        </div>
      </div>
      {cavaId
        ? <PantallaFicha id={cavaId} recargarLista={recargar} volver={volver} />
        : <PantallaLista ir={ir} lista={lista} error={error} recargar={recargar} />}
    </div>
  );
}
