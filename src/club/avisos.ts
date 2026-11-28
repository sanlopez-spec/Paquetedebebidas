// Las cuentas de los avisos de arriba de cada sección (sin pantalla): qué mensaje corresponde y con qué clave se cierra.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fmt = (n: number, d = 0) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const mesAnterior = (ym: string) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

export interface EtiqCompra { vino: string; anada: number | null; botellas: number; vivino?: number | null }
export interface MesCompra { mes: string; botellas: number; etiquetas: EtiqCompra[] }
export interface AvisoCompras { clave: string; caso: 'anada' | 'vivino' | 'ingreso'; titulo: string; texto: string; vino?: string; anada?: number | null }

// el aviso de Compras: habla del mes más nuevo con compras del club, sólo si es el mes en curso o el anterior
export function avisoCompras(m: MesCompra | undefined, mesEnCurso: string): AvisoCompras | null {
  if (!m || !mesEnCurso || (m.mes !== mesEnCurso && m.mes !== mesAnterior(mesEnCurso))) return null;
  const este = m.mes === mesEnCurso;
  const nombreMes = MESES[Number(m.mes.slice(5, 7)) - 1];
  const cuando = este ? 'Este mes' : `En ${nombreMes}`;
  const deMes = este ? 'de este mes' : `de ${nombreMes}`;
  const anioActual = Number(mesEnCurso.slice(0, 4));
  const nom = (a: EtiqCompra, b: EtiqCompra) => a.vino.localeCompare(b.vino, 'es');
  const viejas = m.etiquetas.filter(e => e.anada != null && anioActual - (e.anada as number) >= 10);
  if (viejas.length) {
    const e = [...viejas].sort((a, b) => (a.anada as number) - (b.anada as number) || b.botellas - a.botellas || (b.vivino ?? -1) - (a.vivino ?? -1) || nom(a, b))[0];
    const edad = anioActual - (e.anada as number);
    const que = e.botellas === 1 ? 'una botella' : `${fmt(e.botellas)} botellas`;
    return { clave: `${m.mes}|anada|${e.vino}|${e.anada}`, caso: 'anada', vino: e.vino, anada: e.anada,
      titulo: `¡Wow! ${cuando} te asignamos ${que} ${e.anada} (${fmt(edad)} años).`, texto: e.vino };
  }
  const altas = m.etiquetas.filter(e => e.vivino != null && (e.vivino as number) >= 4.3);
  if (altas.length) {
    const e = [...altas].sort((a, b) => (b.vivino as number) - (a.vivino as number) || b.botellas - a.botellas || (a.anada ?? 9999) - (b.anada ?? 9999) || nom(a, b))[0];
    return { clave: `${m.mes}|vivino|${e.vino}|${e.anada}`, caso: 'vivino', vino: e.vino, anada: e.anada,
      titulo: `¡Felicitaciones! ${cuando} recibiste una etiqueta ${fmt(e.vivino as number, 1)} en Vivino.`, texto: e.anada ? `${e.vino} ${e.anada}` : e.vino };
  }
  return { clave: `${m.mes}|ingreso`, caso: 'ingreso', titulo: `Ya están tus vinos ${deMes}.`,
    texto: m.botellas === 1 ? 'Entró 1 botella a tu cava.' : `Entraron ${fmt(m.botellas)} botellas a tu cava.` };
}

// Valor: el número redondo (en pesos) más alto ya pasado: $1 M, $2 M, $5 M, $10 M y de ahí cada $10 M. 0 si no llega a $1 M
export function hitoValor(pesos: number): number {
  const M = 1e6;
  if (!(pesos >= M)) return 0;
  if (pesos >= 10 * M) return Math.floor(pesos / (10 * M)) * 10 * M;
  return pesos >= 5 * M ? 5 * M : pesos >= 2 * M ? 2 * M : M;
}
export const hitoTxt = (n: number) => `$${fmt(n / 1e6)} M`;
