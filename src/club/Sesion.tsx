// Entrada de socios: botón "Entrar", hoja con mail → código, y la sesión compartida por toda la app del club.
// La sesión vive en una cookie del servidor (api/auth.ts); acá sólo se lee quién es y a qué cavas entra.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import './sesion.css';

export interface CavaAcceso { id: string; nombre: string; tipo: string; miembros: number }
export interface UsuarioSesion { nombre: string; email: string; admin: boolean }
interface EstadoSesion { listo: boolean; sesion: boolean; usuario: UsuarioSesion | null; cavas: CavaAcceso[]; cavaId: string | null }

// ── el estado compartido (el botón de la landing y el del tablero ven lo mismo) ──
let estado: EstadoSesion = { listo: false, sesion: false, usuario: null, cavas: [], cavaId: null };
const oyentes = new Set<() => void>();
const poner = (p: Partial<EstadoSesion>) => { estado = { ...estado, ...p }; oyentes.forEach(f => f()); };
const GUARDADA = 'edb_cava';
const leerGuardada = () => { try { return localStorage.getItem(GUARDADA); } catch { return null; } };

function aplicar(d: any) {
  if ((d?.sesion || d?.ok) && d.usuario) {
    const cavas: CavaAcceso[] = d.cavas ?? [];
    const guardada = leerGuardada();
    const cavaId = cavas.find(c => c.id === guardada)?.id ?? cavas[0]?.id ?? null;
    poner({ listo: true, sesion: true, usuario: d.usuario, cavas, cavaId });
  } else {
    poner({ listo: true, sesion: false, usuario: null, cavas: [], cavaId: null });
  }
}
let pedida = false;
function cargarSesion() {
  if (pedida) return;
  pedida = true;
  fetch('/api/auth?accion=sesion', { credentials: 'same-origin' })
    .then(r => r.json()).then(aplicar).catch(() => poner({ listo: true }));
}
export function useSesion(): EstadoSesion {
  const e = useSyncExternalStore(
    cb => { oyentes.add(cb); return () => { oyentes.delete(cb); }; },
    () => estado, () => estado);
  useEffect(cargarSesion, []);
  return e;
}
export function elegirCava(id: string) {
  try { localStorage.setItem(GUARDADA, id); } catch { /* sin almacenamiento, no pasa nada */ }
  poner({ cavaId: id });
}

async function llamar(accion: string, cuerpo?: object) {
  const r = await fetch(`/api/auth?accion=${accion}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo ?? {}),
  });
  let d: any = {};
  try { d = await r.json(); } catch { /* respuesta sin cuerpo */ }
  return { ok: r.ok, estado: r.status, ...d };
}
export const pedirCodigo = (email: string) => llamar('pedir', { email });
export async function entrarConCodigo(codigo: string) {
  const r = await llamar('entrar', { codigo });
  if (r.ok) aplicar(r);
  return r;
}
export async function salir() {
  await llamar('salir');
  aplicar({ sesion: false });
}

// ── la hoja de entrada: mail → código ──
function PanelEntrar({ onCerrar }: { onCerrar: () => void }) {
  const [paso, setPaso] = useState<'mail' | 'codigo'>('mail');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { campo.current?.focus(); }, [paso]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCerrar]);

  async function pedir(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (trabajando) return;
    setError(''); setAviso(''); setTrabajando(true);
    const r = await pedirCodigo(email.trim());
    setTrabajando(false);
    if (!r.ok) { setError(r.error ?? 'No pudimos mandar el código. Probá de nuevo.'); return; }
    setPaso('codigo'); setCodigo('');
    setAviso(r.mensaje ?? 'Si tu mail está registrado, te llega el código.');
  }
  async function entrar(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (trabajando) return;
    setError(''); setTrabajando(true);
    const r = await entrarConCodigo(codigo);
    setTrabajando(false);
    if (r.ok) { onCerrar(); return; }
    setError(r.error ?? 'No pudimos entrar. Probá de nuevo.');
    if (r.nuevo) { setPaso('mail'); setAviso(''); }
    setCodigo('');
  }

  return (
    <div className="ses-back" onClick={onCerrar}>
      <div className="ses-sheet" role="dialog" aria-modal="true" aria-label="Entrar al Club EDB" onClick={e => e.stopPropagation()}>
        <div className="ses-handle" aria-hidden="true" />
        <button className="ses-x" type="button" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="ses-t">Entrar al Club EDB</div>
        {paso === 'mail' ? (
          <form onSubmit={pedir} className="ses-form" data-paso="mail">
            <label className="ses-lbl" htmlFor="ses-mail">Tu mail de socio</label>
            <input id="ses-mail" ref={campo} className="ses-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
              placeholder="nombre@mail.com" value={email} onChange={e => setEmail(e.target.value)} required />
            <p className="ses-ayuda">Te mandamos un código de 6 números. Sin contraseñas.</p>
            {error && <p className="ses-error" role="alert">{error}</p>}
            <button className="ses-principal" type="submit" disabled={trabajando || !email.trim()}>{trabajando ? 'Enviando…' : 'Enviarme el código'}</button>
          </form>
        ) : (
          <form onSubmit={entrar} className="ses-form" data-paso="codigo">
            <label className="ses-lbl" htmlFor="ses-cod">Código de 6 números</label>
            <input id="ses-cod" ref={campo} className="ses-input ses-codigo" type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]*" maxLength={6} placeholder="000000" value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
            {aviso && <p className="ses-ayuda">{aviso} Vence en 10 minutos.</p>}
            {error && <p className="ses-error" role="alert">{error}</p>}
            <button className="ses-principal" type="submit" disabled={trabajando || codigo.length !== 6}>{trabajando ? 'Entrando…' : 'Entrar'}</button>
            <div className="ses-links">
              <button type="button" className="ses-link" onClick={() => pedir()}>Mandar otro código</button>
              <button type="button" className="ses-link" onClick={() => { setPaso('mail'); setError(''); setAviso(''); }}>Cambiar el mail</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── el botón de la cabecera: "Entrar", o el nombre + selector de cava + "Salir" ──
export function BotonSesion({ variante = 'oscuro' }: { variante?: 'oscuro' | 'claro' }) {
  const s = useSesion();
  const [abierto, setAbierto] = useState(false);
  if (!s.listo) return <span className={`ses-slot ses-${variante}`} aria-hidden="true" />;
  if (!s.sesion || !s.usuario) {
    return (
      <span className={`ses-slot ses-${variante}`}>
        <button type="button" className="ses-entrar" onClick={() => setAbierto(true)}>Entrar</button>
        {abierto && createPortal(<PanelEntrar onCerrar={() => setAbierto(false)} />, document.querySelector('.club-root') ?? document.body)}
      </span>
    );
  }
  const primero = s.usuario.nombre.split(' ')[0] || 'Socio';
  return (
    <span className={`ses-slot ses-${variante} ses-dentro`}>
      <span className="ses-nombre" title={s.usuario.email}>{primero}</span>
      {s.cavas.length > 1 && (
        <select className="ses-cava" aria-label="Cava" value={s.cavaId ?? ''} onChange={e => elegirCava(e.target.value)}>
          {s.cavas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
      <button type="button" className="ses-salir" onClick={() => salir()}>Salir</button>
    </span>
  );
}
