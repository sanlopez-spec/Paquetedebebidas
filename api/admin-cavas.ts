// Lista de "Otras cavas" para el Admin: las cavas de la tabla Cavas que no son suyas.
// Valida la sesión y la casilla Admin; si no es Admin responde 403 y no lista nada. Sin montos.
import { cavasDe, sesionDe } from './_lib/sesion.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
  try {
    const u = await sesionDe(req);
    if (!u) return res.status(401).json({ error: 'Entrá con tu mail.' });
    if (!u.admin) return res.status(403).json({ error: 'Sólo para el Admin.' });
    const otras = (await cavasDe(u)).filter(c => !c.propia)
      .sort((a, b) => (a.dueno || a.titulo).localeCompare(b.dueno || b.titulo, 'es'));
    return res.status(200).json({ cavas: otras });
  } catch (e) {
    console.error('[api/admin-cavas]', String(e).slice(0, 200));
    return res.status(500).json({ error: 'No pudimos procesar el pedido.' });
  }
}
