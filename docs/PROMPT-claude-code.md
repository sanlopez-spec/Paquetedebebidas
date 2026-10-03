# Club EDB — Migración a edb.com.ar

Vas a sumar el **Club EDB** al sitio de EDB (este repo). Hoy existen tres prototipos HTML aprobados (landing, tablero de la cava, programa de referidos) y un proxy a Airtable. Tu trabajo es portarlos a React dentro del sitio, conectarlos a datos reales y dejarlos listos para producción.

El Club EDB es el club de vinos de guarda de EDB: el socio pone un presupuesto mensual en USD, EDB le compra vinos y se los guarda en su cava. Contexto completo de negocio en `docs/club/club-documento-interno.md` (leelo antes de arrancar; es la fuente de verdad).

## Archivos que te paso

Están en `docs/club/` (copialos ahí si no están):

- `prototipos/club-landing.html` — landing **aprobada**. Diseño y textos cerrados.
- `prototipos/club-tablero.html` — tablero de la cava, con los datos reales del Club #001 embebidos en JS (`DATA`, `CONS`, `PERFILES`).
- `prototipos/club-referidos.html` — programa de referidos.
- `imagenes/tablero-*.jpg` — las 4 capturas del slider de la landing. Van a `public/club/`.
- `cava.ts` — proxy a Airtable ya escrito, pendiente de deploy.
- `club-documento-interno.md` — documento del proyecto.

## Reglas de trabajo (no negociables)

1. **Nunca pushees a `main`.** `main` es producción directa, no hay staging. Trabajá en la rama `club`; Vercel genera una URL de preview por rama y ahí se revisa.
2. **Trabajá por fases.** Al terminar cada fase: `vite build` sin errores, commit, push a `club`, y frená. Pasame la URL de preview y un resumen corto de lo hecho. No sigas a la fase siguiente sin mi OK.
3. **Fidelidad al prototipo.** Diseño, espaciados y **textos** de los prototipos están decididos. No reescribas copy, no "mejores" el diseño, no agregues ni saques secciones. Si algo no se puede portar igual, o ves un problema, preguntá antes de cambiarlo.
4. **Mobile first.** Se revisa en iPhone (390 px). Nada de scroll horizontal; respetá safe areas.
5. **No linkees `/club` desde el header ni desde el home** hasta que te lo pida. Las páginas existen pero quedan fuera del menú.
6. No toques el cotizador (`/paquetes`), `api/lead.ts` ni el home, salvo lo mínimo para registrar rutas.

## Decisión visual

- **Header y footer: los del sitio** (`SiteHeader` con `openInNewTab={false}`, `Footer`).
- **Contenido del club: paleta propia del club**, no los tokens `edb-*`. Es una submarca respaldada por EDB. Registrala como tokens propios en el CSS global (bloque `@theme` de Tailwind v4), con prefijo `club-`:

  | Token | Valor |
  |---|---|
  | `club-ink` | `#241318` |
  | `club-burgundy` | `#571622` |
  | `club-claret` | `#8a2a34` |
  | `club-parchment` | `#e9dfc7` |
  | `club-parchment-2` | `#f2ead8` |
  | `club-brass` | `#a9843c` |
  | `club-brass-dim` | `#8f6f31` |
  | `club-glass` | `#34432e` |
  | `club-line` | `rgba(36,19,24,.16)` |
  | `club-line-strong` | `rgba(36,19,24,.30)` |

  Verificá contra el `:root` de cada prototipo y sumá cualquier color que falte.
- **Tipografías:** Fraunces (títulos) y Archivo (texto), las mismas en landing y tablero. Si el sitio no las carga, cargalas solo en las rutas del club.
- **Referidos usa otra paleta y otras fuentes** (vino oscuro, Cormorant/Karla): es un prototipo anterior. Portalo **con la paleta y fuentes del club**, manteniendo estructura y textos. Fondo oscuro (`club-ink`) está bien para esta página.
- Usá Tailwind con los tokens `club-*`. Para piezas complejas (slider, dona, gráficos del tablero) podés usar un CSS acotado dentro de `src/club/` si en Tailwind queda ilegible.

## Estructura

- Rutas en `src/main.tsx`: `/club` (landing), `/club/cava` (tablero), `/club/referidos`.
- Código en `src/club/` (`Club.tsx`, `Tablero.tsx`, `Referidos.tsx`, componentes y datos). No uses `src/site/`, es del cotizador.
- En el prototipo de la landing ya reemplacé los links de artifacts por `/club/cava` y `/club/referidos`. Usá `Link` de `react-router`.

## Fase 1 — Landing en `/club`

Portá `club-landing.html` 1:1. La lógica vanilla JS pasa a estado de React. Piezas que tienen que quedar funcionando igual:

- **Hero** con el recuadro placeholder "Foto de la cava" (la foto llega después; dejalo fácil de reemplazar por una imagen).
- **Franja del tablero** en `club-parchment-2`, de borde a borde: slider de 4 capturas (`public/club/tablero-*.jpg`) dentro del marco de celular, swipe con el dedo + puntos clickeables, sin autoplay. En mobile el celular va arriba del texto.
- **Beneficios**: 3 bloques con íconos SVG ("Pagás menos", "Añejás más", "Tomás mejor"), 2 beneficios cada uno.
- **Planes**: tabla Reserva / Gran Reserva y debajo "2 formatos" con las dos tarjetas, asteriscos y "* Montos de ejemplo.".
- **Formulario de alta** compacto. Regla clave: **en Grupal, el plan se calcula sobre el total del grupo** (cuota × integrantes), no sobre la cuota individual. Umbral: total ≥ USD 100 → Gran Reserva. Mostrar "Total del grupo: USD X por mes".
- **Panel "Tu plan"** (solo escritorio, sticky, oculto < 820 px): se actualiza en vivo con formato, monto, plan, descuento (30 % / 40 %), guarda incluida (30 / 60 botellas) y prioridad. Al enviar, form y panel se ocultan y aparece la confirmación.
- Leer `?ref=` de la URL y precargarlo en "¿Quién te recomendó?".
- En esta fase el envío del form solo muestra la confirmación (se conecta en la fase 5).

## Fase 2 — Tablero en `/club/cava`

- Portá `club-tablero.html` completo: banda de demo, toggle Cava del club / Cava individual, tarjetas de indicadores, candado "Valor de la cava", dona de cepas, bodegas, país, regiones, botellas abiertas por año + informe acumulado, añadas clickeables, buscador, filtros de tipo y formato, lista de etiquetas con detalle.
- Sacá los datos embebidos (`DATA`, `CONS`, `PERFILES`) a `src/club/data/cava-001.json` (o `.ts`) **sin cambiar su forma**. Los componentes leen de ahí. En la fase 4 esa fuente se reemplaza por la API.
- El **valor de la cava sigue bloqueado** (tarjeta con candado). No calcules ni muestres precios ni valuaciones en ningún lado: está pendiente de una consulta legal.

## Fase 3 — Referidos en `/club/referidos`

- Portá `club-referidos.html` con la paleta del club (ver decisión visual).
- Los premios figuran como `[Etiqueta y añada]`: son placeholders pendientes. Dejalos visibles tal cual.
- El botón "Recomendar el club" hoy apunta a `#`. Hacé que comparta el link `https://edb.com.ar/club` con Web Share API (`navigator.share`) y, si no está disponible, copie el link al portapapeles con un aviso "Link copiado".

## Fase 4 — Datos reales: `api/cava.ts`

- Subí `cava.ts` como `api/cava.ts`. Alinealo con el patrón de `api/lead.ts` (export default handler, `process.env`). Si difiere en estilo, adaptalo sin cambiar su lógica.
- Variables: `AIRTABLE_TOKEN` (y la que haga falta para el ID de base, si `cava.ts` la espera). Las cargo yo en Vercel; decime exactamente cuáles y con qué nombre.
- Mantené la **whitelist de campos públicos**: precios, valuaciones, ganancias y posición en cava ni se consultan. El valor total de la cava queda afuera.
- `Cache-Control: s-maxage=300, stale-while-revalidate=86400` para no pegarle al rate limit de Airtable (5 req/s).
- Escribí un mapper en el front que convierta la respuesta de la API a la misma forma de `cava-001.json`, así los componentes no cambian. Si la API falla, el tablero usa el JSON local como respaldo.
- Ojo: `/api/*` no corre en `vite dev`. Probá contra la URL de preview de Vercel (o `vercel dev` si está disponible).

## Fase 5 — Alta conectada: `api/club-lead.ts`

- `POST /api/club-lead`, mismo patrón que `api/lead.ts`.
- Escribe una fila en la tabla **"Solicitudes"** de la base de Airtable "Club EDB" con: Fecha, Nombre, Celular, Formato (Individual/Grupal), Integrantes, Cuota por persona (USD), Total mensual (USD), Plan, Guarda en casa (Sí/No), Recomendó, URL de origen.
- Envía el evento `Lead` a Meta CAPI igual que `api/lead.ts`, con su propio try/catch.
- Validá en el servidor: nombre y celular obligatorios, cuota ≥ 50, integrantes ≥ 2 si es grupal. Recalculá el plan en el servidor (no confíes en el que manda el front).
- El front muestra la confirmación solo si la respuesta es OK; si falla, un mensaje para reintentar y el botón de WhatsApp como alternativa.

## Analítica (todas las fases)

Usá `trackGA`, `trackClarity` y `trackPixel` de `src/app/utils.ts`, como el resto del sitio. Eventos mínimos: vista de `/club`, clic en "Sumarme al club", uso del slider del tablero, apertura de `/club/cava`, cambio de formato en el form, envío del form (`Lead`), clic en "Recomendar el club".

## Fuera de alcance (no lo hagas)

Login o autenticación, Softr, valuaciones o precios visibles, marketplace, cambios de copy, cambios en el home o en `/paquetes`, link en el menú del sitio.

## Pendientes conocidos (no los resuelvas, solo dejá el lugar)

Foto real del hero · premios de referidos (`[Etiqueta y añada]`) · valor de la cava (consulta legal) · medio de pago.

## Antes de pasar a `main`

Checklist que me mostrás en la última fase: build sin errores, sin scroll horizontal a 390 px, imágenes livianas (WebP o JPG comprimido), sin claves en el front, rutas que no rompen al recargar, eventos de analítica disparando. El merge a `main` lo autorizo yo.
