import { google } from 'googleapis';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false });
  }

  try {
    const { origen, lead = {}, inputs = {}, precios = {} } = req.body || {};

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
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Leads!A:O',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [fila] },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Error guardando lead:', err);
    return res.status(500).json({ ok: false });
  }
}
