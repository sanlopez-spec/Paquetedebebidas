// Lo que los socios hacen en Consumos: armar la juntada (Presidente), puntuar (asistentes), fotos, y en la cava personal
// abrir botellas. Los datos y los permisos salen de /api/juntadas: acá nada se decide sólo en la app.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fmtN, mesLargo, plural } from './ClubCava';
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
}
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
  yo: string; individual: boolean; puedeArmar: boolean; esDueno: boolean; hoy: string;
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

// ── una hoja que sube desde abajo (el mismo estilo que "Tus cavas") ──
function Hoja({ titulo, onCerrar, children, clase }: { titulo: string; onCerrar: () => void; children: React.ReactNode; clase?: string }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCerrar]);
  return createPortal(
    <div className="ses-back" onClick={onCerrar}>
      <div className={'ses-sheet jt-hoja' + (clase ? ' ' + clase : '')} role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <div className="ses-handle" aria-hidden="true" />
        <button className="ses-x" type="button" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="ses-t">{titulo}</div>
        {children}
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

// ── armar o editar una juntada (Presidente) ──
export function HojaArmar({ cavaId, e, juntada, onCerrar, onGuardado }: {
  cavaId: string; e: EstadoJuntadas; juntada: JuntadaPriv | null; onCerrar: () => void; onGuardado: (nombre: string) => void;
}) {
  const [fecha, setFecha] = useState(juntada?.fecha ?? e.hoy);
  const [asis, setAsis] = useState<Set<string>>(new Set(juntada ? juntada.asistentes : e.socios.map(s => s.id)));
  const [vinos, setVinos] = useState<{ consumo?: string; botella: string; vino: string; anada: number | null }[]>(
    juntada ? [...juntada.consumos].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99)).map(c => ({ consumo: c.id, botella: c.botella, vino: c.vino, anada: c.anada })) : []);
  const [maridaje, setMaridaje] = useState(juntada?.maridaje ?? '');
  const [notas, setNotas] = useState(juntada?.notas ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const usadas = useMemo(() => { const m = new Map<string, number>(); vinos.filter(v => !v.consumo).forEach(v => m.set(v.botella, (m.get(v.botella) ?? 0) + 1)); return m; }, [vinos]);
  const mover = (i: number, d: number) => setVinos(vs => { const x = [...vs]; const [v] = x.splice(i, 1); x.splice(i + d, 0, v); return x; });
  async function guardar(confirmar = false) {
    setError(''); setGuardando(true);
    const r = await pedir('armar', { cava: cavaId, juntada: juntada?.id, fecha, asistentes: [...asis], vinos: vinos.map(v => ({ consumo: v.consumo, botella: v.botella })), maridaje, notas, confirmar });
    setGuardando(false);
    if (r.estado === 409 && !confirmar) {
      if (window.confirm(`${r.error} ¿Seguimos?`)) return guardar(true);
      return;
    }
    if (!r.ok) { setError(r.error ?? 'No pudimos guardar la juntada.'); return; }
    onGuardado(r.nombre);
  }
  return (
    <Hoja titulo={juntada ? 'Editar juntada' : 'Armar juntada'} onCerrar={onCerrar}>
      <div className="jt-form" data-jt="armar">
        <label className="ses-lbl" htmlFor="jt-fecha">Fecha</label>
        <input id="jt-fecha" className="ses-input" type="date" value={fecha} onChange={ev => setFecha(ev.target.value)} />

        <div className="ses-lbl">Asistentes</div>
        <div className="jt-asis">
          {e.socios.map(s => (
            <label key={s.id} className="jt-check">
              <input type="checkbox" checked={asis.has(s.id)} onChange={() => setAsis(a => { const n = new Set(a); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
              <span>{s.nombre}</span>
            </label>
          ))}
        </div>

        <div className="ses-lbl">Vinos, en el orden en que se abren</div>
        <Buscador guarda={e.guarda} usadas={usadas} onElegir={id => {
          const b = e.guarda.find(x => x.id === id);
          if (b) setVinos(vs => [...vs, { botella: b.id, vino: b.vino, anada: b.anada }]);
        }} />
        {vinos.length > 0 ? (
          <ol className="jt-lista" data-jt="lista">
            {vinos.map((v, i) => (
              <li key={(v.consumo ?? 'n') + i + v.botella}>
                <span className="jt-num">{i + 1}</span>
                <span className="jt-nom">{vinoTxt(v)}</span>
                <span className="jt-acc">
                  <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)}>↑</button>
                  <button type="button" aria-label="Bajar" disabled={i === vinos.length - 1} onClick={() => mover(i, 1)}>↓</button>
                  <button type="button" aria-label="Sacar" onClick={() => setVinos(vs => vs.filter((_, k) => k !== i))}>✕</button>
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
        <button type="button" className="ses-principal" disabled={guardando || !vinos.length || !asis.size} onClick={() => guardar()}>
          {guardando ? 'Guardando…' : 'Guardar juntada'}
        </button>
      </div>
    </Hoja>
  );
}

// ── la pantalla de puntaje (escala Parker: 50 + las cuatro partes) ──
export function franjaDe(total: number, guia: Guia) { return guia.franjas.find(f => total >= f.desde && total <= f.hasta)?.nombre ?? ''; }
export function HojaPuntaje({ consumo, e, puedeVotar, onCerrar, onGuardado, onDeshecho }: {
  consumo: ConsumoPriv; e: EstadoJuntadas; puedeVotar: boolean; onCerrar: () => void; onGuardado: () => void; onDeshecho: () => void;
}) {
  const p = e.puntajes[consumo.id];
  const mio = p?.mio;
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(e.partes.map(x => [x.clave, mio?.partes[x.clave] ?? Math.round(x.max / 2)])));
  const [notas, setNotas] = useState(mio?.notas ?? '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const total = 50 + e.partes.reduce((s, x) => s + (vals[x.clave] ?? 0), 0);
  const [confirmando, setConfirmando] = useState(false);
  async function deshacer() {
    setError(''); setGuardando(true);
    const r = await pedir('deshacer', { consumo: consumo.id, conPuntaje: true });
    setGuardando(false);
    if (!r.ok) { setError(r.error ?? 'No pudimos deshacer la apertura.'); setConfirmando(false); return; }
    onDeshecho();
  }
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
      {p?.club && (
        <div className="jt-club" data-jt="club">
          <div className="jt-club-cab"><b>{fmtN(p.club.promedio, 1)}</b><span>promedio del club · {fmtN(p.club.votos)} {plural(p.club.votos, 'voto', 'votos')}</span></div>
          {p.club.detalle.map((d, i) => (
            <div key={i} className="jt-club-fila" data-jt="voto"><span>{d.mio ? `${d.nombre} (vos)` : d.nombre}</span><b>{d.total}</b></div>
          ))}
        </div>
      )}
      {consumo.puedeDeshacer && (confirmando ? (
        <div className="jt-deshacer" data-jt="deshacer-conf">
          <p>¿Deshacer la apertura de <b>{vinoTxt(consumo)}</b>?{mio ? ' También se borra tu puntaje.' : ''}</p>
          {error && <p className="ses-error" role="alert">{error}</p>}
          <div className="jt-deshacer-bot">
            <button type="button" className="ses-principal" disabled={guardando} onClick={deshacer} data-jt="deshacer-ok">{guardando ? 'Deshaciendo…' : 'Deshacer'}</button>
            <button type="button" className="ses-link" disabled={guardando} onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ses-link jt-deshacer-link" data-jt="deshacer-apertura" onClick={() => setConfirmando(true)}>Deshacer apertura</button>
      ))}
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
export function BotonSubirFoto({ juntada, onSubida, texto = 'Subir foto' }: { juntada: string; onSubida: () => void; texto?: string }) {
  const campo = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<'' | 'subiendo' | 'error'>('');
  async function elegido(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo) return;
    setEstado('subiendo');
    try {
      const r = await pedir('foto', { juntada, imagen: await aJpg(archivo) });
      if (!r.ok) throw new Error(r.error);
      setEstado(''); onSubida();
    } catch { setEstado('error'); }
  }
  return (
    <>
      <button type="button" className="jt-subir" data-jt="subir-foto" disabled={estado === 'subiendo'} onClick={ev => { ev.stopPropagation(); campo.current?.click(); }}>
        {estado === 'subiendo' ? 'Subiendo…' : estado === 'error' ? 'No se pudo · probá de nuevo' : texto}
      </button>
      <input ref={campo} type="file" accept="image/*" hidden onChange={elegido} />
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

// ── cava personal: las botellas abiertas, por mes (la más nueva arriba) ──
export function ListadoIndividual({ e, onPuntuar, onAbrir }: { e: EstadoJuntadas; onPuntuar: (c: ConsumoPriv) => void; onAbrir: () => void }) {
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
              <div key={c.id} className="ji-fila" role="button" tabIndex={0} onClick={() => onPuntuar(c)}
                onKeyDown={ev => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) onPuntuar(c); }}>
                <span className="ji-dia">{c.fecha.slice(8, 10)}/{c.fecha.slice(5, 7)}</span>
                <span className="ji-txt"><b>{vinoTxt(c)}</b><small>{[c.bodega, c.cepa].filter(Boolean).join(' · ')}</small></span>
                {mio ? <span className="jt-mi">{mio.total ?? '—'}</span>
                  : e.esDueno ? <span className="cj-puntuar">Puntuar</span> : null}
              </div>
            );
          })}
        </section>
      ))}
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
