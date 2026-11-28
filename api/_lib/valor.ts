// Cuentas de la tarjeta "Valor de la cava" (sólo socios). Sin red ni Airtable: recibe filas ya leídas.
// Sólo cuentan las botellas con Origen = "Compra club" (regalos y aportes no tienen precio).
// El valor de cada botella repite la fórmula del campo "Valor estimado USD" de Airtable:
//   Sugerido USD × 1,075 ^ min(años de estiba, tope)   (tope 10 años; 20 si es Icono o el sugerido de un 750 pasa USD 60)
// pero contando los años de estiba hasta cada mes, para la serie del gráfico.
export const ORIGEN_CLUB = 'Compra club';

export interface FilaBotella {
  id: string; origen: string; cantidad: number; enGuarda: number; fecha: string;   // fecha = AAAA-MM-DD de ingreso
  pagado: number; sugerido: number; valorEst: number; gananciaEstiba: number; icono: boolean; formato: string;
  vino?: string; anada?: string; bodega?: string; cepa?: string;   // sólo para "Lo último que entró"
  pagadoArs?: number;   // Pagado ARS por botella (pesos del mes de compra); sin él, Compras usa Pagado USD × el dólar de ese mes
}
export interface FilaConsumo { botella: string; cantidad: number; fecha: string; sugeridoHist: number }
export interface PuntoValor { mes: string; compras: number; tomado: number; cava: number }   // mes = AAAA-MM, todo en USD acumulado
// La cuenta del bloque Valor cierra: compras + ahorro + guarda − tomado = valorCava (todo de las compras del club, en USD).
// Descuento = 1 − costo / sugerido de las compras del club (todas, o las de un año), en % entero.
export interface DescuentoClub { pct: number; costo: number; sugerido: number; ahorro: number; botellas: number; porAnio: { anio: number; pct: number; botellas: number }[] }
// Una etiqueta (vino + añada + formato) en guarda: lo que sumó la guarda = Σ botellas × (valor hoy − Sugerido USD), y % = valor hoy / ancla − 1
export interface EtiquetaCrecida { vino: string; anada: string; formato: string; anios: number; botellas: number; suma: number; pct: number }
export interface InformeValor {
  valorCava: number; compras: number; porcentaje: number; guarda: number; tomado: number;
  ahorro: number;                          // sugerido − costo, de todas las compras del club
  botellasTomadas: number; botellasEnCava: number; serie: PuntoValor[];   // sólo las que tienen precio (compras del club)
  enGuardaTodas: number; abiertasTodas: number;   // todas las botellas de la cava, con y sin precio (regalos y aportes)
  descuento: DescuentoClub;                // cuánto menos que el precio sugerido pagó el club (informe de Valor)
  crecieron: EtiquetaCrecida[];            // las 5 etiquetas en guarda que más sumó la guarda (la pantalla pide 3 o más con guarda > 0)
  crecieronN: number;                      // cuántas etiquetas en guarda tienen guarda > 0
  plan?: 'Reserva' | 'Gran Reserva'; topePlan?: number;   // los pone api/montos.ts desde la cuota de la cava
  mesEnCurso: string;                      // AAAA-MM del mes calendario actual
  asignadoMes: number;                     // lo pagado por las botellas de ese mes
  comprasPorMes: Record<string, number>;   // AAAA-MM → USD pagado ese mes
}

const LITROS: Record<string, number> = { '750': 1, 'Magnum 1.5': 2, 'Jeroboam 3': 4, '6 L': 8, 'Salmanazar 9': 12, '12 L': 16 };
const ymd = (s: string) => { const [a, m, d] = s.slice(0, 10).split('-').map(Number); return { a, m, d }; };
// años cumplidos entre dos fechas (como DATETIME_DIFF(..., 'years'))
function aniosEntre(desde: string, hasta: string): number {
  const x = ymd(desde), y = ymd(hasta);
  let n = y.a - x.a;
  if (y.m < x.m || (y.m === x.m && y.d < x.d)) n--;
  return Math.max(0, n);
}
function valorAl(b: FilaBotella, fecha: string): number {
  if (!b.sugerido) return 0;
  const tope = b.icono || b.sugerido / (LITROS[b.formato] ?? 1) > 60 ? 20 : 10;
  return b.sugerido * Math.pow(1.075, Math.min(aniosEntre(b.fecha, fecha), tope));
}
const finDeMes = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
function sumarMes(mes: string): string { const [a, m] = mes.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; }

export function calcularValor(todas: FilaBotella[], todosConsumos: FilaConsumo[], hoy: string): InformeValor {
  const bots = todas.filter(b => b.origen === ORIGEN_CLUB);
  const ids = new Set(bots.map(b => b.id));
  const cons = todosConsumos.filter(c => ids.has(c.botella));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const valorCava = sum(bots.map(b => b.enGuarda * b.valorEst));
  const compras = sum(bots.map(b => b.cantidad * b.pagado));
  const ahorro = sum(bots.map(b => b.cantidad * (b.sugerido - b.pagado)));
  const guarda = sum(bots.map(b => b.enGuarda * b.gananciaEstiba));
  const tomado = sum(cons.map(c => c.cantidad * c.sugeridoHist));
  const porcentaje = compras > 0 ? Math.round((valorCava / compras - 1) * 100) : 0;

  // serie mensual: del mes de la primera compra al mes actual
  const fechados = bots.filter(b => b.fecha);
  const serie: PuntoValor[] = [];
  if (fechados.length) {
    const primero = fechados.map(b => b.fecha.slice(0, 7)).sort()[0];
    const ultimo = hoy.slice(0, 7);
    for (let mes = primero; mes <= ultimo; mes = sumarMes(mes)) {
      const corte = mes === ultimo ? hoy : finDeMes(mes);
      const consHasta = cons.filter(c => c.fecha && c.fecha.slice(0, 10) <= corte);
      const tomadas = new Map<string, number>();
      for (const c of consHasta) tomadas.set(c.botella, (tomadas.get(c.botella) ?? 0) + c.cantidad);
      let cCompras = 0, cCava = 0;
      for (const b of fechados) {
        if (b.fecha.slice(0, 10) > corte) continue;
        cCompras += b.cantidad * b.pagado;
        cCava += Math.max(0, b.cantidad - (tomadas.get(b.id) ?? 0)) * valorAl(b, corte);
      }
      serie.push({ mes, compras: Math.round(cCompras), tomado: Math.round(sum(consHasta.map(c => c.cantidad * c.sugeridoHist))), cava: Math.round(cCava) });
    }
  }
  const comprasPorMes: Record<string, number> = {};
  for (const b of fechados) { const k = b.fecha.slice(0, 7); comprasPorMes[k] = (comprasPorMes[k] ?? 0) + b.cantidad * b.pagado; }
  for (const k of Object.keys(comprasPorMes)) comprasPorMes[k] = Math.round(comprasPorMes[k]);
  // descuento total y año por año: sólo compras del club, con el mismo cálculo (1 − costo / sugerido)
  const pctDesc = (costo: number, sug: number) => (sug > 0 ? Math.round((1 - costo / sug) * 100) : 0);
  const sugeridoTotal = sum(bots.map(b => b.cantidad * b.sugerido));
  const anios = new Map<number, { costo: number; sug: number; bot: number }>();
  for (const b of fechados) {
    const a = Number(b.fecha.slice(0, 4)), x = anios.get(a) ?? { costo: 0, sug: 0, bot: 0 };
    x.costo += b.cantidad * b.pagado; x.sug += b.cantidad * b.sugerido; x.bot += b.cantidad; anios.set(a, x);
  }
  const descuento: DescuentoClub = {
    pct: pctDesc(compras, sugeridoTotal), costo: Math.round(compras), sugerido: Math.round(sugeridoTotal), ahorro: Math.round(ahorro),
    botellas: Math.round(sum(bots.map(b => b.cantidad))),
    porAnio: [...anios.entries()].sort((a, b) => a[0] - b[0]).map(([anio, x]) => ({ anio, pct: pctDesc(x.costo, x.sug), botellas: Math.round(x.bot) })),
  };
  // las que más crecieron en guarda: por etiqueta (vino + añada + formato), de las botellas que siguen en guarda
  const etq = new Map<string, { vino: string; anada: string; formato: string; desde: string; bot: number; suma: number; ancla: number }>();
  for (const b of bots) {
    if (!(b.enGuarda > 0) || !b.vino?.trim()) continue;
    const k = `${b.vino.trim().toLowerCase()}|${b.anada ?? ''}|${b.formato ?? ''}`;
    const e = etq.get(k) ?? { vino: b.vino.trim(), anada: String(b.anada ?? ''), formato: b.formato ?? '', desde: '', bot: 0, suma: 0, ancla: 0 };
    e.bot += b.enGuarda; e.suma += b.enGuarda * (b.valorEst - b.sugerido); e.ancla += b.enGuarda * b.sugerido;
    if (b.fecha && (!e.desde || b.fecha < e.desde)) e.desde = b.fecha;
    etq.set(k, e);
  }
  const conGuarda = [...etq.values()].filter(e => e.suma > 0 && e.ancla > 0).sort((a, b) => b.suma - a.suma);
  const crecieron: EtiquetaCrecida[] = conGuarda.slice(0, 5).map(e => ({
    vino: e.vino, anada: e.anada, formato: e.formato, anios: e.desde ? aniosEntre(e.desde, hoy) : 0, botellas: Math.round(e.bot), suma: Math.round(e.suma), pct: Math.round((e.suma / e.ancla) * 100),
  }));
  const mesEnCurso = hoy.slice(0, 7);
  return {
    descuento, crecieron, crecieronN: conGuarda.length,
    mesEnCurso, asignadoMes: comprasPorMes[mesEnCurso] ?? 0, comprasPorMes,
    valorCava: Math.round(valorCava), compras: Math.round(compras), porcentaje, guarda: Math.round(guarda), tomado: Math.round(tomado),
    ahorro: Math.round(ahorro),
    botellasTomadas: Math.round(sum(cons.map(c => c.cantidad))), botellasEnCava: Math.round(sum(bots.map(b => b.enGuarda))), serie,
    enGuardaTodas: Math.round(sum(todas.map(b => b.enGuarda))), abiertasTodas: Math.round(sum(todosConsumos.map(c => c.cantidad))),
  };
}

// ── pantalla Compras (sólo socios) ─────────────────────────────────
// Reglas del mes (Compras 9, cuenta corriente EN PESOS). Una sola función para la app y el Panel Admin. Desde "Saldo desde", cada mes:
//  · Presupuesto = la cuota del mes del grupo en pesos = la cuota por socio en pesos de ese mes (pesosDelMes, la misma de Cuotas: la columna
//    Cuota de "Guarda por mes" o, si no está, USD por socio × dólar de ese mes) × la cantidad de socios;
//  · Comprado = suma de las compras del mes en pesos: por botella Math.round(Pagado ARS) × cantidad (sin Pagado ARS: Pagado USD × dólar
//    del mes), igual que la tabla del Panel Admin, así coincide al peso con su "Total del mes";
//  · Para comprar (disponible) = Presupuesto + el saldo que trae del mes anterior. En el mes de "Saldo desde" trae el Saldo inicial de la cava
//    (cargado en USD: se pasa a pesos con el dólar de la cuota de ese mes);
//  · Queda = Para comprar − Comprado. Un mes terminado lo pasa ENTERO al mes siguiente, en pesos, a favor o en contra, sin ajustes ni
//    redondeos. El mes en curso todavía no pasa nada. Antes de "Saldo desde" cada mes va con su presupuesto, sin arrastre.
// Sólo los costos, sugeridos y Valor siguen en USD; todos los montos de MesCompras son PESOS.
export interface ConfigCuota {
  cuota: number | null;            // Cuota mensual USD de la cava (el total del grupo); null = sin cuota, sin cuenta corriente
  saldoInicial: number; saldoDesde: string;   // saldoInicial en USD; saldoDesde = AAAA-MM o "": el arrastre de saldo existe sólo desde ese mes
  dolares?: Record<string, number>;           // dólar oficial de cada mes (AAAA-MM → valor)
  plan?: PlanPesos; socios?: number;          // la cuota por socio en pesos de cada mes (Guarda por mes) y cuántos socios la pagan
}
export interface MesCompras {
  mes: string; botellas: number;
  cuota: number;                  // Presupuesto del mes, en pesos (la cuota del grupo)
  asignado: number;               // Comprado en el mes, en pesos
  saldoAnterior: number | null;   // pesos que le pasó el mes anterior (null = antes de "Saldo desde" o en el mes de "Saldo desde")
  saldoInicial: number | null;    // en el mes de "Saldo desde": el Saldo inicial de la cava en pesos (null en los demás)
  disponible: number;             // Para comprar, en pesos: Presupuesto + saldo que trae (o el saldo inicial)
  queda: number;                  // disponible − asignado, en pesos: lo que falta (mes en curso) o lo que pasa al mes siguiente
  arrastre: boolean;              // true desde "Saldo desde": al terminar el mes, lo que queda pasa al mes siguiente
  dolar: number | null;           // dólar oficial de ese mes (sólo informativo: los montos ya están en pesos)
}
// un vino de un mes con un solo precio por botella: cant × costo = lo pagado, cant × sug = a precio sugerido
export interface FilaMes { vino: string; anada: string; cant: number; costo: number; sug: number }
export interface UltimaEtiqueta { vino: string; anada: string; bodega: string; cepa: string; botellas: number }
export interface Regalo { vino: string; anada: string; bodega: string; cepa: string; botellas: number; origen: string }
export interface InformeCompras {
  meses: MesCompras[];            // del primer mes con compras (o "Saldo desde") al mes actual, en pesos (vacío si la cava no tiene cuota)
  porMes: Record<string, { costo: number; sugerido: number }>;
  filasMes: Record<string, FilaMes[]>;   // por mes: un vino por precio (USD por botella); sólo viaja con sesión
  ultimas: UltimaEtiqueta[];
  club: { botellas: number; desde: string; costo: number; sugerido: number };
  regalos: Regalo[];              // origen distinto de "Compra club", de la más nueva a la más vieja
}
const restarDias = (f: string, d: number) => new Date(Date.parse(f.slice(0, 10) + 'T00:00:00Z') - d * 86400000).toISOString().slice(0, 10);

export function calcularCompras(todas: FilaBotella[], hoy: string, cfg: ConfigCuota): InformeCompras {
  const bots = todas.filter(b => b.origen === ORIGEN_CLUB && b.fecha);
  const porMes: Record<string, { costo: number; sugerido: number }> = {};
  const botMes: Record<string, number> = {};
  const filasMes: Record<string, FilaMes[]> = {};
  let costo = 0, sugerido = 0, botellas = 0;
  for (const b of bots) {
    const k = b.fecha.slice(0, 7);
    const m = porMes[k] ?? (porMes[k] = { costo: 0, sugerido: 0 });
    m.costo += b.cantidad * b.pagado; m.sugerido += b.cantidad * b.sugerido;
    botMes[k] = (botMes[k] ?? 0) + b.cantidad;
    if (b.cantidad > 0) {
      const vino = (b.vino ?? '').trim(), anada = String(b.anada ?? '').trim();
      const fs = filasMes[k] ?? (filasMes[k] = []);
      const e = fs.find(f => f.vino.toLowerCase() === vino.toLowerCase() && f.anada === anada && Math.abs(f.costo - b.pagado) < 0.005 && Math.abs(f.sug - b.sugerido) < 0.005);
      if (e) e.cant += b.cantidad;
      else fs.push({ vino, anada, cant: b.cantidad, costo: b.pagado, sug: b.sugerido });
    }
    costo += b.cantidad * b.pagado; sugerido += b.cantidad * b.sugerido; botellas += b.cantidad;
  }
  const mesHoy = hoy.slice(0, 7);
  const primerMes = Object.keys(porMes).sort()[0] ?? '';
  const dolares = cfg.dolares ?? {};
  // lo comprado en pesos, por mes (por botella redondeado al peso, como la tabla del Panel Admin)
  const compradoMes: Record<string, number> = {};
  for (const b of bots) {
    const k = b.fecha.slice(0, 7);
    const porBotella = Math.round(b.pagadoArs && b.pagadoArs > 0 ? b.pagadoArs : b.pagado * (dolarDe(k, dolares) ?? 0));
    compradoMes[k] = (compradoMes[k] ?? 0) + Math.round(b.cantidad) * porBotella;
  }
  const meses: MesCompras[] = [];
  if (cfg.cuota != null) {
    const socios = Math.max(1, cfg.socios ?? 1);
    const plan: PlanPesos = cfg.plan ?? { filas: {}, dolares, cuotaUsdSocio: cfg.cuota / socios };
    const presupuesto = (mes: string) => Math.round(pesosDelMes(mes, plan).cuota * socios);
    // el dólar de la cuota de un mes: el que surge de la cuota cargada en "Guarda por mes", o el oficial de ese mes
    const dolarCuota = (mes: string) => { const f = plan.filas[mes]; return f && f.cuotaSocio != null && plan.cuotaUsdSocio > 0 ? f.cuotaSocio / plan.cuotaUsdSocio : dolarDe(mes, dolares) ?? 1; };
    const desde = cfg.saldoDesde || mesHoy;
    const inicio = primerMes && primerMes < desde ? primerMes : desde;
    let saldo = 0;                                    // pesos que pasan del mes anterior
    for (let mes = inicio; mes <= mesHoy; mes = sumarMes(mes)) {
      const asignado = compradoMes[mes] ?? 0;
      const arrastre = mes >= desde;
      const esDesde = mes === desde;
      const inicial = esDesde ? Math.round(cfg.saldoInicial * dolarCuota(mes)) : 0;
      const trae = arrastre && !esDesde ? saldo : 0;
      const cuota = presupuesto(mes);
      const disponible = cuota + trae + inicial;
      meses.push({
        mes, botellas: Math.round(botMes[mes] ?? 0), cuota, asignado,
        saldoAnterior: arrastre && !esDesde ? trae : null, saldoInicial: esDesde ? inicial : null,
        disponible, queda: disponible - asignado, arrastre, dolar: dolarDe(mes, dolares),
      });
      saldo = arrastre ? disponible - asignado : 0;
    }
  }
  // etiquetas que entraron en los últimos 30 días (varias filas del mismo vino y añada se juntan)
  const corte = restarDias(hoy, 30);
  const juntas = new Map<string, UltimaEtiqueta>();
  for (const b of bots.filter(b => b.fecha.slice(0, 10) >= corte).sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    const vino = (b.vino ?? '').trim(), anada = String(b.anada ?? '').trim();
    const k = `${vino.toLowerCase()}|${anada}`;
    const e = juntas.get(k);
    if (e) e.botellas += b.cantidad;
    else juntas.set(k, { vino, anada, bodega: (b.bodega ?? '').trim(), cepa: (b.cepa ?? '').trim(), botellas: b.cantidad });
  }
  const ultimas = [...juntas.values()].slice(0, 5).map(e => ({ ...e, botellas: Math.round(e.botellas) }));
  // regalos y aportes: una fila por etiqueta y origen, sin montos
  const rg = new Map<string, Regalo & { fecha: string }>();
  for (const b of todas.filter(b => b.origen !== ORIGEN_CLUB && b.cantidad > 0).sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    const vino = (b.vino ?? '').trim(), anada = String(b.anada ?? '').trim();
    const k = `${vino.toLowerCase()}|${anada}|${b.origen}`;
    const e = rg.get(k);
    if (e) e.botellas += b.cantidad;
    else rg.set(k, { vino, anada, bodega: (b.bodega ?? '').trim(), cepa: (b.cepa ?? '').trim(), botellas: b.cantidad, origen: b.origen, fecha: b.fecha });
  }
  const regalos = [...rg.values()].map(({ fecha: _f, ...e }) => ({ ...e, botellas: Math.round(e.botellas) }));
  for (const k of Object.keys(porMes)) porMes[k] = { costo: Math.round(porMes[k].costo), sugerido: Math.round(porMes[k].sugerido) };
  return { meses, porMes, filasMes, ultimas, regalos, club: { botellas: Math.round(botellas), desde: primerMes, costo: Math.round(costo), sugerido: Math.round(sugerido) } };
}

// ── cuotas de los socios ───────────────────────────────────────────
// La cuota y la guarda de cada mes son en pesos, por socio. La cuota del mes sale de la fila "Guarda por mes" de Airtable si la tiene
// (así los meses hasta noviembre 2026 quedan en $77.400) y, si no, es USD (cuota ÷ socios) × el dólar de ese mes. La guarda sale
// de esa misma fila (sin fila, 0). Nada de esto está escrito en el código.
export interface MiembroCuota { id: string; nombre: string; desde: string }          // desde = AAAA-MM o ""
// Un pago: pesos = lo transferido en pesos (los pagos nuevos; cuota y guarda juntas). Los pagos viejos sólo tienen monto en USD (la cuota
// de USD 50 de la "carga inicial"): se toman como el mes pagado entero, porque entonces la guarda no existía (convertirlos con el dólar del
// mes los dejaría debiendo una guarda que nunca se les cobró).
export interface PagoCuota { usuario: string; mes: string; monto: number; pesos?: number }   // mes = AAAA-MM o ""; monto en USD, pesos > 0 = pago en pesos
export interface FilaGuarda { mes: string; cuotaSocio: number | null; guarda: number }  // pesos por socio; cuotaSocio null = sin dato
export interface PlanPesos {
  filas: Record<string, FilaGuarda>;          // por mes (AAAA-MM), de la tabla "Guarda por mes"
  dolares: Record<string, number>;            // dólar oficial de cada mes (tabla Tipo de cambio)
  cuotaUsdSocio: number;                      // cuota del grupo ÷ socios, en USD
}
// el dólar de un mes: el suyo, o el del mes anterior más cercano, o el primero que haya. null = no hay ninguno.
export function dolarDe(mes: string, dolares: Record<string, number>): number | null {
  if (dolares[mes] > 0) return dolares[mes];
  const ks = Object.keys(dolares).filter(k => dolares[k] > 0).sort();
  const antes = ks.filter(k => k <= mes).pop();
  return antes ? dolares[antes] : ks.length ? dolares[ks[0]] : null;
}
// cuota y guarda de un socio en un mes, en pesos. Sin ningún dólar conocido todo queda en USD (enUsd) y la guarda en 0.
export function pesosDelMes(mes: string, plan: PlanPesos): { cuota: number; guarda: number; enUsd: boolean } {
  const d = dolarDe(mes, plan.dolares);
  if (!d) return { cuota: plan.cuotaUsdSocio, guarda: 0, enUsd: true };
  const f = plan.filas[mes];
  return { cuota: f && f.cuotaSocio != null ? f.cuotaSocio : plan.cuotaUsdSocio * d, guarda: f ? f.guarda : 0, enUsd: false };
}
export interface SocioCuota { id: string; nombre: string; alDia: boolean; meses: number; debe: number; aFavor: number; adeudados: { mes: string; falta: number }[] }   // debe y aFavor en pesos; adeudados: cada mes con deuda y lo que le falta (pesos)
export interface InformeCuotas {
  cuotaSocio: number;          // USD por mes cada uno (cuota del grupo ÷ socios)
  desde: string; alDia: number; total: number; socios: SocioCuota[];
  mes: string;                 // el mes en curso
  cuotaPesos: number; guardaPesos: number; totalPesos: number;   // por socio, del mes en curso
  enUsd: boolean;              // sin dólar: los montos de arriba van en USD
}

export function calcularCuotas(p: { cuota: number; cuotasDesde: string; miembros: MiembroCuota[]; pagos: PagoCuota[]; hoy: string; plan: PlanPesos }): InformeCuotas {
  const mesHoy = p.hoy.slice(0, 7);
  const n = Math.max(1, p.miembros.length);
  const cuotaSocio = p.cuota / n;                              // USD por mes cada uno: lo que valía un pago viejo
  const eps = 0.5;                                             // medio peso
  const socios = p.miembros.map(m => {
    const ini = m.desde && m.desde > p.cuotasDesde ? m.desde : p.cuotasDesde;
    const meses: string[] = [];
    for (let x = ini; x <= mesHoy; x = sumarMes(x)) meses.push(x);
    // lo que cada mes pide (cuota + guarda, pesos) y lo que se pagó para ese mes, todo en pesos
    const pide = new Map<string, number>(meses.map(x => { const v = pesosDelMes(x, p.plan); return [x, v.cuota + v.guarda]; }));
    const pagado = new Map<string, number>(meses.map(x => [x, 0]));
    let fondo = 0;                                             // lo que sobra de un mes y lo que no tiene mes (se aplica al mes más viejo que falte)
    for (const g of p.pagos.filter(g => g.usuario === m.id)) {
      const enPesos = g.pesos && g.pesos > 0 ? g.pesos : null;
      if (pagado.has(g.mes)) pagado.set(g.mes, pagado.get(g.mes)! + (enPesos ?? (g.monto / cuotaSocio) * pide.get(g.mes)!));
      else fondo += enPesos ?? g.monto * (dolarDe(g.mes || mesHoy, p.plan.dolares) ?? 1);
    }
    for (const x of meses) { const v = pagado.get(x)!, t = pide.get(x)!; if (v > t) { fondo += v - t; pagado.set(x, t); } }
    // un mes adeudado debe lo que le falta de cuota + guarda; el fondo cubre primero los meses más viejos
    let debe = 0, adeudados = 0;
    const detalle: { mes: string; falta: number }[] = [];
    for (const x of meses) {
      let falta = pide.get(x)! - pagado.get(x)!;
      if (falta > eps && fondo > 0) { const t = Math.min(falta, fondo); falta -= t; fondo -= t; }
      if (falta > eps) { debe += falta; adeudados++; detalle.push({ mes: x, falta }); }
    }
    const alDia = adeudados === 0;
    return { id: m.id, nombre: m.nombre, alDia, meses: adeudados, debe: Math.round(debe), aFavor: alDia ? Math.round(fondo) : 0, adeudados: detalle };
  });
  socios.sort((a, b) => Number(a.alDia) - Number(b.alDia) || b.debe - a.debe || a.nombre.localeCompare(b.nombre, 'es'));
  const v = pesosDelMes(mesHoy, p.plan);
  return {
    cuotaSocio: Math.round(cuotaSocio * 100) / 100, desde: p.cuotasDesde, alDia: socios.filter(s => s.alDia).length, total: socios.length, socios,
    mes: mesHoy, cuotaPesos: Math.round(v.cuota), guardaPesos: Math.round(v.guarda), totalPesos: Math.round(v.cuota + v.guarda), enUsd: v.enUsd,
  };
}
