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

  try {
    const {
      origen, lead = {}, inputs = {}, precios = {}, linkPdf = '',
      eventId, consultaEventId, eventSourceUrl, fbp, fbc,
    } = req.body || {};

    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64 || '', 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const fechaHora = new Date().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });

    const fila = [
      fechaHora,
      origen || '',
      lead.nombre || '',
      lead.telefono || '',
      lead.fechaEvento || '',
      inputs.tipoEvento || '',
      inputs.personas ?? '',
      inputs.duracion || '',
      inputs.intensidad || '',
      inputs.estilo || '',
      precios.plan || '',
      precios.precioPorPersona ?? '',
      precios.total ?? '',
      'Nuevo',
      '',
      linkPdf,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Leads!A:P',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [fila] },
    });

    // ── Meta Conversions API ─────────────────────────────────────────────────
    const capiToken = process.env.META_CAPI_TOKEN;
    const pixelId   = process.env.META_PIXEL_ID;

    if (!capiToken || !pixelId) {
      console.warn('Meta CAPI: META_CAPI_TOKEN o META_PIXEL_ID no configurados, omitiendo envío.');
    } else {
      try {
        const eventTime = Math.floor(Date.now() / 1000);

        const userData: Record<string, string> = {
          client_ip_address: (req.headers['x-forwarded-for'] as string | undefined)
            ?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '',
          client_user_agent: (req.headers['user-agent'] as string | undefined) ?? '',
        };
        if (fbp) userData.fbp = fbp;
        if (fbc) userData.fbc = fbc;
        const normalizedPhone = normalizePhone(lead.telefono || '');
        if (normalizedPhone) userData.ph = sha256hex(normalizedPhone);

        const customData = {
          value:        precios.total ?? 0,
          currency:     'ARS',
          content_name: precios.plan  || '',
        };

        const mainEvent = {
          event_name:       origen === 'PDF' ? 'CompleteRegistration' : 'Lead',
          event_time:       eventTime,
          event_id:         eventId         || '',
          action_source:    'website',
          event_source_url: eventSourceUrl  || '',
          user_data:        userData,
          custom_data:      customData,
        };

        const consultaEvent = {
          event_name:       'ConsultaPaquetes',
          event_time:       eventTime,
          event_id:         consultaEventId || '',
          action_source:    'website',
          event_source_url: eventSourceUrl  || '',
          user_data:        userData,
          custom_data:      customData,
        };

        const capiRes = await fetch(
          `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${capiToken}`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ data: [mainEvent, consultaEvent] }),
          }
        );

        if (!capiRes.ok) {
          console.warn('Meta CAPI respuesta no-OK:', capiRes.status, await capiRes.text());
        }
      } catch (capiErr) {
        console.warn('Meta CAPI error (no afecta al lead):', capiErr);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error guardando lead:', err);
    return res.status(500).json({ ok: false });
  }
}
