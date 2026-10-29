// Montos reales de una cava (sólo con sesión): lee /api/montos y los deja listos para mostrar.
// Si algo falla, el estado es 'error' y la pantalla se queda con el candado.
import { useEffect, useState } from 'react';
import { useSesion } from './Sesion';

export interface Montos { pagaste: number; valorHoy: number; ahorroClub: number; sumaGuarda: number }
export interface PuntoValor { mes: string; compras: number; tomado: number; cava: number }
export interface InformeValor {
  valorCava: number; compras: number; porcentaje: number; guarda: number; tomado: number;
  botellasTomadas: number; botellasEnCava: number; serie: PuntoValor[]; tuParte: { valorCava: number; compras: number };
  presupuestoMes: number; mesEnCurso: string; asignadoMes: number; comprasPorMes: Record<string, number>;
}
export interface MontosCava {
  informe: InformeValor;
  cava: { id: string; nombre: string; tipo: string; miembros: number };
  total: Montos; tuParte: Montos; porEtiqueta: Record<string, Montos>;
}
export type EstadoMontos = { estado: 'sin-sesion' | 'cargando' | 'error' } | { estado: 'listo'; datos: MontosCava };

// "USD 27.339": sin decimales y con punto de miles (a mano, porque es-AR no separa los de 4 cifras)
export const usd = (n: number) => 'USD ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function useMontos(): EstadoMontos {
  const s = useSesion();
  const [r, setR] = useState<{ cava: string; res: EstadoMontos } | null>(null);
  const cavaId = s.sesion ? s.cavaId : null;
  useEffect(() => {
    if (!cavaId) return;
    let vivo = true;
    fetch(`/api/montos?cava=${encodeURIComponent(cavaId)}`, { credentials: 'same-origin' })
      .then(x => (x.ok ? x.json() : Promise.reject(new Error(String(x.status)))))
      .then(d => {
        const ok = d && d.total && d.tuParte && d.porEtiqueta && d.cava && d.informe && Array.isArray(d.informe.serie);
        if (vivo) setR({ cava: cavaId, res: ok ? { estado: 'listo', datos: d as MontosCava } : { estado: 'error' } });
      })
      .catch(() => { if (vivo) setR({ cava: cavaId, res: { estado: 'error' } }); });
    return () => { vivo = false; };
  }, [cavaId]);
  if (!cavaId) return { estado: 'sin-sesion' };
  return r && r.cava === cavaId ? r.res : { estado: 'cargando' };
}
