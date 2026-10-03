import { google } from 'googleapis';
import { createHash } from 'crypto';

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return digits;
  return '54' + digits;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const {
    nombre, celular, formato, integrantes, cuota,
    guardaEnCasa, recomienda, urlOrigen,
    fbp, fbc,
  } = req.body || {};

  // ── Validación ────────────────────────────────────────────────────────────
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  if (!celular || !String(celular).trim()) {
    return res.status(400).json({ error: 'Celular requerido' });
  }
  const cuotaNum = Number(cuota);
  if (!cuotaNum || cuotaNum < 50) {
    return res.status(400).json({ error: 'Cuota mínima USD 50' });
  }
  const esGrupal = formato === 'Grupal';
  const integrantesNum = esGrupal ? Number(integrantes) : 1;
  if (esGrupal && (isNaN(integrantesNum) || integrantesNum < 2)) {
    return res.status(400).json({ error: 'Grupal requiere mínimo 2 integrantes' });
  }

  // ── Recálculo del plan en el servidor ─────────────────────────────────────
  const total = esGrupal ? cuotaNum * integrantesNum : cuotaNum;
  const plan  = total >= 100 ? 'Gran Reserva' : 'Reserva';

  // ── Meta CAPI — fire-and-forget ───────────────────────────────────────────
  const capiToken = process.env.META_CAPI_TOKEN;
  const pixelId   = process.env.META_PIXEL_ID;

  if (capiToken && pixelId) {
    try {
      const eventTime = Math.floor(Date.now() / 1000);
      const userData: Record<string, string> = {
        client_ip_address: (req.headers['x-forwarded-for'] as string | undefined)
          ?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '',
        client_user_agent: (req.headers['user-agent'] as string | undefined) ?? '',
      };
      if (fbp) userData.fbp = fbp;
      if (fbc) userData.fbc = fbc;
      const normalizedPhone = normalizePhone(String(celular));
      if (normalizedPhone) userData.ph = sha256hex(normalizedPhone);

      await fetch(
        `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${capiToken}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              event_name:       'Lead',
              event_time:       eventTime,
              action_source:    'website',
              event_source_url: urlOrigen || '',
              user_data:        userData,
              custom_data: {
                value:        total,
                currency:     'USD',
                content_name: `Club ${plan}`,
              },
            }],
          }),
        }
      );
    } catch (err) {
      console.warn('Meta CAPI error (club lead, no afecta al guardado):', err);
    }
  }

  // ── Google Sheets — si falla devolvemos 500 ───────────────────────────────
  try {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64 || '', 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const fechaHora = new Date().toLocaleString('es-AR', {
      timeZone:  'America/Argentina/Buenos_Aires',
      day:       '2-digit',
      month:     '2-digit',
      year:      'numeric',
      hour:      '2-digit',
      minute:    '2-digit',
    });

    const fila = [
      fechaHora,                                         // A Fecha
      String(nombre).trim(),                             // B Nombre
      String(celular).trim(),                            // C Celular
      esGrupal ? 'Grupal' : 'Individual',               // D Formato
      esGrupal ? integrantesNum : '',                    // E Integrantes
      cuotaNum,                                          // F Cuota por persona (USD)
      total,                                             // G Total mensual (USD)
      plan,                                              // H Plan
      guardaEnCasa || '',                                // I Guarda en casa
      recomienda ? String(recomienda).trim() : '',       // J Recomendó
      urlOrigen || '',                                   // K URL de origen
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range:         'Club!A:K',
      valueInputOption: 'USER_ENTERED',
      requestBody:   { values: [fila] },
    });
  } catch (err) {
    console.error('Error guardando club lead en Sheets:', err);
    return res.status(500).json({ error: 'No pudimos guardar tus datos. Intentá de nuevo.' });
  }

  return res.status(200).json({ ok: true });
}
