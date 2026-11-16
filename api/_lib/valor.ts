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
}
export interface FilaConsumo { botella: string; cantidad: number; fecha: string; sugeridoHist: number }
export interface PuntoValor { mes: string; compras: number; tomado: number; cava: number }   // mes = AAAA-MM, todo en USD acumulado
// La cuenta del bloque Valor cierra: compras + ahorro + guarda − tomado = valorCava (todo de las compras del club, en USD).
export interface InformeValor {
  valorCava: number; compras: number; porcentaje: number; guarda: number; tomado: number;
  ahorro: number;                          // sugerido − costo, de todas las compras del club
  botellasTomadas: number; botellasEnCava: number; serie: PuntoValor[];   // sólo las que tienen precio (compras del club)
  enGuardaTodas: number; abiertasTodas: number;   // todas las botellas de la cava, con y sin precio (regalos y aportes)
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
  const mesEnCurso = hoy.slice(0, 7);
  return {
    mesEnCurso, asignadoMes: comprasPorMes[mesEnCurso] ?? 0, comprasPorMes,
    valorCava: Math.round(valorCava), compras: Math.round(compras), porcentaje, guarda: Math.round(guarda), tomado: Math.round(tomado),
    ahorro: Math.round(ahorro),
    botellasTomadas: Math.round(sum(cons.map(c => c.cantidad))), botellasEnCava: Math.round(sum(bots.map(b => b.enGuarda))), serie,
    enGuardaTodas: Math.round(sum(todas.map(b => b.enGuarda))), abiertasTodas: Math.round(sum(todosConsumos.map(c => c.cantidad))),
  };
}

// ── pantalla Compras (sólo socios) ─────────────────────────────────
// Reglas del mes (Compras 3):
//  · cada mes tiene su propio presupuesto: la cuota completa del grupo, hayan pagado o no los socios;
//  · un mes se cierra cuando lo asignado llega al 95 % de lo que hay para gastar (cuota ± saldo que le pasó el mes anterior);
//    por debajo del 95 % sigue abierto, aunque el mes calendario haya terminado. Entre 95 % y 110 % es el cierre normal; un mes que
//    se pasa de 110 % también se da por cerrado (queda "se pasó" y se descuenta del siguiente);
//  · recién al cerrarse, lo que sobró (o se pasó) pasa al mes siguiente; mientras está abierto no se suma a nadie.
export const CIERRE_DESDE = 0.95;
export interface ConfigCuota {
  cuota: number | null;            // presupuesto mensual del grupo en USD (el de la fila de la cava)
  saldoInicial: number; saldoDesde: string;   // saldoDesde = AAAA-MM o ""
  presupuestoMes?: (mes: string) => number;   // presupuesto del grupo en USD de ese mes (si falta, siempre `cuota`)
}
export interface MesCompras {
  mes: string; botellas: number; cuota: number; asignado: number;
  saldoAnterior: number | null;   // lo que le pasó el mes anterior, sólo si ese mes ya cerró (null = nada)
  disponible: number;             // cuota del mes ± saldo que le pasó el mes anterior (lo que hay para gastar)
  queda: number;                  // disponible − asignado: lo que falta (mes abierto), lo que sobró (> 0) o se pasó (< 0)
  arrastre: boolean;              // true desde "Saldo desde": al cerrar, lo que queda pasa al mes siguiente
  cerrado: boolean;               // lo asignado llegó al 95 % de lo disponible
}
export interface UltimaEtiqueta { vino: string; anada: string; bodega: string; cepa: string; botellas: number }
export interface Regalo { vino: string; anada: string; bodega: string; cepa: string; botellas: number; origen: string }
export interface InformeCompras {
  meses: MesCompras[];            // del primer mes con compras al mes actual (vacío si la cava no tiene cuota)
  porMes: Record<string, { costo: number; sugerido: number }>;
  ultimas: UltimaEtiqueta[];
  club: { botellas: number; desde: string; costo: number; sugerido: number };
  regalos: Regalo[];              // origen distinto de "Compra club", de la más nueva a la más vieja
}
const restarDias = (f: string, d: number) => new Date(Date.parse(f.slice(0, 10) + 'T00:00:00Z') - d * 86400000).toISOString().slice(0, 10);

export function calcularCompras(todas: FilaBotella[], hoy: string, cfg: ConfigCuota): InformeCompras {
  const bots = todas.filter(b => b.origen === ORIGEN_CLUB && b.fecha);
  const porMes: Record<string, { costo: number; sugerido: number }> = {};
  const botMes: Record<string, number> = {};
  let costo = 0, sugerido = 0, botellas = 0;
  for (const b of bots) {
    const k = b.fecha.slice(0, 7);
    const m = porMes[k] ?? (porMes[k] = { costo: 0, sugerido: 0 });
    m.costo += b.cantidad * b.pagado; m.sugerido += b.cantidad * b.sugerido;
    botMes[k] = (botMes[k] ?? 0) + b.cantidad;
    costo += b.cantidad * b.pagado; sugerido += b.cantidad * b.sugerido; botellas += b.cantidad;
  }
  const mesHoy = hoy.slice(0, 7);
  const primerMes = Object.keys(porMes).sort()[0] ?? '';
  // cada mes arranca con su presupuesto; el saldo del mes anterior sólo pasa si ese mes ya cerró
  const meses: MesCompras[] = [];
  if (cfg.cuota != null) {
    const desde = cfg.saldoDesde || mesHoy;
    const inicio = primerMes && primerMes < desde ? primerMes : desde;
    let previo: MesCompras | null = null;
    for (let mes = inicio; mes <= mesHoy; mes = sumarMes(mes)) {
      const asignado = porMes[mes]?.costo ?? 0;
      const presupuesto = cfg.presupuestoMes ? cfg.presupuestoMes(mes) : cfg.cuota;
      const arrastre = mes >= desde;
      const trae = arrastre && previo && previo.arrastre && previo.cerrado ? previo.queda : 0;
      const inicial = mes === desde ? cfg.saldoInicial : 0;       // el saldo de arranque entra en el primer mes sin mostrarse como "de {mes}"
      const disponible = presupuesto + trae + inicial;
      const cerrado = asignado > 0 && disponible > 0 && asignado / disponible >= CIERRE_DESDE;
      const m: MesCompras = {
        mes, botellas: Math.round(botMes[mes] ?? 0), cuota: Math.round(presupuesto), asignado: Math.round(asignado),
        saldoAnterior: trae !== 0 ? Math.round(trae) : null, disponible: Math.round(disponible), queda: Math.round(disponible - asignado), arrastre, cerrado,
      };
      meses.push(m); previo = m;
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
  return { meses, porMes, ultimas, regalos, club: { botellas: Math.round(botellas), desde: primerMes, costo: Math.round(costo), sugerido: Math.round(sugerido) } };
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
// presupuesto del grupo en USD de un mes (para la tarjeta del mes): la cuota en pesos de todos, al dólar de ese mes
export function presupuestoUsdDe(mes: string, plan: PlanPesos, socios: number, cuotaGrupoUsd: number): number {
  const f = plan.filas[mes], d = dolarDe(mes, plan.dolares);
  return f && f.cuotaSocio != null && d ? (f.cuotaSocio * socios) / d : cuotaGrupoUsd;
}
export interface SocioCuota { id: string; nombre: string; alDia: boolean; meses: number; debe: number; aFavor: number }   // debe y aFavor en pesos
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
    for (const x of meses) {
      let falta = pide.get(x)! - pagado.get(x)!;
      if (falta > eps && fondo > 0) { const t = Math.min(falta, fondo); falta -= t; fondo -= t; }
      if (falta > eps) { debe += falta; adeudados++; }
    }
    const alDia = adeudados === 0;
    return { id: m.id, nombre: m.nombre, alDia, meses: adeudados, debe: Math.round(debe), aFavor: alDia ? Math.round(fondo) : 0 };
  });
  socios.sort((a, b) => Number(a.alDia) - Number(b.alDia) || b.debe - a.debe || a.nombre.localeCompare(b.nombre, 'es'));
  const v = pesosDelMes(mesHoy, p.plan);
  return {
    cuotaSocio: Math.round(cuotaSocio * 100) / 100, desde: p.cuotasDesde, alDia: socios.filter(s => s.alDia).length, total: socios.length, socios,
    mes: mesHoy, cuotaPesos: Math.round(v.cuota), guardaPesos: Math.round(v.guarda), totalPesos: Math.round(v.cuota + v.guarda), enUsd: v.enUsd,
  };
}
