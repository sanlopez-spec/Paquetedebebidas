// "Voy / No voy" desde el mail: /club/respuesta#t=<link firmado>. Sin login: el link firmado es la credencial.
// Abrir la página NO guarda nada (los programas de mail abren los links solos para revisarlos): se guarda recién al tocar el botón.
// Sólo muestra la juntada y la respuesta; nada más de la cava. El link va en el # y se borra de la barra apenas se lee.
import { useEffect, useState } from 'react';
import './respuesta.css';

type Vista = {
  vencida?: boolean; prueba?: boolean; guardado?: boolean; error?: string;
  nombre?: string; respuesta?: 'va' | 'no'; actual?: 'va' | 'no' | null; otro?: string; app?: string;
  fecha?: string; hora?: string; sede?: string; cava?: string; confirmados?: number; total?: number;
};
const APP = '/club/cava#consumos';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaCorto = (f: string) => { const [y, m, d] = f.split('-').map(Number); return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}/${String(m).padStart(2, '0')}`; };

async function pedir(accion: 'rsvp-ver' | 'rsvp', t: string): Promise<Vista> {
  try {
    const r = await fetch(`/api/juntadas?accion=${accion}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t }) });
    const d = await r.json().catch(() => ({}));
    return r.ok ? d : { error: d.error || 'Este link no es válido.' };
  } catch { return { error: 'No pudimos conectarnos. Probá de nuevo en un rato.' }; }
}

export default function Respuesta() {
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? window.location.hash.match(/[#&]t=([^&]+)/)?.[1] ?? '' : ''));
  const [vista, setVista] = useState<Vista | null>(null);
  const [mandando, setMandando] = useState(false);
  useEffect(() => {
    // el link no queda en la barra ni en el historial, y no viaja como Referer
    const meta = document.createElement('meta');
    meta.name = 'referrer'; meta.content = 'no-referrer';
    document.head.appendChild(meta);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    document.title = 'Juntada · Club EDB';
    return () => { meta.remove(); };
  }, []);
  useEffect(() => {
    if (!token) { setVista({ error: 'Este link no es válido.' }); return; }
    let vivo = true;
    setVista(null);
    pedir('rsvp-ver', token).then(v => { if (vivo) setVista(v); });
    return () => { vivo = false; };
  }, [token]);
  async function confirmar() {
    setMandando(true);
    const v = await pedir('rsvp', token);
    setMandando(false);
    setVista(v);
  }

  let cuerpo: React.ReactNode;
  if (!vista) cuerpo = <p className="rs-gris">Cargando…</p>;
  else if (vista.error) cuerpo = <><p className="rs-t">{vista.error}</p><a className="rs-link" href={APP}>Ir a la app</a></>;
  else if (vista.vencida) cuerpo = <><p className="rs-t" data-rs="vencida">Esta juntada ya no está abierta para responder</p><a className="rs-link" href={APP}>Ver la juntada en la app</a></>;
  else {
    const va = vista.respuesta === 'va';
    const cab = (
      <p className="rs-juntada" data-rs="juntada">
        Juntada del {vista.fecha ? diaCorto(vista.fecha) : ''}{vista.hora ? ` · ${vista.hora}` : ''}{vista.sede ? ` · Sede: ${vista.sede}` : ''}
      </p>
    );
    if (vista.guardado === false && vista.prueba) {
      cuerpo = <>{cab}<p className="rs-t" data-rs="prueba">Esto era una prueba, no se guardó tu respuesta</p><a className="rs-link" href={APP}>Ver la juntada en la app</a></>;
    } else if (vista.guardado) {
      cuerpo = (
        <>
          {cab}
          <p className="rs-t" data-rs="listo">{va ? 'Listo, te anotamos.' : 'Listo, avisamos que no vas.'}</p>
          {vista.total ? <p className="rs-gris">Confirmados: {vista.confirmados} de {vista.total}</p> : null}
          <a className="rs-link" href={APP}>Ver la juntada en la app</a>
          {vista.otro && <button type="button" className="rs-link rs-boton-link" onClick={() => setToken(vista.otro as string)}>Cambiar mi respuesta</button>}
        </>
      );
    } else {
      cuerpo = (
        <>
          {cab}
          {vista.prueba && <p className="rs-prueba">PRUEBA · lo que toques acá no se guarda</p>}
          <p className="rs-t" data-rs="pregunta">{va ? `¿Confirmás que vas, ${vista.nombre}?` : `¿Confirmás que no vas, ${vista.nombre}?`}</p>
          {vista.actual === vista.respuesta && <p className="rs-gris">Ya tenías esta respuesta.</p>}
          <button type="button" className={'rs-boton' + (va ? '' : ' rs-borde')} data-rs="confirmar" disabled={mandando} onClick={confirmar}>
            {mandando ? 'Guardando…' : va ? 'Sí, voy' : 'No voy, avisame la próxima'}
          </button>
          <a className="rs-link" href={APP}>Ver la juntada en la app</a>
        </>
      );
    }
  }
  return (
    <div className="rs-raiz">
      <div className="rs-caja" data-rs="caja">
        <div className="rs-marca">Club EDB</div>
        {cuerpo}
      </div>
    </div>
  );
}
