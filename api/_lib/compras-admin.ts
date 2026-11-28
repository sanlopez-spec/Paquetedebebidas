// Compras del mes en el Panel Admin: leer las líneas de compra de una cava y corregirlas (cantidad, costo, sugerido), sumar y borrar.
// Una "línea" es un registro de Botellas con Origen "Compra club". Los precios por botella se cargan en PESOS del mes de compra
// (Pagado ARS / Sugerido ARS) con el vínculo al Tipo de cambio de ese mes (Mes TC); los USD históricos se vacían para que manden los pesos.
// Las cuentas del mes (presupuesto, % asignado, cierre) salen de calcularCompras, la misma función que usa la pantalla Compras.
// Vive en _lib para que Vercel no lo cuente como función. Sólo lo llama api/admin-cavas.ts, después de validar sesión y Admin.
import { BASE_ID, FLD, TBL, listar } from './sesion.js';
import { escribir } from './panel.js';
import { calcularCompras, dolarDe, ORIGEN_CLUB, type FilaBotella } from './valor.js';
import { dolaresPorMes, getDolarDelMes } from './dolar.js';

export class Mal extends Error { constructor(m: string, public estado = 400) { super(m); } }

const T_CAMBIO = 'tbl22foumsLmMopOs', F_TC_MES = 'fldQqnVlVgkMedg35';
export const B = {
  vino: FLD.bVino, cava: FLD.bCava, bodega: FLD.bBodega, anada: FLD.bAnada, cepa: FLD.bCepa, region: 'fldB48PO4izRD88LR', tipo: 'fldwvWtMUaBgKcsQP',
  formato: FLD.bFormato, cantidad: FLD.bComprada, fecha: FLD.bFecha, pagadoArs: 'fld7kmHUsYsQrMPxv', sugeridoArs: 'fldhhYrxkUpjTKEb9',
  consumidas: 'fldD5WKffD2MD03z8', mesTc: 'fld8zKmDSDftsrf2K', tcValor: 'fldhi9rlfEJdnylCY', pagadoUsd: FLD.bPagadoUSD, sugeridoUsd: FLD.bSugeridoUSD,
  costoHist: 'fldJPYJKSz31wkRj5', sugeridoHist: 'fldFGPcRrjiciZyk7', origen: FLD.bOrigen, provincia: 'fld4xdlvVVkMasePd', linea: 'fldjrlB7S79dZzU00', icono: FLD.bIcono,
  enGuarda: FLD.bEnGuarda, valorEst: FLD.bValorUSD, gananciaEstiba: FLD.bGananciaEstiba,
} as const;
const CAMPOS = Object.values(B);

const txt = (v: any): string => String(Array.isArray(v) ? v[0] ?? '' : v?.name ?? v ?? '').trim();
const num = (v: any) => Number(Array.isArray(v) ? v[0] : v) || 0;
const redondear = (n: number) => Math.round(n * 100) / 100;
// sin mayúsculas, tildes ni puntuación: para comparar nombres de vinos
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

export interface LineaCompra {
  id: string; vino: string; anada: number | null; bodega: string; cepa: string; cantidad: number; abiertas: number;
  costoArs: number; sugeridoArs: number; costoUsd: number; sugeridoUsd: number;
}

async function botellasDeCava(cavaId: string) {
  const todas = await listar(TBL.botellas, [...CAMPOS]);
  return todas.filter(b => ((b.fields[B.cava] ?? []) as string[]).includes(cavaId));
}
async function todasLasBotellas() { return listar(TBL.botellas, [...CAMPOS]); }

async function dolares(): Promise<Record<string, number>> {
  const d = await dolaresPorMes().catch(() => ({} as Record<string, number>));
  const hoy = await getDolarDelMes().catch(() => null);
  if (hoy) d[hoy.mes] = hoy.valor;
  return d;
}

function aLinea(r: any, dolarMes: number): LineaCompra {
  const f = r.fields;
  const tc = num(f[B.tcValor]) || dolarMes || 0;
  let usdC = num(f[B.pagadoUsd]), usdS = num(f[B.sugeridoUsd]);
  const arsC = num(f[B.pagadoArs]) > 0 ? num(f[B.pagadoArs]) : usdC * tc;
  const arsS = num(f[B.sugeridoArs]) > 0 ? num(f[B.sugeridoArs]) : usdS * tc;
  if (!usdC && tc) usdC = arsC / tc;
  if (!usdS && tc) usdS = arsS / tc;
  return {
    id: r.id, vino: String(f[B.vino] ?? '').trim(), anada: num(f[B.anada]) || null, bodega: txt(f[B.bodega]), cepa: txt(f[B.cepa]),
    cantidad: num(f[B.cantidad]), abiertas: num(f[B.consumidas]),
    costoArs: Math.round(arsC), sugeridoArs: Math.round(arsS), costoUsd: redondear(usdC), sugeridoUsd: redondear(usdS),
  };
}

// opciones que ya existen en Airtable (las que ya usa alguna botella): así un vino nuevo nunca inventa una opción
function opcionesDe(todas: any[]) {
  const set = (campo: string) => [...new Set(todas.map(b => txt(b.fields[campo])).filter(Boolean))].sort((a, z) => a.localeCompare(z, 'es'));
  return { cepa: set(B.cepa), region: set(B.region), provincia: set(B.provincia), tipo: set(B.tipo), formato: set(B.formato) };
}

export async function comprasMes(cavaId: string, mesPedido?: string) {
  const [todas, cavaR, dol] = await Promise.all([
    todasLasBotellas(),
    listar(TBL.cavas, [FLD.cCuota, FLD.cSaldoInicial, FLD.cSaldoDesde], `RECORD_ID()='${cavaId}'`),
    dolares(),
  ]);
  const cava = cavaR[0];
  if (!cava) throw new Mal('No encontramos esa cava.', 404);
  const delaCava = todas.filter(b => ((b.fields[B.cava] ?? []) as string[]).includes(cavaId));
  const compras = delaCava.filter(b => txt(b.fields[B.origen]) === ORIGEN_CLUB && String(b.fields[B.fecha] ?? '').length >= 7);
  const porMes = new Map<string, number>();
  for (const b of compras) { const m = String(b.fields[B.fecha]).slice(0, 7); porMes.set(m, (porMes.get(m) ?? 0) + num(b.fields[B.cantidad])); }
  const meses = [...porMes.entries()].map(([mes, botellas]) => ({ mes, botellas })).sort((a, z) => a.mes.localeCompare(z.mes));
  const mes = mesPedido && /^\d{4}-\d{2}$/.test(mesPedido) ? mesPedido : meses[meses.length - 1]?.mes ?? new Date().toISOString().slice(0, 7);
  const dolarMes = dolarDe(mes, dol) ?? 0;
  const lineas = compras.filter(b => String(b.fields[B.fecha]).slice(0, 7) === mes).map(b => aLinea(b, dolarMes))
    .sort((a, z) => a.vino.localeCompare(z.vino, 'es') || (a.anada ?? 0) - (z.anada ?? 0) || a.id.localeCompare(z.id));
  // presupuesto del mes: la misma función que la pantalla Compras
  const filas: FilaBotella[] = delaCava.map(b => { const x = b.fields; return {
    id: b.id, origen: txt(x[B.origen]), cantidad: num(x[B.cantidad]), enGuarda: num(x[B.enGuarda]), fecha: String(x[B.fecha] ?? ''),
    pagado: num(x[B.pagadoUsd]), sugerido: num(x[B.sugeridoUsd]), valorEst: num(x[B.valorEst]), gananciaEstiba: num(x[B.gananciaEstiba]),
    icono: !!x[B.icono], formato: txt(x[B.formato]), vino: String(x[B.vino] ?? ''), anada: String(x[B.anada] ?? ''), bodega: txt(x[B.bodega]), cepa: txt(x[B.cepa]) }; });
  const cf = cava.fields, cuotaRaw = Number(cf[FLD.cCuota]);
  const informe = calcularCompras(filas, new Date().toISOString().slice(0, 10), {
    cuota: Number.isFinite(cuotaRaw) && cuotaRaw > 0 ? cuotaRaw : null, saldoInicial: Number(cf[FLD.cSaldoInicial]) || 0,
    saldoDesde: String(cf[FLD.cSaldoDesde] ?? '').slice(0, 7), dolares: dol,
  });
  return { cava: cavaId, mes, meses, dolar: dolarMes || null, lineas, presupuesto: informe.meses.find(m => m.mes === mes) ?? null, opciones: opcionesDe(todas) };
}

// el registro de una línea de compra (valida que sea de Compra club) y su cava
async function lineaPorId(id: string) {
  const r = (await listar(TBL.botellas, [...CAMPOS], `RECORD_ID()='${id}'`))[0];
  if (!r) throw new Mal('No encontramos esa línea.', 404);
  if (txt(r.fields[B.origen]) !== ORIGEN_CLUB) throw new Mal('Sólo se corrigen las compras del club.', 409);
  const cava = ((r.fields[B.cava] ?? []) as string[])[0];
  const mes = String(r.fields[B.fecha] ?? '').slice(0, 7);
  if (!cava || !/^\d{4}-\d{2}$/.test(mes)) throw new Mal('La línea no tiene cava o fecha de ingreso.', 409);
  return { r, cava, mes };
}

// el registro del Tipo de cambio de un mes (si hay dos, el creado primero, como dolar.ts)
async function tipoDeCambio(mes: string): Promise<string> {
  const rs = (await listar(T_CAMBIO, [F_TC_MES], `{Mes}='${mes}'`)).sort((a, z) => String(a.createdTime).localeCompare(String(z.createdTime)));
  if (!rs[0]) throw new Mal(`No hay dólar cargado para ${mes}.`, 409);
  return rs[0].id;
}

export async function updateLinea(id: string, campo: unknown, valor: unknown) {
  if (campo !== 'cantidad' && campo !== 'costo' && campo !== 'sugerido') throw new Mal('Sólo se editan cantidad, costo o sugerido.');
  const { r, cava, mes } = await lineaPorId(id);
  const n = Number(valor);
  if (!Number.isFinite(n)) throw new Mal('El valor no es un número.');
  if (campo === 'cantidad') {
    if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Mal('La cantidad tiene que ser un entero desde 1.');
    const abiertas = num(r.fields[B.consumidas]);
    if (n < abiertas) throw new Mal(`Ya se abrieron ${abiertas} ${abiertas === 1 ? 'botella' : 'botellas'} de esta línea`, 409);
    await escribir(TBL.botellas, 'PATCH', [{ id, fields: { [B.cantidad]: n } }]);
  } else {
    if (!(n > 0) || n > 1e8) throw new Mal('El monto tiene que ser mayor a cero.');
    // el otro precio se asegura en pesos con lo que hoy se ve, para no perderlo al vaciar los USD históricos
    const dolarMes = dolarDe(mes, await dolares()) ?? 0;
    const actual = aLinea(r, dolarMes);
    const costo = campo === 'costo' ? redondear(n) : actual.costoArs, sugerido = campo === 'sugerido' ? redondear(n) : actual.sugeridoArs;
    if (!(costo > 0) || !(sugerido > 0)) throw new Mal('Falta el otro precio de la línea: cargá costo y sugerido.', 409);
    const tc = await tipoDeCambio(mes);
    await escribir(TBL.botellas, 'PATCH', [{ id, fields: { [B.pagadoArs]: costo, [B.sugeridoArs]: sugerido, [B.mesTc]: [tc], [B.costoHist]: null, [B.sugeridoHist]: null } }]);
  }
  return comprasMes(cava, mes);
}

export async function vinos(texto: unknown) {
  const q = norm(typeof texto === 'string' ? texto.slice(0, 80) : '');
  const palabras = q.split(' ').filter(Boolean);
  if (!palabras.length) return { vinos: [] };
  const vistos = new Map<string, { ref: string; vino: string; bodega: string; cepa: string; region: string }>();
  for (const b of await todasLasBotellas()) {
    const vino = String(b.fields[B.vino] ?? '').trim(), bodega = txt(b.fields[B.bodega]);
    if (!vino) continue;
    const t = norm(`${vino} ${bodega}`);
    if (!palabras.every(p => t.includes(p))) continue;
    const k = `${norm(vino)}|${norm(bodega)}`;
    if (!vistos.has(k)) vistos.set(k, { ref: b.id, vino, bodega, cepa: txt(b.fields[B.cepa]), region: txt(b.fields[B.region]) });
  }
  return { vinos: [...vistos.values()].sort((a, z) => a.vino.localeCompare(z.vino, 'es')).slice(0, 20) };
}

const COPIA = [B.bodega, B.cepa, B.region, B.provincia, B.tipo, B.formato, B.linea] as const;
const txtMax = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function addLinea(d: any) {
  const cava = d.cava, mes = d.mes;
  if (typeof cava !== 'string' || !/^rec[A-Za-z0-9]{14}$/.test(cava)) throw new Mal('Falta la cava.');
  if (typeof mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Mal('Mes inválido.');
  const cantidad = Number(d.cantidad), costo = Number(d.costo), sugerido = Number(d.sugerido), anada = d.anada === '' || d.anada == null ? null : Number(d.anada);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10000) throw new Mal('La cantidad tiene que ser un entero desde 1.');
  if (!(costo > 0) || !(sugerido > 0) || costo > 1e8 || sugerido > 1e8) throw new Mal('Costo y sugerido tienen que ser mayores a cero.');
  if (anada !== null && (!Number.isInteger(anada) || anada < 1900 || anada > 2100)) throw new Mal('La añada no es válida.');
  const todas = await todasLasBotellas();
  const fields: Record<string, unknown> = {};
  if (typeof d.fuente === 'string' && /^rec[A-Za-z0-9]{14}$/.test(d.fuente)) {
    const f = todas.find(b => b.id === d.fuente);
    if (!f) throw new Mal('No encontramos ese vino.', 404);
    fields[B.vino] = String(f.fields[B.vino] ?? '').trim();   // el nombre se copia exacto, nunca se escribe
    for (const c of COPIA) { const v = txt(f.fields[c]); if (v) fields[c] = v; }
    if (f.fields[B.icono]) fields[B.icono] = true;
  } else {
    const n = d.nuevo ?? {};
    const vino = txtMax(n.vino, 120);
    if (!vino) throw new Mal('Falta el nombre del vino.');
    const igual = todas.find(b => norm(String(b.fields[B.vino] ?? '')) === norm(vino));
    if (igual) throw new Mal(`Ya existe «${String(igual.fields[B.vino]).trim()}»: elegilo de la lista.`, 409);
    const op = opcionesDe(todas);
    const bodega = txtMax(n.bodega, 120);
    if (!bodega) throw new Mal('Falta la bodega.');
    const elegir = (clave: 'cepa' | 'region' | 'provincia' | 'tipo' | 'formato', campo: string, que: string, obligatorio: boolean) => {
      const v = txtMax(n[clave], 80);
      if (!v) { if (obligatorio) throw new Mal(`Falta ${que}.`); return; }
      if (!op[clave].includes(v)) throw new Mal(`${que[0].toUpperCase()}${que.slice(1)}: elegí una opción de la lista.`);
      fields[campo] = v;
    };
    fields[B.vino] = vino; fields[B.bodega] = bodega;
    elegir('cepa', B.cepa, 'la cepa', true); elegir('region', B.region, 'la región', true); elegir('provincia', B.provincia, 'la provincia', true);
    elegir('tipo', B.tipo, 'el tipo', true); elegir('formato', B.formato, 'el formato', false);
    const linea = txtMax(n.linea, 120); if (linea) fields[B.linea] = linea;
  }
  const tc = await tipoDeCambio(mes);
  Object.assign(fields, {
    [B.cava]: [cava], [B.fecha]: `${mes}-01`, [B.origen]: ORIGEN_CLUB, [B.cantidad]: cantidad,
    [B.pagadoArs]: redondear(costo), [B.sugeridoArs]: redondear(sugerido), [B.mesTc]: [tc],
  });
  if (anada !== null) fields[B.anada] = anada;
  await escribir(TBL.botellas, 'POST', [{ fields }]);
  return comprasMes(cava, mes);
}

export async function deleteLinea(id: string) {
  const { r, cava, mes } = await lineaPorId(id);
  const abiertas = num(r.fields[B.consumidas]);
  if (abiertas > 0) throw new Mal(`Ya se abrieron ${abiertas} ${abiertas === 1 ? 'botella' : 'botellas'} de esta línea`, 409);
  const tw = process.env.AIRTABLE_WRITE_TOKEN;
  if (!tw) throw new Error('config: falta AIRTABLE_WRITE_TOKEN');
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL.botellas}/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tw}` } });
  if (!res.ok) throw new Error(`Airtable Botellas ${res.status}`);
  return comprasMes(cava, mes);
}
