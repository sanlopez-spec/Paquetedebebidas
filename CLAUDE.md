# EDB Estación de Bebidas — Cotizador

## Qué es
Wizard de 5 pasos para cotizar paquetes de bebidas para eventos (casamientos, cumpleaños, eventos corporativos, juntadas). Calcula cantidades automáticamente y captura leads hacia Google Sheets.

## Stack
- Vite + React + TypeScript, deployado en **Vercel**
- Vercel Functions en `api/` (Node.js serverless)
- Google Sheets API via `googleapis` (env vars: `GOOGLE_CREDENTIALS_BASE64`, `SHEET_ID`)

## Regla de negocio crítica — NUNCA violar
**Las cantidades calculadas por categoría (botellas, porrones, litros, unidades) son el activo propietario del negocio y NUNCA deben salir del frontend.** No van en payloads a `/api/lead`, no van en la URL del PDF, no van en el mensaje de WhatsApp, no van a ningún servicio externo. Solo viajan: elecciones del usuario (labels legibles), precios brutos (`precioPorPersona`, `total`), y datos del lead (nombre, teléfono).

## Archivos clave
- `src/app/App.tsx` — wizard completo + PdfModal + toda la lógica de UI
- `src/app/calculator.ts` — motor de cálculo (cantidades); sus resultados NUNCA salen del frontend
- `src/app/quoter-config.ts` — configuración de precios, duraciones, intensidades, estilos, vidriera
- `src/app/utils.ts` — helpers de analytics: `trackClarity`, `trackGA`, `trackPixel`
- `api/lead.ts` — Vercel Function que escribe leads en Google Sheets (columnas A–P)
- `public/pdf/cotizacion.html` — template standalone del PDF (CSS+JS inline, sin bundler)
- `public/pdf-assets/` — logo y watermark PNG para el PDF

## Analytics instalados (no tocar los snippets en index.html)
- **Microsoft Clarity** — ID `x4545s8v61`
- **Google Analytics 4** — ID `G-4WTYC93V71`
- **Meta Pixel** — ID `1385468086833929`

## Flujos principales
1. **WhatsApp CTA**: genera mensaje con `vidriera` (showcase text), llama `/api/lead` (fire-and-forget), abre `wa.me`
2. **Modal PDF**: captura nombre + teléfono + fecha, llama `/api/lead` con `linkPdf` (URL del template con query params)
3. **PDF template**: lee query params (`plan`, `estilo`, `tipoEvento`, `personas`, `duracion`, `intensidad`, `nombre`, `fechaEvento`, `ppBase/Premium/Icon`, `totalBase/Premium/Icon`); fallback a `DATOS_PRUEBA` si faltan

## Convenciones
- Labels legibles de las selecciones ya existen en `quoterConfig` y `packageConfig`
- Mapping estilo: `completo→experiencia_completa`, `cocktails→barra_cerveza`, `bodega→vinos_espumantes`
- `buildPdfUrl(quality, nombre, fechaEvento)` está definida en App.tsx como closure sobre el estado del wizard
