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
