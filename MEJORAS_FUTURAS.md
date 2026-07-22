# Mejoras futuras

Ideas y backlog de mejoras para el cotizador y la landing de EDB.

**Última actualización: 2026-07-22**

---

## Completado

### Imágenes reales del Home
- **Estado:** HECHA
- **Descripción:** Cargadas las fotos reales de las secciones Paquetes, Tienda, Local Barracas y Local Flores (banner + 6 de galería cada uno). Banners pre-recortados a relación 2.6:1 con la banda "cartel + vidriera".
- **Lección:** el encuadre del banner se resuelve RECORTANDO EL ASSET a la proporción exacta, no peleando con object-position en CSS. Dos intentos con object-position ("center top", "center 22%") empeoraron el resultado.

---

## App / Experiencia de usuario

### Carrusel de testimonios (mobile y desktop)
- **Estado:** IDEA
- **Disparador:** cuando haya más de 3-4 testimonios y/o varios tipos de evento (cumpleaños, corporativos, etc.).
- **Descripción:** Reemplazar el layout actual (3 cards apiladas en mobile, 3 en fila en desktop) por un carrusel deslizable. En mobile evita el scroll larguísimo; en desktop permite mostrar más de 3 sin romper la grilla.
- **Por qué importa:** Con muchos testimonios, apiladas se hace eterno y en fila no entran. Ideal poder filtrar/mostrar por tipo de evento para que el visitante vea uno parecido al suyo.
- **Notas:** Sumar testimonios reales de otros tipos de evento a medida que se consigan (con OK del cliente, como los 3 actuales).

### Reemplazar imágenes provisorias del Home
- **Estado:** IDEA
- **Descripción:** Tres assets a mejorar cuando haya material: (a) barra-evento.jpg es stock de Unsplash, reemplazar por foto de un evento real de EDB; (b) local-barracas-6.jpg es la fachada repetida porque faltaba una foto de interior; (c) confirmar consentimiento de las personas que aparecen en local-barracas-5.jpg (cata grupal con caras identificables).
- **Por qué importa:** autenticidad para un ticket alto y prolijidad legal.

---

## GEO / SEO para IA

### GEO / SEO para motores de IA (ChatGPT, Perplexity, Gemini, Claude)
- **Estado:** PRIORIZADA (las partes baratas) · IDEA (el resto)
- **Disparador:** las partes baratas, apenas se conecte el dominio propio; el resto es trabajo continuo post-lanzamiento. NO es bloqueante para lanzar la V1.
- **Línea roja:** NUNCA exponer las cantidades calculadas (botellas/litros por persona). El contenido GEO va a alto nivel ("para un casamiento se piensa en bebida con y sin alcohol, agua, hielo y un margen"), nunca la metodología fina. Las IAs citan el marco, no el cálculo.
- **Qué hacer (orden de impacto):**
  1. Crawleabilidad (CRÍTICO y barato): verificar que robots.txt no bloquee bots de IA (ChatGPT-User, etc.) y que el contenido de la landing sea visible en el HTML, no escondido detrás de JavaScript. OJO: la landing es React/Vite; si renderiza solo client-side, los bots pueden no leerla. Verificar con "ver código fuente" que el texto esté presente.
  2. FAQ ampliada con preguntas reales que la gente le hace a las IAs ("¿cuánta bebida necesito para un casamiento de X personas?", "¿cuánto cuesta una barra para un evento?"), cada una con respuesta directa de 40-60 palabras justo debajo del título, a alto nivel (sin cantidades).
  3. Schema markup (datos estructurados, invisibles al usuario): FAQPage para la FAQ + LocalBusiness/Organization para las dos vinotecas (nombre, direcciones, años, reseñas).
  4. Señales de entidad/autoridad: datos consistentes en toda la web (nombre, direcciones, 14 años, +300 reseñas). Trabajo continuo.
- **Por qué importa:** el tráfico vía IA convierte mejor y la ventana competitiva está abierta (pocos lo trabajan). Las primeras citas aparecen a 4-8 semanas, es de mediano plazo. Los puntos 1-3 además mejoran el SEO tradicional de paso.

---

## Home — Sección Tienda

### Links por categoría en la sección Tienda del Home
- **Estado:** IDEA
- **Descripción:** Hoy las 10 categorías (Vinos, Espumantes, Whisky, Gin, Destilados, Licores, Cervezas, Sidras, Cristalería, Accesorios) linkean todas al home de la tienda (TIENDA_URL). Cuando existan los links directos por categoría en Tiendanube, apuntar cada tarjeta a su categoría (mejora UX + SEO).
- **Implementación:** En `TIENDA_CATS` (src/home/Home.tsx), reemplazar `href={TIENDA_URL}` por la URL de cada categoría, o agregar un campo `url` al objeto de cada categoría.

---

## Dominios / Migración

### Migrar la tienda a tienda.edb.com.ar
- **Estado:** PRIORIZADA
- **Descripción:** Mover la tienda de Tiendanube al subdominio tienda.edb.com.ar. DESCARTADO el camino de subcarpeta edb.com.ar/tienda: requiere un proxy frágil entre Vercel y Tiendanube.
- **Por qué importa:** coherencia de marca bajo un dominio único.
- **Notas:** hacerlo DESPUÉS de validar el lanzamiento B2C. Si sale mal, cae la tienda justo cuando hay inversión en ads.

### Redirección 301 de estaciondebebidas.com
- **Estado:** PRIORIZADA
- **Descripción:** Redirigir estaciondebebidas.com a edb.com.ar con 301 mapeadas URL por URL (no todo al home), más "Cambio de dirección" en Search Console, sitemaps nuevos y actualización de directorios.
- **Por qué importa:** preservar el posicionamiento acumulado del catálogo.
- **Notas:** REGLA FIRME: estaciondebebidas.com no se deja vencer nunca, ni después de migrar. Sostiene las redirecciones y el correo.

### Alias de dominio edb.com.ar en Google Workspace
- **Estado:** PRIORIZADA
- **Descripción:** Sumar edb.com.ar como alias de dominio para que cada casilla reciba también su versión corta (info@estaciondebebidas.com e info@edb.com.ar en la misma bandeja). No es migración: no se rompe nada ni hay que avisar a proveedores. Sin costo extra.
- **Notas:** bloqueo conocido: admin.google.com quedaba en un loop de selección de cuenta. Destrabar eso primero.

### Actualizar links de GBP y redes al dominio nuevo
- **Estado:** PRIORIZADA
- **Descripción:** Los perfiles de Google Business de ambos locales y los links de redes apuntan hoy a estaciondebebidas.com. Cambiarlos a edb.com.ar una vez conectado el dominio.
- **Por qué importa:** el Home tiene la sección de cada local con mapa, horarios, teléfono, reseñas y galería: es mejor destino que la tienda para alguien que buscó el local en Maps.
