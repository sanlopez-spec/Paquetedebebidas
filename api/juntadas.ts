// Juntadas, puntajes y fotos de Consumos (sólo socios, con sesión). Todo permiso se valida acá, nunca sólo en la app.
//   GET  ?accion=estado&cava=<id>    lo que la persona puede ver y hacer en Consumos de esa cava (sin dinero)
//   GET  ?accion=fotos&juntada=<id>  las fotos de una juntada (URLs que vencen en horas: no se cachean)
//   POST ?accion=armar     { cava, juntada?, fecha, diaExacto, hora, sede, asistentes[], vinos[{ consumo?, botella }], maridaje, notas, confirmar?, empezar? }
//                          arma una juntada (Presidente o Admin) o la edita. Con fecha futura queda Programada: los vinos van a
//                          "Vinos designados" y no se crean consumos (una sola programada por cava). Con fecha de hoy o pasada, o con
//                          empezar (desde el día de la juntada), queda Realizada: asistentes + consumos. Editar una realizada: el Admin
//                          siempre; el Presidente hasta 7 días después de su fecha. Una programada la editan Presidente y Admin.
//                          Con avisar: true manda la invitación (programada nueva) o el aviso de cambios (fecha, hora, sede o vinos).
//   POST ?accion=responder { juntada, va }          "Voy" / "No voy": sólo socios de la cava, sólo mientras está programada
//   POST ?accion=borrar    { juntada, avisar? }     Admin: cualquiera. Presidente: sólo una programada. Borra puntajes, consumos y la juntada
//                                                   (programada con avisar: manda el aviso de suspensión)
//   POST ?accion=recordar  { juntada }              Presidente o Admin: manda la invitación a los socios que no respondieron
//   POST ?accion=prueba    { cava, juntada?, fecha, hora, sede, maridaje, vinos[] }   sólo el Admin: la invitación, sólo a su mail
// Sin sesión (la página que abren los botones del mail; el link firmado es la credencial y nunca guarda al abrirse):
//   POST ?accion=rsvp-ver  { t }                    qué juntada y qué respuesta trae el link (vencido si dejó de estar programada)
//   POST ?accion=rsvp      { t }                    guarda esa respuesta (con el link de prueba no guarda nada)
//   POST ?accion=votar     { consumo, color, aroma, sabor, impresion, notas }   sólo los asistentes (o el dueño en una individual)
//   POST ?accion=foto      { juntada, imagen }      agrega una foto (JPG en base64, ya achicada en el navegador): asistentes, Presidente y Admin
//   POST ?accion=portada   { juntada, foto }        pone esa foto primera y anota quién la eligió
//   POST ?accion=abrir     { cava, botella }        cava individual: el dueño abre una botella en guarda
//   POST ?accion=deshacer  { consumo, conPuntaje? } borra una apertura y sus puntajes: ver puedeDeshacerConsumo (conPuntaje confirma que se borre el puntaje)
// Escribe con AIRTABLE_WRITE_TOKEN; lee con el token de siempre. Puntaje total y Puntaje club son fórmulas/rollups de Airtable.
import { BASE_ID, FLD, TBL, cavasDe, firmar, leerJson, listar, mandarMails, normalizarMail, sesionDe, usuarioPorId, verificar } from './_lib/sesion.js';
import { armarInvitacion, armarSuspension, cambiosEntre, primerNombre } from './_lib/mailJuntada.js';
import type { DatosMail } from './_lib/mailJuntada.js';
import type { Usuario } from './_lib/sesion.js';

const T = { juntadas: 'tblXjEG9P1VZEEcpE', consumos: 'tblvfDCiHNUXo1ZFQ', puntajes: 'tblzC35aynQwytHMS' } as const;
const FJ = {
  nombre: 'fldg8zGBLWIivkItj', cava: 'fld8m6VnxAUF39uls', fecha: 'fldoLC4TDsOuji996', fotos: 'fldKno8prsBjITYcQ',
  notas: 'fldqIubl1JdAoxsJD', maridaje: 'fldveT1zfp0HYZAgH', asistentes: 'fldqi83NGrcq5BfYf', portadaPor: 'fldEbcA8JtipHw69x', consumos: 'fldVvVrbshJnj119x', exacto: 'fldOr7pvh16gYRil2',
  estado: 'fldNjI92ecirmFzNj', sede: 'fldV8mloKBm9ffZSd', hora: 'fldyj3Sx2ivf2qoAr', designados: 'fldpBY5mY9CuX5GRL', van: 'fldq22lEbMSCtSQng', noVan: 'fldOjcBBBkiu9SJkK',
  invitada: 'fldOO0h2qSEvmsaOr',   // "Invitación enviada" (fecha y hora); vacío = la invitación todavía no salió
} as const;
// Estado vacío = Realizada (las 36 viejas)
const esProgramada = (j: any) => s1(j?.fields?.[FJ.estado]) === 'Programada';
const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/;
const FC = {
  botella: 'fldxtM9Sk5kjFthch', usuario: 'fldmQ1NU9iS7blDBF', cantidad: 'fldst9TObn0RlTmZQ', fecha: 'fld9C1dM0eAorQ2VG', juntada: 'fldCOhmlxHcAIY3RB',
  orden: 'fldibhsgKPsEyW8Bl', vino: 'fldU4IKr05dBVw2es', anada: 'fldwLeledoDNJX5e0', cepa: 'fld8cwEdALO83hD42', tipo: 'fld263m2dOlHBUCNf', bodega: 'fldal6zQKDoh2O9C3',
} as const;
const FP = {
  usuario: 'fldW9Zahv0F4Xgy5v', botella: 'fld3UwETLKEXE36u7', consumo: 'fldTcPESTd8mreoGm', fecha: 'fldKXKnI41FiNjU3q', notas: 'fldws01W7Nmi5W8aP',
  color: 'fldDao45F0iaAXuv0', aroma: 'fldfhwbP6kg5LHuh0', sabor: 'fldFBu2Hi1iWfuMs3', impresion: 'fld76lAOU6EoZjW06', total: 'fldCUb1dAadxM1VCP',
} as const;
const B_VIVINO = 'fldWS6koVIWrXerQv';
const B_TIPO = 'fldwvWtMUaBgKcsQP';
// Las cuatro partes del puntaje (escala Parker): el máximo de cada una. La guía de cada rango sale de la descripción del campo.
export const PARTES = [
  { clave: 'color', campo: FP.color, max: 5 }, { clave: 'aroma', campo: FP.aroma, max: 15 },
  { clave: 'sabor', campo: FP.sabor, max: 20 }, { clave: 'impresion', campo: FP.impresion, max: 10 },
] as const;
const DIAS_VOTACION = 7;
const SEG_DESHACER = 120;
const MAX_FOTO = 3_000_000;
const ID = /^rec[A-Za-z0-9]{14}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

class Rechazo extends Error { constructor(public estado: number, msg: string, public extra: object = {}) { super(msg); } }
const porIds = (ids: string[]) => ids.length ? `OR(${ids.map(i => `RECORD_ID()='${i.replace(/[^A-Za-z0-9]/g, '')}'`).join(',')})` : 'FALSE()';
const s1 = (v: any) => String(Array.isArray(v) ? v[0] ?? '' : v?.name ?? v ?? '').trim();
const n1 = (v: any) => { const x = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(x) ? x : null; };
export const hoyAR = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
// abierta desde que se guarda hasta 7 días después de su Fecha
export const votacionAbierta = (fecha: string, hoy = hoyAR()) => {
  if (!FECHA.test(fecha)) return false;
  const fin = new Date(fecha + 'T00:00:00Z'); fin.setUTCDate(fin.getUTCDate() + DIAS_VOTACION);
  return hoy <= fin.toISOString().slice(0, 10);
};

// Quién puede deshacer un consumo: el Admin siempre; el socio sólo lo suyo en una cava individual y hasta 7 días después de su fecha.
// Los consumos de una juntada grupal los deshace sólo el Admin (el Presidente edita la juntada).
export const DIAS_DESHACER = 7;
export function puedeDeshacerConsumo(u: { admin: boolean }, individual: boolean, esMio: boolean, fecha: string, hoy = hoyAR()) {
  if (u.admin) return true;
  if (!individual || !esMio || !FECHA.test(fecha)) return false;
  const fin = new Date(fecha + 'T00:00:00Z'); fin.setUTCDate(fin.getUTCDate() + DIAS_DESHACER);
  return hoy <= fin.toISOString().slice(0, 10);
}

// ── escritura (sólo con el token de escritura) ──
function tokenEscritura() {
  const t = process.env.AIRTABLE_WRITE_TOKEN;
  if (!t) throw new Error('config: falta AIRTABLE_WRITE_TOKEN');
  return t;
}
async function escribir(metodo: 'POST' | 'PATCH' | 'DELETE', tabla: string, cuerpo?: object, query = ''): Promise<any> {
  const r = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tabla}${query}`, {
    method: metodo, headers: { Authorization: `Bearer ${tokenEscritura()}`, 'Content-Type': 'application/json' },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  if (!r.ok) throw new Error(`Airtable ${metodo} ${tabla} ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}
// de a 10 registros por pedido (el tope de Airtable)
async function enTandas<T>(items: T[], f: (tanda: T[]) => Promise<any>) {
  const out: any[] = [];
  for (let i = 0; i < items.length; i += 10) { const r = await f(items.slice(i, i + 10)); out.push(...(r?.records ?? [])); }
  return out;
}
const crear = (tabla: string, campos: object[]) => enTandas(campos, t => escribir('POST', tabla, { records: t.map(fields => ({ fields })) }));
const cambiar = (tabla: string, regs: { id: string; fields: object }[]) => enTandas(regs, t => escribir('PATCH', tabla, { records: t }));
const borrar = (tabla: string, ids: string[]) => enTandas(ids, t => escribir('DELETE', tabla, undefined, '?' + t.map(i => `records[]=${i}`).join('&')));

// ── quién es la persona en esta cava ──
async function contexto(u: Usuario, cavaId: string) {
  if (!ID.test(cavaId)) throw new Rechazo(400, 'Falta la cava.');
  const acceso = (await cavasDe(u)).find(c => c.id === cavaId);
  if (!acceso) throw new Rechazo(403, 'No sos miembro de esa cava.');
  const c = (await listar(TBL.cavas, [FLD.cTipo, FLD.cGrupo, FLD.cUsuario], `RECORD_ID()='${cavaId}'`))[0];
  const tipo = s1(c?.fields[FLD.cTipo]).toLowerCase();
  const grupo = s1(c?.fields[FLD.cGrupo]);
  const individual = tipo.startsWith('individual') || !grupo;
  const esDueno = individual && ((c?.fields[FLD.cUsuario] ?? []) as string[]).includes(u.id);
  let esPresidente = false;
  let socios: string[] = [];
  if (!individual) {
    const ms = await listar(TBL.membresias, [FLD.mUsuario, FLD.mGrupo, FLD.mRol]);
    const delGrupo = ms.filter(m => ((m.fields[FLD.mGrupo] ?? []) as string[]).includes(grupo));
    socios = [...new Set(delGrupo.flatMap(m => (m.fields[FLD.mUsuario] ?? []) as string[]))];
    esPresidente = delGrupo.some(m => ((m.fields[FLD.mUsuario] ?? []) as string[]).includes(u.id) && s1(m.fields[FLD.mRol]) === 'Presidente');
  }
  return { cavaId, titulo: acceso.titulo || acceso.nombre, individual, esDueno, esPresidente, puedeArmar: !individual && (esPresidente || u.admin), socios };
}
async function nombres(ids: string[]) {
  const unicos = [...new Set(ids)];
  if (!unicos.length) return new Map<string, string>();
  return new Map((await listar(TBL.usuarios, [FLD.uNombre], porIds(unicos))).map(r => [r.id, String(r.fields[FLD.uNombre] ?? '').trim()]));
}
async function juntadasDe(cavaId: string) {
  const js = await listar(T.juntadas, [FJ.nombre, FJ.cava, FJ.fecha, FJ.fotos, FJ.asistentes, FJ.portadaPor, FJ.consumos, FJ.maridaje, FJ.notas, FJ.exacto, FJ.estado, FJ.sede, FJ.hora, FJ.designados, FJ.van, FJ.noVan, FJ.invitada]);
  return js.filter(j => ((j.fields[FJ.cava] ?? []) as string[]).includes(cavaId));
}
async function botellasDe(cavaId: string) {
  const bs = await listar(TBL.botellas, [FLD.bVino, FLD.bAnada, FLD.bCava, FLD.bEnGuarda, FLD.bBodega, FLD.bCepa, B_VIVINO, B_TIPO]);
  return bs.filter(b => ((b.fields[FLD.bCava] ?? []) as string[]).includes(cavaId));
}

// ── la guía de cada parte, leída de la descripción del campo ("0-1: opaco… 2-3: limpio…") ──
let guiaCache: { partes: Record<string, { desde: number; hasta: number; texto: string }[]>; franjas: { desde: number; hasta: number; nombre: string }[] } | null = null;
export function leerGuia(desc: string) {
  const out: { desde: number; hasta: number; texto: string }[] = [];
  const re = /(\d+)\s*-\s*(\d+):\s*([\s\S]*?)(?=\s\d+\s*-\s*\d+:|$)/g;
  for (let m = re.exec(desc); m; m = re.exec(desc)) out.push({ desde: +m[1], hasta: +m[2], texto: m[3].trim().replace(/\.$/, '') });
  return out;
}
async function guia() {
  if (guiaCache) return guiaCache;
  const r = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, { headers: { Authorization: `Bearer ${tokenEscritura()}` } });
  if (!r.ok) throw new Error(`Airtable esquema ${r.status}`);
  const tabla = ((await r.json()).tables as any[]).find(t => t.id === T.puntajes);
  const desc = (id: string) => String(tabla?.fields.find((f: any) => f.id === id)?.description ?? '');
  const partes: Record<string, { desde: number; hasta: number; texto: string }[]> = {};
  for (const p of PARTES) partes[p.clave] = leerGuia(desc(p.campo));
  const franjas = [...desc(FP.total).matchAll(/(\d+)\s*-\s*(\d+)\s+([a-záéíóúñ ]+?)(?=,|\.|$)/gi)].map(m => ({ desde: +m[1], hasta: +m[2], nombre: m[3].trim() }));
  guiaCache = { partes, franjas };
  return guiaCache;
}

// ── los puntajes que la persona puede ver: los suyos siempre; los del resto, sólo de los vinos que ya votó ──
export type Voto = { consumo: string; usuario: string; total: number | null; partes: Record<string, number | null>; notas: string };
export function puntajesVisibles(votos: Voto[], yo: string, nombre: (id: string) => string) {
  const out: Record<string, { mio: Voto | null; club: { promedio: number; votos: number; detalle: { nombre: string; total: number; mio: boolean }[] } | null }> = {};
  const porConsumo = new Map<string, Voto[]>();
  for (const v of votos) { if (!porConsumo.has(v.consumo)) porConsumo.set(v.consumo, []); porConsumo.get(v.consumo)!.push(v); }
  for (const [c, vs] of porConsumo) {
    const mio = vs.find(v => v.usuario === yo) ?? null;
    const completos = vs.filter(v => v.total != null);
    out[c] = {
      mio,
      club: mio && completos.length ? {
        promedio: Math.round(completos.reduce((s, v) => s + (v.total as number), 0) / completos.length * 10) / 10,
        votos: completos.length,
        detalle: completos.map(v => ({ nombre: nombre(v.usuario), total: v.total as number, mio: v.usuario === yo })).sort((a, b) => b.total - a.total),
      } : null,
    };
  }
  return out;
}
async function votosDe(consumos: Set<string>): Promise<(Voto & { id: string })[]> {
  if (!consumos.size) return [];
  const ps = await listar(T.puntajes, [FP.usuario, FP.consumo, FP.total, FP.notas, ...PARTES.map(p => p.campo)]);
  return ps.filter(p => consumos.has(s1(p.fields[FP.consumo]))).map(p => ({
    id: p.id, consumo: s1(p.fields[FP.consumo]), usuario: s1(p.fields[FP.usuario]), total: n1(p.fields[FP.total]), notas: String(p.fields[FP.notas] ?? ''),
    partes: Object.fromEntries(PARTES.map(x => [x.clave, n1(p.fields[x.campo])])),
  }));
}

// ── mails de la juntada programada ──
// Los links de "Voy / No voy": uno por socio, por juntada y por respuesta, firmados con SESSION_SECRET (el mismo mecanismo
// que la sesión y el código del login, con su propio propósito). Vencen cuando la juntada deja de estar programada; además
// tienen un tope de 120 días. Van en el # de la URL: no viajan al servidor ni en el Referer.
const RSVP = 'rsvp';
const DIAS_LINK = 120;
const APP = () => (process.env.APP_URL || 'https://edb.com.ar').replace(/\/$/, '');
type TokenRsvp = { u: string; j: string; r: 'va' | 'no'; p?: 1; f?: string; h?: string; s?: string; c?: string; x: number };
const linkRsvp = (d: Omit<TokenRsvp, 'x'>) => `${APP()}/club/respuesta#t=${firmar({ ...d, x: Date.now() + DIAS_LINK * 86400000 }, RSVP)}`;
const linkApp = () => `${APP()}/club/cava#consumos`;
// las personas que reciben: nombre y mail (el mail nunca sale de acá)
async function destinatarios(ids: string[]) {
  if (!ids.length) return [];
  const us = await listar(TBL.usuarios, [FLD.uNombre, FLD.uEmail], porIds([...new Set(ids)]));
  return us.map(x => ({ id: x.id, nombre: primerNombre(String(x.fields[FLD.uNombre] ?? '')), email: normalizarMail(x.fields[FLD.uEmail]) }))
    .filter((x): x is { id: string; nombre: string; email: string } => !!x.email);
}
function datosMail(titulo: string, f: { fecha: string; hora: string; sede: string; maridaje: string; designados: string[] }, botPor: Map<string, any>): DatosMail {
  return {
    cava: titulo, fecha: f.fecha, hora: f.hora, sede: f.sede, maridaje: f.maridaje,
    vinos: f.designados.filter(id => botPor.has(id)).map(id => {
      const b = botPor.get(id);
      const cepa = s1(b.fields[FLD.bCepa]);
      // los cortes blancos se nombran "Blend blanco"
      return { vino: s1(b.fields[FLD.bVino]), anada: n1(b.fields[FLD.bAnada]) || null, cepa: /^blend$/i.test(cepa) && s1(b.fields[B_TIPO]).toLowerCase() === 'blanco' ? 'Blend blanco' : cepa };
    }),
  };
}
const datosDeRegistro = (titulo: string, j: any, botPor: Map<string, any>) => datosMail(titulo, {
  fecha: String(j.fields[FJ.fecha] ?? ''), hora: String(j.fields[FJ.hora] ?? ''), sede: String(j.fields[FJ.sede] ?? ''),
  maridaje: String(j.fields[FJ.maridaje] ?? ''), designados: (j.fields[FJ.designados] ?? []) as string[],
}, botPor);
// invitación (o aviso de cambios) a cada persona, con sus propios links
async function mandarInvitacion(juntadaId: string, datos: DatosMail, ids: string[], op: { cambios?: ReturnType<typeof cambiosEntre>; van?: string[]; noVan?: string[]; recordatorio?: boolean } = {}) {
  const para = await destinatarios(ids);
  return mandarMails(para.map(x => {
    const respuesta = op.van?.includes(x.id) ? 'va' : op.noVan?.includes(x.id) ? 'no' : null;
    const m = armarInvitacion(datos, { nombre: x.nombre, respuesta, links: { va: linkRsvp({ u: x.id, j: juntadaId, r: 'va' }), no: linkRsvp({ u: x.id, j: juntadaId, r: 'no' }), app: linkApp() } }, op);
    return { para: x.email, ...m };
  }));
}
const anotarInvitacion = (id: string) => cambiar(T.juntadas, [{ id, fields: { [FJ.invitada]: new Date().toISOString() } }]);
// un mail que falla no deshace lo guardado: se avisa en la respuesta
async function sinFrenar(f: () => Promise<number>) {
  try { return { mails: await f() }; } catch (e) { console.error('[api/juntadas] mails', String(e).slice(0, 200)); return { mails: 0, mailError: true }; }
}

// ── GET estado ──
async function estado(u: Usuario, cavaId: string) {
  const cx = await contexto(u, cavaId);
  const hoy = hoyAR();
  const botellas = await botellasDe(cavaId);
  const botPor = new Map(botellas.map(b => [b.id, b]));
  const cons = (await listar(T.consumos, [FC.botella, FC.usuario, FC.fecha, FC.orden, FC.juntada, FC.vino, FC.anada, FC.cepa, FC.tipo, FC.bodega]))
    .filter(c => botPor.has(s1(c.fields[FC.botella])));
  const consPor = new Map(cons.map(c => [c.id, c]));
  const fila = (c: any) => {
    const b = botPor.get(s1(c.fields[FC.botella]));
    return {
      id: c.id, botella: s1(c.fields[FC.botella]), vino: s1(c.fields[FC.vino]), anada: n1(c.fields[FC.anada]) || null, cepa: s1(c.fields[FC.cepa]),
      tipo: s1(c.fields[FC.tipo]).toLowerCase(), bodega: s1(c.fields[FC.bodega]), fecha: String(c.fields[FC.fecha] ?? ''), orden: n1(c.fields[FC.orden]),
      vivino: b ? n1(b.fields[B_VIVINO]) : null, creado: c.createdTime, mio: s1(c.fields[FC.usuario]) === u.id,
      puedeDeshacer: puedeDeshacerConsumo(u, cx.individual, cx.esDueno || s1(c.fields[FC.usuario]) === u.id, String(c.fields[FC.fecha] ?? ''), hoy),
    };
  };
  const js = cx.individual ? [] : await juntadasDe(cavaId);
  const designado = (id: string) => {
    const b = botPor.get(id);
    return { botella: id, vino: s1(b?.fields[FLD.bVino]), anada: n1(b?.fields[FLD.bAnada]) || null, cepa: s1(b?.fields[FLD.bCepa]), tipo: s1(b?.fields[B_TIPO]).toLowerCase(), bodega: s1(b?.fields[FLD.bBodega]), vivino: b ? n1(b.fields[B_VIVINO]) : null, enGuarda: b ? n1(b.fields[FLD.bEnGuarda]) ?? 0 : 0 };
  };
  const juntadas = js.map(j => {
    const fecha = String(j.fields[FJ.fecha] ?? '');
    const asistentes = (j.fields[FJ.asistentes] ?? []) as string[];
    const programada = esProgramada(j);
    const van = (j.fields[FJ.van] ?? []) as string[], noVan = (j.fields[FJ.noVan] ?? []) as string[];
    return {
      id: j.id, nombre: s1(j.fields[FJ.nombre]), fecha, exacto: programada || j.fields[FJ.exacto] === true, asistentes, abierta: !programada && votacionAbierta(fecha, hoy), soyAsistente: asistentes.includes(u.id),
      programada, sede: String(j.fields[FJ.sede] ?? ''), hora: String(j.fields[FJ.hora] ?? ''),
      designados: programada ? ((j.fields[FJ.designados] ?? []) as string[]).filter(id => botPor.has(id)).map(designado) : [],
      van: programada ? van : [], noVan: programada ? noVan : [],
      miRespuesta: !programada ? null : van.includes(u.id) ? 'va' : noVan.includes(u.id) ? 'no' : null,
      puedeResponder: programada && cx.socios.includes(u.id),
      invitacionEnviada: programada ? String(j.fields[FJ.invitada] ?? '') : '',
      puedeEmpezar: programada && cx.puedeArmar && fecha <= hoy,
      puedeBorrar: u.admin || (programada && cx.esPresidente),
      puedeEditar: programada ? cx.puedeArmar : (u.admin || (cx.esPresidente && votacionAbierta(fecha, hoy))),
      puedeFotos: u.admin || cx.esPresidente || asistentes.includes(u.id),
      fotos: ((j.fields[FJ.fotos] ?? []) as unknown[]).length, portadaPor: s1(j.fields[FJ.portadaPor]),
      // la portada: URL de Airtable que vence en horas (esta respuesta no se cachea)
      portada: (((j.fields[FJ.fotos] ?? []) as any[])[0]?.thumbnails?.large?.url ?? ((j.fields[FJ.fotos] ?? []) as any[])[0]?.url ?? ''),
      maridaje: String(j.fields[FJ.maridaje] ?? ''), notas: String(j.fields[FJ.notas] ?? ''),
      consumos: ((j.fields[FJ.consumos] ?? []) as string[]).filter(id => consPor.has(id)).map(id => fila(consPor.get(id))),
    };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  // en la individual, todas las aperturas de la cava; en la grupal, las de las juntadas
  const individuales = cx.individual ? cons.map(fila).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado ?? '').localeCompare(a.creado ?? '')) : [];
  const ids = new Set(cx.individual ? individuales.map(c => c.id) : juntadas.flatMap(j => j.consumos.map(c => c.id)));
  const votos = await votosDe(ids);
  const nom = await nombres([...votos.map(v => v.usuario), ...juntadas.flatMap(j => j.asistentes), ...juntadas.map(j => j.portadaPor).filter(Boolean), ...cx.socios]);
  const guarda = cx.puedeArmar || cx.esDueno
    ? botellas.filter(b => (n1(b.fields[FLD.bEnGuarda]) ?? 0) > 0).map(b => ({
      id: b.id, vino: s1(b.fields[FLD.bVino]), anada: n1(b.fields[FLD.bAnada]) || null, bodega: s1(b.fields[FLD.bBodega]),
      cepa: s1(b.fields[FLD.bCepa]), enGuarda: n1(b.fields[FLD.bEnGuarda]) ?? 0,
    })).sort((a, b) => a.vino.localeCompare(b.vino, 'es') || (b.anada ?? 0) - (a.anada ?? 0))
    : [];
  return {
    yo: u.id, esAdmin: u.admin, individual: cx.individual, puedeArmar: cx.puedeArmar, esDueno: cx.esDueno, hoy,
    // los socios de la cava (nombres): para armar la juntada y para la lista de "Voy / No voy"
    socios: cx.socios.map(id => ({ id, nombre: nom.get(id) ?? '' })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    soySocio: cx.socios.includes(u.id),
    guarda,
    totalSocios: cx.socios.length,
    juntadas: juntadas.map(j => ({ ...j, portadaPor: j.portadaPor ? (nom.get(j.portadaPor) ?? '') : '', asistentesNombres: j.asistentes.map(id => ({ id, nombre: nom.get(id) ?? '' })) })),
    individuales,
    puntajes: puntajesVisibles(votos, u.id, id => nom.get(id) ?? 'Socio'),
    guia: await guia(),
    partes: PARTES.map(p => ({ clave: p.clave, max: p.max })),
  };
}

// ── POST armar ──
async function armar(u: Usuario, b: any) {
  const cx = await contexto(u, String(b.cava ?? ''));
  if (!cx.puedeArmar) throw new Rechazo(403, 'Sólo el Presidente de la cava puede armar la juntada.');
  let fecha = String(b.fecha ?? '');
  if (!FECHA.test(fecha)) throw new Rechazo(400, 'Revisá la fecha.');
  // sin día exacto sólo se sabe el mes: se guarda el 1
  const diaExacto = b.diaExacto !== false;
  if (!diaExacto) fecha = fecha.slice(0, 7) + '-01';
  const asistentes = [...new Set(((b.asistentes ?? []) as unknown[]).map(String))];
  if (asistentes.some(a => !cx.socios.includes(a))) throw new Rechazo(400, 'Hay asistentes que no son socios de la cava.');
  const vinos = ((b.vinos ?? []) as any[]).map(v => ({ consumo: v?.consumo ? String(v.consumo) : null, botella: String(v?.botella ?? '') }));
  if (!vinos.length) throw new Rechazo(400, 'Agregá al menos un vino.');
  const hora = String(b.hora ?? '').trim();
  if (hora && !HORA.test(hora)) throw new Rechazo(400, 'Revisá la hora (por ejemplo, 21:00).');
  const sede = String(b.sede ?? '').trim().slice(0, 200);
  const botellas = await botellasDe(cx.cavaId);
  const botPor = new Map(botellas.map(x => [x.id, x]));
  const js = await juntadasDe(cx.cavaId);
  let juntada = b.juntada ? js.find(j => j.id === String(b.juntada)) : null;
  if (b.juntada && !juntada) throw new Rechazo(404, 'No encontramos esa juntada.');
  const eraProgramada = esProgramada(juntada);
  const hoy = hoyAR();
  // con fecha futura queda programada; "Empezamos" la pasa a realizada (sólo desde el día de la juntada)
  if (b.empezar && (!eraProgramada || String(juntada?.fields[FJ.fecha] ?? '') > hoy)) throw new Rechazo(403, 'Se puede empezar una juntada programada desde el día de la juntada.');
  const programar = !b.empezar && fecha > hoy;
  if (juntada && !eraProgramada && programar) throw new Rechazo(400, 'Una juntada que ya se hizo no puede tener fecha futura.');
  if (programar && js.some(j => esProgramada(j) && j.id !== juntada?.id)) throw new Rechazo(409, 'Esta cava ya tiene una juntada programada.', { programada: true });
  // editar una realizada: el Admin siempre; el Presidente hasta 7 días después de su fecha
  if (juntada && !eraProgramada && !u.admin && !votacionAbierta(String(juntada.fields[FJ.fecha] ?? ''))) throw new Rechazo(403, 'Pasaron más de 7 días de la juntada: sólo un Admin puede editarla.');

  if (programar) {
    // programada: sólo los vinos designados (en orden; un vínculo de Airtable no repite registros), sin consumos ni asistentes
    const designados = [...new Set(vinos.map(v => v.botella))];
    if (designados.some(id => (n1(botPor.get(id)?.fields[FLD.bEnGuarda]) ?? 0) <= 0)) throw new Rechazo(400, 'Hay un vino que no está en guarda en esta cava.');
    let nombre = juntada ? s1(juntada.fields[FJ.nombre]) : '';
    if (!juntada) {
      const [y, m, d] = fecha.split('-').map(Number);
      nombre = `Juntada ${MESES[m - 1]} ${y}`;
      if (js.some(j => s1(j.fields[FJ.nombre]).toLowerCase() === nombre.toLowerCase() || String(j.fields[FJ.fecha] ?? '').slice(0, 7) === fecha.slice(0, 7))) nombre += ` ${d}/${m}`;
    }
    const campos = {
      [FJ.nombre]: nombre, [FJ.cava]: [cx.cavaId], [FJ.fecha]: fecha, [FJ.exacto]: true, [FJ.estado]: 'Programada', [FJ.hora]: hora, [FJ.sede]: sede,
      [FJ.designados]: designados, [FJ.maridaje]: String(b.maridaje ?? '').slice(0, 2000), [FJ.notas]: String(b.notas ?? '').slice(0, 4000),
    };
    const antes = juntada && eraProgramada ? datosDeRegistro(cx.titulo, juntada, botPor) : null;
    const respuestas = { van: (juntada?.fields[FJ.van] ?? []) as string[], noVan: (juntada?.fields[FJ.noVan] ?? []) as string[] };
    if (juntada) await cambiar(T.juntadas, [{ id: juntada.id, fields: campos }]);
    else juntada = (await crear(T.juntadas, [campos]))[0];
    const ahora = datosMail(cx.titulo, { fecha, hora, sede, maridaje: String(b.maridaje ?? '').slice(0, 2000), designados }, botPor);
    const cambios = antes ? cambiosEntre(antes, ahora) : [];
    let envio = {};
    if (b.avisar === true && !antes) {
      envio = await sinFrenar(() => mandarInvitacion(juntada.id, ahora, cx.socios));
      if ((envio as { mails?: number }).mails) await anotarInvitacion(juntada.id);
    }
    else if (b.avisar === true && cambios.length) envio = await sinFrenar(() => mandarInvitacion(juntada.id, ahora, cx.socios, { cambios, ...respuestas }));
    return { ok: true, juntada: juntada.id, nombre, programada: true, ...envio };
  }
  const previos = juntada ? ((juntada.fields[FJ.consumos] ?? []) as string[]) : [];
  // los vinos nuevos tienen que estar en guarda (contando las veces que se repiten)
  const nuevos = vinos.filter(v => !v.consumo || !previos.includes(v.consumo));
  const usa = new Map<string, number>();
  for (const v of nuevos) {
    const bt = botPor.get(v.botella);
    usa.set(v.botella, (usa.get(v.botella) ?? 0) + 1);
    if (!bt || (n1(bt.fields[FLD.bEnGuarda]) ?? 0) < (usa.get(v.botella) as number)) throw new Rechazo(400, 'Hay un vino que no está en guarda en esta cava.');
  }
  const quedan = new Set(vinos.map(v => v.consumo).filter(Boolean) as string[]);
  const sacar = previos.filter(id => !quedan.has(id));
  const votosSacar = (await votosDe(new Set(sacar)));
  if (votosSacar.length && !b.confirmar) throw new Rechazo(409, `Se borra el consumo y sus puntajes. La botella vuelve a la cava.`, { votos: votosSacar.length });

  let nombre = juntada ? s1(juntada.fields[FJ.nombre]) : '';
  if (!juntada) {
    const [y, m, d] = fecha.split('-').map(Number);
    nombre = `Juntada ${MESES[m - 1]} ${y}`;
    if (js.some(j => s1(j.fields[FJ.nombre]).toLowerCase() === nombre.toLowerCase() || String(j.fields[FJ.fecha] ?? '').slice(0, 7) === fecha.slice(0, 7))) nombre += ` ${d}/${m}`;
  }
  const campos = {
    [FJ.nombre]: nombre, [FJ.cava]: [cx.cavaId], [FJ.fecha]: fecha, [FJ.exacto]: diaExacto, [FJ.asistentes]: asistentes, [FJ.estado]: 'Realizada',
    [FJ.hora]: hora, [FJ.sede]: sede, [FJ.maridaje]: String(b.maridaje ?? '').slice(0, 2000), [FJ.notas]: String(b.notas ?? '').slice(0, 4000),
  };
  if (!juntada) juntada = (await crear(T.juntadas, [campos]))[0];
  // borrar lo que se sacó (con sus votos), crear lo nuevo y numerar todo en el orden de la lista
  if (votosSacar.length) await borrar(T.puntajes, votosSacar.map(v => v.id));
  if (sacar.length) await borrar(T.consumos, sacar);
  const creados = await crear(T.consumos, nuevos.map(v => ({ [FC.botella]: [v.botella], [FC.cantidad]: 1, [FC.fecha]: fecha, [FC.juntada]: nombre })));
  let k = 0;
  const finales = vinos.map(v => (v.consumo && previos.includes(v.consumo) ? v.consumo : creados[k++].id as string));
  await cambiar(T.consumos, finales.map((id, i) => ({ id, fields: { [FC.orden]: i + 1, [FC.fecha]: fecha, [FC.juntada]: nombre } })));
  await cambiar(T.juntadas, [{ id: juntada.id, fields: { ...campos, [FJ.consumos]: finales } }]);
  return { ok: true, juntada: juntada.id, nombre };
}

// ── permisos sobre un consumo: ¿puede votarlo o subir fotos a su juntada? ──
async function permisoConsumo(u: Usuario, consumoId: string) {
  if (!ID.test(consumoId)) throw new Rechazo(400, 'Falta el vino.');
  const c = (await listar(T.consumos, [FC.botella, FC.usuario], `RECORD_ID()='${consumoId}'`))[0];
  if (!c) throw new Rechazo(404, 'No encontramos ese vino.');
  const botella = s1(c.fields[FC.botella]);
  const b = (await listar(TBL.botellas, [FLD.bCava], `RECORD_ID()='${botella}'`))[0];
  const cavaId = s1(b?.fields[FLD.bCava]);
  const cx = await contexto(u, cavaId);
  if (cx.individual) {
    if (!cx.esDueno) throw new Rechazo(403, 'Sólo el dueño de la cava puede puntuar.');
    return { botella, cx };
  }
  const j = (await juntadasDe(cavaId)).find(x => ((x.fields[FJ.consumos] ?? []) as string[]).includes(consumoId));
  if (!j || !((j.fields[FJ.asistentes] ?? []) as string[]).includes(u.id)) throw new Rechazo(403, 'Sólo los asistentes de la juntada pueden puntuar.');
  if (!votacionAbierta(String(j.fields[FJ.fecha] ?? ''))) throw new Rechazo(403, 'La votación de esta juntada ya cerró.');
  return { botella, cx };
}

// ── POST votar ──
async function votar(u: Usuario, b: any) {
  const consumo = String(b.consumo ?? '');
  const { botella } = await permisoConsumo(u, consumo);
  const partes: Record<string, number> = {};
  for (const p of PARTES) {
    const v = Number(b[p.clave]);
    if (!Number.isInteger(v) || v < 0 || v > p.max) throw new Rechazo(400, 'Revisá el puntaje: cada parte va de 0 a su máximo.');
    partes[p.campo] = v;
  }
  const campos = { ...partes, [FP.notas]: String(b.notas ?? '').slice(0, 2000), [FP.fecha]: hoyAR() };
  const ya = (await votosDe(new Set([consumo]))).find(v => v.usuario === u.id);
  if (ya) await cambiar(T.puntajes, [{ id: ya.id, fields: campos }]);
  else await crear(T.puntajes, [{ ...campos, [FP.usuario]: [u.id], [FP.botella]: [botella], [FP.consumo]: [consumo] }]);
  return { ok: true, total: 50 + Object.values(partes).reduce((s, v) => s + v, 0) };
}

// ── fotos ──
async function juntadaConPermiso(u: Usuario, juntadaId: string, soloAsistentes: boolean) {
  if (!ID.test(juntadaId)) throw new Rechazo(400, 'Falta la juntada.');
  const j = (await listar(T.juntadas, [FJ.cava, FJ.asistentes, FJ.fotos, FJ.portadaPor], `RECORD_ID()='${juntadaId}'`))[0];
  if (!j) throw new Rechazo(404, 'No encontramos esa juntada.');
  const cx = await contexto(u, s1(j.fields[FJ.cava]));
  if (soloAsistentes && !cx.puedeArmar && !((j.fields[FJ.asistentes] ?? []) as string[]).includes(u.id)) throw new Rechazo(403, 'Sólo los asistentes, el Presidente o un Admin pueden subir o elegir fotos.');
  return j;
}
async function fotos(u: Usuario, juntadaId: string) {
  const j = await juntadaConPermiso(u, juntadaId, false);
  const nom = await nombres([s1(j.fields[FJ.portadaPor])].filter(Boolean));
  return {
    portadaPor: nom.get(s1(j.fields[FJ.portadaPor])) ?? '',
    fotos: ((j.fields[FJ.fotos] ?? []) as any[]).map(f => ({ id: f.id, url: f.thumbnails?.large?.url ?? f.url, grande: f.thumbnails?.full?.url ?? f.url })),
  };
}
async function subirFoto(u: Usuario, b: any) {
  const j = await juntadaConPermiso(u, String(b.juntada ?? ''), true);
  const buf = Buffer.from(String(b.imagen ?? '').replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (!buf.length || buf.length > MAX_FOTO || !(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Rechazo(400, 'La foto no es válida. Probá con otra.');
  const r = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${j.id}/${FJ.fotos}/uploadAttachment`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokenEscritura()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: 'image/jpeg', file: buf.toString('base64'), filename: `juntada-${Date.now()}.jpg` }),
  });
  if (!r.ok) throw new Error(`Airtable uploadAttachment ${r.status}`);
  return { ok: true };
}
async function portada(u: Usuario, b: any) {
  const j = await juntadaConPermiso(u, String(b.juntada ?? ''), true);
  const actuales = ((j.fields[FJ.fotos] ?? []) as { id: string }[]).map(f => f.id);
  const elegida = String(b.foto ?? '');
  if (!actuales.includes(elegida)) throw new Rechazo(400, 'Esa foto no es de esta juntada.');
  await cambiar(T.juntadas, [{ id: j.id, fields: { [FJ.fotos]: [elegida, ...actuales.filter(x => x !== elegida)].map(id => ({ id })), [FJ.portadaPor]: [u.id] } }]);
  return { ok: true };
}

// ── cava individual: abrir y deshacer ──
async function abrir(u: Usuario, b: any) {
  const cx = await contexto(u, String(b.cava ?? ''));
  if (!cx.individual || !cx.esDueno) throw new Rechazo(403, 'Sólo el dueño de una cava personal puede abrir botellas acá.');
  const bt = (await botellasDe(cx.cavaId)).find(x => x.id === String(b.botella ?? ''));
  if (!bt || (n1(bt.fields[FLD.bEnGuarda]) ?? 0) <= 0) throw new Rechazo(400, 'Esa botella no está en guarda.');
  const [c] = await crear(T.consumos, [{ [FC.botella]: [bt.id], [FC.usuario]: [u.id], [FC.cantidad]: 1, [FC.fecha]: hoyAR() }]);
  return { ok: true, consumo: c.id };
}
async function deshacer(u: Usuario, b: any) {
  const id = String(b.consumo ?? '');
  if (!ID.test(id)) throw new Rechazo(400, 'Falta el consumo.');
  const c = (await listar(T.consumos, [FC.usuario, FC.botella, FC.fecha], `RECORD_ID()='${id}'`))[0];
  if (!c) throw new Rechazo(404, 'No encontramos esa apertura.');
  const bt = (await listar(TBL.botellas, [FLD.bCava], `RECORD_ID()='${s1(c.fields[FC.botella])}'`))[0];
  const cx = await contexto(u, s1(bt?.fields[FLD.bCava]));
  const mio = cx.esDueno || s1(c.fields[FC.usuario]) === u.id;
  const recien = mio && cx.individual && Date.now() - new Date(c.createdTime).getTime() <= SEG_DESHACER * 1000;
  if (!recien && !puedeDeshacerConsumo(u, cx.individual, mio, String(c.fields[FC.fecha] ?? ''))) throw new Rechazo(403, 'No podés deshacer esta apertura.');
  // los puntajes vinculados se borran primero; la botella vuelve sola a la cava (En guarda = Cantidad menos consumos)
  const votos = await votosDe(new Set([id]));
  if (votos.length && !b.conPuntaje) throw new Rechazo(409, 'Esa botella ya tiene puntaje.');
  if (votos.length) await borrar(T.puntajes, votos.map(v => v.id));
  await borrar(T.consumos, [id]);
  return { ok: true };
}

// ── POST responder: "Voy" / "No voy" ──
async function responder(u: Usuario, b: any) {
  const id = String(b.juntada ?? '');
  if (!ID.test(id)) throw new Rechazo(400, 'Falta la juntada.');
  const j = (await listar(T.juntadas, [FJ.cava, FJ.estado, FJ.van, FJ.noVan], `RECORD_ID()='${id}'`))[0];
  if (!j) throw new Rechazo(404, 'No encontramos esa juntada.');
  const cx = await contexto(u, s1(j.fields[FJ.cava]));
  if (cx.individual || !cx.socios.includes(u.id)) throw new Rechazo(403, 'Sólo los socios de la cava pueden responder.');
  if (!esProgramada(j)) throw new Rechazo(403, 'Esa juntada ya no está programada.');
  const va = b.va === true;
  await guardarRespuesta(j, u.id, va);
  return { ok: true, va };
}
// "Voy" agrega a Van y saca de No van; "No voy", al revés. Devuelve cuántos van.
async function guardarRespuesta(j: any, usuario: string, va: boolean) {
  const sin = (xs: string[]) => xs.filter(x => x !== usuario);
  const van = sin((j.fields[FJ.van] ?? []) as string[]), noVan = sin((j.fields[FJ.noVan] ?? []) as string[]);
  const nuevosVan = va ? [...van, usuario] : van;
  await cambiar(T.juntadas, [{ id: j.id, fields: { [FJ.van]: nuevosVan, [FJ.noVan]: va ? noVan : [...noVan, usuario] } }]);
  return nuevosVan.length;
}

// ── POST borrar: primero los puntajes, después los consumos y al final la juntada (las fotos se van con el registro) ──
async function borrarJuntada(u: Usuario, b: any) {
  const id = String(b.juntada ?? '');
  if (!ID.test(id)) throw new Rechazo(400, 'Falta la juntada.');
  const j = (await listar(T.juntadas, [FJ.cava, FJ.estado, FJ.consumos, FJ.fecha, FJ.hora, FJ.sede, FJ.maridaje, FJ.designados], `RECORD_ID()='${id}'`))[0];
  if (!j) throw new Rechazo(404, 'No encontramos esa juntada.');
  const cx = await contexto(u, s1(j.fields[FJ.cava]));
  if (cx.individual) throw new Rechazo(400, 'Esa no es una juntada de una cava grupal.');
  const avisar = b.avisar === true && esProgramada(j);
  const datos = avisar ? datosDeRegistro(cx.titulo, j, new Map()) : null;
  if (!u.admin && !(cx.esPresidente && esProgramada(j))) throw new Rechazo(403, 'Sólo un Admin puede borrar una juntada que ya se hizo.');
  const consumos = (j.fields[FJ.consumos] ?? []) as string[];
  const votos = await votosDe(new Set(consumos));
  if (votos.length) await borrar(T.puntajes, votos.map(v => v.id));
  if (consumos.length) await borrar(T.consumos, consumos);
  await borrar(T.juntadas, [id]);
  const envio = datos ? await sinFrenar(async () => mandarMails((await destinatarios(cx.socios)).map(x => ({ para: x.email, ...armarSuspension(datos, { nombre: x.nombre, app: linkApp() }) })))) : {};
  return { ok: true, ...envio };
}

// ── POST recordar: si la invitación no salió, a todos los socios (y queda anotada); si salió, sólo a los que no respondieron ──
async function recordar(u: Usuario, b: any) {
  const id = String(b.juntada ?? '');
  if (!ID.test(id)) throw new Rechazo(400, 'Falta la juntada.');
  const j = (await listar(T.juntadas, [FJ.cava, FJ.estado, FJ.fecha, FJ.hora, FJ.sede, FJ.maridaje, FJ.designados, FJ.van, FJ.noVan, FJ.invitada], `RECORD_ID()='${id}'`))[0];
  if (!j) throw new Rechazo(404, 'No encontramos esa juntada.');
  const cx = await contexto(u, s1(j.fields[FJ.cava]));
  if (!cx.puedeArmar) throw new Rechazo(403, 'Sólo el Presidente o un Admin pueden mandar el recordatorio.');
  if (!esProgramada(j)) throw new Rechazo(403, 'Esa juntada ya no está programada.');
  const invitada = !!j.fields[FJ.invitada];
  const respondieron = new Set([...((j.fields[FJ.van] ?? []) as string[]), ...((j.fields[FJ.noVan] ?? []) as string[])]);
  const faltan = invitada ? cx.socios.filter(x => !respondieron.has(x)) : cx.socios;
  if (!faltan.length) return { ok: true, mails: 0 };
  const botPor = new Map((await botellasDe(cx.cavaId)).map(x => [x.id, x]));
  const mails = await mandarInvitacion(id, datosDeRegistro(cx.titulo, j, botPor), faltan, invitada ? { recordatorio: true } : {});
  if (!invitada && mails) await anotarInvitacion(id);
  return { ok: true, mails };
}

// ── POST prueba: la invitación como quedaría, sólo al mail del Admin; sus links no guardan nada ──
async function prueba(u: Usuario, b: any) {
  if (!u.admin) throw new Rechazo(403, 'Sólo un Admin puede mandarse una prueba.');
  const cx = await contexto(u, String(b.cava ?? ''));
  const fecha = String(b.fecha ?? '');
  if (!FECHA.test(fecha)) throw new Rechazo(400, 'Revisá la fecha.');
  const hora = String(b.hora ?? '').trim(), sede = String(b.sede ?? '').trim().slice(0, 200);
  if (hora && !HORA.test(hora)) throw new Rechazo(400, 'Revisá la hora (por ejemplo, 21:00).');
  const email = normalizarMail(u.email);
  if (!email) throw new Rechazo(400, 'Tu usuario no tiene un mail cargado.');
  const botPor = new Map((await botellasDe(cx.cavaId)).map(x => [x.id, x]));
  const designados = [...new Set(((b.vinos ?? []) as unknown[]).map(String))];
  const datos = datosMail(cx.titulo, { fecha, hora, sede, maridaje: String(b.maridaje ?? '').slice(0, 2000), designados }, botPor);
  const base = { u: u.id, j: ID.test(String(b.juntada ?? '')) ? String(b.juntada) : 'prueba', p: 1 as const, f: fecha, h: hora, s: sede, c: cx.titulo };
  const m = armarInvitacion(datos, { nombre: primerNombre(u.nombre), links: { va: linkRsvp({ ...base, r: 'va' }), no: linkRsvp({ ...base, r: 'no' }), app: linkApp() } }, { prueba: true });
  await mandarMails([{ para: email, ...m }]);
  return { ok: true, mails: 1 };
}

// ── sin sesión: la página de "Voy / No voy" que abren los botones del mail ──
// Valida la firma, que la juntada siga programada y que la persona sea socia de esa cava. Devuelve sólo lo que muestra la página.
async function leerRsvp(t: unknown) {
  const d = verificar<TokenRsvp>(typeof t === 'string' ? t : '', RSVP);
  if (!d || !ID.test(String(d.u)) || (d.r !== 'va' && d.r !== 'no')) throw new Rechazo(400, 'Este link no es válido.');
  const u = await usuarioPorId(d.u);
  if (!u) throw new Rechazo(400, 'Este link no es válido.');
  const otro = firmar({ ...d, r: d.r === 'va' ? 'no' : 'va' }, RSVP);
  const base = { nombre: primerNombre(u.nombre), respuesta: d.r, otro, app: linkApp() };
  if (d.p === 1) return { u, d, j: null, vista: { ...base, prueba: true, fecha: d.f ?? '', hora: d.h ?? '', sede: d.s ?? '', cava: d.c ?? '' } };
  if (!ID.test(String(d.j))) throw new Rechazo(400, 'Este link no es válido.');
  const j = (await listar(T.juntadas, [FJ.cava, FJ.estado, FJ.fecha, FJ.hora, FJ.sede, FJ.van, FJ.noVan], `RECORD_ID()='${d.j}'`))[0];
  if (!j || !esProgramada(j)) return { u, d, j: null, vista: { vencida: true, app: linkApp() } };
  let cx;
  try { cx = await contexto(u, s1(j.fields[FJ.cava])); } catch { throw new Rechazo(403, 'Este link no es válido.'); }
  if (cx.individual || !cx.socios.includes(u.id)) throw new Rechazo(403, 'Este link no es válido.');
  const van = (j.fields[FJ.van] ?? []) as string[], noVan = (j.fields[FJ.noVan] ?? []) as string[];
  return {
    u, d, j, cx, vista: {
      ...base, fecha: String(j.fields[FJ.fecha] ?? ''), hora: String(j.fields[FJ.hora] ?? ''), sede: String(j.fields[FJ.sede] ?? ''), cava: cx.titulo,
      actual: van.includes(u.id) ? 'va' : noVan.includes(u.id) ? 'no' : null, confirmados: van.length, total: cx.socios.length,
    },
  };
}
async function rsvpVer(b: any) { return (await leerRsvp(b.t)).vista; }
async function rsvpGuardar(b: any) {
  const r = await leerRsvp(b.t);
  if ('vencida' in r.vista) return r.vista;
  if (!r.j) return { ...r.vista, guardado: false };   // la prueba del Admin: no se guarda nada
  const confirmados = await guardarRespuesta(r.j, r.u.id, r.d.r === 'va');
  return { ...r.vista, guardado: true, actual: r.d.r, confirmados };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  const accion = String(req.query?.accion ?? '');
  try {
    if (accion === 'rsvp-ver' || accion === 'rsvp') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
      const b = await leerJson(req);
      return res.status(200).json(await (accion === 'rsvp' ? rsvpGuardar(b) : rsvpVer(b)));
    }
    const u = await sesionDe(req);
    if (!u) return res.status(401).json({ error: 'Entrá con tu mail.' });
    if (req.method === 'GET') {
      if (accion === 'estado') return res.status(200).json(await estado(u, String(req.query?.cava ?? '')));
      if (accion === 'fotos') return res.status(200).json(await fotos(u, String(req.query?.juntada ?? '')));
      return res.status(404).json({ error: 'No existe' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const b = await leerJson(req);
    const acciones: Record<string, (u: Usuario, b: any) => Promise<object>> = { armar, votar, foto: subirFoto, portada, abrir, deshacer, responder, borrar: borrarJuntada, recordar, prueba };
    if (!acciones[accion]) return res.status(404).json({ error: 'No existe' });
    return res.status(200).json(await acciones[accion](u, b));
  } catch (e) {
    if (e instanceof Rechazo) return res.status(e.estado).json({ error: e.message, ...e.extra });
    console.error('[api/juntadas]', accion, String(e).slice(0, 200));
    return res.status(500).json({ error: 'No pudimos guardar. Probá de nuevo en unos minutos.' });
  }
}
