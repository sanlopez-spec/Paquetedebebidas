// Mails de la juntada programada: invitación, aviso de cambios y suspensión. Acá sólo se arma el texto y el HTML
// (sin red, así se pueden revisar sin mandar nada); el envío es mandarMails() de sesion.ts, con Resend.
// Todo lo que viene de la base (nombres, sede, maridaje, vinos) se escapa antes de entrar al HTML.

export interface VinoMail { vino: string; cepa: string; anada: number | null }
export interface DatosMail { cava: string; fecha: string; hora: string; sede: string; maridaje: string; vinos: VinoMail[] }
export interface ParaMail {
  nombre: string;                                       // el primer nombre
  links: { va: string; no: string; app: string };      // los dos links firmados de esta persona y la app
  respuesta?: 'va' | 'no' | null;                      // en el aviso de cambios: lo que ya respondió
}
export interface Mail { asunto: string; html: string; text: string }

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const aFecha = (f: string) => { const [y, m, d] = f.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
// "jueves 26/11"
export const diaCorto = (f: string) => `${DIAS[aFecha(f).getUTCDay()]} ${Number(f.slice(8, 10))}/${f.slice(5, 7)}`;
// "Jueves 26 de noviembre"
export const diaLargo = (f: string) => { const d = aFecha(f); const t = `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`; return t.charAt(0).toUpperCase() + t.slice(1); };
export const primerNombre = (n: string) => n.trim().split(/\s+/)[0] || '';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
// la cepa como se lee en la juntada: "Blend" en los cortes, "Blend blanco" si es blanco
const cepaCorta = (c: string) => (/^blend( tinto)?$/i.test(c.trim()) ? 'Blend' : /^blend blanco$/i.test(c.trim()) ? 'Blend blanco' : c.trim());
// "Bressia Conjuro Blend 2017 · va a tener 9 años" (la cepa no se repite si ya está en el nombre)
export function lineaVino(v: VinoMail, anioJuntada: number) {
  const cepa = cepaCorta(v.cepa);
  const nombre = [v.vino, cepa && !v.vino.toLowerCase().includes(cepa.toLowerCase()) ? cepa : '', v.anada ?? ''].filter(Boolean).join(' ');
  const edad = v.anada ? anioJuntada - v.anada : null;
  return edad != null && edad >= 0 ? `${nombre} · va a tener ${edad} ${edad === 1 ? 'año' : 'años'}` : nombre;
}

// Lo que cambió entre dos versiones de la juntada (fecha, hora, sede o vinos). Maridaje y notas no cuentan.
export type Campo = 'fecha' | 'hora' | 'sede' | 'vinos';
export function cambiosEntre(antes: DatosMail, ahora: DatosMail): Campo[] {
  const out: Campo[] = [];
  if (antes.fecha !== ahora.fecha) out.push('fecha');
  if (antes.hora.trim() !== ahora.hora.trim()) out.push('hora');
  if (antes.sede.trim() !== ahora.sede.trim()) out.push('sede');
  const clave = (vs: VinoMail[]) => vs.map(v => `${v.vino}|${v.anada ?? ''}`).join('·');
  if (clave(antes.vinos) !== clave(ahora.vinos)) out.push('vinos');
  return out;
}
const textoCambio = (c: Campo, j: DatosMail) =>
  c === 'fecha' ? `Nueva fecha: ${diaLargo(j.fecha)}` : c === 'hora' ? (j.hora ? `Nueva hora: ${j.hora}` : 'Ya no tiene hora fija')
    : c === 'sede' ? (j.sede ? `Nueva sede: ${j.sede}` : 'Sede a confirmar') : 'Cambiaron los vinos designados';

// colores y letras del club (con fallback de sistema)
const C = { crema: '#f2ead8', crema2: '#e9dfc7', bordo: '#A8384F', tinta: '#241318', gris: '#6a5d52', linea: '#d6c9ad', dorado: '#a9843c' };
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
function marco(cuerpo: string, previa: string) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Club EDB</title></head>
<body style="margin:0;padding:0;background:${C.crema2}">
<div style="display:none;max-height:0;overflow:hidden">${esc(previa)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.crema2}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.crema};border:1px solid ${C.linea};border-radius:14px">
<tr><td style="padding:16px 22px;border-bottom:1px solid ${C.linea};font-family:${SERIF};font-size:16px;font-weight:bold;color:${C.tinta}">Club EDB</td></tr>
<tr><td style="padding:22px;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.tinta}">${cuerpo}</td></tr>
</table></td></tr></table></body></html>`;
}
const boton = (href: string, texto: string, lleno: boolean) =>
  `<a href="${esc(href)}" style="display:block;padding:14px 10px;border-radius:10px;border:2px solid ${C.bordo};background:${lleno ? C.bordo : 'transparent'};color:${lleno ? '#ffffff' : C.bordo};font-family:${SANS};font-size:17px;font-weight:bold;text-align:center;text-decoration:none">${esc(texto)}</a>`;
const marca = (txt: string, cambio: boolean) => (cambio ? `<span style="color:${C.bordo};font-weight:bold">${txt}</span>` : txt);

// ── la invitación (también el aviso de cambios, con `cambios`, y la prueba del Admin, con `prueba`) ──
export function armarInvitacion(j: DatosMail, p: ParaMail, op: { cambios?: Campo[]; prueba?: boolean; recordatorio?: boolean } = {}): Mail {
  const cambios = op.cambios ?? [];
  const cambio = new Set(cambios);
  const anio = Number(j.fecha.slice(0, 4));
  const asunto = `${op.prueba ? 'PRUEBA · ' : ''}${cambios.length ? `Cambió la juntada del ${diaCorto(j.fecha)}` : `Juntada del ${diaCorto(j.fecha)} · ${j.cava}`}`;
  const vinos = j.vinos.map((v, i) => `${i + 1}. ${lineaVino(v, anio)}`);
  const ya = p.respuesta === 'va' ? 'Ya confirmaste que vas.' : p.respuesta === 'no' ? 'Ya avisaste que no vas.' : '';
  const html = marco(`
${op.prueba ? `<p style="margin:0 0 16px;padding:10px 12px;border-radius:8px;background:${C.dorado};color:#ffffff;font-weight:bold;text-align:center">PRUEBA · solo te llegó a vos</p>` : ''}
<p style="margin:0 0 14px">Hola ${esc(p.nombre)},</p>
${cambios.length ? `<div style="margin:0 0 16px;padding:12px 14px;border-radius:8px;border:1px solid ${C.bordo};background:#ffffff">
  <p style="margin:0 0 6px;font-weight:bold;color:${C.bordo}">Hubo cambios en la juntada</p>
  ${cambios.map(c => `<p style="margin:0">${esc(textoCambio(c, j))}</p>`).join('')}</div>`
    : `<p style="margin:0 0 16px">${op.recordatorio ? 'Te recordamos la próxima juntada de' : 'Te invitamos a la próxima juntada de'} ${esc(j.cava)}.</p>`}
<p style="margin:0;font-family:${SERIF};font-size:26px;line-height:1.2;color:${C.tinta}">${marca(esc(diaLargo(j.fecha)), cambio.has('fecha'))}</p>
${j.hora ? `<p style="margin:4px 0 0;font-family:${SERIF};font-size:19px;color:${C.bordo}">${marca(esc(j.hora) + ' h', cambio.has('hora'))}</p>` : ''}
${j.sede ? `<p style="margin:10px 0 0">Sede: ${marca(esc(j.sede), cambio.has('sede'))}</p>` : ''}
${j.maridaje ? `<p style="margin:4px 0 0">Maridaje: ${esc(j.maridaje)}</p>` : ''}
${vinos.length ? `<p style="margin:20px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${C.gris}">${marca('Vinos designados', cambio.has('vinos'))}</p>
${vinos.map(v => `<p style="margin:0 0 4px">${esc(v)}</p>`).join('')}` : ''}
<div style="margin:24px 0 0">
${ya
    ? `<p style="margin:0;font-weight:bold;color:${C.bordo}">${esc(ya)} <a href="${esc(p.respuesta === 'va' ? p.links.no : p.links.va)}" style="color:${C.bordo};font-weight:normal">Cambiar</a></p>`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td width="50%" style="padding-right:6px">${boton(p.links.va, 'Voy', true)}</td>
  <td width="50%" style="padding-left:6px">${boton(p.links.no, 'No voy', false)}</td></tr></table>`}
</div>
<p style="margin:22px 0 0;font-size:13px"><a href="${esc(p.links.app)}" style="color:${C.gris}">Ver la juntada en la app</a></p>`,
    `${diaLargo(j.fecha)}${j.hora ? ` · ${j.hora}` : ''}${j.sede ? ` · ${j.sede}` : ''}`);
  const text = [
    op.prueba ? 'PRUEBA · solo te llegó a vos\n' : '',
    `Hola ${p.nombre},`, '',
    cambios.length ? `Hubo cambios en la juntada:\n${cambios.map(c => `- ${textoCambio(c, j)}`).join('\n')}\n` : `${op.recordatorio ? 'Te recordamos' : 'Te invitamos a'} la próxima juntada de ${j.cava}.\n`,
    diaLargo(j.fecha) + (j.hora ? ` · ${j.hora} h` : ''),
    j.sede ? `Sede: ${j.sede}` : '', j.maridaje ? `Maridaje: ${j.maridaje}` : '',
    vinos.length ? `\nVinos designados:\n${vinos.join('\n')}` : '', '',
    ya ? `${ya} Para cambiar: ${p.respuesta === 'va' ? p.links.no : p.links.va}` : `Voy: ${p.links.va}\nNo voy: ${p.links.no}`, '',
    `Ver la juntada en la app: ${p.links.app}`,
  ].filter(x => x !== '').join('\n');
  return { asunto, html, text };
}

// ── la suspensión: corta y sin botones ──
export function armarSuspension(j: DatosMail, p: { nombre: string; app: string }): Mail {
  const asunto = `Se suspendió la juntada del ${diaCorto(j.fecha)}`;
  const html = marco(`
<p style="margin:0 0 14px">Hola ${esc(p.nombre)},</p>
<p style="margin:0 0 14px">La juntada de ${esc(j.cava)} del <b>${esc(diaLargo(j.fecha))}</b>${j.sede ? ` en ${esc(j.sede)}` : ''} se suspendió.</p>
<p style="margin:0 0 0">Cuando se arme la próxima, te llega la invitación.</p>
<p style="margin:22px 0 0;font-size:13px"><a href="${esc(p.app)}" style="color:${C.gris}">Ir a la app</a></p>`, asunto);
  const text = `Hola ${p.nombre},\n\nLa juntada de ${j.cava} del ${diaLargo(j.fecha)}${j.sede ? ` en ${j.sede}` : ''} se suspendió.\nCuando se arme la próxima, te llega la invitación.\n\n${p.app}`;
  return { asunto, html, text };
}
