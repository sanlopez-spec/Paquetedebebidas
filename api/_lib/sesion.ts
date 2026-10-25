// Login de socios del Club EDB: piezas comunes (firma, cookies, Airtable, permisos).
// Lo usan api/auth.ts y api/montos.ts. El token de Airtable y las claves viven sólo acá, en el servidor.
//
// Variables de entorno:
//   AIRTABLE_TOKEN   (ya existe)
//   SESSION_SECRET   clave larga y secreta para firmar el código y la sesión
//   RESEND_API_KEY   clave de Resend para mandar los mails
//   MAIL_FROM        (opcional) remitente; por defecto "Club EDB <acceso@edb.com.ar>"
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const BASE_ID = 'appag1VLp4aN3tD3v';
export const TBL = {
  usuarios: 'tblrs54qDQH1JAHRW', membresias: 'tblETY9OBswoLrsxM', cavas: 'tblMlk7zZG5WreEL5',
  grupos: 'tblfSnuEMHR1Arqbj', botellas: 'tblZIXNa2Ck3DNCwS', accesos: 'tbljIluBHiw9LH9mK',
} as const;
export const FLD = {
  // Usuarios
  uNombre: 'fldCyrZEH75CRuq6x', uEmail: 'fldp0uizp9t8JvXCS', uCavas: 'fld1sO3OOK444XADq',
  uMembresias: 'fldnSq2ATcvPm5Nm5', uAdmin: 'fldT2xWZIM0gJ9fMX',
  // Membresias
  mUsuario: 'fld0RfCA3DA1WMMsH', mGrupo: 'fldgzZDW42nHsMBpw',
  // Cavas
  cNombre: 'fldg3OXbdsSUUX7BR', cTipo: 'fld1U9iCxg0ZpHXCW', cGrupo: 'fldB25kKxMcB1SiHH', cUsuario: 'fld21IIvt8fvxpIe4',
  // Grupos
  gMiembros: 'fldQwFVmww5t8pPox', gCavas: 'fldDWdXHioZarWZbP',
  // Botellas
  bVino: 'fldUZflAbSpmIdK20', bAnada: 'fldKC7gp51yfg7wtF', bCava: 'fldekIJ54IKI1gd2R',
  bComprada: 'fldm87g7J9lHhI8pM', bEnGuarda: 'fldMTLDQLjYDZQRa2',
  bPagadoUSD: 'fldv4njMaHOaG2yOY', bValorUSD: 'fldDj8MZ9uvXAHtbf',
  bGananciaClub: 'fldmtzdD4FW0kMBPh', bGananciaEstiba: 'fld3TVr6pcCoNFBdW',
  // Accesos
  aClave: 'fld7L5C0pK9zNI1bd', aTipo: 'fldhdh18ayOyj9nj1', aTs: 'fldWt3h7ihItoNczY',
} as const;

export const COOKIE_SESION = 'edb_sesion';
export const COOKIE_DESAFIO = 'edb_desafio';
export const SESION_DIAS = 90;
export const CODIGO_MIN = 10;          // el código vence a los 10 minutos
export const MAX_INTENTOS = 5;
export const MAX_PEDIDOS_MAIL = 3;      // por mail, cada 15 minutos
export const MAX_PEDIDOS_IP = 12;       // por IP, cada hora

// ── base64url y firma ─────────────────────────────────────────────
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export function secreto(): string {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('config: falta SESSION_SECRET (32 caracteres o más)');
  return s;
}
function hmac(clave: string, dato: string): Buffer {
  return createHmac('sha256', clave).update(dato).digest();
}
function iguales(a: Buffer | string, b: Buffer | string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
// Un valor firmado: "<datos>.<firma>". El propósito entra en la firma, así una cookie no vale como otra.
export function firmar(datos: object, proposito: string): string {
  const cuerpo = b64u(JSON.stringify(datos));
  return `${cuerpo}.${b64u(hmac(secreto(), `${proposito}.${cuerpo}`))}`;
}
export function verificar<T = any>(valor: string | undefined, proposito: string): T | null {
  if (!valor) return null;
  const i = valor.indexOf('.');
  if (i < 1) return null;
  const cuerpo = valor.slice(0, i), firma = valor.slice(i + 1);
  let esperada: string;
  try { esperada = b64u(hmac(secreto(), `${proposito}.${cuerpo}`)); } catch { return null; }
  if (!iguales(firma, esperada)) return null;
  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    if (typeof d?.x === 'number' && d.x < Date.now()) return null;   // vencida
    return d as T;
  } catch { return null; }
}
export function nuevoNonce(): string { return randomBytes(12).toString('base64url'); }
// El código de 6 dígitos se calcula a partir del desafío firmado: no se guarda en ningún lado.
export function codigoDe(nonce: string, email: string): string {
  const n = hmac(secreto(), `codigo|${nonce}|${email}`).readUInt32BE(0) % 1_000_000;
  return String(n).padStart(6, '0');
}
export const huella = (s: string) => sha(`${s}|${process.env.SESSION_SECRET ?? ''}`).slice(0, 32);

// ── cookies ───────────────────────────────────────────────────────
export function leerCookies(req: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const par of String(req.headers?.cookie ?? '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}
export function cookie(nombre: string, valor: string, segundos: number, path = '/'): string {
  return `${nombre}=${encodeURIComponent(valor)}; Max-Age=${segundos}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}
export const borrarCookie = (nombre: string, path = '/') => cookie(nombre, '', 0, path);
export function ponerCookies(res: any, ...cookies: string[]) { res.setHeader('Set-Cookie', cookies); }

export async function leerJson(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}
export function ipDe(req: any): string {
  return String(req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress ?? '').split(',')[0].trim() || 'sin-ip';
}
export function normalizarMail(v: unknown): string | null {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (e.length < 5 || e.length > 120) return null;
  return /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/.test(e) ? e : null;
}
export const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

// ── Airtable ──────────────────────────────────────────────────────
function token(): string {
  const t = process.env.AIRTABLE_TOKEN;
  if (!t) throw new Error('config: falta AIRTABLE_TOKEN');
  return t;
}
async function airtable(tabla: string, params: URLSearchParams | null, init?: RequestInit): Promise<any> {
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tabla}`);
  if (params) params.forEach((v, k) => url.searchParams.append(k, v));
  const r = await fetch(url.toString(), { ...init, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`Airtable ${tabla} ${r.status}`);
  return r.json();
}
export async function listar(tabla: string, campos: string[], formula?: string): Promise<any[]> {
  const out: any[] = [];
  let offset: string | undefined;
  do {
    const p = new URLSearchParams({ returnFieldsByFieldId: 'true', pageSize: '100' });
    for (const c of campos) p.append('fields[]', c);
    if (formula) p.set('filterByFormula', formula);
    if (offset) p.set('offset', offset);
    const j = await airtable(tabla, p);
    out.push(...j.records);
    offset = j.offset;
  } while (offset);
  return out;
}
const porIds = (ids: string[]) => ids.length ? `OR(${ids.map(i => `RECORD_ID()='${i.replace(/[^A-Za-z0-9]/g, '')}'`).join(',')})` : `FALSE()`;

// ── permisos: quién es, a qué cavas entra ─────────────────────────
export interface Usuario { id: string; nombre: string; email: string; admin: boolean }
export interface CavaAcceso { id: string; nombre: string; tipo: string; miembros: number }

export async function usuarioPorMail(email: string): Promise<Usuario | null> {
  const r = await listar(TBL.usuarios, [FLD.uNombre, FLD.uEmail, FLD.uAdmin], `LOWER({Email})='${email}'`);
  const u = r[0];
  return u ? aUsuario(u) : null;
}
export async function usuarioPorId(id: string): Promise<Usuario | null> {
  const r = await listar(TBL.usuarios, [FLD.uNombre, FLD.uEmail, FLD.uAdmin], porIds([id]));
  return r[0] ? aUsuario(r[0]) : null;
}
function aUsuario(r: any): Usuario {
  return { id: r.id, nombre: String(r.fields[FLD.uNombre] ?? '').trim(), email: String(r.fields[FLD.uEmail] ?? '').trim().toLowerCase(), admin: r.fields[FLD.uAdmin] === true };
}

// Las cavas de una persona: las individuales (suyas) y las de los grupos donde tiene membresía. Un admin ve todas.
export async function cavasDe(u: Usuario): Promise<CavaAcceso[]> {
  const todas = await listar(TBL.cavas, [FLD.cNombre, FLD.cTipo, FLD.cGrupo, FLD.cUsuario]);
  let permitidas: any[];
  if (u.admin) {
    permitidas = todas;
  } else {
    const ms = await listar(TBL.membresias, [FLD.mUsuario, FLD.mGrupo]);
    const grupos = new Set<string>();
    for (const m of ms) if ((m.fields[FLD.mUsuario] ?? []).includes(u.id)) for (const g of m.fields[FLD.mGrupo] ?? []) grupos.add(g);
    permitidas = todas.filter(c => (c.fields[FLD.cUsuario] ?? []).includes(u.id) || (c.fields[FLD.cGrupo] ?? []).some((g: string) => grupos.has(g)));
  }
  const gruposIds = [...new Set(permitidas.flatMap(c => c.fields[FLD.cGrupo] ?? []))] as string[];
  const gr = gruposIds.length ? await listar(TBL.grupos, [FLD.gMiembros], porIds(gruposIds)) : [];
  const miembrosDe = new Map(gr.map(g => [g.id, Number(g.fields[FLD.gMiembros]) || 1]));
  return permitidas.map(c => {
    const g = (c.fields[FLD.cGrupo] ?? [])[0];
    return {
      id: c.id, nombre: String(c.fields[FLD.cNombre] ?? ''), tipo: String(c.fields[FLD.cTipo]?.name ?? c.fields[FLD.cTipo] ?? ''),
      miembros: g ? (miembrosDe.get(g) ?? 1) : 1,
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// La sesión de la cookie → la persona (siempre se vuelve a leer de Airtable: si la sacan de la tabla, deja de entrar).
export async function sesionDe(req: any): Promise<Usuario | null> {
  let d: { u?: string } | null;
  try { d = verificar(leerCookies(req)[COOKIE_SESION], 'sesion'); } catch { return null; }
  if (!d?.u) return null;
  return usuarioPorId(d.u);
}
export function cookieSesion(usuarioId: string): string {
  const x = Date.now() + SESION_DIAS * 86400_000;
  return cookie(COOKIE_SESION, firmar({ u: usuarioId, x }, 'sesion'), SESION_DIAS * 86400);
}

// ── límites: pedidos e intentos ───────────────────────────────────
// Dos capas: memoria del servidor (siempre anda) y la tabla Accesos de Airtable (si el token puede escribir).
const memoria = new Map<string, number[]>();
let escribeAirtable: boolean | null = null;   // null = todavía no probamos
export async function contar(clave: string, tipo: string, ventanaMs: number): Promise<number> {
  const desde = Date.now() - ventanaMs;
  const local = (memoria.get(`${tipo}|${clave}`) ?? []).filter(t => t > desde).length;
  let remoto = 0;
  try {
    const r = await listar(TBL.accesos, [FLD.aTs], `AND({Clave}='${clave}',{Tipo}='${tipo}',{Ts}>${desde})`);
    remoto = r.length;
  } catch { /* sin Airtable seguimos con la memoria */ }
  return Math.max(local, remoto);
}
export async function anotar(clave: string, tipo: string): Promise<void> {
  const k = `${tipo}|${clave}`;
  const ahora = Date.now();
  memoria.set(k, [...(memoria.get(k) ?? []).filter(t => t > ahora - 3600_000), ahora]);
  if (escribeAirtable === false) return;
  try {
    await airtable(TBL.accesos, null, { method: 'POST', body: JSON.stringify({ records: [{ fields: { [FLD.aClave]: clave, [FLD.aTipo]: tipo, [FLD.aTs]: ahora } }] }) });
    escribeAirtable = true;
  } catch (e) {
    if (escribeAirtable === null) console.warn('[auth] el token de Airtable no puede escribir en Accesos; los límites usan sólo la memoria del servidor');
    escribeAirtable = false;
  }
}

// ── mail ──────────────────────────────────────────────────────────
export async function mandarCodigo(email: string, codigo: string): Promise<void> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) throw new Error('config: falta RESEND_API_KEY');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM || 'Club EDB <acceso@edb.com.ar>',
      to: [email],
      subject: `Tu código para entrar al Club EDB: ${codigo}`,
      text: `Tu código para entrar al Club EDB es ${codigo}.\n\nVence en ${CODIGO_MIN} minutos. Si no lo pediste vos, ignorá este mail.`,
      html: `<div style="font-family:Georgia,serif;max-width:420px;margin:0 auto;padding:24px;color:#2b1708">
        <p style="font-size:15px;margin:0 0 12px">Tu código para entrar al <b>Club EDB</b>:</p>
        <p style="font-size:34px;letter-spacing:8px;margin:0 0 16px;color:#6B1E2E"><b>${codigo}</b></p>
        <p style="font-size:13px;color:#6a4a4f;margin:0">Vence en ${CODIGO_MIN} minutos. Si no lo pediste vos, ignorá este mail.</p></div>`,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}`);
}
