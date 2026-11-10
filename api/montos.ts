// Montos de una cava, sólo para socios: /api/montos?cava=<id de la cava>
// Aparte de api/cava.ts, que sigue sin ningún dato de dinero. Pide sesión y que la persona sea
// miembro de esa cava (o admin). Devuelve por botella (etiqueta) y en total:
// Los cuatro se calculan sobre las mismas botellas: las que siguen en guarda (así se pueden comparar).
//   pagaste       lo pagado (Pagado USD × botellas en guarda)
//   valorHoy      valor estimado hoy (Valor estimado USD × botellas en guarda)
//   ahorroClub    sugerido − pagado (Ganancia club USD × botellas en guarda)
//   sumaGuarda    revalorización por la guarda (Ganancia estiba USD × botellas en guarda)
// En una cava grupal, `tuParte` es el total dividido la cantidad de miembros.
// `consumos`: lo abierto, uno por consumo, con su precio sugerido y su costo (para la tarjeta "Valor" del informe de Consumos).
// Es plata: sale sólo de acá (con sesión de socio de la cava o Admin), nunca de api/cava.ts.
import { FLD, TBL, cavasDe, listar, sesionDe } from './_lib/sesion.js';

// Consumos: Costo USD (rollup) y los lookups del vino; Botellas: Vivino; Juntadas: para saber de qué juntada es cada consumo
const K = { costo: 'fldlnqi9lv2A3R0fI', vino: 'fldU4IKr05dBVw2es', anada: 'fldwLeledoDNJX5e0', cepa: 'fld8cwEdALO83hD42', tipo: 'fld263m2dOlHBUCNf', bodega: 'fldal6zQKDoh2O9C3' } as const;
const B_VIVINO = 'fldWS6koVIWrXerQv';
const T_JUNTADAS = 'tblXjEG9P1VZEEcpE';
const FJ = { cava: 'fld8m6VnxAUF39uls', nombre: 'fldg8zGBLWIivkItj', consumos: 'fldVvVrbshJnj119x', estado: 'fldNjI92ecirmFzNj' } as const;
import { calcularCompras, calcularCuotas, calcularValor, type FilaBotella, type FilaConsumo, type InformeCuotas, type MiembroCuota, type PagoCuota } from './_lib/valor.js';

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

    const bots = await listar(TBL.botellas, [FLD.bVino, FLD.bAnada, FLD.bCava, FLD.bEnGuarda,
      FLD.bPagadoUSD, FLD.bValorUSD, FLD.bGananciaClub, FLD.bGananciaEstiba,
      FLD.bComprada, FLD.bPosicion, FLD.bOrigen, FLD.bFecha, FLD.bSugeridoUSD, FLD.bIcono, FLD.bFormato, FLD.bBodega, FLD.bCepa, B_VIVINO]);
    const delaCava = bots.filter(b => (b.fields[FLD.bCava] ?? []).includes(cavaId));
    const num1 = (v: any) => Number(Array.isArray(v) ? v[0] : v) || 0;
    const txt = (v: any) => String(Array.isArray(v) ? v[0] ?? '' : v?.name ?? v ?? '');
    const filas: FilaBotella[] = delaCava.map(b => { const f = b.fields; return {
      id: b.id, origen: txt(f[FLD.bOrigen]), cantidad: num1(f[FLD.bComprada]), enGuarda: num1(f[FLD.bEnGuarda]), fecha: String(f[FLD.bFecha] ?? ''),
      pagado: num1(f[FLD.bPagadoUSD]), sugerido: num1(f[FLD.bSugeridoUSD]), valorEst: num1(f[FLD.bValorUSD]), gananciaEstiba: num1(f[FLD.bGananciaEstiba]),
      icono: !!f[FLD.bIcono], formato: txt(f[FLD.bFormato]),
      vino: String(f[FLD.bVino] ?? ''), anada: String(f[FLD.bAnada] ?? ''), bodega: txt(f[FLD.bBodega]), cepa: txt(f[FLD.bCepa]) }; });
    const idsCava = new Set(filas.map(b => b.id));
    const cons = await listar(TBL.consumos, [FLD.kBotella, FLD.kCantidad, FLD.kFecha, FLD.kSugeridoHist, K.costo, K.vino, K.anada, K.cepa, K.tipo, K.bodega]);
    const filasCons: FilaConsumo[] = cons.filter(c => (c.fields[FLD.kBotella] ?? []).some((i: string) => idsCava.has(i))).map(c => ({
      botella: (c.fields[FLD.kBotella] ?? [])[0], cantidad: num1(c.fields[FLD.kCantidad]), fecha: String(c.fields[FLD.kFecha] ?? ''), sugeridoHist: num1(c.fields[FLD.kSugeridoHist]) }));
    const hoy = new Date().toISOString().slice(0, 10);
    const informe = calcularValor(filas, filasCons, hoy);
    // los consumos de la cava con su precio: el sugerido es por botella; el costo, el de ese consumo. Sin Sugerido historico, sin precio.
    const botPor = new Map(delaCava.map(b => [b.id, b]));
    const juntadasCava = (await listar(T_JUNTADAS, [FJ.cava, FJ.nombre, FJ.consumos, FJ.estado]).catch(() => []))
      .filter(j => (j.fields[FJ.cava] ?? []).includes(cavaId) && txt(j.fields[FJ.estado]) !== 'Programada');
    const juntadaDe = new Map<string, string>();
    for (const j of juntadasCava) for (const id of (j.fields[FJ.consumos] ?? []) as string[]) juntadaDe.set(id, txt(j.fields[FJ.nombre]).trim());
    const consumos = cons.filter(c => (c.fields[FLD.kBotella] ?? []).some((i: string) => idsCava.has(i))).map(c => {
      const f = c.fields, b = botPor.get((f[FLD.kBotella] ?? [])[0]);
      return {
        vino: txt(f[K.vino]).trim(), anada: num1(f[K.anada]) || null, cepa: txt(f[K.cepa]), tipo: txt(f[K.tipo]).toLowerCase(), bodega: txt(f[K.bodega]),
        fecha: String(f[FLD.kFecha] ?? '').slice(0, 10), q: num1(f[FLD.kCantidad]) || 1, sug: num1(f[FLD.kSugeridoHist]), costo: num1(f[K.costo]),
        formato: b ? txt(b.fields[FLD.bFormato]) : '', vivino: b ? (num1(b.fields[B_VIVINO]) || null) : null, jt: juntadaDe.get(c.id) ?? '',
      };
    });
    // cuota y saldo de arranque: viven en la fila de la cava (no en la lista de cavas que viaja a todos)
    const cf = (await listar(TBL.cavas, [FLD.cCuota, FLD.cSaldoInicial, FLD.cSaldoDesde, FLD.cPausa, FLD.cCuotasDesde, FLD.cGrupo, FLD.cUsuario], `RECORD_ID()='${cavaId}'`))[0]?.fields ?? {};
    const cuota = cf[FLD.cCuota] === undefined || cf[FLD.cCuota] === null || cf[FLD.cCuota] === '' ? null : Number(cf[FLD.cCuota]);
    const compras = calcularCompras(filas, hoy, { cuota: Number.isFinite(cuota) ? cuota : null, saldoInicial: Number(cf[FLD.cSaldoInicial]) || 0, saldoDesde: String(cf[FLD.cSaldoDesde] ?? '').slice(0, 7) });
    // cuotas de cada socio (en grupales los ven todos los miembros; en individuales, sólo la persona)
    const cuotasDesde = String(cf[FLD.cCuotasDesde] ?? '').slice(0, 7);
    let cuotas: (InformeCuotas & { vos: string | null }) | null = null;
    if (Number.isFinite(cuota) && cuota! > 0 && cuotasDesde) {
      const grupo = (cf[FLD.cGrupo] ?? [])[0] as string | undefined;
      let miembrosCuota: MiembroCuota[];
      const nombres = new Map<string, string>((await listar(TBL.usuarios, [FLD.uNombre])).map(x => [x.id, String(x.fields[FLD.uNombre] ?? '')]));
      if (grupo) {
        const ms = await listar(TBL.membresias, [FLD.mUsuario, FLD.mGrupo, FLD.mDesde]);
        miembrosCuota = ms.filter(m => (m.fields[FLD.mGrupo] ?? []).includes(grupo) && (m.fields[FLD.mUsuario] ?? [])[0])
          .map(m => { const id = m.fields[FLD.mUsuario][0] as string; return { id, nombre: nombres.get(id) ?? '', desde: String(m.fields[FLD.mDesde] ?? '').slice(0, 7) }; });
      } else {
        miembrosCuota = ((cf[FLD.cUsuario] ?? []) as string[]).slice(0, 1).map(id => ({ id, nombre: nombres.get(id) ?? '', desde: '' }));
      }
      const pg = (await listar(TBL.pagos, [FLD.pUsuario, FLD.pCava, FLD.pMes, FLD.pMonto])).filter(p => (p.fields[FLD.pCava] ?? []).includes(cavaId));
      const pagos: PagoCuota[] = pg.map(p => ({ usuario: (p.fields[FLD.pUsuario] ?? [])[0] ?? '', mes: String(p.fields[FLD.pMes] ?? '').trim(), monto: Number(p.fields[FLD.pMonto]) || 0 }));
      if (miembrosCuota.length) cuotas = { ...calcularCuotas({ cuota: cuota!, cuotasDesde, miembros: miembrosCuota, pagos, hoy }), vos: u.id };
    }
    // Posición en cava: sólo de las que siguen en guarda; varias botellas del mismo vino se juntan. Se muestra tal cual viene.
    const posiciones: Record<string, string> = {};
    {
      const vistas: Record<string, string[]> = {};
      for (const b of delaCava) {
        const f = b.fields;
        const pos = String(f[FLD.bPosicion] ?? '').trim();
        if (!pos || !(Number(f[FLD.bEnGuarda]) > 0)) continue;
        const k = `${String(f[FLD.bVino] ?? '').trim().toLowerCase()}|${f[FLD.bAnada] ?? 'nv'}`;
        const l = vistas[k] ?? (vistas[k] = []);
        if (!l.includes(pos)) l.push(pos);
      }
      for (const [k, l] of Object.entries(vistas)) posiciones[k] = l.join(', ');
    }
    const total = vacio();
    const porEtiqueta: Record<string, Montos> = {};
    const origenes: Record<string, Set<string>> = {};   // por etiqueta: los Origen de sus botellas
    for (const b of bots) {
      const f = b.fields;
      if (!(f[FLD.bCava] ?? []).includes(cavaId)) continue;
      const num = (k: string) => Number(f[k]) || 0;
      const guarda = num(FLD.bEnGuarda);
      const m: Montos = {
        pagaste: num(FLD.bPagadoUSD) * guarda, valorHoy: num(FLD.bValorUSD) * guarda,
        ahorroClub: num(FLD.bGananciaClub) * guarda, sumaGuarda: num(FLD.bGananciaEstiba) * guarda,
      };
      const key = `${String(f[FLD.bVino] ?? '').trim().toLowerCase()}|${f[FLD.bAnada] ?? 'nv'}`;
      (origenes[key] ??= new Set()).add(txt(f[FLD.bOrigen]));
      const e = porEtiqueta[key] ?? (porEtiqueta[key] = vacio());
      for (const k of Object.keys(m) as (keyof Montos)[]) { e[k] += m[k]; total[k] += m[k]; }
    }
    const miembros = Math.max(1, cava.miembros);
    const parte = (m: Montos): Montos => ({ pagaste: m.pagaste / miembros, valorHoy: m.valorHoy / miembros, ahorroClub: m.ahorroClub / miembros, sumaGuarda: m.sumaGuarda / miembros });
    // etiquetas cuyas botellas son todas "Fuera del club": no tienen precio, la ficha no muestra el bloque Valor
    const fueraDelClub = Object.entries(origenes).filter(([, o]) => o.size === 1 && o.has('Fuera del club')).map(([k]) => k);
    return res.status(200).json({
      posiciones, fueraDelClub, consumos,
      compras: { ...compras, pausa: !!cf[FLD.cPausa], cuotas }, informe: { ...informe, presupuestoMes: Number.isFinite(cuota) ? cuota : null, tuParte: { valorCava: Math.round(informe.valorCava / miembros), compras: Math.round(informe.compras / miembros) } }, moneda: 'USD', cava: { id: cava.id, nombre: cava.nombre, tipo: cava.tipo, miembros }, esAdmin: u.admin,
      total: redondear(total), tuParte: redondear(parte(total)),
      porEtiqueta: Object.fromEntries(Object.entries(porEtiqueta).map(([k, m]) => [k, redondear(m)])),
    });
  } catch (e) {
    console.error('[api/montos]', String(e).slice(0, 200));
    return res.status(500).json({ error: 'No pudimos calcular los montos. Probá de nuevo en unos minutos.' });
  }
}
