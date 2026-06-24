# Mejoras futuras

Ideas y backlog de mejoras para el cotizador y la landing de EDB.

---

## App / Experiencia de usuario

### Carrusel de testimonios (mobile y desktop)
- **Estado:** IDEA
- **Disparador:** cuando haya más de 3-4 testimonios y/o varios tipos de evento (cumpleaños, corporativos, etc.).
- **Descripción:** Reemplazar el layout actual (3 cards apiladas en mobile, 3 en fila en desktop) por un carrusel deslizable. En mobile evita el scroll larguísimo; en desktop permite mostrar más de 3 sin romper la grilla.
- **Por qué importa:** Con muchos testimonios, apiladas se hace eterno y en fila no entran. Ideal poder filtrar/mostrar por tipo de evento para que el visitante vea uno parecido al suyo.
- **Notas:** Sumar testimonios reales de otros tipos de evento a medida que se consigan (con OK del cliente, como los 3 actuales).

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
