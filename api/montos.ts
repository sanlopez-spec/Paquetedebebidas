// Montos de una cava, sólo para socios: /api/montos?cava=<id de la cava>
// Aparte de api/cava.ts, que sigue sin ningún dato de dinero. Pide sesión y que la persona sea
// miembro de esa cava (o admin). Devuelve por botella (etiqueta) y en total:
//   pagaste       lo pagado (Pagado USD × botellas compradas)
//   valorHoy      valor estimado hoy (Valor estimado USD × botellas en guarda)
//   ahorroClub    sugerido − pagado (Ganancia club USD × botellas compradas)
//   sumaGuarda    revalorización por la guarda (Ganancia estiba USD × botellas en guarda)
// En una cava grupal, `tuParte` es el total dividido la cantidad de miembros.
import { FLD, TBL, cavasDe, listar, sesionDe } from './_lib/sesion.js';

const r2 = (n: number) => Math.round(n * 100) / 100;
type Montos = { pagaste: number; valorHoy: number; ahorroClub: number; sumaGuarda: number };
const vacio = (): Montos => ({ pagaste: 0, valorHoy: 0, ahorroClub: 0, sumaGuarda: 0 });
const redondear = (m: Montos): Montos => ({ pagaste: r2(m.pagaste), valorHoy: r2(m.valorHoy), ahorroClub: r2(m.ahorroClub), sumaGuarda: r2(m.sumaGuarda) });

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const u = await sesionDe(req);
    if (!u) return res.status(401).json({ error: 'Entrá con tu mail para ver los montos.' });

    const cavaId = String(req.query?.cava ?? '');
    if (!/^rec[A-Za-z0-9]{14}$/.test(cavaId)) return res.status(400).json({ error: 'Falta la cava.' });
    const cavas = await cavasDe(u);
    const cava = cavas.find(c => c.id === cavaId);
    if (!cava) return res.status(403).json({ error: 'No sos miembro de esa cava.' });

    const bots = await listar(TBL.botellas, [FLD.bVino, FLD.bAnada, FLD.bCava, FLD.bComprada, FLD.bEnGuarda,
      FLD.bPagadoUSD, FLD.bValorUSD, FLD.bGananciaClub, FLD.bGananciaEstiba]);
    const total = vacio();
    const porEtiqueta: Record<string, Montos> = {};
    for (const b of bots) {
      const f = b.fields;
      if (!(f[FLD.bCava] ?? []).includes(cavaId)) continue;
      const num = (k: string) => Number(f[k]) || 0;
      const comprada = num(FLD.bComprada), guarda = num(FLD.bEnGuarda);
      const m: Montos = {
        pagaste: num(FLD.bPagadoUSD) * comprada, valorHoy: num(FLD.bValorUSD) * guarda,
        ahorroClub: num(FLD.bGananciaClub) * comprada, sumaGuarda: num(FLD.bGananciaEstiba) * guarda,
      };
      const key = `${String(f[FLD.bVino] ?? '').trim().toLowerCase()}|${f[FLD.bAnada] ?? 'nv'}`;
      const e = porEtiqueta[key] ?? (porEtiqueta[key] = vacio());
      for (const k of Object.keys(m) as (keyof Montos)[]) { e[k] += m[k]; total[k] += m[k]; }
    }
    const miembros = Math.max(1, cava.miembros);
    const parte = (m: Montos): Montos => ({ pagaste: m.pagaste / miembros, valorHoy: m.valorHoy / miembros, ahorroClub: m.ahorroClub / miembros, sumaGuarda: m.sumaGuarda / miembros });
    return res.status(200).json({
      moneda: 'USD', cava: { id: cava.id, nombre: cava.nombre, tipo: cava.tipo, miembros }, esAdmin: u.admin,
      total: redondear(total), tuParte: redondear(parte(total)),
      porEtiqueta: Object.fromEntries(Object.entries(porEtiqueta).map(([k, m]) => [k, redondear(m)])),
    });
  } catch (e) {
    console.error('[api/montos]', String(e).slice(0, 200));
    return res.status(500).json({ error: 'No pudimos calcular los montos. Probá de nuevo en unos minutos.' });
  }
}
