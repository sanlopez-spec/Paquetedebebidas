// Cuentas de la tarjeta "Valor de la cava" (sólo socios). Sin red ni Airtable: recibe filas ya leídas.
// Sólo cuentan las botellas con Origen = "Compra club" (regalos y aportes no tienen precio).
// El valor de cada botella repite la fórmula del campo "Valor estimado USD" de Airtable:
//   Sugerido USD × 1,075 ^ min(años de estiba, tope)   (tope 10 años; 20 si es Icono o el sugerido de un 750 pasa USD 60)
// pero contando los años de estiba hasta cada mes, para la serie del gráfico.
export const ORIGEN_CLUB = 'Compra club';

export interface FilaBotella {
  id: string; origen: string; cantidad: number; enGuarda: number; fecha: string;   // fecha = AAAA-MM-DD de ingreso
  pagado: number; sugerido: number; valorEst: number; gananciaEstiba: number; icono: boolean; formato: string;
}
export interface FilaConsumo { botella: string; cantidad: number; fecha: string; sugeridoHist: number }
export interface PuntoValor { mes: string; compras: number; tomado: number; cava: number }   // mes = AAAA-MM, todo en USD acumulado
export interface InformeValor {
  valorCava: number; compras: number; porcentaje: number; guarda: number; tomado: number;
  botellasTomadas: number; botellasEnCava: number; serie: PuntoValor[];
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
  return {
    valorCava: Math.round(valorCava), compras: Math.round(compras), porcentaje, guarda: Math.round(guarda), tomado: Math.round(tomado),
    botellasTomadas: Math.round(sum(cons.map(c => c.cantidad))), botellasEnCava: Math.round(sum(bots.map(b => b.enGuarda))), serie,
  };
}
