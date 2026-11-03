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
export interface InformeValor {
  valorCava: number; compras: number; porcentaje: number; guarda: number; tomado: number;
  botellasTomadas: number; botellasEnCava: number; serie: PuntoValor[];
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
    botellasTomadas: Math.round(sum(cons.map(c => c.cantidad))), botellasEnCava: Math.round(sum(bots.map(b => b.enGuarda))), serie,
  };
}

// ── pantalla Compras (sólo socios) ─────────────────────────────────
export interface ConfigCuota { cuota: number | null; saldoInicial: number; saldoDesde: string }   // saldoDesde = AAAA-MM o ""
export interface MesCompras {
  mes: string; botellas: number; cuota: number; asignado: number;
  saldoAnterior: number | null;   // null = antes de "Saldo desde": sin saldo ni arrastre
  disponible: number | null;
  queda: number | null;           // lo que pasa al mes siguiente (en el mes actual: lo que queda)
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
  // arrastre: cada mes arranca con la cuota + lo que sobró (o faltó) del mes anterior. El presupuesto es siempre la cuota.
  const meses: MesCompras[] = [];
  if (cfg.cuota != null) {
    const desde = cfg.saldoDesde || mesHoy;
    const inicio = primerMes && primerMes < desde ? primerMes : desde;
    let saldo = cfg.saldoInicial;
    for (let mes = inicio; mes <= mesHoy; mes = sumarMes(mes)) {
      const asignado = porMes[mes]?.costo ?? 0;
      const base = { mes, botellas: Math.round(botMes[mes] ?? 0), cuota: cfg.cuota, asignado: Math.round(asignado) };
      if (mes < desde) { meses.push({ ...base, saldoAnterior: null, disponible: null, queda: null }); continue; }
      const disponible = cfg.cuota + saldo;
      meses.push({ ...base, saldoAnterior: mes > desde ? Math.round(saldo) : null, disponible: Math.round(disponible), queda: Math.round(disponible - asignado) });
      saldo = disponible - asignado;
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
export interface MiembroCuota { id: string; nombre: string; desde: string }          // desde = AAAA-MM o ""
export interface PagoCuota { usuario: string; mes: string; monto: number }            // mes = AAAA-MM o ""
export interface SocioCuota { id: string; nombre: string; alDia: boolean; meses: number; debe: number; aFavor: number }
export interface InformeCuotas { cuotaSocio: number; desde: string; alDia: number; total: number; socios: SocioCuota[] }

export function calcularCuotas(p: { cuota: number; cuotasDesde: string; miembros: MiembroCuota[]; pagos: PagoCuota[]; hoy: string }): InformeCuotas {
  const mesHoy = p.hoy.slice(0, 7);
  const n = Math.max(1, p.miembros.length);
  const cuotaSocio = p.cuota / n;
  const eps = 0.005;
  const socios = p.miembros.map(m => {
    const ini = m.desde && m.desde > p.cuotasDesde ? m.desde : p.cuotasDesde;
    const meses: string[] = [];
    for (let x = ini; x <= mesHoy; x = sumarMes(x)) meses.push(x);
    const suyos = p.pagos.filter(g => g.usuario === m.id);
    // lo pagado para cada mes; lo que sobra de un mes, lo que no tiene mes y lo de fuera de rango van a un fondo
    const porMes = new Map<string, number>(meses.map(x => [x, 0]));
    let fondo = 0;
    for (const g of suyos) { if (porMes.has(g.mes)) porMes.set(g.mes, porMes.get(g.mes)! + g.monto); else fondo += g.monto; }
    for (const x of meses) { const v = porMes.get(x)!; if (v > cuotaSocio) { fondo += v - cuotaSocio; porMes.set(x, cuotaSocio); } }
    let debe = 0, adeudados = 0;
    for (const x of meses) {                                  // el fondo cubre primero los meses más viejos
      let falta = cuotaSocio - porMes.get(x)!;
      if (falta > eps && fondo > 0) { const t = Math.min(falta, fondo); falta -= t; fondo -= t; }
      if (falta > eps) { debe += falta; adeudados++; }
    }
    return { id: m.id, nombre: m.nombre, alDia: debe <= eps, meses: adeudados, debe: Math.round(debe), aFavor: debe <= eps ? Math.round(fondo) : 0 };
  });
  socios.sort((a, b) => Number(a.alDia) - Number(b.alDia) || b.debe - a.debe || a.nombre.localeCompare(b.nombre, 'es'));
  return { cuotaSocio: Math.round(cuotaSocio), desde: p.cuotasDesde, alDia: socios.filter(s => s.alDia).length, total: socios.length, socios };
}
