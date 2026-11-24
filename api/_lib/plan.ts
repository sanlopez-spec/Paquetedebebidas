// Plan del club (Reserva / Gran Reserva): una sola regla para /api/montos y el Panel Admin.
// Se suma lo que la persona pone por mes en todas sus cavas; con USD 100 o más tiene Gran Reserva en todas.
//   lo que pone en una cava: en una individual, la Cuota mensual USD de la cava; en una grupal, esa cuota dividida la cantidad de
//   miembros (la cuota por socio). Las cavas sin cuota (sólo catálogo) suman 0.
//   plan en una cava = Gran Reserva si la cava llega sola a USD 100 (en una grupal, el total del grupo) o si la suma de la persona
//   llega a USD 100; si no, Reserva. Tope de descuento: Reserva 30 %, Gran Reserva 40 %.
// Sólo decide el plan: el presupuesto de Compras sigue saliendo de la cuota de cada cava.
// Vive en _lib para que Vercel no lo cuente como función.
import { FLD, TBL, listar } from './sesion.js';

export type Plan = 'Reserva' | 'Gran Reserva';
export const UMBRAL_GRAN_RESERVA = 100;   // USD por mes
export const TOPE_PLAN: Record<Plan, number> = { Reserva: 30, 'Gran Reserva': 40 };

// una cava con lo que hace falta para la regla: su cuota (USD por mes; null = sin cuota), el grupo (grupales), el dueño (individuales)
// y cuántos miembros reparten la cuota
export interface CuotaCava { id: string; cuotaUsd: number | null; grupo: string | null; duenos: string[]; miembros: number }

const conCuota = (c: CuotaCava) => c.cuotaUsd != null && Number.isFinite(c.cuotaUsd) && c.cuotaUsd > 0;
// lo que pone una persona por mes en esa cava
export const aporteEnCava = (c: CuotaCava): number => (!conCuota(c) ? 0 : c.grupo ? c.cuotaUsd! / Math.max(1, c.miembros) : c.cuotaUsd!);
// las cavas de una persona: las suyas (individuales) y las de sus grupos
export const esDe = (c: CuotaCava, persona: string, grupos: Set<string>) => (c.grupo ? grupos.has(c.grupo) : c.duenos.includes(persona));
// lo que la persona pone por mes sumando todas sus cavas
export function sumaDePersona(persona: string, grupos: Set<string>, cavas: CuotaCava[]): number {
  return cavas.filter(c => esDe(c, persona, grupos)).reduce((s, c) => s + aporteEnCava(c), 0);
}
// el plan en una cava: la cava sola o la suma de la persona (null = no hay una persona a quien mirar: sólo la cava)
export function planDeCava(c: CuotaCava, sumaPersona: number | null): Plan {
  const sola = conCuota(c) && c.cuotaUsd! >= UMBRAL_GRAN_RESERVA;
  return sola || (sumaPersona ?? 0) >= UMBRAL_GRAN_RESERVA ? 'Gran Reserva' : 'Reserva';
}

// Lectura para /api/montos: todas las cavas con su cuota, los grupos de cada persona y los miembros de cada grupo.
export async function leerCuotas(): Promise<{ cavas: CuotaCava[]; gruposDe: (persona: string) => Set<string> }> {
  const [cavasR, memR, gruR] = await Promise.all([
    listar(TBL.cavas, [FLD.cCuota, FLD.cGrupo, FLD.cUsuario]),
    listar(TBL.membresias, [FLD.mUsuario, FLD.mGrupo]),
    listar(TBL.grupos, [FLD.gMiembros]),
  ]);
  const miembrosDe = new Map(gruR.map(g => [g.id, Number(g.fields[FLD.gMiembros]) || 1]));
  const cavas: CuotaCava[] = cavasR.map(r => {
    const f = r.fields ?? {}, raw = f[FLD.cCuota], grupo = ((f[FLD.cGrupo] ?? []) as string[])[0] ?? null;
    return { id: r.id, cuotaUsd: raw === undefined || raw === null || raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw),
      grupo, duenos: ((f[FLD.cUsuario] ?? []) as string[]).slice(0, 1), miembros: grupo ? (miembrosDe.get(grupo) ?? 1) : 1 };
  });
  const gruposDe = (persona: string) => new Set(memR.filter(m => ((m.fields[FLD.mUsuario] ?? []) as string[]).includes(persona)).flatMap(m => (m.fields[FLD.mGrupo] ?? []) as string[]));
  return { cavas, gruposDe };
}
