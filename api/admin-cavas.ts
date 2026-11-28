// Panel Admin del Club EDB: una sola función para todo lo del panel (Vercel Hobby tiene tope de funciones).
// Sin ?action= devuelve, como siempre, la lista de "Otras cavas" (cavas que no son del Admin) y nada más.
// Con ?action= (GET: list, detail, usuarios, comprasMes, vinos · POST: updateCava, updateUsuario, addSocio, upsertGuarda, createPago, createCava, updateLinea, addLinea, deleteLinea):
// cada acción valida la sesión y la casilla Admin; si no es Admin responde 403 y no lee ni escribe nada.
// El token de escritura de Airtable sólo vive acá (servidor). api/cava.ts (público) no se toca.
import { FLD, TBL, cavasDe, leerJson, sesionDe } from './_lib/sesion.js';
import { Mal, addLinea, comprasMes, deleteLinea, updateLinea, vinos } from './_lib/compras-admin.js';
import { P, T_GUARDA, cargarBase, escribir, primerNombre, rotuloNumero, r2, type Base, type CavaPanel } from './_lib/panel.js';

const REC = /^rec[A-Za-z0-9]{14}$/, MES = /^\d{4}-\d{2}$/, DIA = /^\d{4}-\d{2}-\d{2}$/;
const MEDIOS = ['Transferencia', 'Mercado Pago', 'Efectivo', 'Otro'];
const rec = (v: unknown, que: string) => { if (typeof v !== 'string' || !REC.test(v)) throw new Mal(`Falta ${que}.`); return v; };
const mes = (v: unknown, que: string) => { if (typeof v !== 'string' || !MES.test(v) || +v.slice(5) < 1 || +v.slice(5) > 12) throw new Mal(`${que}: mes inválido.`); return v; };
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const monto = (v: unknown, que: string) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw new Mal(`${que}: monto inválido.`); return n; };
const mail = (v: unknown) => { const e = texto(v, 120).toLowerCase(); if (!/^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/.test(e)) throw new Mal('El mail no es válido.'); return e; };
const diaUno = (m: string) => `${m}-01`;

function resumen(c: CavaPanel) {
  return {
    id: c.id, numero: c.numero, nombre: c.nombre, tipo: c.tipo, fundacion: c.fundacion, plan: c.plan, cuotaUsd: c.cuotaUsd,
    socios: c.socios.length, sociosNombres: c.socios.map(s => s.nombre), enGuarda: c.enGuarda,
    deuda: c.deuda, mesActual: c.mesActual,
  };
}

async function lista() {
  const b = await cargarBase();
  const distintos = new Set<string>();
  for (const c of b.cavas) for (const s of c.socios) distintos.add(s.id);
  const cavas = b.cavas.map(resumen);
  return {
    dolar: b.dolar, mesHoy: b.mesHoy, cavas,
    usuarios: b.usuarios.map(u => ({ id: u.id, nombre: u.nombre, email: u.email })),
    totales: {
      cavas: cavas.length, grupales: cavas.filter(c => c.tipo === 'grupal').length, individuales: cavas.filter(c => c.tipo === 'individual').length,
      catalogo: cavas.filter(c => c.tipo === 'catalogo').length, socios: distintos.size,
      cuotaUsd: cavas.reduce((t, c) => t + (c.cuotaUsd ?? 0), 0),
      deudaArs: cavas.reduce((t, c) => t + c.deuda.ars, 0), deudores: cavas.reduce((t, c) => t + c.deuda.n, 0),
    },
  };
}

function ficha(b: Base, id: string) {
  const c = b.cavas.find(x => x.id === id);
  if (!c) throw new Mal('No encontramos esa cava.', 404);
  const pagos = b.pagos.filter(p => p.cava === id).sort((a, z) => (a.fecha ? 0 : 1) - (z.fecha ? 0 : 1) || z.fecha.localeCompare(a.fecha) || z.mes.localeCompare(a.mes) || z.creado.localeCompare(a.creado))
    .map(({ cava: _c, creado: _d, ...p }) => p);
  return {
    dolar: b.dolar, hoy: b.hoy, mesHoy: b.mesHoy, cava: c, pagos,
    usuarios: b.usuarios.map(u => ({ id: u.id, nombre: u.nombre, email: u.email })),
  };
}
async function detalle(id: string) { return ficha(await cargarBase(), id); }

// ── escrituras ──
async function updateCava(d: any) {
  const id = rec(d.cava, 'la cava');
  const f: Record<string, unknown> = {};
  if ('cuotaUsd' in d) f[FLD.cCuota] = d.cuotaUsd === null || d.cuotaUsd === '' ? null : monto(d.cuotaUsd, 'Cuota mensual');
  if ('fundacion' in d) f[P.cFundacion] = d.fundacion ? diaUno(mes(d.fundacion, 'Fundación')) : null;
  if ('cuotasDesde' in d) f[FLD.cCuotasDesde] = d.cuotasDesde ? diaUno(mes(d.cuotasDesde, 'Cuotas desde')) : null;
  if ('saldoDesde' in d) f[FLD.cSaldoDesde] = d.saldoDesde ? diaUno(mes(d.saldoDesde, 'Saldo desde')) : null;
  if ('saldoInicial' in d) f[FLD.cSaldoInicial] = monto(d.saldoInicial, 'Saldo inicial');
  if ('notas' in d) f[P.cNotas] = texto(d.notas, 5000);
  if (!Object.keys(f).length) throw new Mal('No hay nada para guardar.');
  await escribir(TBL.cavas, 'PATCH', [{ id, fields: f }]);
  return detalle(id);
}

async function updateUsuario(d: any) {
  const id = rec(d.usuario, 'el socio'), cavaId = rec(d.cava, 'la cava');
  const b = await cargarBase();
  const f: Record<string, unknown> = {};
  if ('nombre' in d) { const n = texto(d.nombre, 120); if (!n) throw new Mal('Falta el nombre.'); f[FLD.uNombre] = n; }
  if ('email' in d) {
    const e = mail(d.email);
    if (b.usuarios.some(u => u.id !== id && u.email.toLowerCase() === e)) throw new Mal('Ese mail ya lo usa otra persona.');
    f[FLD.uEmail] = e;
  }
  if ('telefono' in d) f[P.uTel] = texto(d.telefono, 40);
  if ('notas' in d) f[P.uNotas] = texto(d.notas, 5000);
  if (Object.keys(f).length) await escribir(TBL.usuarios, 'PATCH', [{ id, fields: f }]);
  if ('rol' in d) {
    const c = b.cavas.find(x => x.id === cavaId), s = c?.socios.find(x => x.id === id);
    if (!['Presidente', 'Miembro'].includes(d.rol)) throw new Mal('Rol inválido.');
    if (s?.membresia) await escribir(TBL.membresias, 'PATCH', [{ id: s.membresia, fields: { [FLD.mRol]: d.rol } }]);
  }
  return detalle(cavaId);
}

async function nuevoUsuario(n: any, b: Base): Promise<string> {
  const nombre = texto(n?.nombre, 120), email = mail(n?.email);
  if (!nombre) throw new Mal('Falta el nombre.');
  if (b.usuarios.some(u => u.email.toLowerCase() === email)) throw new Mal(`Ya existe una persona con el mail ${email}: elegila de la lista.`);
  const [u] = await escribir(TBL.usuarios, 'POST', [{ fields: { [FLD.uNombre]: nombre, [FLD.uEmail]: email, ...(texto(n?.telefono, 40) ? { [P.uTel]: texto(n.telefono, 40) } : {}) } }]);
  b.usuarios.push({ id: u.id, nombre, email, telefono: texto(n?.telefono, 40), admin: false });
  return u.id;
}

async function addSocio(d: any) {
  const cavaId = rec(d.cava, 'la cava');
  const b = await cargarBase();
  const c = b.cavas.find(x => x.id === cavaId);
  if (!c || c.tipo !== 'grupal' || !c.grupoId) throw new Mal('Sólo se suman socios a una cava grupal.');
  const rol = d.rol === 'Presidente' ? 'Presidente' : 'Miembro';
  const uid = d.usuario ? rec(d.usuario, 'el socio') : await nuevoUsuario(d.nuevo, b);
  if (c.socios.some(s => s.id === uid)) throw new Mal('Esa persona ya es socia de la cava.');
  const nombre = b.usuarios.find(u => u.id === uid)?.nombre ?? '';
  await escribir(TBL.membresias, 'POST', [{ fields: { [P.mEtiqueta]: `${primerNombre(nombre)} · ${c.numero}`, [FLD.mUsuario]: [uid], [FLD.mGrupo]: [c.grupoId], [FLD.mRol]: rol, [FLD.mDesde]: b.hoy.slice(0, 7) + '-01' } }]);
  return detalle(cavaId);
}

async function upsertGuarda(d: any) {
  const cavaId = rec(d.cava, 'la cava'), m = mes(d.mes, 'Mes');
  const b = await cargarBase();
  const c = b.cavas.find(x => x.id === cavaId);
  if (!c) throw new Mal('No encontramos esa cava.', 404);
  const f: Record<string, unknown> = {};
  if ('cuotaArs' in d) f[P.xCuota] = d.cuotaArs === null || d.cuotaArs === '' ? null : monto(d.cuotaArs, 'Cuota');
  if ('guardaArs' in d) f[P.xGuarda] = monto(d.guardaArs, 'Guarda');
  const ya = c.guarda.find(g => g.mes === m);
  if (ya) await escribir(T_GUARDA, 'PATCH', [{ id: ya.id, fields: f }]);
  else await escribir(T_GUARDA, 'POST', [{ fields: { [P.xMes]: m, [P.xCava]: [cavaId], ...f } }]);
  return detalle(cavaId);
}

async function createPago(d: any) {
  const cavaId = rec(d.cava, 'la cava'), uid = rec(d.usuario, 'el socio');
  const meses: string[] = [...new Set<string>((Array.isArray(d.meses) ? d.meses : []).map((x: unknown) => mes(x, 'Mes')))].sort();
  if (!meses.length || meses.length > 36) throw new Mal('Elegí al menos un mes.');
  const medio = MEDIOS.includes(d.medio) ? d.medio : 'Transferencia';
  const fecha = typeof d.fecha === 'string' && DIA.test(d.fecha) ? d.fecha : null;
  if (!fecha) throw new Mal('Falta la fecha de pago.');
  let resto = monto(d.montoArs, 'Monto');
  if (resto <= 0) throw new Mal('El monto tiene que ser mayor a cero.');
  const b = await cargarBase();
  const c = b.cavas.find(x => x.id === cavaId);
  const s = c?.socios.find(x => x.id === uid);
  if (!c || !s) throw new Mal('Ese socio no es de esta cava.');
  if (!c.cuotaUsd || c.cuotaSocioUsd <= 0) throw new Mal('La cava no tiene cuota.');
  const filas = meses.map(m => { const x = c.mesesArs.find(y => y.mes === m); if (!x) throw new Mal(`El mes ${m} está fuera del rango de cuotas.`); return x; });
  // los meses se completan en orden; el último queda parcial; si sobra, se suma al último mes (queda a favor)
  const ars = filas.map(x => { const t = Math.min(resto, x.totalArs); resto -= t; return t; });
  if (resto > 0) ars[ars.length - 1] += resto;
  const usados = filas.map((x, i) => ({ x, ars: ars[i] })).filter(y => y.ars > 0);
  const corto = primerNombre(s.nombre), notas = texto(d.notas, 2000);
  const records = usados.map(({ x, ars: a }) => ({ fields: {
    [P.pPago]: c.tipo === 'grupal' ? `${corto} · ${x.mes}` : `${corto} · ${c.numero} · ${x.mes}`,
    [FLD.pUsuario]: [uid], [FLD.pCava]: [cavaId], [FLD.pMes]: x.mes,
    [FLD.pMonto]: r2(c.cuotaSocioUsd * (a / x.totalArs)), [P.pArs]: Math.round(a), [P.pDolar]: r2(x.dolarUsado),
    [P.pMedio]: medio, [P.pFecha]: fecha, ...(notas ? { [P.pNotas]: notas } : {}),
  } }));
  await escribir(TBL.pagos, 'POST', records);
  return detalle(cavaId);
}

async function createCava(d: any) {
  const tipo = d.tipo;
  if (!['individual', 'grupal', 'catalogo'].includes(tipo)) throw new Mal('Elegí el tipo de cava.');
  const fund = mes(d.fundacion, 'Fundación');
  // Solo catálogo (Individual sin cuota): sin cuota, sin cuotas desde ni saldo
  const cuotasDesde = tipo === 'catalogo' ? '' : mes(d.cuotasDesde, 'Cuotas desde');
  const saldoDesde = tipo === 'catalogo' ? '' : mes(d.saldoDesde, 'Saldo desde');
  const saldoInicial = tipo === 'catalogo' ? 0 : monto(d.saldoInicial ?? 0, 'Saldo inicial');
  const cuota = tipo === 'catalogo' ? null : monto(d.cuotaUsd, 'Cuota mensual');
  if (tipo !== 'catalogo' && !(cuota! > 0)) throw new Mal('Falta la cuota mensual.');
  const b = await cargarBase();
  const num = rotuloNumero(b.numeroSiguiente);
  // personas: se crean primero las nuevas (si falla una, todavía no se creó nada más)
  const entradas: { id?: string; nuevo?: any; rol: string }[] = tipo === 'grupal'
    ? (Array.isArray(d.socios) ? d.socios : []).slice(0, 40).map((s: any) => ({ id: s.id, nuevo: s.nuevo, rol: s.rol === 'Presidente' ? 'Presidente' : 'Miembro' }))
    : [{ id: d.titular?.id, nuevo: d.titular?.nuevo, rol: 'Titular' }];
  if (!entradas.length) throw new Mal(tipo === 'grupal' ? 'Sumá al menos un socio.' : 'Elegí el titular.');
  if (tipo === 'grupal' && !texto(d.nombre, 80)) throw new Mal('Falta el nombre del grupo.');
  if (entradas.filter(e => e.rol === 'Presidente').length > 1) throw new Mal('Sólo puede haber un Presidente.');
  const emails = new Set<string>();
  for (const e of entradas) {
    if (e.id) { rec(e.id, 'el socio'); if (!b.usuarios.some(u => u.id === e.id)) throw new Mal('Socio inexistente.'); }
    else { const m = mail(e.nuevo?.email); if (emails.has(m)) throw new Mal('Un mail está repetido.'); emails.add(m); }
  }
  const ids: string[] = [];
  for (const e of entradas) ids.push(e.id ?? await nuevoUsuario(e.nuevo, b));
  if (new Set(ids).size !== ids.length) throw new Mal('Una persona está repetida.');
  const campos: Record<string, unknown> = {
    [FLD.cNombre]: `Cava ${num}`, [FLD.cTipo]: tipo === 'grupal' ? 'Grupal' : 'Individual', [P.cFundacion]: diaUno(fund),
  };
  if (tipo !== 'catalogo') { campos[FLD.cSaldoInicial] = saldoInicial; campos[FLD.cSaldoDesde] = diaUno(saldoDesde); campos[FLD.cCuota] = cuota; campos[FLD.cCuotasDesde] = diaUno(cuotasDesde); }
  let grupoId: string | null = null;
  if (tipo === 'grupal') {
    const [g] = await escribir(TBL.grupos, 'POST', [{ fields: { [FLD.gNombre]: `Club EDB ${num}`, [FLD.gAlias]: texto(d.nombre, 80), [P.gFundacion]: diaUno(fund) } }]);
    grupoId = g.id; campos[FLD.cGrupo] = [g.id];
  } else campos[FLD.cUsuario] = [ids[0]];
  const [cava] = await escribir(TBL.cavas, 'POST', [{ fields: campos }]);
  if (grupoId) {
    await escribir(TBL.membresias, 'POST', ids.map((uid, i) => ({ fields: {
      [P.mEtiqueta]: `${primerNombre(b.usuarios.find(u => u.id === uid)?.nombre ?? '')} · ${num}`, [FLD.mUsuario]: [uid], [FLD.mGrupo]: [grupoId],
      [FLD.mRol]: entradas[i].rol, [FLD.mDesde]: diaUno(fund) } })));
    await escribir(T_GUARDA, 'POST', [{ fields: { [P.xMes]: b.mesHoy, [P.xCava]: [cava.id], [P.xGuarda]: 0 } }]);
  }
  return { id: cava.id, numero: num };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const u = await sesionDe(req);
    if (!u) return res.status(401).json({ error: 'Entrá con tu mail.' });
    if (!u.admin) return res.status(403).json({ error: 'Sólo para el Admin.' });
    const action = String(req.query?.action ?? '');
    if (!action) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
      const otras = (await cavasDe(u)).filter(c => !c.propia)
        .sort((a, b) => (a.dueno || a.titulo).localeCompare(b.dueno || b.titulo, 'es'));
      return res.status(200).json({ cavas: otras });
    }
    if (req.method === 'GET') {
      if (action === 'list') return res.status(200).json(await lista());
      if (action === 'detail') return res.status(200).json(await detalle(rec(String(req.query?.cava ?? ''), 'la cava')));
      if (action === 'comprasMes') return res.status(200).json(await comprasMes(rec(String(req.query?.cava ?? ''), 'la cava'), String(req.query?.mes ?? '') || undefined));
      if (action === 'vinos') return res.status(200).json(await vinos(String(req.query?.q ?? '')));
      return res.status(400).json({ error: 'Acción desconocida.' });
    }
    const d = await leerJson(req);
    const acciones: Record<string, (d: any) => Promise<unknown>> = { updateCava, updateUsuario, addSocio, upsertGuarda, createPago, createCava,
      updateLinea: (x: any) => updateLinea(rec(x.id, 'la línea'), x.campo, x.valor), addLinea, deleteLinea: (x: any) => deleteLinea(rec(x.id, 'la línea')) };
    if (!acciones[action]) return res.status(400).json({ error: 'Acción desconocida.' });
    return res.status(200).json(await acciones[action](d));
  } catch (e) {
    if (e instanceof Mal) return res.status(e.estado).json({ error: e.message });
    console.error('[api/admin-cavas]', String(e).slice(0, 300));
    return res.status(500).json({ error: 'No pudimos procesar el pedido.' });
  }
}
