// Lo que los socios hacen en Consumos: armar la juntada (Presidente), puntuar (asistentes), fotos, y en la cava personal
// abrir botellas. Los datos y los permisos salen de /api/juntadas: acá nada se decide sólo en la app.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtN, mesLargo, plural } from './ClubCava';
import { WHATSAPP_NUMBER } from '../app/data';   // el mismo número de EDB que usa "Pedir relevamiento"
import './juntadas.css';

// ── lo que manda /api/juntadas?accion=estado ──
export interface ConsumoPriv {
  id: string; botella: string; vino: string; anada: number | null; cepa: string; tipo: string; bodega: string;
  fecha: string; orden: number | null; vivino: number | null; mio: boolean;
  puedeDeshacer?: boolean;   // lo decide el servidor (api/juntadas): quién puede deshacer esta apertura
}
export interface JuntadaPriv {
  id: string; nombre: string; fecha: string; asistentes: string[]; abierta: boolean; soyAsistente: boolean;
  fotos: number; portada?: string; portadaPor: string; maridaje: string; notas: string; consumos: ConsumoPriv[];
  exacto: boolean;                                   // "Día exacto": sin tildar, sólo se sabe el mes
  puedeEditar: boolean; puedeFotos: boolean;         // los decide el servidor
  asistentesNombres: { id: string; nombre: string }[];
  // juntada programada: fecha futura, vinos designados, sin consumos
  programada: boolean; sede: string; hora: string; designados: Designado[];
  van: string[]; noVan: string[]; miRespuesta: 'va' | 'no' | null;
  puedeResponder: boolean; puedeEmpezar: boolean; puedeBorrar: boolean;
}
export interface Designado { botella: string; vino: string; anada: number | null; cepa: string; bodega: string; vivino: number | null; enGuarda: number }
export interface VotoPriv { total: number | null; partes: Record<string, number | null>; notas: string }
export interface PuntajePriv {
  mio: VotoPriv | null;
  club: { promedio: number; votos: number; detalle: { nombre: string; total: number; mio: boolean }[] } | null;
}
export interface Guia {
  partes: Record<string, { desde: number; hasta: number; texto: string }[]>;
  franjas: { desde: number; hasta: number; nombre: string }[];
}
export interface EstadoJuntadas {
  yo: string; individual: boolean; puedeArmar: boolean; esDueno: boolean; hoy: string; totalSocios: number; soySocio: boolean;
  socios: { id: string; nombre: string }[];
  guarda: { id: string; vino: string; anada: number | null; bodega: string; cepa: string; enGuarda: number }[];
  juntadas: JuntadaPriv[]; individuales: ConsumoPriv[];
  puntajes: Record<string, PuntajePriv>; guia: Guia; partes: { clave: string; max: number }[];
}
// los nombres de las cuatro partes (los de los campos de la tabla Puntajes)
const NOMBRE_PARTE: Record<string, string> = { color: 'Color y aspecto', aroma: 'Aroma', sabor: 'Sabor y final', impresion: 'Impresión general' };

async function pedir(accion: string, cuerpo?: object) {
  const r = await fetch(`/api/juntadas?accion=${accion}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo ?? {}),
  });
  let d: any = {};
  try { d = await r.json(); } catch { /* sin cuerpo */ }
  return { ok: r.ok, estado: r.status, ...d };
}

export const responderJuntada = (juntada: string, va: boolean) => pedir('responder', { juntada, va });
export const borrarJuntada = (juntada: string) => pedir('borrar', { juntada });
export const programadaDe = (e: EstadoJuntadas | null) => (e && !e.individual ? e.juntadas.find(j => j.programada) ?? null : null);

// ── fechas ──
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const aFecha = (f: string) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const diaSemana = (f: string) => DIAS[aFecha(f).getUTCDay()];
export const diaMes = (f: string) => `${Number(f.slice(8, 10))}/${f.slice(5, 7)}`;
export const fechaLarga = (f: string) => { const d = aFecha(f); const t = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_L[d.getUTCMonth()]}`; return t.charAt(0).toUpperCase() + t.slice(1); };
// "en 17 días", "mañana", "hoy", "hace 3 días"
export function cuandoFalta(f: string, hoy: string) {
  const n = Math.round((aFecha(f).getTime() - aFecha(hoy).getTime()) / 86400000);
  return n === 0 ? 'hoy' : n === 1 ? 'mañana' : n > 1 ? `en ${n} días` : n === -1 ? 'ayer' : `hace ${-n} días`;
}
// el último jueves del mes; si ya pasó, el del mes siguiente
export function ultimoJueves(hoy: string) {
  let [y, m] = hoy.split('-').map(Number);
  for (let k = 0; k < 2; k++) {
    const fin = new Date(Date.UTC(y, m, 0));
    fin.setUTCDate(fin.getUTCDate() - ((fin.getUTCDay() - 4 + 7) % 7));
    const f = fin.toISOString().slice(0, 10);
    if (f >= hoy) return f;
    if (m === 12) { y++; m = 1; } else m++;
  }
  return hoy;
}
// la regla del club: botellas = asistentes − 1
export const botellasPara = (personas: number) => Math.max(0, personas - 1);

// El estado de Consumos para la cava activa (sólo con sesión). `recargar` lo vuelve a pedir después de guardar algo.
export function useJuntadas(cavaId: string | null) {
  const [datos, setDatos] = useState<EstadoJuntadas | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!cavaId) { setDatos(null); return; }
    let vivo = true;
    fetch(`/api/juntadas?accion=estado&cava=${encodeURIComponent(cavaId)}`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null)).then(d => { if (vivo) setDatos(d); }).catch(() => { if (vivo) setDatos(null); });
    return () => { vivo = false; };
  }, [cavaId, vuelta]);
  const recargar = useCallback(() => setVuelta(v => v + 1), []);
  return { datos, recargar };
}

// Vinos que la persona tiene para puntuar: en juntadas con la votación abierta donde es asistente y todavía no votó
export function paraPuntuar(e: EstadoJuntadas | null) {
  if (!e || e.individual) return { n: 0, juntada: null as JuntadaPriv | null };
  let n = 0, juntada: JuntadaPriv | null = null;
  for (const j of e.juntadas) {
    if (!j.abierta || !j.soyAsistente) continue;
    const faltan = j.consumos.filter(c => !e.puntajes[c.id]?.mio).length;
    if (faltan) { n += faltan; juntada = j; }
  }
  return { n, juntada };
}

// ── una hoja: solapa desde abajo en el celular, ventana centrada desde 900 px (ver juntadas.css) ──
// Con `sucio`, cerrar con la ✕, Escape o tocando afuera pregunta "¿Descartar los cambios?".
function Hoja({ titulo, onCerrar, children, clase, sucio = false }: { titulo: string; onCerrar: () => void; children: React.ReactNode; clase?: string; sucio?: boolean }) {
  const [preguntando, setPreguntando] = useState(false);
  const pedirCierre = useCallback(() => { if (sucio) setPreguntando(true); else onCerrar(); }, [sucio, onCerrar]);
  useEffect(() => {
    // con el Catálogo de selección abierto encima, Escape es de él
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.jt-cat-capa')) pedirCierre(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [pedirCierre]);
  return createPortal(
    <div className="ses-back jt-back" onClick={pedirCierre}>
      <div className={'ses-sheet jt-hoja' + (clase ? ' ' + clase : '')} role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <div className="ses-handle" aria-hidden="true" />
        <button className="ses-x" type="button" onClick={pedirCierre} aria-label="Cerrar">✕</button>
        <div className="ses-t">{titulo}</div>
        {children}
        {preguntando && (
          <div className="jt-descartar" role="alertdialog" aria-label="¿Descartar los cambios?" data-jt="descartar">
            <p>¿Descartar los cambios?</p>
            <div>
              <button type="button" className="ses-principal" onClick={onCerrar}>Descartar</button>
              <button type="button" className="ses-link" onClick={() => setPreguntando(false)}>Seguir editando</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.querySelector('.club-root') ?? document.body);
}
const vinoTxt = (v: { vino: string; anada: number | null }) => `${v.vino}${v.anada ? ` · ${v.anada}` : ''}`;

// ── buscador sobre las botellas en guarda ──
function Buscador({ guarda, usadas, onElegir }: {
  guarda: EstadoJuntadas['guarda']; usadas: Map<string, number>; onElegir: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const res = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return [];
    return guarda.filter(b => (b.enGuarda - (usadas.get(b.id) ?? 0)) > 0 && norm(`${b.vino} ${b.bodega} ${b.anada ?? ''}`).includes(t)).slice(0, 8);
  }, [q, guarda, usadas]);
  return (
    <div className="jt-busca">
      <input className="ses-input" type="search" placeholder="Buscá un vino de la guarda" value={q} onChange={e => setQ(e.target.value)} data-jt="buscar" />
      {res.length > 0 && (
        <div className="jt-res">
          {res.map(b => (
            <button key={b.id} type="button" className="jt-res-fila" data-jt="resultado" onClick={() => { onElegir(b.id); setQ(''); }}>
              <span><b>{vinoTxt(b)}</b><small>{[b.bodega, b.cepa].filter(Boolean).join(' · ')}</small></span>
              <span className="jt-res-n">{fmtN(b.enGuarda - (usadas.get(b.id) ?? 0))} en guarda</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── armar, editar o empezar una juntada (Presidente o Admin; los permisos los valida el servidor) ──
// Con fecha futura queda programada: sin asistentes (están invitados todos los socios) y los vinos quedan designados.
// "Empezamos" la abre con los que dijeron "Voy" y los vinos designados, y al guardar se crean los consumos.
type VinoForm = { consumo?: string; botella: string; vino: string; anada: number | null };
export type CatalogoSeleccion = (p: { usadas: Map<string, number>; onListo: (botellas: string[]) => void; onCerrar: () => void }) => React.ReactNode;
const IcoArriba = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>;
const IcoAbajo = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
const IcoX = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>;

export function HojaArmar({ cavaId, e, juntada, empezar = false, onCerrar, onGuardado, onBorrar, catalogo }: {
  cavaId: string; e: EstadoJuntadas; juntada: JuntadaPriv | null; empezar?: boolean; onCerrar: () => void; onGuardado: (nombre: string) => void;
  onBorrar?: () => void; catalogo?: CatalogoSeleccion;
}) {
  const inicial = useMemo(() => {
    const desdeDesignados = !!juntada?.programada;
    return {
      fecha: juntada?.fecha ?? ultimoJueves(e.hoy),
      sinDia: juntada && !juntada.programada ? !juntada.exacto : false,
      hora: juntada?.hora ?? '', sede: juntada?.sede ?? '',
      asis: empezar && juntada ? juntada.van : juntada && !juntada.programada ? juntada.asistentes : e.socios.map(x => x.id),
      vinos: (desdeDesignados
        ? (juntada as JuntadaPriv).designados.map(d => ({ botella: d.botella, vino: d.vino, anada: d.anada }))
        : juntada ? [...juntada.consumos].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)).map(c => ({ consumo: c.id, botella: c.botella, vino: c.vino, anada: c.anada })) : []) as VinoForm[],
      maridaje: juntada?.maridaje ?? '', notas: juntada?.notas ?? '',
    };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [fecha, setFecha] = useState(inicial.fecha);
  const [sinDia, setSinDia] = useState(inicial.sinDia);
  const [hora, setHora] = useState(inicial.hora);
  const [sede, setSede] = useState(inicial.sede);
  const [asis, setAsis] = useState<Set<string>>(new Set(inicial.asis));
  const [vinos, setVinos] = useState<VinoForm[]>(inicial.vinos);
  const [maridaje, setMaridaje] = useState(inicial.maridaje);
  const [notas, setNotas] = useState(inicial.notas);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [catAbierto, setCatAbierto] = useState(false);
  const arrastrado = useRef<number | null>(null);
  const programada = !empezar && fecha > e.hoy;
  const sucio = JSON.stringify({ fecha, sinDia, hora, sede, asis: [...asis].sort(), vinos, maridaje, notas })
    !== JSON.stringify({ ...inicial, asis: [...inicial.asis].sort() });
  // en una programada todos los vinos salen de la guarda; en una realizada, sólo los nuevos
  const usadas = useMemo(() => { const m = new Map<string, number>(); vinos.filter(v => programada || !v.consumo).forEach(v => m.set(v.botella, (m.get(v.botella) ?? 0) + 1)); return m; }, [vinos, programada]);
  const mover = (i: number, d: number) => setVinos(vs => { const x = [...vs]; const [v] = x.splice(i, 1); x.splice(i + d, 0, v); return x; });
  const agregar = (ids: string[]) => setVinos(vs => [...vs, ...ids.map(id => e.guarda.find(x => x.id === id)).filter(Boolean).map(b => ({ botella: b!.id, vino: b!.vino, anada: b!.anada }))]);
  // el contador: botellas = asistentes − 1 (en una programada, los que confirmaron; si nadie confirmó, los socios)
  const personas = programada ? (juntada?.van.length || e.totalSocios) : asis.size;
  const tope = botellasPara(personas);
  const sobran = vinos.length - tope;
  async function guardar(confirmar = false) {
    setError(''); setGuardando(true);
    const r = await pedir('armar', {
      cava: cavaId, juntada: juntada?.id, fecha, diaExacto: programada || !sinDia, hora, sede, empezar,
      asistentes: programada ? [] : [...asis], vinos: vinos.map(v => ({ consumo: programada ? undefined : v.consumo, botella: v.botella })), maridaje, notas, confirmar,
    });
    setGuardando(false);
    if (r.estado === 409 && r.votos && !confirmar) {
      if (window.confirm(`${r.error}`)) return guardar(true);
      return;
    }
    if (!r.ok) { setError(r.error ?? 'No pudimos guardar la juntada.'); return; }
    onGuardado(r.nombre);
  }
  const titulo = empezar ? 'Empezamos la juntada' : juntada ? 'Editar juntada' : 'Armar juntada';
  return (
    <Hoja titulo={titulo} onCerrar={onCerrar} sucio={sucio && !guardando}>
      <div className="jt-form" data-jt="armar">
        <div className="jt-fila2">
          <div>
            <label className="ses-lbl" htmlFor="jt-fecha">Fecha</label>
            <input id="jt-fecha" className="ses-input" type="date" value={fecha} disabled={empezar} onChange={ev => setFecha(ev.target.value)} />
          </div>
          <div>
            <label className="ses-lbl" htmlFor="jt-hora">Hora <small>(opcional)</small></label>
            <input id="jt-hora" className="ses-input" type="time" value={hora} onChange={ev => setHora(ev.target.value)} />
          </div>
        </div>
        {!programada && <label className="jt-check"><input type="checkbox" data-jt="sin-dia" checked={sinDia} onChange={() => setSinDia(v => !v)} /><span>No sé el día exacto</span></label>}
        {programada && <p className="jt-ayuda" data-jt="aviso-programada">Fecha futura: queda programada. Están invitados todos los socios de la cava y los vinos quedan designados (no salen de la guarda hasta que empiece).</p>}
        <label className="ses-lbl" htmlFor="jt-sede">Sede</label>
        <input id="jt-sede" className="ses-input" type="text" placeholder="Dónde es" value={sede} onChange={ev => setSede(ev.target.value)} />

        {!programada && (
          <>
            <div className="ses-lbl">Asistentes{empezar ? <small> · tildados los que dijeron "Voy"</small> : null}</div>
            <div className="jt-asis">
              {e.socios.map(x => (
                <label key={x.id} className="jt-check">
                  <input type="checkbox" checked={asis.has(x.id)} onChange={() => setAsis(a => { const n = new Set(a); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); return n; })} />
                  <span>{x.nombre}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="jt-vinos-cab">
          <span className="ses-lbl">Vinos, en el orden en que se abren</span>
          <span className={'jt-contador' + (sobran > 0 ? ' sobra' : '')} data-jt="contador">{fmtN(vinos.length)} de {fmtN(tope)} {plural(tope, 'botella', 'botellas')}{sobran > 0 ? ` · ${plural(sobran, 'sobra', 'sobran')} ${fmtN(sobran)}` : ''}</span>
        </div>
        <Buscador guarda={e.guarda} usadas={usadas} onElegir={id => agregar([id])} />
        {catalogo && <button type="button" className="ses-link jt-cat-link" data-jt="elegir-catalogo" onClick={() => setCatAbierto(true)}>Elegir desde el Catálogo →</button>}
        {vinos.length > 0 ? (
          <ol className="jt-lista" data-jt="lista">
            {vinos.map((v, i) => (
              <li key={(v.consumo ?? 'n') + i + v.botella} draggable
                onDragStart={ev => { arrastrado.current = i; ev.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={ev => { if (arrastrado.current != null) ev.preventDefault(); }}
                onDrop={ev => { ev.preventDefault(); const de = arrastrado.current; arrastrado.current = null; if (de != null && de !== i) mover(de, i - de); }}
                onDragEnd={() => { arrastrado.current = null; }}>
                <span className="jt-manija" aria-hidden="true">⋮⋮</span>
                <span className="jt-num">{i + 1}</span>
                <span className="jt-nom">{vinoTxt(v)}</span>
                <span className="jt-acc">
                  <button type="button" className="jt-flechita" aria-label="Subir" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)}><IcoArriba /></button>
                  <button type="button" className="jt-flechita" aria-label="Bajar" title="Bajar" disabled={i === vinos.length - 1} onClick={() => mover(i, 1)}><IcoAbajo /></button>
                  <button type="button" aria-label="Sacar" title="Sacar" onClick={() => setVinos(vs => vs.filter((_, k) => k !== i))}><IcoX /></button>
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="jt-vacio">Todavía no agregaste vinos.</p>}

        <label className="ses-lbl" htmlFor="jt-mar">Maridaje <small>(opcional)</small></label>
        <textarea id="jt-mar" className="ses-input" rows={2} value={maridaje} onChange={ev => setMaridaje(ev.target.value)} />
        <label className="ses-lbl" htmlFor="jt-not">Notas <small>(opcional)</small></label>
        <textarea id="jt-not" className="ses-input" rows={2} value={notas} onChange={ev => setNotas(ev.target.value)} />
        {error && <p className="ses-error" role="alert">{error}</p>}
        <button type="button" className="ses-principal" data-jt="guardar-juntada" disabled={guardando || !vinos.length || (!programada && !asis.size)} onClick={() => guardar()}>
          {guardando ? 'Guardando…' : empezar ? 'Guardar lo que se abrió' : programada ? 'Guardar juntada programada' : 'Guardar juntada'}
        </button>
        {juntada?.puedeBorrar && onBorrar && !empezar && <button type="button" className="ses-link jt-borrar-link" data-jt="borrar-link" onClick={onBorrar}>Borrar juntada</button>}
      </div>
      {catAbierto && catalogo?.({ usadas, onCerrar: () => setCatAbierto(false), onListo: ids => { agregar(ids); setCatAbierto(false); } })}
    </Hoja>
  );
}

// ── la pantalla de puntaje (escala Parker: 50 + las cuatro partes) ──
export function franjaDe(total: number, guia: Guia) { return guia.franjas.find(f => total >= f.desde && total <= f.hasta)?.nombre ?? ''; }
export function HojaPuntaje({ consumo, e, puedeVotar, onCerrar, onGuardado }: {
  consumo: ConsumoPriv; e: EstadoJuntadas; puedeVotar: boolean; onCerrar: () => void; onGuardado: () => void;
}) {
  const p = e.puntajes[consumo.id];
  const mio = p?.mio;
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(e.partes.map(x => [x.clave, mio?.partes[x.clave] ?? Math.round(x.max / 2)])));
  const [notas, setNotas] = useState(mio?.notas ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const total = 50 + e.partes.reduce((s, x) => s + (vals[x.clave] ?? 0), 0);
  async function guardar() {
    setError(''); setGuardando(true);
    const r = await pedir('votar', { consumo: consumo.id, ...vals, notas });
    setGuardando(false);
    if (!r.ok) { setError(r.error ?? 'No pudimos guardar el puntaje.'); return; }
    onGuardado();
  }
  return (
    <Hoja titulo={vinoTxt(consumo)} onCerrar={onCerrar} clase="jt-punt">
      <div className="jt-total" data-jt="total-caja">
        <b data-jt="total">{total}</b>
        <span className="jt-franja">{franjaDe(total, e.guia)}</span>
      </div>
      <p className="jt-franjas">{e.guia.franjas.map(f => `${f.desde}–${f.hasta} ${f.nombre}`).join(' · ')}</p>
      {puedeVotar ? (
        <div className="jt-form">
          {e.partes.map(x => {
            const v = vals[x.clave] ?? 0;
            const g = e.guia.partes[x.clave]?.find(r => v >= r.desde && v <= r.hasta);
            return (
              <div key={x.clave} className="jt-parte">
                <label className="jt-parte-cab" htmlFor={`jt-${x.clave}`}><span>{NOMBRE_PARTE[x.clave] ?? x.clave}</span><b>{v} <small>/ {x.max}</small></b></label>
                <input id={`jt-${x.clave}`} type="range" min={0} max={x.max} step={1} value={v} data-parte={x.clave}
                  onChange={ev => setVals(s => ({ ...s, [x.clave]: Number(ev.target.value) }))} />
                {g && <small className="jt-guia">{g.texto}</small>}
              </div>
            );
          })}
          <label className="ses-lbl" htmlFor="jt-cata">Notas <small>(opcional)</small></label>
          <textarea id="jt-cata" className="ses-input" rows={2} value={notas} onChange={ev => setNotas(ev.target.value)} />
          {error && <p className="ses-error" role="alert">{error}</p>}
          <button type="button" className="ses-principal" disabled={guardando} onClick={guardar} data-jt="guardar">{guardando ? 'Guardando…' : mio ? 'Guardar cambios' : 'Guardar'}</button>
        </div>
      ) : mio ? <p className="jt-cerrada">La votación está cerrada. Tu voto: <b>{mio.total ?? '—'}</b>.</p> : null}
      {p?.club && !e.individual && (
        <div className="jt-club" data-jt="club">
          <div className="jt-club-cab"><b>{fmtN(p.club.promedio, 1)}</b><span>promedio del club · {fmtN(p.club.votos)} {plural(p.club.votos, 'voto', 'votos')}</span></div>
          {p.club.detalle.map((d, i) => (
            <div key={i} className="jt-club-fila" data-jt="voto"><span>{d.mio ? `${d.nombre} (vos)` : d.nombre}</span><b>{d.total}</b></div>
          ))}
        </div>
      )}
    </Hoja>
  );
}

// ── fotos: subir (achicada en el navegador) y la galería ──
async function aJpg(archivo: File, lado = 1600): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('imagen')); i.src = url; });
    const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.8).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}
// Sube una o varias fotos (cada una achicada en el navegador); devuelve cuántas salieron bien
export async function subirFotos(juntada: string, archivos: File[]): Promise<number> {
  let ok = 0;
  for (const a of archivos.filter(x => x.type.startsWith('image/'))) {
    try { const r = await pedir('foto', { juntada, imagen: await aJpg(a) }); if (r.ok) ok++; } catch { /* sigue con la próxima */ }
  }
  return ok;
}
export function BotonSubirFoto({ juntada, onSubida, texto = 'Subir foto' }: { juntada: string; onSubida: () => void; texto?: string }) {
  const campo = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'' | 'subiendo' | 'error'>('');
  async function elegido(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivos = [...(ev.target.files ?? [])];
    ev.target.value = '';
    if (!archivos.length) return;
    setEstado('subiendo');
    const n = await subirFotos(juntada, archivos);
    if (n === 0) { setEstado('error'); return; }
    setEstado(''); onSubida();
  }
  return (
    <>
      <button type="button" className="jt-subir" data-jt="subir-foto" disabled={estado === 'subiendo'} onClick={ev => { ev.stopPropagation(); campo.current?.click(); }}>
        {estado === 'subiendo' ? 'Subiendo…' : estado === 'error' ? 'No se pudo · probá de nuevo' : texto}
      </button>
      <input ref={campo} type="file" accept="image/*" multiple hidden onChange={elegido} />
    </>
  );
}
export function Galeria({ juntada, puedeElegir, onCerrar, onCambio }: { juntada: JuntadaPriv; puedeElegir: boolean; onCerrar: () => void; onCambio: () => void }) {
  const [fotos, setFotos] = useState<{ id: string; url: string; grande: string }[] | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    fetch(`/api/juntadas?accion=fotos&juntada=${juntada.id}`, { credentials: 'same-origin' }).then(r => r.json()).then(d => setFotos(d.fotos ?? [])).catch(() => setFotos([]));
  }, [juntada.id, vuelta]);
  async function usar(id: string) {
    const r = await pedir('portada', { juntada: juntada.id, foto: id });
    if (r.ok) { setVuelta(v => v + 1); onCambio(); }
  }
  return (
    <Hoja titulo={`Fotos · ${juntada.nombre}`} onCerrar={onCerrar} clase="jt-gal">
      {fotos == null ? <p className="jt-vacio">Cargando…</p> : (
        <div className="jt-fotos">
          {fotos.map((f, i) => (
            <figure key={f.id} className="jt-foto">
              <a href={f.grande} target="_blank" rel="noreferrer"><img src={f.url} alt={`Foto ${i + 1} de la juntada`} loading="lazy" /></a>
              <figcaption>{i === 0 ? <span className="jt-es-portada">Portada</span> : puedeElegir ? <button type="button" onClick={() => usar(f.id)}>Usar como portada</button> : null}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {puedeElegir && <BotonSubirFoto juntada={juntada.id} onSubida={() => { setVuelta(v => v + 1); onCambio(); }} texto="Agregar foto" />}
    </Hoja>
  );
}

// ── cava personal: abrir una botella ──
export function HojaAbrir({ cavaId, e, onCerrar, onAbierta, inicial }: {
  cavaId: string; e: EstadoJuntadas; onCerrar: () => void; onAbierta: (consumo: string) => void; inicial?: string | null;
}) {
  const [elegida, setElegida] = useState<string | null>(inicial ?? null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const b = elegida ? e.guarda.find(x => x.id === elegida) : null;
  async function confirmar() {
    if (!b) return;
    setGuardando(true); setError('');
    const r = await pedir('abrir', { cava: cavaId, botella: b.id });
    setGuardando(false);
    if (!r.ok) { setError(r.error ?? 'No pudimos registrar la botella.'); return; }
    onAbierta(r.consumo);
  }
  return (
    <Hoja titulo="Abrir botella" onCerrar={onCerrar}>
      <div className="jt-form" data-jt="abrir">
        {b ? (
          <>
            <p className="jt-conf">¿Abrís <b>{vinoTxt(b)}</b>? Baja de la guarda.</p>
            {error && <p className="ses-error" role="alert">{error}</p>}
            <button type="button" className="ses-principal" disabled={guardando} onClick={confirmar}>{guardando ? 'Guardando…' : 'Sí, la abrí'}</button>
            <button type="button" className="ses-link" onClick={() => setElegida(null)}>Elegir otra</button>
          </>
        ) : <Buscador guarda={e.guarda} usadas={new Map()} onElegir={setElegida} />}
      </div>
    </Hoja>
  );
}

// ── íconos de línea de cada vino consumido (18 px) ──
const Ico = ({ children }: { children: React.ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
export const IcoEstrella = () => <Ico><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z" /></Ico>;
const IcoCarrito = () => <Ico><circle cx="9" cy="20" r="1.4" /><circle cx="17" cy="20" r="1.4" /><path d="M3 4h2.4l2 10.2a1.5 1.5 0 0 0 1.5 1.2h7.7a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2" /></Ico>;
const IcoDeshacer = () => <Ico><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Ico>;

// Puntuar (o la pastilla con el puntaje, que se toca para editar)
export function BotonPuntuar({ total, onClick }: { total: number | null | undefined; onClick: () => void }) {
  return total !== undefined
    ? <button type="button" className="jt-mi" data-jt="mi-puntaje" title="Editar mi puntaje" aria-label={`Editar mi puntaje (${total ?? '—'})`} onClick={onClick}>{total ?? '—'}</button>
    : <button type="button" className="ic-acc ic-puntuar" data-jt="puntuar" title="Puntuar" aria-label="Puntuar" onClick={onClick}><IcoEstrella /><span>Puntuar</span></button>;
}
export const urlRecompra = (c: { vino: string; anada: number | null }, cavaTxt: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola Santi, quiero volver a comprar ${c.vino}${c.anada ? ` ${c.anada}` : ''} (Cava ${cavaTxt})`)}`;

// ── cava personal: las botellas abiertas, por mes (la más nueva arriba) ──
export function ListadoIndividual({ e, cavaTxt, onPuntuar, onAbrir, onDeshacer }: {
  e: EstadoJuntadas; cavaTxt: string; onPuntuar: (c: ConsumoPriv) => void; onAbrir: () => void; onDeshacer: (c: ConsumoPriv) => void;
}) {
  const meses = useMemo(() => {
    const m = new Map<string, ConsumoPriv[]>();
    for (const c of e.individuales) { const k = c.fecha.slice(0, 7); if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); }
    return [...m.entries()];
  }, [e.individuales]);
  return (
    <div className="ji" data-jt="individual">
      {e.esDueno && <button type="button" className="jt-armar" data-jt="abrir-botella" onClick={onAbrir}>+ Abrir botella</button>}
      {meses.length === 0 && <p className="jt-vacio">Todavía no abriste botellas de tu cava.</p>}
      {meses.map(([mes, cs]) => (
        <section key={mes} className="ji-mes" data-mes={mes}>
          <h3>{mesLargo(mes, true)}</h3>
          {cs.map(c => {
            const mio = e.puntajes[c.id]?.mio;
            return (
              <div key={c.id} className="ji-fila">
                <span className="ji-dia">{c.fecha.slice(8, 10)}/{c.fecha.slice(5, 7)}</span>
                <span className="ji-txt"><b>{vinoTxt(c)}</b><small>{[c.bodega, c.cepa].filter(Boolean).join(' · ')}</small></span>
                <span className="ji-acc">
                  {(mio || e.esDueno) && <BotonPuntuar total={mio ? (mio.total ?? null) : undefined} onClick={() => onPuntuar(c)} />}
                  {e.esDueno && <a className="ic-acc" data-jt="recomprar" href={urlRecompra(c, cavaTxt)} target="_blank" rel="noopener noreferrer" title="Volver a comprar" aria-label="Volver a comprar"><IcoCarrito /></a>}
                  {c.puedeDeshacer && <button type="button" className="ic-acc" data-jt="deshacer-icono" title="Deshacer apertura" aria-label="Deshacer apertura" onClick={() => onDeshacer(c)}><IcoDeshacer /></button>}
                </span>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

// Confirmación de "Deshacer apertura" (la misma desde cualquier lugar)
export function HojaDeshacer({ consumo, onCerrar, onDeshecho }: { consumo: ConsumoPriv; onCerrar: () => void; onDeshecho: () => void }) {
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  async function deshacer() {
    setError(''); setTrabajando(true);
    const r = await pedir('deshacer', { consumo: consumo.id, conPuntaje: true });
    setTrabajando(false);
    if (!r.ok) { setError(r.error ?? 'No pudimos deshacer la apertura.'); return; }
    onDeshecho();
  }
  return (
    <Hoja titulo="Deshacer apertura" onCerrar={onCerrar}>
      <div className="jt-form" data-jt="deshacer-conf">
        <p className="jt-conf">¿Deshacer la apertura de <b>{vinoTxt(consumo)}</b>? También se borra tu puntaje.</p>
        {error && <p className="ses-error" role="alert">{error}</p>}
        <button type="button" className="ses-principal" disabled={trabajando} onClick={deshacer} data-jt="deshacer-ok">{trabajando ? 'Deshaciendo…' : 'Deshacer'}</button>
        <button type="button" className="ses-link" disabled={trabajando} onClick={onCerrar}>Cancelar</button>
      </div>
    </Hoja>
  );
}

// ── Voy / No voy (la tarjeta de la juntada y el cartel del Inicio) ──
export function BotonesRespuesta({ pj, onRespondido }: { pj: JuntadaPriv; onRespondido: () => void }) {
  const [cambiando, setCambiando] = useState(false);
  const [mandando, setMandando] = useState(false);
  const [error, setError] = useState('');
  if (!pj.puedeResponder) return null;
  async function responder(va: boolean) {
    setMandando(true); setError('');
    const r = await responderJuntada(pj.id, va);
    setMandando(false);
    if (!r.ok) { setError(r.error ?? 'No pudimos guardar tu respuesta.'); return; }
    setCambiando(false); onRespondido();
  }
  if (pj.miRespuesta && !cambiando) {
    return (
      <div className="jt-resp jt-resp-ya" data-jt="respuesta" onClick={ev => ev.stopPropagation()}>
        <b>{pj.miRespuesta === 'va' ? 'Vas ✓' : 'No vas'}</b>
        <button type="button" className="ses-link" data-jt="cambiar" onClick={() => setCambiando(true)}>Cambiar</button>
      </div>
    );
  }
  return (
    <div className="jt-resp" data-jt="respuesta" onClick={ev => ev.stopPropagation()}>
      <button type="button" className="jt-voy" data-jt="voy" disabled={mandando} onClick={() => responder(true)}>Voy</button>
      <button type="button" className="jt-novoy" data-jt="no-voy" disabled={mandando} onClick={() => responder(false)}>No voy</button>
      {error && <p className="ses-error" role="alert">{error}</p>}
    </div>
  );
}

// la lista de "Confirmados": Van · No van · Sin responder
export function HojaConfirmados({ pj, e, onCerrar }: { pj: JuntadaPriv; e: EstadoJuntadas; onCerrar: () => void }) {
  const nombre = (id: string) => e.socios.find(x => x.id === id)?.nombre || 'Socio';
  const sin = e.socios.filter(x => !pj.van.includes(x.id) && !pj.noVan.includes(x.id)).map(x => x.id);
  const grupo = (t: string, ids: string[]) => (
    <div className="jt-conf-g">
      <div className="ses-lbl">{t} · {fmtN(ids.length)}</div>
      {ids.length ? <ul>{ids.map(id => <li key={id}><Iniciales nombres={[{ id, nombre: nombre(id) }]} />{nombre(id)}</li>)}</ul> : <p className="jt-vacio">Nadie.</p>}
    </div>
  );
  return (
    <Hoja titulo="Confirmados" onCerrar={onCerrar}>
      <div data-jt="confirmados">{grupo('Van', pj.van)}{grupo('No van', pj.noVan)}{grupo('Sin responder', sin)}</div>
    </Hoja>
  );
}

// "¿Borrar la juntada…?": dentro de la página, no con confirm()
export function HojaBorrar({ pj, onCerrar, onBorrada }: { pj: JuntadaPriv; onCerrar: () => void; onBorrada: () => void }) {
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const n = pj.consumos.length;
  const texto = pj.programada
    ? `¿Borrar la juntada del ${diaSemana(pj.fecha)} ${diaMes(pj.fecha)}? Se pierden los vinos designados y las respuestas.`
    : `¿Borrar la juntada de ${mesLargo(pj.fecha.slice(0, 7))}?${n === 1 ? ' Se borra su consumo y su puntaje, y la botella vuelve a la cava.' : n ? ` Se borran sus ${fmtN(n)} consumos y sus puntajes, y las botellas vuelven a la cava.` : ''} No se puede deshacer.`;
  async function borrar() {
    setError(''); setTrabajando(true);
    const r = await borrarJuntada(pj.id);
    setTrabajando(false);
    if (!r.ok) { setError(r.error ?? 'No pudimos borrar la juntada.'); return; }
    onBorrada();
  }
  return (
    <Hoja titulo="Borrar juntada" onCerrar={onCerrar}>
      <div className="jt-form" data-jt="borrar-conf">
        <p className="jt-conf">{texto}</p>
        {error && <p className="ses-error" role="alert">{error}</p>}
        <button type="button" className="ses-principal jt-peligro" disabled={trabajando} onClick={borrar} data-jt="borrar-ok">{trabajando ? 'Borrando…' : 'Borrar juntada'}</button>
        <button type="button" className="ses-link" disabled={trabajando} onClick={onCerrar}>Cancelar</button>
      </div>
    </Hoja>
  );
}

// ── línea de asistentes: iniciales superpuestas, "6 de 7" y, al tocar, los nombres ──
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
// Las iniciales en círculos superpuestos. No hay avatar por socio (api/avatar.ts guarda uno por cava), así que siempre son iniciales.
export function Iniciales({ nombres, max = 7 }: { nombres: { id: string; nombre: string }[]; max?: number }) {
  return <span className="cj-asis-av" aria-hidden="true">{nombres.slice(0, max).map(a => <i key={a.id}>{iniciales(a.nombre)}</i>)}</span>;
}
export function LineaAsistentes({ pj, totalSocios }: { pj: JuntadaPriv; totalSocios: number }) {
  const [abierta, setAbierta] = useState(false);
  if (!pj.asistentesNombres.length) return null;
  const n = pj.asistentesNombres.length;
  return (
    <div className="cj-asis" data-cj="asistentes">
      <button type="button" className="cj-asis-btn" aria-expanded={abierta} onClick={() => setAbierta(v => !v)}>
        <span className="cj-asis-rot">Fueron</span>
        <Iniciales nombres={pj.asistentesNombres} />
        <span>{fmtN(n)}{totalSocios ? ` de ${fmtN(totalSocios)}` : ''}</span>
      </button>
      {abierta && <p className="cj-asis-lista">{pj.asistentesNombres.map(a => a.nombre).filter(Boolean).join(', ')}</p>}
    </div>
  );
}

// ── el aviso de "Deshacer" (10 segundos) después de abrir ──
export function AvisoDeshacer({ consumo, onDeshecho, onPuntuar, onFin }: { consumo: string; onDeshecho: () => void; onPuntuar: () => void; onFin: () => void }) {
  const [quedan, setQuedan] = useState(10);
  useEffect(() => {
    if (quedan <= 0) { onFin(); return; }
    const t = setTimeout(() => setQuedan(q => q - 1), 1000);
    return () => clearTimeout(t);
  }, [quedan, onFin]);
  return createPortal(
    <div className="jt-toast" role="status" data-jt="deshacer">
      <span>Botella abierta.</span>
      <button type="button" onClick={onPuntuar}>Puntuar ahora</button>
      <button type="button" onClick={async () => { const r = await pedir('deshacer', { consumo }); if (r.ok) onDeshecho(); onFin(); }}>Deshacer ({quedan})</button>
    </div>,
    document.querySelector('.club-root') ?? document.body);
}
