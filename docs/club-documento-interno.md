# Club del Vino — Documento interno del proyecto

> **Memoria viva del proyecto.** Captura el concepto, las decisiones tomadas, el estado de construcción y lo que falta. Sigue siendo un documento de pensamiento, no de planificación financiera: no contiene proyecciones ni unit economics, porque ninguno de esos números está validado todavía. Cuando haya datos reales, esa será otra etapa.
>
> **Última actualización: 28/9/2026.** Esta versión suma el **modelo de valorización de la cava** (implementado en Airtable), el **módulo de guarda cerrado** (umbral + precio del excedente), la **revisión de valorización por única vez** que hay que hacer al cargar, y el **posicionamiento de planes por grado de acceso**.

---

## 1. El concepto en una frase

Operador de **clubes de vino de guarda colectiva para grupos de afinidad** (amigos, colegas, círculos) y de **carteras individuales administradas**, con base en AMBA, apalancado en vinoteca propia (EDB), con vocación de escalar.

No se vende vino: se vende **la posibilidad de vivir la experiencia de la guarda** — algo que un individuo solo casi no puede hacer (sin volumen, sin cava, sin con quién compartirlo). El tiempo es el producto; la cava lo hace posible.

---

## 2. El origen: el Club EDB #001 como caso testigo

Siete amigos, desde abril de 2021, aportan USD 50 por mes cada uno para comprar vinos ícono de guarda a través de la vinoteca propia, al mejor costo. Se juntan a comer y probar cada dos meses. Terminan añejando más de lo que consumen.

Hipótesis cualitativas que el club validó en cinco años: hay disposición sostenida a pagar en USD por acceso a vinos que individualmente no se comprarían; la adherencia es excepcional (cinco años, cero deserciones); la ventaja de costo vía vinoteca es real; el esquema sobrevive a la macro argentina.

**Números reales del #001 (base de calibración):** en cinco años compraron ~600 botellas de 750 ml, tienen ~400 en guarda y consumieron ~200. La proporción **un tercio consumido / dos tercios guardado** se mantuvo estable a lo largo de los cinco años. Eso da ~120 botellas/año entrando a la cava para 7 socios de USD 50, o sea **~17 botellas por socio por año**, de las cuales ~11 quedan en guarda. Precio de compra promedio ~USD 35 (alto justamente porque juntar 7 cuotas les permite comer íconos que un socio solo no alcanzaría).

Lo que NO está probado: **la escalabilidad**. Coordinar 7 amigos no es operar decenas de grupos.

> El informe anual del Club #001 (2º aniversario) es, sin haberlo planeado, un entregable premium terminado: inventario valuado, análisis de cepas y regiones, edad de la colección, revalorización. Es prueba de concepto y producto a la vez.

---

## 3. Decisiones estratégicas tomadas

| Decisión | Definición |
|---|---|
| **Modelo** | Operador de guarda colectiva + carteras individuales administradas |
| **Dos formatos, en paralelo** | Individual ("cartera administrada", default) y grupal (cava compartida) |
| **Estructura de lanzamiento** | **Dos bandas**: base (USD 50–100/mes) y alta (USD 100+/mes, sin techo). El cliente elige el monto; el umbral de USD 100 decide la banda. (El esquema completo de cuatro tiers —Low Cost/Recomendado/Premium/Icon— queda como modelo más amplio, diferido.) |
| **La cuota = presupuesto de compra** | No es un fee por la herramienta; la herramienta va incluida. La ganancia es el margen de compra. Sin fee de servicio en esta etapa. |
| **Planes = grado de acceso, no gama de vino** | Todos acceden a todo en líneas generales (pool único). La banda alta no queda encerrada en íconos ni la base condenada a gama media: la diferencia es **cuántos íconos y con qué prioridad**. Lo contrario del club lineal que manda la misma caja. Ver sección 7. |
| **Mercado inicial** | AMBA |
| **Política de precio al cliente** | "35% de descuento sobre sugerido de bodega" (más en la banda alta). Beneficio real verificable + margen-piso garantizado. |
| **Guarda** | Cobrada aparte, modelo de umbral (incluida hasta X botellas, paga al superar). **Módulo cerrado — ver sección 6.** |
| **Valorización de la cava** | Ancla = sugerido de bodega al momento de compra, congelado en USD. Revalorización 7,5%/año. **Modelo cerrado e implementado en Airtable — ver sección 8.** |
| **Dónde vive** | Sección dentro de **edb.com.ar** (no sitio aparte). Facturación por EDB, sin figura jurídica nueva por ahora. |
| **Stack** | Airtable (datos) + Vercel (sitio y proxy). Softr como opción para vistas gateadas de socios más adelante. |
| **Modelo de datos** | Consumidas se archivan (no se borran), FIFO. Arquitectura **multi-usuario / multi-grupo desde el inicio**, con la **Cava** como objeto central. Ver sección 9. |
| **Marca** | "Club EDB", respaldada por EDB (marca respaldada, no nueva desde cero). |
| **Narrativa coleccionable vs. inversión** | **Pendiente, requiere consulta legal.** Decide regulación, marketing, cliente target y lenguaje. Condiciona mostrar valuaciones y todo el Motor 4. |

---

## 4. La política de margen: la "triple capa"

1. **Margen base disfrazado de beneficio.** El "35% de descuento sobre sugerido" deja margen-piso para el operador y beneficio real para el cliente. Nadie se siente engañado.
2. **Acciones por cantidad estructurales (5+1, 3+1…).** Descuentos fijos de bodega que un solo club no alcanza pero que se activan al consolidar varios clubes + los locales. Es la economía de escala que se captura al crecer.
3. **Acciones agresivas oportunistas.** No predecibles; cuando aparecen van casi enteras a margen porque el precio al club ya está fijado por la política del 35%.

Las capas 2 y 3 son la tesis de escala: el negocio se vuelve más rentable cuanto más crece.

---

## 5. Los cuatro motores de ingreso

| Motor | Naturaleza | Fase | Rol |
|---|---|---|---|
| **1 · Margen de compra** | Transaccional | 1 | Volumen, caja, ventaja de costo |
| **2 · Guarda** | Recurrente creciente | 1 | Rentabilidad de largo plazo + candado anti-churn |
| **3 · Servicios premium** | Recurrente + puntual | 1 | Margen alto + marca (asignaciones escasas / eventos) |
| **4 · Marketplace interno** | Take rate / plataforma | 2 | Cambia la naturaleza del negocio: de servicio a plataforma |

- **Motor 2 (guarda)** es el corazón económico: ingreso recurrente que no depende de que compren más, candado anti-churn (nadie muda años de cava), y el foso más difícil de copiar (cava profesional con trazabilidad = CAPEX + know-how + años).
- **Motor 4 (marketplace)** es Fase 2. Su pieza brillante: el vino no se mueve físicamente, todas las cavas están en la misma instalación, solo cambia de titular en el sistema. Arquitectura probable: híbrida (cerrada primero, abierta después). **No bloquea el lanzamiento.**

---

## 6. Módulo de guarda: umbral y precio (CERRADO)

La guarda es el Motor 2. Se cobra **barato por botella a propósito** —cobrar caro por guardar contradice la promesa de un club de guarda— pero tiene que ser un **motor real**: cubrir mantenimiento y alquiler y dejar margen a escala. La renta no la hace el precio unitario sino el volumen de botellas que nunca se van. El servicio es *ad eternum*: cada botella que entra tiende a quedarse, así que es la base recurrente más predecible del negocio.

**Regla del umbral:**
- Se mide sobre el **stock actual en guarda**, no sobre la compra histórica. No se premia rotar ni consumir: es un club de guarda, el que acumula es el mejor cliente. Cruzar el umbral es un **logro** ("tu colección superó la cava incluida"), no un peaje.
- Es **proporcional al presupuesto** y se cuenta en **equivalentes de 750**.
- **Banda base (50–99):** 30 botellas incluidas. Un socio típico cruza a **~1,5 años** (18 meses de compras, ya con varias botellas probadas: momento razonable para empezar a pagar y ya atado).
- **Banda alta (100+):** 60 botellas (el doble exacto).

**Precio del excedente:** **0,15 USD/botella-mes (base)** y **0,10 (alta)**, cobrado **solo sobre lo que supera el umbral** — el umbral siempre gratis (modelo tipo datos del celular, no "cruzaste y pagás por todas", que se sentiría trampa).

**Formato especial** paga por su **equivalencia real en 750** (Jeroboam ×4, Magnum ×2): ocupa más y requiere mueble adaptado, así que paga lo que cuesta. No es castigo, es el costo real.

**Fundamento de costo:** ~0,05 USD/botella-mes a depósito lleno (alquiler ~700k ARS / capacidad ~10.000 botellas). El umbral incluido es un **subsidio chico** que absorbe la cuota (60 botellas de banda alta ≈ USD 3/mes de costo contra una cuota de 100+). **Benchmark La Cripta (Insolity, España):** 0,20/0,15 EUR por botella-mes; no guardan botellas de menos de 40 EUR; formatos especiales +10%; seguro 0,13% anual sobre valor de adquisición; permanencia mínima 2 años. Estamos **cómodos por debajo del estándar europeo** → defendible como precio justo, no como abuso.

**Elasticidad y copy:** en el momento de pago la elasticidad es baja (ya está atado, no muda años de cava). Pero el argumento al cliente **no es el lock-in, es el benchmark** ("en España esto sale más"). El lock-in es *por qué* paga sin irse; el benchmark es *por qué lo siente justo*.

**Watch-out de la gama media:** a 0,15 una botella de ~15 USD paga ~12%/año de su valor, por encima del 7,5% de estiba. Para las baratas la guarda se come la revalorización. Se autorresuelve (la gente toma lo barato y guarda lo que vale la pena añejar), pero cambia el relato: la gama media **no** se vende como "se revaloriza y se paga sola" (falso para esas botellas), se vende como **"tu colección entera cuidada como en un banco suizo, por monedas"**. La historia de revalorización queda para íconos y bandas altas.

**Derivado pendiente:** seguro sobre las botellas en guarda (tarjeta Trello #37, lista Legal/fiscal/operativo).

---

## 7. Núcleo de servicio (lanzamiento: dos bandas)

| Servicio (cuota base) | Banda base | Banda alta |
|---|---|---|
| Compra a precio club (35% s/ sugerido) | ✓ | ✓ (descuento mayor) |
| Tracking digital de la colección | ✓ | ✓ |
| Coordinación de juntadas y logística | ✓ | ✓ |
| Informe anual valuado | ✓ | ✓ |
| Guarda incluida hasta el umbral (30 / 60 botellas) | ✓ | ✓ |
| Prioridad en vinos difíciles / asignaciones | — | ✓ |
| Precio preferencial en cenas y eventos | — | ✓ |

Regla premium: a mayor banda, mayor descuento sobre sugerido (menos margen porcentual sobre mucho más volumen absoluto).

**Posicionamiento (decisión de fondo).** Los planes se diferencian por **grado de acceso**, no por gama de vino. Pagar caro no te encierra en íconos y te hace perder joyitas de gama media, oportunidades, etc.; pagar barato no te condena a gama media ni te deja afuera de los íconos. **Todos pueden acceder a todo en líneas generales**: la idea es que experimentes todos los estilos, pagues poco o mucho. El instrumento que lo banca sin mantener catálogos separados es la **prioridad en asignaciones** (pool único; la banda alta tiene el primer *dibs* cuando entra algo escaso). Operativamente es un alivio; comercialmente es el diferencial contra la caja mensual lineal.

> **Copy honesto:** vender *"podés experimentar todos los estilos, pagues poco o mucho"* (verdadero), **no** *"todos tienen los mismos vinos"* (la excepción honesta es el ultra-ícono que se come 3 meses de cuota: el de banda base lo toca de vez en cuando, no todos los meses).

**Gama media guardable (diferencial de producto).** Probado en la propia cava del #001: hay gama media (USD 10–20) que se guarda 5–10 años y mejora (ej.: Alpamanta Estate Cab. Sauv. 2010 con 15 años, impecable; Kaiken Ultra 2007/2011/2013 conseguidos ya añejados). La mayoría de la gama media mejora hasta ~5 años, suficiente para que valga la pena guardarla y no tomarla ya. Esto habilita **sembrar la cava con estiba ya hecha**: un socio que entra hoy no espera diez años para vivir la guarda, se le arranca la cava con botellas que *ya* tienen 12–15 años, compradas a costo de gama media. Acorta el *time to magic* a cero. (Al cargar datos: distinguir revalorización genuina de mero corrimiento por inflación/dólar — ver sección 8.)

---

## 8. Modelo de valorización de la cava (CERRADO e implementado en Airtable)

**Principio.** El precio de compra **no** es valor de mercado (se compra con descuento fuerte sobre el sugerido). Revalorizar desde el costo partiría de una base artificialmente baja.

- **Ancla = sugerido de bodega al momento de compra**, capturado en ARS, pasado a USD al **TC de ese mes** y **congelado**. Es trabajo de alta, no de mantenimiento → escala a miles de etiquetas.
- **Estiba** se mide desde la **fecha de ingreso a la cava**, no desde la añada (el vino sale de bodega con 2–3 años de crianza; edad ≠ estiba).
- **Revalorización: 7,5% anual** (conservador; el estándar es 10%), **tope 10 años**, **tope 20 años para íconos** (checkbox Ícono).
- **Dos ganancias separadas, nunca sumadas en un solo número:**
  - **Ganancia club** = sugerido − pagado. Hecho duro, verificable, prueba de que el club rinde desde el día uno. Argumento de venta.
  - **Ganancia estiba** = valor hoy − ancla. Estimación que crece sola con el tiempo.
  - Mezclarlas contaminaría lo sólido con lo estimado.
- **Tipo de cambio:** promedio mensual en tabla aparte; cada botella toma el TC del mes de su ingreso. (Decisión pendiente fina: qué dólar de referencia usar de forma consistente para toda la serie.)
- **Nombre del vino limpio** (sin añada ni formato); añada y formato en campos aparte; campo calculado **"Etiqueta completa"** (bodega + vino + añada) como clave visual, que habilita el salto entre añadas en el tablero y el aprendizaje de perfil por etiqueta.
- **"El más nuevo pisa" — descartado:** en vinos de guarda casi no se recompra el mismo producto años después (salen del mercado), así que no vale la ingeniería de re-anclar toda una etiqueta con la compra más reciente. El ancla queda fija por botella.

**Revisión por única vez (pendiente, al cargar).** Los cinco años fueron turbulentos de precios: el vino argentino tuvo aumentos **muy por encima de la inflación** durante 1–2 años (arranque de gestión Milei, sobre todo íconos y gama alta) y en los últimos 1–2 años viene **perdiendo contra la inflación**, bastante clavado. Es una curva **real** del mercado, no solo ruido cambiario. Riesgo: que el año de compra sesgue la valuación. Como **cada bodega se movió distinto** (y hay dispersión incluso dentro de una misma camada), **no** se corrige por camada: se **reconstruyen todos los costos actuales de una vez** (relevar el sugerido de cosecha actual de toda la cava) y se analiza con la tabla completa sobre la mesa. Es trabajo grande pero por única vez, y de paso deja el ancla actualizada. Cero teoría hasta tener los números.

**Motor de aprendizaje (decisión de datos).** Al consumir, el **dueño** de la cava marca la botella como consumida y **puntúa** (ese es el momento de cata). **No se guarda el promedio: se guarda cada voto con su autor** (tabla Puntajes, con los 4 componentes de cata). El dato individual es lo que permite aprender el perfil de cada usuario y optimizar sus compras futuras; como el voto está atado a la persona y no a la cava, el perfil viaja entre formatos (grupal → individual).

---

## 9. Defensibilidad (el foso)

La cava de guarda ata al cliente (años de stock no se mudan); la vinoteca da acceso y costo que un entrante no tiene; los grupos cerrados dan adquisición múltiple por venta y churn bajo; los datos e historia real del propio club son prueba viva y storytelling; y, cuando el Motor 4 madure, la red de cavas misma se vuelve infraestructura de mercado imposible de copiar sin replicar todo lo anterior.

---

## 10. El filtro de los inversores (anticipado)

1. ¿Es negocio o lifestyle? Hoy lifestyle; para ser negocio debe ser replicable sin depender del fundador eligiendo cada botella.
2. ¿La unit economics cierra? Pendiente de validar con datos reales.
3. ¿Es escalable? El Motor 4 es la respuesta de fondo.
4. ¿Hay defensibilidad? Ver sección 9.

---

## 11. Estado de construcción

**Base de datos (Airtable "Club EDB") — CONSTRUIDA.** Arquitectura multi-usuario / multi-grupo con la **Cava** como objeto central (tabla intermedia Individual/Grupal entre Usuarios/Grupos y Botellas, para evitar vínculos polimórficos). Siete tablas: Usuarios, Grupos, Cavas, Membresías (N a N, rol Presidente/Miembro), Botellas, Consumos, Puntajes, más una tabla de Tipo de cambio (promedio mensual). El **modelo de valorización de la sección 8 está implementado y verificado** de punta a punta (ancla en USD, estiba, valor estimado, ganancia club y ganancia estiba, todos calculados). Detalle de tablas/campos/IDs en el documento de traspaso y en el spec de esquema.

**Prototipos funcionales** (HTML/CSS/JS vanilla, son el diseño/spec, hoy con datos de muestra):

- **Tablero de la cava** — el gestor/visualizador, el diferencial del club. Perfil del grupo (nombre, avatar, miembros, consumidos); indicadores; valor de la cava tras candado (solo socios); dona de cepas y barras por región clickeables; gráfico de compras y consumos por año; gráfico de añadas clickeable; buscador y filtros por tipo y formato; lista de etiquetas con detalle (ingreso, consumidas, salto a otras añadas del mismo vino); toggle grupal/individual; tira fija de demo.
- **Landing de la sección** — hero, dos formatos (individual/grupal), comparación de planes, dos fichas de colección con botón "Entrar al tablero", alta/signup.

**Proxy `api/cava.ts` — ESCRITO** (pendiente de deploy). Whitelist estricta de campos públicos (los privados —precios, valuaciones, ganancias, posición en cava— ni se consultan); paginado; `Cache-Control` contra el rate limit de Airtable. El **valor total de la cava queda deliberadamente afuera** hasta resolver la consulta legal coleccionable vs. inversión; cuando se habilite, se calcula server-side y se devuelve solo el total agregado, nunca precio por botella.

**Excel de carga — ENTREGADO** (`Club EDB - Carga de botellas.xlsx`): hoja Botellas con dropdowns sincronizados con Airtable y Mes TC autocalculado, hoja Tipo de cambio, hoja Leeme.

**Definiciones de datos tomadas:** agrupar por etiqueta; copita por tipo de vino; precio no se muestra por fila y el valor total va tras candado (afuera cae del lado inversión); formatos grandes deducidos de la equivalencia en 750; consumidas archivadas con FIFO. Las medallas/premios al grupo NO van en la vista de ventas: viven en el perfil de miembro estilo foro (Fase 2).

---

## 12. Estado técnico (auditoría de edb.com.ar)

- **Stack real:** React 18 + TypeScript, Vite, Tailwind v4 (con tokens propios: `bg-edb-base`, `text-edb-gold`, etc.), React Router v7. Sin `tsc` estricto en el build.
- **Hosting:** Vercel único. Deploy por `git push` a `main` (sin staging). El `vercel.json` ya reescribe todo a `index.html` (SPA).
- **Serverless:** los archivos en `api/` se vuelven endpoints solos. Hoy existe `api/lead.ts` — es el patrón a copiar.
- **Secretos:** en el dashboard de Vercel, leídos con `process.env` solo del lado del servidor. El front nunca ve una key (no hay `VITE_*`). Para el club: se suma `AIRTABLE_TOKEN` igual.
- **Auth:** hoy no hay. El sitio es público.
- **Recomendación:** página del club → ruta `/club` con carpeta `src/club/`; proxy → `api/cava.ts` (mismo patrón que `api/lead.ts`).
- **Riesgos:** rate limit de Airtable (5 req/s, se resuelve con `Cache-Control`); cold starts (1–2 s, trivial); catálogo semi-privado (token en URL o password si se quiere gatear el listado); CORS no es problema (mismo dominio).

---

## 13. Plan paso a paso (próximo bloque)

1. **Cargar datos reales del #001** en el Excel de carga e importar a Airtable; cargar los TC mensuales de los meses con compras.
2. **Revisión de valorización por única vez** (sección 8): relevar el sugerido de cosecha actual de toda la cava y analizar el desvío con la tabla completa.
3. **Deploy del proxy:** llevar `cava.ts` al repo como `api/cava.ts`, cargar `AIRTABLE_TOKEN` en Vercel, `git push` a `main`, alinear con `api/lead.ts` si difiere.
4. **Portar** landing + tablero a React en `src/club/`, ruta `/club`, con los tokens `edb-*` (se hace en Claude Code; necesita el repo clonado y los dos HTML de prototipo).

---

## 14. Pendientes críticos de validar

- **Moneda y medio de pago.**
- **Revisión de valorización por única vez** (sección 8) — al cargar los datos del #001.
- **Público de la landing** (define el copy): conocidos vs. desconocidos. Para desconocidos, el ancla de confianza es EDB (dos locales, 13 años).
- **Narrativa coleccionable vs. inversión** → consulta legal. Condiciona mostrar valuaciones y todo el Motor 4.
- **Seguro sobre las botellas en guarda** (tarjeta #37): póliza propia vs. exigírsela al socio; si se traslada como línea aparte o se absorbe.
- **Catálogo semi-privado sí/no** (token/password) — decisión, no bloqueo.
- **Display de consumidas**: checkbox "mostrar botellas consumidas".
- **Estructura legal/regulatoria**, **operación mínima viable del primer club pago**, **transición del club fundador**, **CAPEX real de cava** — siguen abiertos (ver Trello).
- Económicos (cuando haya datos reales): margen efectivo de la vinoteca sobre íconos, sensibilidad de precio de las bandas, CAC y churn reales.

**Resuelto en esta etapa (ya no pendiente):** umbral de guarda y precio del excedente (sección 6); modelo de valorización (sección 8); esquema de Airtable (sección 11).

---

## 15. Activos que el proyecto hereda

Logo e identidad ("Club EDB #001", escudo con copa); formato de informe anual valuado ya probado; Excel histórico de 5 años (inventario, compras, consumos, presupuesto, posición en cava); historia y storytelling auténtico; relación con bodegas vía la vinoteca; cava acondicionada; conocimiento operacional acumulado. El "#001" implica numéricamente la idea de réplica (#002, #003…): es el modelo de negocio en una marca.

---

## 16. Otros modelos considerados (descartados como foco)

Suscripción premium curada (mercado saturado); wine investment fund (sin mercado secundario líquido en Argentina — el Motor 4 lo reabre parcialmente); curaduría/armado de cavas a medida (posible línea complementaria); SaaS para clubes de vino (posible spin-off futuro). El elegido es guarda colectiva + carteras individuales.

---

## 17. Decisión metodológica

No se arman modelos financieros ni proyecciones hasta que haya datos reales que validen los supuestos. Los Excel y PDF con proyecciones generados al principio quedan archivados como ilustración, no como plan. Modelar antes de pensar es el error clásico de quien quiere parecer riguroso sin serlo.

---

## 18. Archivos y entregables del proyecto

- **`Club del Vino - Documento interno.md`** — este documento (memoria viva).
- **`Club EDB - Documento de traspaso.md`** — estado + plan de ejecución para retomar en un chat nuevo (incluye IDs de Airtable y próximos pasos).
- **`Club EDB - Carga de botellas.xlsx`** — planilla de carga con dropdowns sincronizados y Mes TC autocalculado.
- **`cava.ts`** — proxy serverless para Airtable (whitelist de campos públicos), pendiente de deploy.
- **`club-edb-seccion.html`** — prototipo de la landing de la sección.
- **`club-edb-catalogo.html`** — prototipo del tablero/gestor de la cava.
- **Spec "Club EDB — Esquema de datos"** — detalle de tablas y campos (artifact).
- **Trello:** "Club del Vino — Proyecto" (https://trello.com/b/cVMHAzDW/club-del-vino-proyecto), con tarjetas al día.
- Materiales viejos (modelo financiero .xlsx, presentaciones .pdf): archivados como ilustración, números a tomar con pinzas.
