#!/usr/bin/env node
// Sube una foto al campo Fotos de un registro de la tabla Juntadas de Airtable.
//
//   node scripts/subir-foto-juntada.mjs <archivo.jpg> [recordId]
//
// Usa AIRTABLE_TOKEN del entorno o de .env.local, y nunca lo imprime.
// Por defecto sube al registro "Juntada septiembre 2026" del Club #001.
// Verifica leyendo el registro que el adjunto quedó.

import { readFileSync, existsSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE_ID = 'appag1VLp4aN3tD3v';
const TBL_JUNTADAS = 'tblXjEG9P1VZEEcpE';
const FLD_FOTOS = 'fldKno8prsBjITYcQ';

const [archivo, recordId = 'rectLnijXXcacTQyw'] = process.argv.slice(2);
if (!archivo || !existsSync(archivo)) {
  console.error('Uso: node scripts/subir-foto-juntada.mjs <archivo.jpg> [recordId]');
  process.exit(1);
}

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile) && !process.env.AIRTABLE_TOKEN) {
  for (const l of readFileSync(envFile, 'utf8').split('\n')) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) process.env[m[1]] ??= m[2];
  }
}
const token = process.env.AIRTABLE_TOKEN;
if (!token) { console.error('Falta AIRTABLE_TOKEN.'); process.exit(1); }

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const contentType = MIME[extname(archivo).toLowerCase()];
if (!contentType) { console.error('Formato no soportado (jpg, png o webp).'); process.exit(1); }

const leer = async () => {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${TBL_JUNTADAS}/${recordId}?returnFieldsByFieldId=true`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Leer el registro: ${r.status} ${await r.text()}`);
  return r.json();
};

const antes = await leer();
const fotosAntes = antes.fields[FLD_FOTOS] ?? [];
console.log(`Registro: ${antes.fields.fldg8zGBLWIivkItj ?? recordId} — fotos hoy: ${fotosAntes.length}`);

const nombre = basename(archivo);
if (fotosAntes.some(f => f.filename === nombre)) {
  console.log(`"${nombre}" ya está subida: no hago nada.`);
  process.exit(0);
}

const base64 = readFileSync(archivo).toString('base64');
const res = await fetch(
  `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${FLD_FOTOS}/uploadAttachment`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, file: base64, filename: nombre }),
  });
if (!res.ok) { console.error('Subida:', res.status, await res.text()); process.exit(1); }

const despues = await leer();
const fotos = despues.fields[FLD_FOTOS] ?? [];
const sube = fotos.find(f => f.filename === nombre);
if (!sube) { console.error('La subida respondió bien pero el adjunto no aparece.'); process.exit(1); }
console.log(`OK: "${sube.filename}" (${sube.type}, ${Math.round(sube.size / 1024)} KB) — ` +
  `fotos ahora: ${fotos.length}. Miniatura large: ${sube.thumbnails?.large ? 'sí' : 'no'}.`);
