// Cambio de cava y avatar: la hoja "Tus cavas" (se abre desde el recuadro de perfil del Inicio) y el avatar redondo de la cava.
// El avatar se sirve por /api/avatar (con sesión); quien tiene permiso puede elegir una foto, que se recorta cuadrada y se achica a 512 × 512 JPG.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cavasPropias, elegirCava, esGrupal, marcarAvatar, nombreCava, useSesion } from './Sesion';
import type { CavaAcceso } from './Sesion';

const urlAvatar = (c: CavaAcceso) => `/api/avatar?cava=${encodeURIComponent(c.id)}&v=${c.avatarV ?? 0}`;

function Imagen({ cava }: { cava: CavaAcceso | null }) {
  const [falla, setFalla] = useState(false);
  useEffect(() => setFalla(false), [cava?.id, cava?.avatarV]);
  if (cava?.avatar && !falla) return <img className="av-img" src={urlAvatar(cava)} alt="" onError={() => setFalla(true)} />;
  return <svg className="crest"><use href="#crest" /></svg>;
}

// Recorte cuadrado centrado, 512 × 512, JPG (devuelve el base64 sin encabezado)
async function aJpg512(archivo: File): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('imagen')); i.src = url; });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 512, 512);
    ctx.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, 512, 512);
    return cv.toDataURL('image/jpeg', 0.85).split(',')[1];
  } finally { URL.revokeObjectURL(url); }
}

// El avatar del recuadro de perfil. Si la persona puede cambiarlo, es un botón con un lápiz.
export function AvatarCava({ cava }: { cava: CavaAcceso | null }) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!error) return; const t = setTimeout(() => setError(''), 6000); return () => clearTimeout(t); }, [error]);

  async function elegido(ev: React.ChangeEvent<HTMLInputElement>) {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo || !cava) return;
    setError(''); setSubiendo(true);
    try {
      const imagen = await aJpg512(archivo);
      const r = await fetch('/api/avatar', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cava: cava.id, imagen }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'No pudimos guardar la foto.'); }
      marcarAvatar(cava.id);
    } catch (e) {
      setError(e instanceof Error && e.message !== 'imagen' && e.message !== 'canvas' ? e.message : 'No pudimos usar esa foto. Probá con otra.');
    } finally { setSubiendo(false); }
  }

  if (!cava?.puedeAvatar) return <div className="pf-av" data-av="fijo"><Imagen cava={cava} /></div>;
  return (
    <div className="pf-av-wrap">
      <button type="button" className="pf-av pf-av-edit" data-av="editable" aria-label="Cambiar la foto de la cava" disabled={subiendo} onClick={() => campo.current?.click()}>
        <Imagen cava={cava} />
        {subiendo ? <span className="av-carga" role="status" aria-label="Subiendo la foto" /> : <span className="av-lapiz" aria-hidden="true">✎</span>}
      </button>
      <input ref={campo} type="file" accept="image/*" hidden onChange={elegido} />
      {error && <small className="av-error" role="alert">{error}</small>}
    </div>
  );
}

// La hoja "Tus cavas": una fila por cava de la persona, con tilde en la activa
export function HojaCavas({ onCerrar }: { onCerrar: () => void }) {
  const s = useSesion();
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onCerrar]);
  return createPortal(
    <div className="ses-back" onClick={onCerrar}>
      <div className="ses-sheet" role="dialog" aria-modal="true" aria-label="Tus cavas" data-sel="hoja" onClick={e => e.stopPropagation()}>
        <div className="ses-handle" aria-hidden="true" />
        <button className="ses-x" type="button" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="ses-t">Tus cavas</div>
        <div className="cv-lista">
          {cavasPropias(s.cavas).map(c => (
            <button key={c.id} type="button" className={'cv-fila' + (c.id === s.cavaId ? ' on' : '')} data-sel-fila={esGrupal(c) ? 'grupal' : 'individual'}
              aria-current={c.id === s.cavaId ? 'true' : undefined} onClick={() => { elegirCava(c.id); onCerrar(); }}>
              <span className="cv-av"><Imagen cava={c} /></span>
              <span className="cv-txt">
                <b>{nombreCava(c)}</b>
                <small>{esGrupal(c) ? `Club · ${c.miembros} ${c.miembros === 1 ? 'socio' : 'socios'}` : c.dueno}</small>
              </span>
              {c.id === s.cavaId && <span className="cv-tilde" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.querySelector('.club-root') ?? document.body);
}
