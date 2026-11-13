// Montos reales de una cava (sólo con sesión): lee /api/montos y los deja listos para mostrar.
// Si algo falla, el estado es 'error' y la pantalla se queda con el candado.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSesion } from './Sesion';

export interface Montos { pagaste: number; valorHoy: number; ahorroClub: number; sumaGuarda: number }
export interface PuntoValor { mes: string; compras: number; tomado: number; cava: number }
export interface InformeValor {
  valorCava: number; compras: number; porcentaje: number; guarda: number; tomado: number;
  botellasTomadas: number; botellasEnCava: number; serie: PuntoValor[]; tuParte: { valorCava: number; compras: number };
  presupuestoMes: number | null; mesEnCurso: string; asignadoMes: number; comprasPorMes: Record<string, number>;
}
export interface ComprasMes {
  mes: string; botellas: number; cuota: number; asignado: number;
  saldoAnterior: number | null; disponible: number; queda: number; arrastre: boolean;
}
export interface SocioCuota { id: string; nombre: string; alDia: boolean; meses: number; debe: number; aFavor: number }
export interface CuotasInforme { cuotaSocio: number; desde: string; alDia: number; total: number; socios: SocioCuota[]; vos: string | null }
export interface ComprasInforme {
  meses: ComprasMes[];
  porMes: Record<string, { costo: number; sugerido: number }>;
  ultimas: { vino: string; anada: string; bodega: string; cepa: string; botellas: number }[];
  club: { botellas: number; desde: string; costo: number; sugerido: number };
  regalos: { vino: string; anada: string; bodega: string; cepa: string; botellas: number; origen: string }[];
  pausa: boolean;
  cuotas: CuotasInforme | null;
}
// un consumo con su precio (sólo viaja por /api/montos, con sesión): sug = precio sugerido por botella; costo = lo que costó ese consumo
export interface ConsumoPrecio {
  vino: string; anada: number | null; cepa: string; tipo: string; bodega: string; fecha: string; q: number;
  sug: number; costo: number; formato: string; vivino: number | null; jt: string;
}
export interface MontosCava {
  dolar?: { mes: string; valor: number } | null;                 // dólar oficial del mes (para mostrar en pesos)
  compraDe?: Record<string, { fecha: string; costo: number }>;   // por etiqueta: primera compra con precio (USD por botella)
  consumos?: ConsumoPrecio[];
  compras?: ComprasInforme;
  fueraDelClub?: string[];               // etiquetas (vino|año) con Origen "Fuera del club": sin bloque Valor
  posiciones?: Record<string, string>;   // por etiqueta (vino|año): dónde está en la cava
  informe: InformeValor;
  cava: { id: string; nombre: string; tipo: string; miembros: number };
  total: Montos; tuParte: Montos; porEtiqueta: Record<string, Montos>;
}
export type EstadoMontos = { estado: 'sin-sesion' | 'cargando' | 'error' } | { estado: 'listo'; datos: MontosCava };

// ── plata: todo se guarda en USD y se muestra en pesos al dólar oficial del mes ──
// Ningún monto se formatea por fuera de formatMonto. Los totales se suman en USD y se convierten una vez, al final.
export type Moneda = 'ARS' | 'USD';
export interface Dolar { mes: string; valor: number }   // mes = AAAA-MM
// punto de miles a mano (es-AR no separa los de 4 cifras)
const conPuntos = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const coma1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/[.,]0$/, '').replace('.', ',');
// "$44.400" / "−$12.300" / "USD 27.339"; corto (ejes de gráficos): "$1,2 M", "$450 mil", "10k". Sin dólar del mes, va en USD.
export function formatMonto(usd: number, { moneda, dolar, corto = false }: { moneda: Moneda; dolar: Dolar | null; corto?: boolean }): string {
  const enPesos = moneda === 'ARS' && !!dolar && dolar.valor > 0;
  const signo = usd < 0 ? '−' : '';
  const a = Math.abs(usd);
  if (!enPesos) return corto ? `${signo}${coma1(a / 1000)}k` : `${signo}USD ${conPuntos(a)}`;
  const p = Math.round((a * dolar!.valor) / 100) * 100;
  if (corto && p >= 1e6) return `${signo}$${coma1(p / 1e6)} M`;
  if (corto && p >= 1e3) return `${signo}$${coma1(p / 1e3)} mil`;
  return `${signo}$${conPuntos(p)}`;
}
// lo que ve el visitante en lugar de un monto
export const MONTO_TAPADO = '$ ●●●●';

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// el dólar del mes: llega con /api/montos y lo comparten todas las pantallas
let dolarActual: Dolar | null = null;
const oyentesDolar = new Set<() => void>();
function ponerDolar(d: unknown) {
  const ok = d && typeof d === 'object' && /^\d{4}-\d{2}$/.test(String((d as Dolar).mes)) && Number((d as Dolar).valor) > 0;
  const nuevo = ok ? { mes: String((d as Dolar).mes), valor: Number((d as Dolar).valor) } : null;
  if (nuevo?.mes === dolarActual?.mes && nuevo?.valor === dolarActual?.valor) return;
  dolarActual = nuevo;
  oyentesDolar.forEach(f => f());
}
const subDolar = (f: () => void) => { oyentesDolar.add(f); return () => { oyentesDolar.delete(f); }; };

// la moneda elegida con el botón $ / USD: una sola para todas las pantallas que lo tienen; se recuerda en este navegador
const CLAVE_MONEDA = 'edb-club-moneda';
function leerMoneda(): Moneda { try { return localStorage.getItem(CLAVE_MONEDA) === 'USD' ? 'USD' : 'ARS'; } catch { return 'ARS'; } }
let monedaElegida: Moneda = leerMoneda();
const oyentesMoneda = new Set<() => void>();
export function elegirMoneda(m: Moneda) {
  monedaElegida = m;
  try { localStorage.setItem(CLAVE_MONEDA, m); } catch { /* sin almacenamiento: queda hasta recargar */ }
  oyentesMoneda.forEach(f => f());
}
const subMoneda = (f: () => void) => { oyentesMoneda.add(f); return () => { oyentesMoneda.delete(f); }; };

// conBoton: la pantalla tiene el botón $ / USD (Valor, tarjeta Valor de Consumos, fichas). En el resto, siempre pesos.
export function useDinero(conBoton = false) {
  const dolar = useSyncExternalStore(subDolar, () => dolarActual, () => null);
  const elegida = useSyncExternalStore(subMoneda, () => monedaElegida, () => 'ARS' as Moneda);
  const moneda: Moneda = !dolar ? 'USD' : conBoton ? elegida : 'ARS';
  return {
    moneda, dolar, hayDolar: !!dolar,
    fmt: (usd: number) => formatMonto(usd, { moneda, dolar }),
    corto: (usd: number) => formatMonto(usd, { moneda, dolar, corto: true }),
    // "Montos en pesos al dólar oficial de noviembre ($1.475)" / "Montos en dólares, al precio de cada compra."
    linea: moneda === 'ARS' && dolar
      ? `Montos en pesos al dólar oficial de ${MESES_LARGOS[Number(dolar.mes.slice(5, 7)) - 1]} ($${conPuntos(dolar.valor)})`
      : 'Montos en dólares, al precio de cada compra.',
  };
}

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
        if (ok) ponerDolar(d.dolar);
        if (vivo) setR({ cava: cavaId, res: ok ? { estado: 'listo', datos: d as MontosCava } : { estado: 'error' } });
      })
      .catch(() => { if (vivo) setR({ cava: cavaId, res: { estado: 'error' } }); });
    return () => { vivo = false; };
  }, [cavaId]);
  if (!cavaId) return { estado: 'sin-sesion' };
  return r && r.cava === cavaId ? r.res : { estado: 'cargando' };
}
