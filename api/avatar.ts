// Avatar de una cava (foto redonda del recuadro de perfil).
//   GET  /api/avatar?cava=<id>   con sesión de socio de esa cava: redirect 302 a la miniatura (las URLs de los adjuntos de
//                                Airtable vencen en horas, igual que en api/juntada-foto, así que no viajan en ningún JSON).
//   POST /api/avatar             { cava, imagen } con la foto ya recortada a 512×512 JPG en base64: sólo el Presidente
//                                y el Admin (grupales) o el dueño y el Admin (individuales). Reemplaza el avatar anterior.
// Se sube con el mismo mecanismo que scripts/subir-foto-juntada.mjs (uploadAttachment de Airtable).
import { BASE_ID, FLD, TBL, cavasDe, leerJson, listar, sesionDe } from './_lib/sesion.js';

const MAX_BYTES = 1_500_000;   // una foto de 512×512 pesa unos 60 KB; esto es sólo un tope de seguridad

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const u = await sesionDe(req);
    if (!u) return res.status(401).json({ error: 'Entrá con tu mail para ver o cambiar el avatar.' });

    const body = req.method === 'POST' ? await leerJson(req) : {};
    const cavaId = String((req.method === 'POST' ? body.cava : req.query?.cava) ?? '');
    if (!/^rec[A-Za-z0-9]{14}$/.test(cavaId)) return res.status(400).json({ error: 'Falta la cava.' });
    const cava = (await cavasDe(u)).find(c => c.id === cavaId);
    if (!cava) return res.status(403).json({ error: 'No sos miembro de esa cava.' });

    if (req.method === 'GET') {
      const reg = (await listar(TBL.cavas, [FLD.cAvatar], `RECORD_ID()='${cavaId}'`))[0];
      const foto = ((reg?.fields[FLD.cAvatar] ?? []) as any[])[0];
      if (!foto) return res.status(404).json({ error: 'sin_avatar' });
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Location', foto.thumbnails?.large?.url ?? foto.url);
      return res.status(302).end();
    }

    if (!cava.puedeAvatar) return res.status(403).json({ error: 'No tenés permiso para cambiar el avatar de esta cava.' });
    const b64 = String(body.imagen ?? '').replace(/^data:image\/jpeg;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length || buf.length > MAX_BYTES || !(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) {
      return res.status(400).json({ error: 'La foto no es válida. Probá con otra.' });
    }
    const token = process.env.AIRTABLE_TOKEN;
    if (!token) throw new Error('config: falta AIRTABLE_TOKEN');
    const cab = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const sube = await fetch(`https://content.airtable.com/v0/${BASE_ID}/${cavaId}/${FLD.cAvatar}/uploadAttachment`, {
      method: 'POST', headers: cab, body: JSON.stringify({ contentType: 'image/jpeg', file: buf.toString('base64'), filename: `avatar-${Date.now()}.jpg` }),
    });
    if (!sube.ok) throw new Error(`Airtable uploadAttachment ${sube.status}`);
    const rec = await sube.json() as any;
    const adjuntos = (rec.fields?.[FLD.cAvatar] ?? []) as { id: string }[];
    const nuevo = adjuntos[adjuntos.length - 1];
    if (!nuevo) throw new Error('la subida no devolvió el adjunto');
    // dejar sólo el nuevo: reemplaza al anterior
    const quita = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TBL.cavas}/${cavaId}`, {
      method: 'PATCH', headers: cab, body: JSON.stringify({ fields: { [FLD.cAvatar]: [{ id: nuevo.id }] } }),
    });
    if (!quita.ok) throw new Error(`Airtable reemplazo ${quita.status}`);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[api/avatar]', String(e).slice(0, 200));
    return res.status(500).json({ error: 'No pudimos guardar la foto. Probá de nuevo en unos minutos.' });
  }
}
