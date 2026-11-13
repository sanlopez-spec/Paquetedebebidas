// Dólar del mes: oficial Banco Nación, tipo vendedor. Uno por mes, guardado en la tabla "Tipo de cambio".
// La primera vez que se pide en un mes nuevo, se busca en dolarapi.com (o bluelytics si falla) y se crea la fila.
// Si las fuentes fallan, se usa el último mes cargado (sin escribir nada). Cache en memoria: 1 hora.
// Vive en _lib para que Vercel no lo cuente como función.
import { BASE_ID, listar } from './sesion.js';

const T_CAMBIO = 'tbl22foumsLmMopOs';
const F = { mes: 'fldQqnVlVgkMedg35', valor: 'fldUQpfvTQ5CzYSDC', notas: 'fldrpu2lbLs1vdikQ' } as const;

export interface DolarMes { mes: string; valor: number }   // mes = AAAA-MM

let cache: { hasta: number; mesPedido: string; d: DolarMes } | null = null;

// fecha de hoy en Buenos Aires: { mes: '2026-11', dia: '13/11/2026' }
function hoyBA(): { mes: string; dia: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { mes: `${p.year}-${p.month}`, dia: `${p.day}/${p.month}/${p.year}` };
}

type Fila = { mes: string; valor: number; creada: string };
async function filas(): Promise<Fila[]> {
  const rs = await listar(T_CAMBIO, [F.mes, F.valor]);
  return rs.map(r => ({ mes: String(r.fields[F.mes] ?? '').trim(), valor: Number(r.fields[F.valor]) || 0, creada: String(r.createdTime ?? '') }))
    .filter(f => /^\d{4}-\d{2}$/.test(f.mes) && f.valor > 0);
}
// la fila de un mes (si hay dos, la creada primero)
const delMes = (fs: Fila[], mes: string) => fs.filter(f => f.mes === mes).sort((a, b) => a.creada.localeCompare(b.creada))[0];

async function conTiempo(url: string): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function deLaFuente(): Promise<{ valor: number; fuente: string } | null> {
  try {
    const v = Number((await conTiempo('https://dolarapi.com/v1/dolares/oficial'))?.venta);
    if (v > 0) return { valor: v, fuente: 'dolarapi.com' };
  } catch { /* probamos la otra */ }
  try {
    const v = Number((await conTiempo('https://api.bluelytics.com.ar/v2/latest'))?.oficial?.value_sell);
    if (v > 0) return { valor: v, fuente: 'bluelytics.com.ar' };
  } catch { /* sin fuente */ }
  return null;
}

async function crear(mes: string, valor: number, nota: string): Promise<void> {
  const tw = process.env.AIRTABLE_WRITE_TOKEN;
  if (!tw) throw new Error('config: falta AIRTABLE_WRITE_TOKEN');
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${T_CAMBIO}`, {
    method: 'POST', headers: { Authorization: `Bearer ${tw}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields: { [F.mes]: mes, [F.valor]: valor, [F.notas]: nota } }] }),
  });
  if (!r.ok) throw new Error(`Airtable Tipo de cambio ${r.status}`);
}

export async function getDolarDelMes(): Promise<DolarMes | null> {
  const { mes, dia } = hoyBA();
  if (cache && cache.mesPedido === mes && cache.hasta > Date.now()) return cache.d;
  const guardar = (d: DolarMes) => { cache = { hasta: Date.now() + 3600_000, mesPedido: mes, d }; return d; };
  let fs = await filas();
  const ya = delMes(fs, mes);
  if (ya) return guardar({ mes, valor: ya.valor });
  const ultimo = (): DolarMes | null => {
    const u = fs.filter(f => f.mes < mes).sort((a, b) => b.mes.localeCompare(a.mes) || a.creada.localeCompare(b.creada))[0];
    return u ? { mes: u.mes, valor: u.valor } : null;
  };
  const f = await deLaFuente();
  if (!f) { const u = ultimo(); return u ? guardar(u) : null; }
  const valor = Math.round(f.valor * 100) / 100;
  try {
    fs = await filas();                     // otra instancia pudo haberla creado recién
    if (!delMes(fs, mes)) await crear(mes, valor, `Automático: oficial BNA vendedor del ${dia} (${f.fuente})`);
    fs = await filas();
    const fila = delMes(fs, mes);
    return guardar({ mes, valor: fila ? fila.valor : valor });
  } catch (e) {
    console.error('[dolar]', String(e).slice(0, 200));
    return { mes, valor };                  // sin cache: se reintenta la escritura en el próximo pedido
  }
}
