// "El sommelier sugiere": debajo de la grilla de Mi cava, sólo para socios. 1 banner en celular, 2 distintos lado a lado en desktop.
// Se sortean una vez por cada carga de la página (y por cava) para que no cambien al ir y venir entre secciones, y se guarda
// lo último que se mostró (localStorage) para no repetir dos visitas seguidas. Sin ninguna regla aplicable, no se dibuja nada.
// Lo único tocable es el botón: abre WhatsApp con el mensaje armado.
import { useEffect, useMemo, useState } from 'react';
import { elegirBanners, reglasQueAplican, urlPedido, type Banner, type DatosSommelier } from './sommelier';
import './sommelier.css';

const clave = (cavaId: string) => `edb-club-sommelier-${cavaId}`;
function ultimosDe(cavaId: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(clave(cavaId)) ?? '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []; } catch { return []; }
}
function guardar(cavaId: string, ids: string[]) { try { localStorage.setItem(clave(cavaId), JSON.stringify(ids)); } catch { /* sin almacenamiento: puede repetirse */ } }

// lo sorteado en esta carga de la página, por cava (siempre 2: el celular muestra el primero)
const sorteados = new Map<string, Banner[]>();

function useDosColumnas(): boolean {
  const q = '(min-width: 900px)';
  const [si, setSi] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setSi(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return si;
}

export default function Sommelier({ datos, cavaId, individualConCuota }: { datos: DatosSommelier; cavaId: string; individualConCuota: boolean }) {
  const dos = useDosColumnas();
  const picks = useMemo(() => {
    let p = sorteados.get(cavaId);
    if (!p) { p = elegirBanners(reglasQueAplican(datos, { individualConCuota }), 2, ultimosDe(cavaId)); sorteados.set(cavaId, p); }
    return p;
  }, [datos, cavaId, individualConCuota]);
  const mostrados = picks.slice(0, dos ? 2 : 1);
  const ids = mostrados.map(b => b.id).join(',');
  useEffect(() => { if (ids) guardar(cavaId, ids.split(',')); }, [cavaId, ids]);
  if (!mostrados.length) return null;
  return (
    <aside className="som" data-som="banners" aria-label="El sommelier sugiere">
      {mostrados.map(b => (
        <div key={b.id} className="som-card" data-som={b.id}>
          <div className="som-cuerpo">
            <span className="som-rot">EL SOMMELIER SUGIERE</span>
            <h3 className="som-t">{b.titulo}</h3>
            <p className="som-x">{b.texto}</p>
          </div>
          <a className="som-cta" data-som-cta href={urlPedido(b.titulo)} target="_blank" rel="noopener noreferrer">Pedir al club</a>
        </div>
      ))}
    </aside>
  );
}
