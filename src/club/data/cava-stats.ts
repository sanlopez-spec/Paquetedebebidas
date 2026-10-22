import cavaRaw from './cava-001.json';

const raw = cavaRaw as any;

export function sumGuarda(rows: { qty: number }[]): number {
  return rows.reduce((s, r) => s + r.qty, 0);
}

// Pre-computed landing stats for Club EDB #001 (grupal cava)
export const club001 = {
  enGuarda: sumGuarda(raw.data.grupal),
  abiertas: raw.cons.grupal.total as number,
  desde: raw.perfiles.grupal.fundado as number,
} as const;

// Resumen card shown in the landing phone mockup (same numbers as the tablero)
export interface CavaResumen {
  nombre: string;
  alias: string;
  miembros: number;
  fundado: number;
  enGuarda: number;
  abiertas: number;
  eq750: number;
  bodegas: number;
  cepas: number;
  edad: string;
}

type ResumenWine = { qty: number; eq: number; bod: string; cepa: string; an: number | null };

export function buildResumen(
  perfil: { nombre: string; alias: string; miembros: number; fundado: number },
  wines: ResumenWine[],
  abiertas: number,
): CavaResumen {
  const now = new Date().getFullYear();
  let eq750 = 0, tw = 0, twn = 0;
  const bods = new Set<string>(), cepas = new Set<string>();
  wines.forEach(w => {
    eq750 += w.eq;
    bods.add(w.bod); cepas.add(w.cepa);
    if (w.an) { tw += (now - w.an) * w.qty; twn += w.qty; }
  });
  return {
    nombre: perfil.nombre,
    alias: perfil.alias,
    miembros: perfil.miembros,
    fundado: perfil.fundado,
    enGuarda: sumGuarda(wines),
    abiertas,
    eq750,
    bodegas: bods.size,
    cepas: cepas.size,
    // es-AR: con coma, nunca con punto decimal
    edad: twn
      ? new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          .format(tw / twn)
      : '—',
  };
}

export const club001Resumen = buildResumen(raw.perfiles.grupal, raw.data.grupal, raw.cons.grupal.total);
