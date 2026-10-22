// Foto de portada de una juntada: GET /api/juntada-foto?cava=001&mes=2026-09
//
// Las URLs de los adjuntos de Airtable vencen en unas horas, así que no pueden
// viajar dentro de /api/cava (que se cachea). Acá se busca la juntada, se toma
// la miniatura "large" de la primera foto (la portada) y se responde con un
// redirect 302 a esa URL. El CDN guarda el redirect 30 minutos, bastante menos
// que lo que dura la URL.

const BASE_ID = 'appag1VLp4aN3tD3v';
const TBL_JUNT = 'tblXjEG9P1VZEEcpE';
const FJ = {
  cava:  'fld8m6VnxAUF39uls',
  fecha: 'fldoLC4TDsOuji996',
  fotos: 'fldKno8prsBjITYcQ',
} as const;

// Las cavas que existen: el código público de la URL → su registro en Airtable.
const CAVAS: Record<string, string> = {
  '001': 'rec7kgfT9LXzYPy6a',
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

type Adjunto = {
  url: string;
  thumbnails?: { large?: { url: string }; full?: { url: string } };
};

export default async function handler(req: any, res: any) {
  const q = req.query ?? {};
  const cava = typeof q.cava === 'string' ? q.cava : '';
  const mes = typeof q.mes === 'string' ? q.mes : '';

  if (!Object.prototype.hasOwnProperty.call(CAVAS, cava) || !MES.test(mes)) {
    return res.status(400).json({ error: 'parametros_invalidos' });
  }

  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return res.status(500).json({ error: 'no_token' });

  try {
    const cavaId = CAVAS[cava];
    let offset: string | undefined;
    let foto: string | null = null;

    do {
      const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${TBL_JUNT}`);
      url.searchParams.set('returnFieldsByFieldId', 'true');
      url.searchParams.set('pageSize', '100');
      for (const f of Object.values(FJ)) url.searchParams.append('fields[]', f);
      if (offset) url.searchParams.set('offset', offset);
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Airtable ${r.status}`);
      const json = await r.json() as { records: any[]; offset?: string };

      for (const rec of json.records) {
        const cavas = (rec.fields[FJ.cava] as string[] | undefined) ?? [];
        const fecha = rec.fields[FJ.fecha] as string | undefined;
        if (!cavas.includes(cavaId) || !fecha || fecha.slice(0, 7) !== mes) continue;
        const portada = ((rec.fields[FJ.fotos] as Adjunto[] | undefined) ?? [])[0];
        if (portada) {
          foto = portada.thumbnails?.large?.url ?? portada.url;
          break;
        }
      }
      offset = foto ? undefined : json.offset;
    } while (offset);

    if (!foto) {
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(404).json({ error: 'sin_foto' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=1800');
    res.setHeader('Location', foto);
    return res.status(302).end();
  } catch (err) {
    console.error('[api/juntada-foto] error:', err);
    return res.status(500).json({ error: 'error_interno' });
  }
}
