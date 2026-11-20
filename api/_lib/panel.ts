// Panel Admin del Club EDB: lectura de toda la base y cuentas por cava. Lo usa api/admin-cavas.ts (sólo con sesión de Admin).
// Presupuesto del mes y deuda por socio salen de las MISMAS funciones que usa la pantalla Compras (valor.ts):
// calcularCompras y calcularCuotas. Acá sólo se arma la entrada y se pasan los montos a pesos.
// Vive en _lib para que Vercel no lo cuente como función.
import { BASE_ID, FLD, TBL, listar } from './sesion.js';
import { calcularCompras, calcularCuotas, type FilaBotella, type InformeCuotas, type MiembroCuota, type PagoCuota } from './valor.js';
import { getDolarDelMes, type DolarMes } from './dolar.js';

export const T_GUARDA = 'tblMLbnBu01srMvaX';
const T_CAMBIO = 'tbl22foumsLmMopOs';
// campos que no están en FLD
export const P = {
  cFundacion: 'fld7YahL0rR8m1EpM', cNotas: 'fldsc6VWGJc32pxRn', cToken: 'fldtwedot1iTPeDOi',
  uTel: 'fldnQT3Y4Ffhe3OP4', uNotas: 'fldwpeVzRSmQ6vmgw',
  gFundacion: 'fldog5wS2It41IG4Z', mEtiqueta: 'fldjN5UJzDAPgtrpd',
  pPago: 'fldVO6svi6FBqs87D', pArs: 'fldO4bbEMqK0IsIef', pDolar: 'fldBwIUfEGX3RBHu1', pMedio: 'fld8S010hXLR8RYUW', pFecha: 'fldd6YcNxFLlzI783', pNotas: 'fldLShJgSLrxaimut',
  xMes: 'fldpQXcs0f3qEM05k', xCava: 'fldPFVgRQ82uVEbhP', xCuota: 'fldQozvm5jesvnPvC', xGuarda: 'fldrAnishW5P7Px0G',
} as const;

// ── escritura (sólo servidor, con el token de escritura) ──
export async function escribir(tabla: string, metodo: 'POST' | 'PATCH', records: any[]): Promise<any[]> {
  const tw = process.env.AIRTABLE_WRITE_TOKEN;
  if (!tw) throw new Error('config: falta AIRTABLE_WRITE_TOKEN');
  const out: any[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tabla}`, {
      method: metodo, headers: { Authorization: `Bearer ${tw}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: records.slice(i, i + 10), typecast: true }),
    });
    if (!r.ok) throw new Error(`Airtable ${tabla} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    out.push(...(await r.json()).records);
  }
  return out;
}

const txt = (v: any): string => String(Array.isArray(v) ? v[0] ?? '' : v?.name ?? v ?? '').trim();
const num1 = (v: any) => Number(Array.isArray(v) ? v[0] : v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const primerNombre = (n: string) => n.trim().split(/\s+/)[0] || n;
const sumarMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
export const mesDe = (f: unknown) => String(f ?? '').slice(0, 7);

export type TipoCava = 'grupal' | 'individual' | 'catalogo';
export interface MesArs { mes: string; cuotaArs: number; guardaArs: number; totalArs: number; dolarUsado: number }
export interface SocioPanel {
  id: string; nombre: string; email: string; telefono: string; notas: string; rol: string; desde: string; membresia: string | null;
  alDia: boolean; meses: number; debeArs: number; aFavorUsd: number; adeudados: string[]; otras: string[];
}
export interface CavaPanel {
  id: string; numero: string; nombre: string; tipo: TipoCava; fundacion: string; plan: string | null;
  cuotaUsd: number | null; cuotaSocioUsd: number; saldoInicial: number; saldoDesde: string; cuotasDesde: string;
  notas: string; grupoId: string | null; socios: SocioPanel[]; enGuarda: number;
  deuda: { n: number; ars: number; meses: number };
  mesActual: { asignado: number; disponible: number; queda: number; saldoAnterior: number | null; botellas: number; arrastre: boolean; mes: string; cuota: number } | null;
  cuotas: InformeCuotas | null;
  mesesArs: MesArs[];
  guarda: { id: string; mes: string; cuotaArs: number | null; guardaArs: number }[];
}
export interface Base {
  hoy: string; mesHoy: string; dolar: DolarMes | null;
  cavas: CavaPanel[];
  pagos: { id: string; cava: string; usuario: string; usuarioNombre: string; mes: string; usd: number; ars: number | null; dolar: number | null; medio: string; fecha: string; notas: string; creado: string }[];
  usuarios: { id: string; nombre: string; email: string; telefono: string; admin: boolean }[];
  numeroSiguiente: number;
}

export async function cargarBase(): Promise<Base> {
  const hoy = new Date().toISOString().slice(0, 10), mesHoy = hoy.slice(0, 7);
  const dolar = await getDolarDelMes().catch(() => null);
  const cavasR = await listar(TBL.cavas, [FLD.cNombre, FLD.cTipo, FLD.cGrupo, FLD.cUsuario, FLD.cCuota, FLD.cSaldoInicial, FLD.cSaldoDesde, FLD.cCuotasDesde, P.cFundacion, P.cNotas]);
  const usuR = await listar(TBL.usuarios, [FLD.uNombre, FLD.uEmail, P.uTel, P.uNotas, FLD.uAdmin]);
  const memR = await listar(TBL.membresias, [FLD.mUsuario, FLD.mGrupo, FLD.mDesde, FLD.mRol]);
  const gruR = await listar(TBL.grupos, [FLD.gNombre, FLD.gAlias, P.gFundacion]);
  const pagR = await listar(TBL.pagos, [FLD.pUsuario, FLD.pCava, FLD.pMes, FLD.pMonto, P.pArs, P.pDolar, P.pMedio, P.pFecha, P.pNotas]);
  const gdaR = await listar(T_GUARDA, [P.xMes, P.xCava, P.xCuota, P.xGuarda]);
  const camR = await listar(T_CAMBIO, ['fldQqnVlVgkMedg35', 'fldUQpfvTQ5CzYSDC']);
  const botR = await listar(TBL.botellas, [FLD.bVino, FLD.bAnada, FLD.bCava, FLD.bEnGuarda, FLD.bPagadoUSD, FLD.bValorUSD, FLD.bGananciaEstiba,
    FLD.bComprada, FLD.bOrigen, FLD.bFecha, FLD.bSugeridoUSD, FLD.bIcono, FLD.bFormato, FLD.bBodega, FLD.bCepa]);

  const dolarDe = new Map<string, number>();
  for (const c of camR) { const m = String(c.fields['fldQqnVlVgkMedg35'] ?? '').trim(), v = Number(c.fields['fldUQpfvTQ5CzYSDC']) || 0; if (/^\d{4}-\d{2}$/.test(m) && v > 0 && !dolarDe.has(m)) dolarDe.set(m, v); }
  const dolarMes = (m: string) => dolarDe.get(m) ?? dolar?.valor ?? 0;

  const usuarios = new Map(usuR.map(u => [u.id, {
    id: u.id, nombre: String(u.fields[FLD.uNombre] ?? '').trim(), email: String(u.fields[FLD.uEmail] ?? '').trim(),
    telefono: String(u.fields[P.uTel] ?? '').trim(), notas: String(u.fields[P.uNotas] ?? ''), admin: u.fields[FLD.uAdmin] === true,
  }]));
  const grupos = new Map(gruR.map(g => [g.id, { nombre: String(g.fields[FLD.gNombre] ?? '').trim(), alias: String(g.fields[FLD.gAlias] ?? '').trim(), fundacion: String(g.fields[P.gFundacion] ?? '').slice(0, 10) }]));
  const pagosAll = pagR.map(p => ({
    id: p.id, cava: (p.fields[FLD.pCava] ?? [])[0] ?? '', usuario: (p.fields[FLD.pUsuario] ?? [])[0] ?? '',
    usuarioNombre: usuarios.get((p.fields[FLD.pUsuario] ?? [])[0])?.nombre ?? '', mes: String(p.fields[FLD.pMes] ?? '').trim(),
    usd: Number(p.fields[FLD.pMonto]) || 0, ars: p.fields[P.pArs] == null ? null : Number(p.fields[P.pArs]) || 0,
    dolar: p.fields[P.pDolar] == null ? null : Number(p.fields[P.pDolar]) || 0, medio: txt(p.fields[P.pMedio]),
    fecha: String(p.fields[P.pFecha] ?? '').slice(0, 10), notas: String(p.fields[P.pNotas] ?? ''), creado: String(p.createdTime ?? ''),
  }));
  const hoyGuarda = (cavaId: string) => gdaR.filter(g => (g.fields[P.xCava] ?? []).includes(cavaId))
    .map(g => ({ id: g.id, mes: String(g.fields[P.xMes] ?? '').trim(), cuotaArs: g.fields[P.xCuota] == null ? null : Number(g.fields[P.xCuota]) || 0, guardaArs: Number(g.fields[P.xGuarda]) || 0 }))
    .filter(g => /^\d{4}-\d{2}$/.test(g.mes)).sort((a, b) => b.mes.localeCompare(a.mes));

  // la cava de cada socio, para "también en #004"
  const grupoDeCava = new Map<string, string>();   // grupo → numero
  const numeroDe = (c: any) => (String(c.fields[FLD.cNombre] ?? '').match(/#\d+/) ?? [''])[0];
  for (const c of cavasR) for (const g of c.fields[FLD.cGrupo] ?? []) grupoDeCava.set(g, numeroDe(c));
  const cavasDeUsuario = new Map<string, Set<string>>();
  const anotar = (u: string, n: string) => { if (u && n) (cavasDeUsuario.get(u) ?? cavasDeUsuario.set(u, new Set()).get(u)!).add(n); };
  for (const m of memR) for (const u of m.fields[FLD.mUsuario] ?? []) for (const g of m.fields[FLD.mGrupo] ?? []) anotar(u, grupoDeCava.get(g) ?? '');
  for (const c of cavasR) if (!(c.fields[FLD.cGrupo] ?? []).length) for (const u of c.fields[FLD.cUsuario] ?? []) anotar(u, numeroDe(c));

  const cavas: CavaPanel[] = cavasR.map(c => {
    const f = c.fields, numero = numeroDe(c);
    const grupoId: string | null = (f[FLD.cGrupo] ?? [])[0] ?? null;
    const grupal = txt(f[FLD.cTipo]).toLowerCase().includes('grup');
    const cuotaRaw = f[FLD.cCuota];
    const cuotaUsd = cuotaRaw === undefined || cuotaRaw === null || cuotaRaw === '' || !(Number(cuotaRaw) > 0) ? null : Number(cuotaRaw);
    const tipo: TipoCava = grupal ? 'grupal' : cuotaUsd == null ? 'catalogo' : 'individual';
    const saldoDesde = mesDe(f[FLD.cSaldoDesde]), cuotasDesde = mesDe(f[FLD.cCuotasDesde]);
    // socios
    let miembros: { id: string; rol: string; desde: string; membresia: string | null }[];
    if (grupal && grupoId) {
      miembros = memR.filter(m => (m.fields[FLD.mGrupo] ?? []).includes(grupoId) && (m.fields[FLD.mUsuario] ?? [])[0])
        .map(m => ({ id: m.fields[FLD.mUsuario][0] as string, rol: txt(m.fields[FLD.mRol]) || 'Miembro', desde: String(m.fields[FLD.mDesde] ?? '').slice(0, 7), membresia: m.id }));
    } else {
      miembros = ((f[FLD.cUsuario] ?? []) as string[]).slice(0, 1).map(id => ({ id, rol: 'Titular', desde: '', membresia: null }));
    }
    const n = Math.max(1, miembros.length);
    const cuotaSocioUsd = cuotaUsd ? cuotaUsd / n : 0;
    const guarda = hoyGuarda(c.id);
    const filaGuarda = new Map(guarda.map(g => [g.mes, g]));
    const mesArs = (mes: string): MesArs => {
      const g = filaGuarda.get(mes), d = dolarMes(mes);
      const cuotaArs = g?.cuotaArs != null && g.cuotaArs > 0 ? g.cuotaArs : Math.round(cuotaSocioUsd * d);
      const guardaArs = g?.guardaArs ?? 0;
      const dolarUsado = g?.cuotaArs != null && g.cuotaArs > 0 && cuotaSocioUsd > 0 ? g.cuotaArs / cuotaSocioUsd : d;
      return { mes, cuotaArs, guardaArs, totalArs: cuotaArs + guardaArs, dolarUsado };
    };
    const mesesArs: MesArs[] = [];
    if (cuotaUsd && cuotasDesde) for (let m = cuotasDesde; m <= mesHoy; m = sumarMes(m)) mesesArs.push(mesArs(m));
    // cuentas: las mismas funciones que Compras
    let cuotas: InformeCuotas | null = null;
    const pagosCava = pagosAll.filter(p => p.cava === c.id);
    if (cuotaUsd && cuotasDesde && miembros.length) {
      const mc: MiembroCuota[] = miembros.map(m => ({ id: m.id, nombre: usuarios.get(m.id)?.nombre ?? '', desde: m.desde }));
      const pc: PagoCuota[] = pagosCava.map(p => ({ usuario: p.usuario, mes: p.mes, monto: p.usd }));
      cuotas = calcularCuotas({ cuota: cuotaUsd, cuotasDesde, miembros: mc, pagos: pc, hoy });
    }
    const porSocio = new Map((cuotas?.socios ?? []).map(s => [s.id, s]));
    const arsDe = new Map(mesesArs.map(m => [m.mes, m]));
    const socios: SocioPanel[] = miembros.map(m => {
      const u = usuarios.get(m.id), s = porSocio.get(m.id);
      // lo que debe en pesos: cada mes adeudado, su parte del total del mes (cuota + guarda)
      const debeArs = Math.round((s?.adeudados ?? []).reduce((t, a) => t + (cuotaSocioUsd > 0 ? a.falta / cuotaSocioUsd : 1) * (arsDe.get(a.mes) ?? mesArs(a.mes)).totalArs, 0));
      return {
        id: m.id, nombre: u?.nombre ?? '', email: u?.email ?? '', telefono: u?.telefono ?? '', notas: u?.notas ?? '', rol: m.rol, desde: m.desde, membresia: m.membresia,
        alDia: s ? s.alDia : true, meses: s?.meses ?? 0, debeArs, aFavorUsd: s?.aFavor ?? 0, adeudados: (s?.adeudados ?? []).map(a => a.mes),
        otras: [...(cavasDeUsuario.get(m.id) ?? [])].filter(x => x !== numero).sort(),
      };
    }).sort((a, b) => Number(a.alDia) - Number(b.alDia) || b.meses - a.meses || a.nombre.localeCompare(b.nombre, 'es'));
    // compras del mes: la misma función que Compras
    const filas: FilaBotella[] = botR.filter(b => (b.fields[FLD.bCava] ?? []).includes(c.id)).map(b => { const x = b.fields; return {
      id: b.id, origen: txt(x[FLD.bOrigen]), cantidad: num1(x[FLD.bComprada]), enGuarda: num1(x[FLD.bEnGuarda]), fecha: String(x[FLD.bFecha] ?? ''),
      pagado: num1(x[FLD.bPagadoUSD]), sugerido: num1(x[FLD.bSugeridoUSD]), valorEst: num1(x[FLD.bValorUSD]), gananciaEstiba: num1(x[FLD.bGananciaEstiba]),
      icono: !!x[FLD.bIcono], formato: txt(x[FLD.bFormato]), vino: String(x[FLD.bVino] ?? ''), anada: String(x[FLD.bAnada] ?? ''), bodega: txt(x[FLD.bBodega]), cepa: txt(x[FLD.bCepa]) }; });
    const compras = calcularCompras(filas, hoy, { cuota: cuotaUsd, saldoInicial: Number(f[FLD.cSaldoInicial]) || 0, saldoDesde });
    const ult = compras.meses[compras.meses.length - 1];
    const nombre = grupal ? (grupos.get(grupoId ?? '')?.alias || grupos.get(grupoId ?? '')?.nombre || numero)
      : (usuarios.get(((f[FLD.cUsuario] ?? []) as string[])[0])?.nombre || numero);
    const deudores = socios.filter(s => !s.alDia);
    return {
      id: c.id, numero, nombre, tipo, plan: cuotaUsd == null ? null : cuotaUsd >= 100 ? 'Gran Reserva' : 'Reserva',
      fundacion: String(f[P.cFundacion] ?? '').slice(0, 10) || (grupoId ? grupos.get(grupoId)?.fundacion ?? '' : '') || (cuotasDesde ? cuotasDesde + '-01' : ''),
      cuotaUsd, cuotaSocioUsd, saldoInicial: Number(f[FLD.cSaldoInicial]) || 0, saldoDesde, cuotasDesde, notas: String(f[P.cNotas] ?? ''),
      grupoId, socios, enGuarda: Math.round(filas.reduce((t, b) => t + b.enGuarda, 0)),
      deuda: { n: deudores.length, ars: deudores.reduce((t, s) => t + s.debeArs, 0), meses: deudores.reduce((t, s) => Math.max(t, s.meses), 0) },
      mesActual: ult ? { asignado: ult.asignado, disponible: ult.disponible, queda: ult.queda, saldoAnterior: ult.saldoAnterior, botellas: ult.botellas, arrastre: ult.arrastre, mes: ult.mes, cuota: ult.cuota } : null,
      cuotas, mesesArs, guarda,
    };
  }).sort((a, b) => a.numero.localeCompare(b.numero));
  const maxN = Math.max(0, ...cavasR.map(c => Number((numeroDe(c).match(/\d+/) ?? ['0'])[0])));
  return { hoy, mesHoy, dolar, cavas, pagos: pagosAll, usuarios: [...usuarios.values()], numeroSiguiente: maxN + 1 };
}

export const rotuloNumero = (n: number) => `#${String(n).padStart(3, '0')}`;
export { r2 };
