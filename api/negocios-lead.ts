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

const TIPOS_VALIDOS = ['Restaurante', 'Wine bar', 'Hotel', 'Otro'];

function planNegocios(presupuesto: number): string {
  if (presupuesto >= 2_000_000) return 'Ícono';
  if (presupuesto >= 500_000)   return 'Gran Reserva';
  return 'Reserva';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  const {
    tipoNegocio, presupuesto, nombreNegocio, nombre, celular,
    recomienda, urlOrigen,
    fbp, fbc,
  } = req.body || {};

  // ── Validación ────────────────────────────────────────────────────────────
  if (!tipoNegocio || !TIPOS_VALIDOS.includes(String(tipoNegocio))) {
    return res.status(400).json({ error: 'Tipo de negocio inválido' });
  }
  if (!nombreNegocio || !String(nombreNegocio).trim()) {
    return res.status(400).json({ error: 'Nombre del negocio requerido' });
  }
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'Nombre requerido' });
  }
  if (!celular || !String(celular).trim()) {
    return res.status(400).json({ error: 'Celular requerido' });
  }
  const presupuestoNum = Number(presupuesto);
  if (!presupuestoNum || presupuestoNum < 200_000) {
    return res.status(400).json({ error: 'Presupuesto mínimo $200.000' });
  }

  // ── Recálculo del plan en el servidor ─────────────────────────────────────
  const plan = planNegocios(presupuestoNum);

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
                value:        presupuestoNum,
                currency:     'ARS',
                content_name: `Negocios ${plan}`,
              },
            }],
          }),
        }
      );
    } catch (err) {
      console.warn('Meta CAPI error (negocios lead, no afecta al guardado):', err);
    }
  }

  // ── Google Sheets ─────────────────────────────────────────────────────────
  try {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64 || '', 'base64').toString('utf-8')
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Ensure "Negocios" sheet exists; create with headers if needed
    const SHEET_NAME = 'Negocios';
    const HEADERS = ['Fecha', 'Tipo de negocio', 'Presupuesto', 'Plan',
                     'Nombre del negocio', 'Nombre', 'Celular', 'Recomendó'];
    try {
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: process.env.SHEET_ID,
        fields: 'sheets.properties.title',
      });
      const exists = meta.data.sheets?.some(s => s.properties?.title === SHEET_NAME);
      if (!exists) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: process.env.SHEET_ID,
          requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] },
        });
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SHEET_ID,
          range: `${SHEET_NAME}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [HEADERS] },
        });
      }
    } catch (sheetErr) {
      console.warn('No se pudo verificar/crear pestaña Negocios:', sheetErr);
      // Intentar append de todos modos
    }

    const fechaHora = new Date().toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const fila = [
      fechaHora,                                    // A Fecha
      String(tipoNegocio),                          // B Tipo de negocio
      presupuestoNum,                               // C Presupuesto
      plan,                                         // D Plan
      String(nombreNegocio).trim(),                 // E Nombre del negocio
      String(nombre).trim(),                        // F Nombre
      String(celular).trim(),                       // G Celular
      recomienda ? String(recomienda).trim() : '',  // H Recomendó
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range:         `${SHEET_NAME}!A:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody:   { values: [fila] },
    });
  } catch (err) {
    console.error('Error guardando negocios lead en Sheets:', err);
    return res.status(500).json({ error: 'No pudimos guardar tus datos. Intentá de nuevo.' });
  }

  return res.status(200).json({ ok: true });
}
