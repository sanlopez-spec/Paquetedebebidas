const BASE_ID  = 'appag1VLp4aN3tD3v';
const CAVA_ID  = 'rec7kgfT9LXzYPy6a';
const TBL_BOT  = 'tblZIXNa2Ck3DNCwS';
const TBL_CONS = 'tblvfDCiHNUXo1ZFQ';
const TBL_CEPA = 'tblbweXp5Dj6xKL5Q';
const TBL_JUNT = 'tblXjEG9P1VZEEcpE';

// ── Juntadas field IDs ─────────────────────────────────────────────
const FJ = {
  juntada:  'fldg8zGBLWIivkItj',
  cava:     'fld8m6VnxAUF39uls',
  fecha:    'fldoLC4TDsOuji996',
  fotos:    'fldKno8prsBjITYcQ',
  notas:    'fldqIubl1JdAoxsJD',
  maridaje: 'fldveT1zfp0HYZAgH',
} as const;

// ── Cepas field IDs ────────────────────────────────────────────────
const FU = {
  nombre:      'fldedJH3bv4izXH8q',
  tipoUva:     'fldUjrXKpZhZXcJIb',
  color:       'fld2NfAjkEZfXCic1',
  colorCopa:   'fldKmScDann1tMeyK',
  intensidad:  'fldAseDJPdRuUJwTB',
  taninos:     'fldYRZwWFxY1xHdcv',
  acidez:      'fldQxruN8RdDBJBoX',
  aromas:      'fld9KlzPw4Psy93pf',
  origen:      'fldzgRXsp8kDDiyC4',
  terroirsAr:  'fldT3AfvrdIl9AvOm',
  terroirsMun: 'fldnyatNLg37gRDkd',
  maridajes:   'fldURkPwYJRTraVXB',
  temperatura: 'flditqnv4mSxnQepO',
  descripcion: 'fldrWfV4SOQFJlpkY',
  esUva:       'fldhH9LGqQuxblPlQ',
} as const;

// Color para una cepa que no tiene fila en la tabla Cepas.
const CEPA_SIN_FICHA = '#B8AC9C';

// Único lugar donde viven los tipos de vino y sus colores. Viaja al frontend
// en la respuesta, así agregar un estilo nuevo es tocar sólo este mapa. Un tipo
// que no esté acá se muestra igual, en gris, y se avisa por consola.
const TIPO_COLORES: Record<string, string> = {
  tinto:     '#6B1E2E',
  blanco:    '#E2CC6F',  // pajizo: el dorado viejo se confundía con el naranjo
  rosado:    '#C25A5A',
  naranjo:   '#C8823A',
  espumante: '#F1EBD6',  // tan claro que lleva borde, ver TIPO_CLARO
};
const TIPO_ORDEN = ['tinto', 'blanco', 'rosado', 'naranjo', 'espumante'];
const TIPO_SIN_COLOR = '#B8AC9C';

// ── Botellas field IDs ─────────────────────────────────────────────
const F = {
  vino:      'fldUZflAbSpmIdK20',
  bodega:    'fldsFEvABrBwU5fBn',
  anada:     'fldKC7gp51yfg7wtF',
  cepa:      'fldL0kHShpmW0EHc1',
  region:    'fldB48PO4izRD88LR',
  provPais:  'fld4xdlvVVkMasePd',
  tipo:      'fldwvWtMUaBgKcsQP',
  formato:   'fld1BEs0Q3KVb3Na6',
  cantComp:  'fldm87g7J9lHhI8pM',
  vivino:    'fldWS6koVIWrXerQv',
  fechaIng:  'fld9RAJzfNv0du6iW',
  icono:     'fld63GBOOkGiUMg0V',
  consumidas:'fldD5WKffD2MD03z8',
  enGuarda:  'fldMTLDQLjYDZQRa2',
  eq750:     'fldesdFFsrv9PXKIM',
  cava:      'fldekIJ54IKI1gd2R',
  origen:    'fldA3mlzf0ZkPy3nM',
  // Vivino valoraciones (añada): cuánta gente puntuó esa añada; desempata el podio
  valoraciones: 'fldmieKGn5YuTxnY8',
} as const;

// Cómo entró la botella. "Compra club" es lo que compró el club; el resto
// (Regalo, Aporte socio, Aporte invitado, Fuera del club) va aparte.
const ORIGEN_CLUB = 'Compra club';

// Tramos de edad de lo que está en guarda. El color viaja al frontend, igual
// que en TIPO_COLORES: un solo lugar donde se define la paleta.
const TRAMOS_EDAD = [
  { tramo: 'Hasta 5 años', hasta: 5,        color: '#E2CFA6' },
  { tramo: '6 a 10',       hasta: 10,       color: '#B88A57' },
  { tramo: '11 a 15',      hasta: 15,       color: '#80532F' },
  { tramo: 'Más de 15',    hasta: Infinity, color: '#3E2717' },
] as const;

// Tramos del puntaje Vivino (1 decimal) de lo que está en guarda. El color viaja
// al frontend, igual que en TRAMOS_EDAD.
const TRAMOS_VIVINO = [
  { tramo: '4,5 o más',    desde: 4.5,       color: '#5E4512' },
  { tramo: '4,3 a 4,4',    desde: 4.3,       color: '#8C6A22' },
  { tramo: '4,0 a 4,2',    desde: 4.0,       color: '#B8994E' },
  { tramo: 'Menos de 4,0', desde: -Infinity, color: '#DCC795' },
] as const;

// ── Consumos field IDs ─────────────────────────────────────────────
const FC = {
  botella:  'fldxtM9Sk5kjFthch',
  cantidad: 'fldst9TObn0RlTmZQ',
  fecha:    'fld9C1dM0eAorQ2VG',
  vinoL:    'fldU4IKr05dBVw2es',
  bodegaL:  'fldal6zQKDoh2O9C3',
  cepaL:    'fld8cwEdALO83hD42',
  regionL:  'fldoQeZvw2ssi8rxL',
  provPaisL:'fldP5IRYv3WtXD9Kg',
  tipoL:    'fld263m2dOlHBUCNf',
  anadaR:   'fldwLeledoDNJX5e0',
} as const;

// ── Helpers ────────────────────────────────────────────────────────
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Provincias argentinas, con su nombre canónico; se buscan sin tildes ni mayúsculas.
const PROVINCIAS_AR = new Map<string, string>(
  ['Mendoza', 'Salta', 'San Juan', 'Río Negro', 'Neuquén', 'Chubut', 'La Rioja', 'Catamarca',
    'Jujuy', 'Tucumán', 'Córdoba', 'San Luis', 'La Pampa', 'Buenos Aires']
    .map(p => [norm(p), p] as [string, string]));
PROVINCIAS_AR.set('patagonia', 'Río Negro');

function normProv(raw: unknown): { pais: string; provincia: string } {
  const p = typeof raw === 'string' ? raw.trim() : '';
  const prov = PROVINCIAS_AR.get(norm(p));
  if (prov) return { pais: 'Argentina', provincia: prov };
  if (norm(p) === 'argentina') return { pais: 'Argentina', provincia: '' };
  return { pais: p || 'Desconocido', provincia: '' };
}

// Regiones con su escritura canónica (con tilde); lo demás pasa tal cual.
const REGIONES_CANON = new Map<string, string>(
  ['Luján de Cuyo', 'Maipú', 'Animaná', 'Valles Calchaquíes', 'Hualfín', 'Mainqué']
    .map(r => [norm(r), r] as [string, string]));

function normReg(raw: unknown): string {
  const r = typeof raw === 'string' ? raw.trim() : '';
  return REGIONES_CANON.get(norm(r)) ?? r;
}

// País, provincia y región de una botella o un consumo, ya normalizados.
function geoDe(provPaisRaw: unknown, regionRaw: unknown): { pais: string; provincia: string; region: string } {
  const region = normReg(regionRaw);
  let { pais, provincia } = normProv(provPaisRaw);
  // Cafayate es Salta, aunque venga cargado como Mendoza
  if (provincia === 'Mendoza' && norm(region).includes('cafayate')) provincia = 'Salta';
  return { pais, provincia, region };
}

// ── Mapeo de cepas ─────────────────────────────────────────────────
// Normaliza para comparar: sin tildes, sin mayúsculas, sin espacios de más.
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Estilos de espumante cargados como si fueran cepa.
const ESTILOS_ESPUMANTE = new Set(
  ['extra brut', 'brut nature', 'nature', 'brut rose', 'brut rosé', 'espumante', 'brut'].map(norm));

// Sinónimos: lo que viene en Botellas/Consumos → fila de la tabla Cepas.
const CEPA_SINONIMO: Record<string, string> = {
  'chianti': 'Sangiovese',
  'malvasia': 'Malvasía Nera',
};

// Cómo se muestra una fila de la tabla cuando el nombre no alcanza.
const CEPA_ETIQUETA: Record<string, string> = {
  'Blend': 'Blend tinto',
  'Blend Blanco': 'Blend blanco',
  'Corte espumante': 'Espumantes',
};

/**
 * Dado el nombre de cepa de una botella/consumo y su tipo de vino, devuelve
 * el nombre de la fila de la tabla Cepas que le corresponde.
 *  - "Blend" se abre en Blend (tinto) / Blend Blanco / Corte espumante según el tipo.
 *  - Los estilos de espumante van a "Corte espumante", pero si el espumante
 *    tiene una uva real (ej. Malbec), cuenta en esa uva.
 */
function filaDeCepa(cepaRaw: string, tipoRaw: string): string {
  const cepa = cepaRaw.trim();
  const n = norm(cepa);
  const tipo = norm(tipoRaw);
  if (!n) return '';
  if (n === 'blend') {
    if (tipo === 'blanco') return 'Blend Blanco';
    if (tipo === 'espumante') return 'Corte espumante';
    return 'Blend';
  }
  if (n === 'blend blanco') return 'Blend Blanco';
  if (ESTILOS_ESPUMANTE.has(n)) return 'Corte espumante';
  return CEPA_SINONIMO[n] ?? cepa;
}

// "2026-09": la clave de mes con la que viajan juntadas y compras.
function mesKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function str1(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '').trim();
  return String(v ?? '').trim();
}

function num1(v: unknown): number | null {
  const n = Array.isArray(v) ? v[0] : v;
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

async function fetchAll(tableId: string, fields: string[], extra: Record<string, string>, token: string): Promise<any[]> {
  const records: any[] = [];
  let offset: string | undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`);
    url.searchParams.set('returnFieldsByFieldId', 'true');
    url.searchParams.set('pageSize', '100');
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    for (const f of fields) url.searchParams.append('fields[]', f);
    if (offset) url.searchParams.set('offset', offset);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${tableId} ${res.status}: ${await res.text()}`);
    const json = await res.json() as { records: any[]; offset?: string };
    records.push(...json.records);
    offset = json.offset;
  } while (offset);
  return records;
}

// Cortes de la evolución: 31/3/2021 (origen, cava vacía — la primera botella
// entra en abril 2021), el cierre de cada año del club (abr→mar) y Hoy.
// El `ts` viaja al frontend para que el eje X sea temporal y proporcional.
function evoCuts(): { label: string; ts: number }[] {
  const cuts = [];
  for (let i = 0; i <= 5; i++) {
    cuts.push({ label: String(2021 + i), ts: Date.UTC(2021 + i, 2, 31) }); // Mar 31 = month index 2
  }
  cuts.push({ label: 'Hoy', ts: Date.now() });
  return cuts;
}

// ── Main handler ───────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) {
    console.warn('[api/cava] AIRTABLE_TOKEN no configurado');
    return res.status(200).json({ error: 'no_token' });
  }

  try {
    // 1. Las cuatro tablas se leen a la vez: son pedidos independientes y en
    //    secuencia sumaban sus latencias. Botellas se filtra en memoria
    //    (ARRAYJOIN resuelve nombres, no IDs). Si Juntadas falla, la API sigue
    //    andando: lo único que se pierde son las fotos.
    const botFields = Object.values(F);
    const consFields = Object.values(FC);
    const [allBotRecs, allConsRecs, todasJuntadas, cepaRecs] = await Promise.all([
      fetchAll(TBL_BOT, botFields, {}, token),
      fetchAll(TBL_CONS, consFields, {}, token),
      fetchAll(TBL_JUNT, Object.values(FJ), {}, token).catch((e: unknown) => {
        console.warn('[api/cava] no pude leer Juntadas:', String(e).slice(0, 160));
        return [] as any[];
      }),
      // Cepas (una fila por uva) — se indexa por nombre normalizado
      fetchAll(TBL_CEPA, Object.values(FU), {}, token),
    ]);
    const botRecs = allBotRecs.filter((r: any) => {
      const cavas = r.fields[F.cava] as string[] | undefined;
      return cavas?.includes(CAVA_ID) ?? false;
    });
    const juntadasRecs = todasJuntadas.filter((r: any) =>
      ((r.fields[FJ.cava] as string[] | undefined) ?? []).includes(CAVA_ID));

    type FichaCepa = {
      nombre: string; etiqueta: string; tipoUva: string; color: string;
      colorCopa: string; intensidad: string; taninos: string; acidez: string;
      aromas: string; origen: string; terroirsAr: string; terroirsMundo: string;
      maridajes: string; temperatura: string; descripcion: string; esUva: boolean;
    };
    const fichas = new Map<string, FichaCepa>();
    for (const r of cepaRecs) {
      const nombre = str1(r.fields[FU.nombre]);
      if (!nombre) continue;
      fichas.set(norm(nombre), {
        nombre,
        etiqueta:      CEPA_ETIQUETA[nombre] ?? nombre,
        tipoUva:       str1(r.fields[FU.tipoUva]),
        color:         str1(r.fields[FU.color]) || CEPA_SIN_FICHA,
        colorCopa:     str1(r.fields[FU.colorCopa]),
        intensidad:    str1(r.fields[FU.intensidad]),
        taninos:       str1(r.fields[FU.taninos]),
        acidez:        str1(r.fields[FU.acidez]),
        aromas:        str1(r.fields[FU.aromas]),
        origen:        str1(r.fields[FU.origen]),
        terroirsAr:    str1(r.fields[FU.terroirsAr]),
        terroirsMundo: str1(r.fields[FU.terroirsMun]),
        maridajes:     str1(r.fields[FU.maridajes]),
        temperatura:   str1(r.fields[FU.temperatura]),
        descripcion:   str1(r.fields[FU.descripcion]),
        esUva:         Boolean(r.fields[FU.esUva]),
      });
    }

    // Only keep consumos whose botella is in our set
    const botIds = new Set(botRecs.map((r: any) => r.id as string));
    const consRecs = allConsRecs.filter((r: any) => {
      const bots = r.fields[FC.botella] as string[] | undefined;
      return bots?.some((id: string) => botIds.has(id));
    });

    // 3. Build ingreso dates map (botId → Date)
    const botIngreso = new Map<string, Date>();
    for (const r of botRecs) {
      const fech = r.fields[F.fechaIng] as string | undefined;
      if (fech) botIngreso.set(r.id, new Date(fech + 'T00:00:00.000Z'));
    }

    // 4. Build per-bottle consumption data
    type ConsEntry = { fecha: Date; cant: number; mes: number; year: number };
    const consByBot = new Map<string, ConsEntry[]>();
    for (const c of consRecs) {
      const bots = c.fields[FC.botella] as string[] | undefined;
      if (!bots?.length) continue;
      const botId = bots[0];
      const cant = Number(c.fields[FC.cantidad]) || 0;
      const fechStr = c.fields[FC.fecha] as string | undefined;
      if (!fechStr) continue;
      let dt = new Date(fechStr + 'T00:00:00.000Z');
      // If consumo before ingreso (9 known cases), shift to ingreso date
      const ing = botIngreso.get(botId);
      if (ing && dt < ing) dt = ing;
      if (!consByBot.has(botId)) consByBot.set(botId, []);
      consByBot.get(botId)!.push({ fecha: dt, cant, mes: dt.getUTCMonth(), year: dt.getUTCFullYear() });
    }

    // 5. Build evolution source: ALL bottles (including fully consumed)
    type EvoBotEntry = { fechaIngTs: number; cantComp: number };
    const allBotEvo: EvoBotEntry[] = [];
    for (const r of botRecs) {
      const fech = r.fields[F.fechaIng] as string | undefined;
      const cantComp = Number(r.fields[F.cantComp]) || 0;
      if (fech && cantComp > 0) {
        allBotEvo.push({ fechaIngTs: new Date(fech + 'T00:00:00.000Z').getTime(), cantComp });
      }
    }

    // 5b. Transform botellas → Wine objects (only those in guarda)
    const wines: any[] = [];
    for (const r of botRecs) {
      const f = r.fields;
      const anada = num1(f[F.anada]);
      const qty = Number(f[F.enGuarda]) || 0;
      if (qty <= 0) continue; // skip fully consumed bottles in wine list

      const { pais, provincia, region } = geoDe(str1(f[F.provPais]), str1(f[F.region]));

      const ingresoDate = botIngreso.get(r.id) ?? null;
      const start: [number, number] | null = ingresoDate
        ? [ingresoDate.getUTCFullYear(), ingresoDate.getUTCMonth()]
        : null;

      const consEntries = consByBot.get(r.id) ?? [];
      const consd = consEntries.map(e => MESES[e.mes] + ' ' + e.year);
      const consTotal = consEntries.reduce((s, e) => s + e.cant, 0);

      wines.push({
        an:     anada,
        vino:   str1(f[F.vino]),
        bod:    str1(f[F.bodega]),
        pais,
        reg:    region,
        tipo:   str1(f[F.tipo]).toLowerCase(),
        cepa:   str1(f[F.cepa]),
        vivino: num1(f[F.vivino]),
        qty,
        start,
        eq:     Number(f[F.eq750]) || qty,
        cons:   consTotal,
        consd,
        icono:  Boolean(f[F.icono]),
        val:    num1(f[F.valoraciones]),
        cantComp: Number(f[F.cantComp]) || 0,
        fechaIngTs: ingresoDate?.getTime() ?? null,
        // provincia, para Geografía
        _provincia: provincia,
      });
    }

    // 6. Build ConsData
    const consDataByYear: Record<string, { n: number; juntadas: Set<number>; wines: any[] }> = {};
    for (const c of consRecs) {
      const bots = c.fields[FC.botella] as string[] | undefined;
      const botId = bots?.[0];
      if (!botId) continue;
      const cant = Number(c.fields[FC.cantidad]) || 0;
      const fechStr = c.fields[FC.fecha] as string | undefined;
      if (!fechStr) continue;
      let dt = new Date(fechStr + 'T00:00:00.000Z');
      const ing = botIngreso.get(botId);
      if (ing && dt < ing) dt = ing;
      const year = dt.getUTCFullYear();
      const mes  = dt.getUTCMonth();
      const yr   = String(year);
      if (!consDataByYear[yr]) consDataByYear[yr] = { n: 0, juntadas: new Set(), wines: [] };
      consDataByYear[yr].n += cant;
      consDataByYear[yr].juntadas.add(mes);
      consDataByYear[yr].wines.push({
        vino:  str1(c.fields[FC.vinoL]),
        bod:   str1(c.fields[FC.bodegaL]),
        cepa:  str1(c.fields[FC.cepaL]),
        pais:  str1(c.fields[FC.provPaisL]),
        reg:   str1(c.fields[FC.regionL]),
        an:    num1(c.fields[FC.anadaR]),
        tipo:  str1(c.fields[FC.tipoL]).toLowerCase(),
        cant,
        mes,
      });
    }

    const consTotal = Object.values(consDataByYear).reduce((s, y) => s + y.n, 0);
    const consJuntadas = Object.values(consDataByYear).reduce((s, y) => s + y.juntadas.size, 0);
    const byYear: Record<string, { n: number; juntadas: number; wines: any[] }> = {};
    for (const [yr, d] of Object.entries(consDataByYear)) {
      byYear[yr] = { n: d.n, juntadas: d.juntadas.size, wines: d.wines };
    }

    // 7. Compute aggregates ─────────────────────────────────────────

    // Totals
    const totalEnGuarda = wines.reduce((s, w) => s + w.qty, 0);
    const totalEq750    = wines.reduce((s, w) => s + w.eq, 0);

    // Etiquetas distintas (vino + añada combos, case-insensitive)
    const etiqSet = new Set(wines.map(w => (w.vino + '|' + (w.an ?? 'nv')).toLowerCase()));
    const etiquetas = etiqSet.size;

    // % íconos
    const iconoQty = wines.filter(w => w.icono).reduce((s, w) => s + w.qty, 0);
    const pctIcono = totalEnGuarda ? Math.round(iconoQty / totalEnGuarda * 100) : 0;

    // Vivino promedio (weighted)
    let viW = 0, viN = 0;
    for (const w of wines) {
      if (w.vivino !== null) { viW += w.vivino * w.qty; viN += w.qty; }
    }
    const vivinoPromedio = viN ? Math.round(viW / viN * 100) / 100 : null;

    // % botellas vivino ≥ 4.2
    const viAltoQty = wines.filter(w => w.vivino !== null && w.vivino >= 4.2).reduce((s, w) => s + w.qty, 0);
    const pctVivinoAlto = viN ? Math.round(viAltoQty / viN * 100) : null;

    // Top 5 por vivino (desempate por qty desc)
    const withVivino = wines
      .filter(w => w.vivino !== null)
      .sort((a, b) => (b.vivino as number) - (a.vivino as number) || b.qty - a.qty);
    const top5Vivino = withVivino.slice(0, 5).map(w => ({
      vino: w.vino, bod: w.bod, an: w.an, vivino: w.vivino, qty: w.qty,
    }));

    // Tipo composición
    const tipoAgg: Record<string, number> = {};
    for (const w of wines) tipoAgg[w.tipo] = (tipoAgg[w.tipo] || 0) + w.qty;
    const tipoComposicion = Object.entries(tipoAgg)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, count]) => ({ tipo, count, pct: Math.round(count / totalEnGuarda * 100) }));

    // Añada stats
    const anadaVals = wines.flatMap(w => w.an ? Array(w.qty).fill(w.an) : []) as number[];
    const anadaPromedio = anadaVals.length ? Math.round(anadaVals.reduce((a, b) => a + b, 0) / anadaVals.length) : null;
    const anadaMin = anadaVals.length ? Math.min(...anadaVals) : null;
    const anadaMax = anadaVals.length ? Math.max(...anadaVals) : null;
    // cosechas distintas que todavía están en guarda
    const anadasCount = anadaVals.length ? new Set(anadaVals).size : null;

    // Stats para tarjetas de sección. `cepasCount` se calcula más abajo, con
    // la tabla Cepas (sólo filas con "Es uva"), en el bloque 7b.
    const regionesCount = new Set(wines.filter(w => w.reg).map(w => `${w.pais}|${w.reg}`)).size;
    const bodegasCount = new Set(wines.map(w => w.bod)).size;
    const paisesCount = new Set(wines.map(w => w.pais)).size;
    const NOW_YEAR = new Date().getUTCFullYear();
    let edGW = 0, edGN = 0;
    for (const w of wines) { if (w.an) { edGW += (NOW_YEAR - w.an) * w.qty; edGN += w.qty; } }
    const edadPromedioGuarda = edGN ? Math.round(edGW / edGN * 10) / 10 : null;
    const vivinoAlto43Count = wines.filter(w => w.vivino !== null && (w.vivino as number) >= 4.3).reduce((s, w) => s + w.qty, 0);

    // Evolution (uses allBotEvo which includes fully consumed bottles) + edadAlAbrir por corte
    const cuts = evoCuts();
    const evolution: { label: string; ts: number; compradas: number; abiertas: number; enGuarda: number; edadAlAbrir: number | null }[] = [];
    let prevCutTs = 0;
    for (const cut of cuts) {
      let comp = 0;
      for (const e of allBotEvo) {
        if (e.fechaIngTs <= cut.ts) comp += e.cantComp;
      }
      let abiertasCut = 0, edadW = 0, edadN = 0;
      for (const c of consRecs) {
        const bots = c.fields[FC.botella] as string[] | undefined;
        const botId = bots?.[0];
        if (!botId) continue;
        const cant = Number(c.fields[FC.cantidad]) || 0;
        const fechStr = c.fields[FC.fecha] as string | undefined;
        if (!fechStr) continue;
        let dt = new Date(fechStr + 'T00:00:00.000Z');
        const ing = botIngreso.get(botId);
        if (ing && dt < ing) dt = ing;
        const dtTs = dt.getTime();
        if (dtTs <= cut.ts) abiertasCut += cant;
        if (dtTs > prevCutTs && dtTs <= cut.ts) {
          const anada = num1(c.fields[FC.anadaR]);
          if (anada !== null && anada >= 1900 && cant > 0) {
            edadW += (dt.getUTCFullYear() - anada) * cant;
            edadN += cant;
          }
        }
      }
      evolution.push({
        label: cut.label, ts: cut.ts, compradas: comp, abiertas: abiertasCut,
        enGuarda: comp - abiertasCut,
        edadAlAbrir: edadN > 0 ? Math.round(edadW / edadN * 10) / 10 : null,
      });
      prevCutTs = cut.ts;
    }

    // Geografía ────────────────────────────────────────────────────
    // Todo sobre botellas en guarda, salvo los países probados y el espejo, que
    // suman también los consumos. Provincia y región ya vienen normalizadas.
    const r1 = (v: number) => Math.round(v * 100) / 100;
    const vivinoProm = (xs: { vivino: number | null; qty: number }[]) => {
      let s = 0, n = 0;
      for (const x of xs) if (x.vivino !== null) { s += x.vivino * x.qty; n += x.qty; }
      return n ? r1(s / n) : null;
    };

    type RegAcc = { region: string; pais: string; provincia: string; botellas: number; bods: Map<string, number>; ws: any[] };
    const regAcc = new Map<string, RegAcc>();
    type BodAcc = { bodega: string; botellas: number; regs: Map<string, number>; ws: any[] };
    const bodAcc = new Map<string, BodAcc>();
    for (const w of wines) {
      if (w.reg) {
        const k = `${w.pais}|${w.reg}`;
        if (!regAcc.has(k)) regAcc.set(k, { region: w.reg, pais: w.pais, provincia: w._provincia, botellas: 0, bods: new Map(), ws: [] });
        const a = regAcc.get(k)!;
        a.botellas += w.qty; a.ws.push(w);
        a.bods.set(w.bod, (a.bods.get(w.bod) || 0) + w.qty);
      }
      if (w.bod) {
        if (!bodAcc.has(w.bod)) bodAcc.set(w.bod, { bodega: w.bod, botellas: 0, regs: new Map(), ws: [] });
        const b = bodAcc.get(w.bod)!;
        b.botellas += w.qty; b.ws.push(w);
        if (w.reg) b.regs.set(w.reg, (b.regs.get(w.reg) || 0) + w.qty);
      }
    }
    const iconosDe = (ws: any[]) => ws.filter(w => w.icono).reduce((s, w) => s + w.qty, 0);
    const geoRegiones = [...regAcc.values()]
      .sort((a, b) => b.botellas - a.botellas || a.region.localeCompare(b.region, 'es'))
      .map(a => ({
        region: a.region,
        pais: a.pais === 'Argentina' ? 'Argentina' : a.pais,
        provincia: a.provincia,
        botellas: a.botellas,
        pct: totalEnGuarda ? Math.round(a.botellas / totalEnGuarda * 100) : 0,
        bodegas: [...a.bods.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'es'))
          .map(([bodega, botellas]) => ({ bodega, botellas })),
        iconos: iconosDe(a.ws),
        vivino: vivinoProm(a.ws),
      }));

    // etiquetas de una bodega: una fila por vino + añada
    const etiquetasDe = (ws: any[]) => {
      const m = new Map<string, { vino: string; anada: number | null; botellas: number; vivino: number | null; icono: boolean; val: number | null }>();
      for (const w of ws) {
        const k = `${w.vino}|${w.an ?? 'nv'}`;
        const e = m.get(k);
        if (e) { e.botellas += w.qty; e.icono = e.icono || w.icono; }
        else m.set(k, { vino: w.vino, anada: w.an, botellas: w.qty, vivino: w.vivino, icono: w.icono, val: w.val });
      }
      return [...m.values()].sort((x, y) => y.botellas - x.botellas || x.vino.localeCompare(y.vino, 'es') || (x.anada ?? 0) - (y.anada ?? 0));
    };
    const geoBodegas = [...bodAcc.values()]
      .sort((a, b) => b.botellas - a.botellas || a.bodega.localeCompare(b.bodega, 'es'))
      .map(b => {
        const regs = [...b.regs.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'es'));
        return {
          bodega: b.bodega,
          region: regs[0]?.[0] ?? '',
          otrasRegiones: Math.max(0, regs.length - 1),
          regiones: regs.map(r => r[0]),
          botellas: b.botellas,
          etiquetas: etiquetasDe(b.ws),
          iconos: iconosDe(b.ws),
          vivino: vivinoProm(b.ws),
        };
      });

    // consumos normalizados: país, provincia y región
    const consGeo = consRecs.map((c: any) => {
      const g = geoDe(str1(c.fields[FC.provPaisL]), str1(c.fields[FC.regionL]));
      return { ...g, cant: Number(c.fields[FC.cantidad]) || 0 };
    }).filter((c: any) => c.cant > 0);

    const provMap = new Map<string, { enGuarda: number; abiertas: number }>();
    const paisMap = new Map<string, { enGuarda: number; abiertas: number }>();
    const suma = (m: Map<string, { enGuarda: number; abiertas: number }>, k: string, campo: 'enGuarda' | 'abiertas', n: number) => {
      if (!k) return;
      if (!m.has(k)) m.set(k, { enGuarda: 0, abiertas: 0 });
      m.get(k)![campo] += n;
    };
    for (const w of wines) {
      if (w.pais === 'Argentina') suma(provMap, w._provincia, 'enGuarda', w.qty);
      else suma(paisMap, w.pais, 'enGuarda', w.qty);
    }
    for (const c of consGeo) {
      if (c.pais === 'Argentina') suma(provMap, c.provincia, 'abiertas', c.cant);
      else suma(paisMap, c.pais, 'abiertas', c.cant);
    }
    const ordenGA = (a: [string, { enGuarda: number; abiertas: number }], b: [string, { enGuarda: number; abiertas: number }]) =>
      b[1].enGuarda - a[1].enGuarda || b[1].abiertas - a[1].abiertas || a[0].localeCompare(b[0], 'es');
    const geoProvincias = [...provMap.entries()].sort(ordenGA).map(([provincia, v]) => {
      const ws = wines.filter(w => w.pais === 'Argentina' && w._provincia === provincia);
      const bods = new Map<string, number>();
      for (const w of ws) bods.set(w.bod, (bods.get(w.bod) || 0) + w.qty);
      return {
        provincia, ...v,
        pct: totalEnGuarda ? Math.round(v.enGuarda / totalEnGuarda * 100) : 0,
        bodegas: [...bods.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'es'))
          .map(([bodega, botellas]) => ({ bodega, botellas })),
        iconos: iconosDe(ws),
        vivino: vivinoProm(ws),
      };
    });
    const geoPaises = [...paisMap.entries()].sort(ordenGA).map(([pais, v]) => ({ pais, ...v }));

    // ¿Se guarda o se toma? por región argentina (10+ botellas entre guarda y abiertas) e Importados
    const abPorRegion = new Map<string, number>();
    let abImportados = 0;
    for (const c of consGeo) {
      if (c.pais === 'Argentina') { if (c.region) abPorRegion.set(c.region, (abPorRegion.get(c.region) || 0) + c.cant); }
      else abImportados += c.cant;
    }
    const guImportados = wines.filter(w => w.pais !== 'Argentina').reduce((s, w) => s + w.qty, 0);
    const espejoRegiones = geoRegiones
      .filter(r => r.pais === 'Argentina')
      .map(r => ({ region: r.region, gu: r.botellas, ab: abPorRegion.get(r.region) || 0 }))
      .filter(r => r.gu + r.ab >= 10)
      .sort((a, b) => b.gu - a.gu || (b.gu + b.ab) - (a.gu + a.ab) || a.region.localeCompare(b.region, 'es'))
      .slice(0, 8);

    const paisesProbados = new Set<string>([...wines.map(w => w.pais), ...consGeo.map((c: any) => c.pais)].filter(Boolean));
    const geografia = {
      regiones: geoRegiones,
      bodegas: geoBodegas,
      provincias: geoProvincias,
      paises: geoPaises,
      paisesEnGuarda: new Set(wines.map(w => w.pais)).size,
      paisesProbados: paisesProbados.size,
      abiertasTotal: consGeo.reduce((s: number, c: any) => s + c.cant, 0),
      espejo: { regiones: espejoRegiones, importados: { gu: guImportados, ab: abImportados } },
    };

    // 7b. Cepas ─────────────────────────────────────────────────────
    type CepaAgg = {
      fila: string; etiqueta: string; color: string; tipoUva: string; esUva: boolean;
      enGuarda: number; abiertas: number;
      regiones: Set<string>;
      anadas: number[];                       // una por botella en guarda
      mejorVivino: { vino: string; an: number | null; vivino: number } | null;
      vinos: Map<string, { vino: string; an: number | null; bod: string; qty: number }>;
      ficha: FichaCepa | null;
    };
    const cepasAgg = new Map<string, CepaAgg>();
    const sinFicha = new Set<string>();

    function tomaCepa(cepaRaw: string, tipoRaw: string): CepaAgg | null {
      const fila = filaDeCepa(cepaRaw, tipoRaw);
      if (!fila) return null;
      const key = norm(fila);
      if (!cepasAgg.has(key)) {
        const ficha = fichas.get(key) ?? null;
        if (!ficha) sinFicha.add(fila);
        cepasAgg.set(key, {
          fila,
          etiqueta: ficha?.etiqueta ?? fila,
          color:    ficha?.color ?? CEPA_SIN_FICHA,
          tipoUva:  ficha?.tipoUva ?? '',
          // sin fila en la tabla no sabemos si es uva: la contamos como uva
          // para no perderla del conteo de "cepas distintas"
          esUva:    ficha ? ficha.esUva : true,
          enGuarda: 0, abiertas: 0,
          regiones: new Set(), anadas: [], mejorVivino: null,
          vinos: new Map(), ficha,
        });
      }
      return cepasAgg.get(key)!;
    }

    for (const w of wines) {
      const a = tomaCepa(w.cepa, w.tipo);
      if (!a) continue;
      a.enGuarda += w.qty;
      if (w.reg) a.regiones.add(w.reg);
      if (w.an) for (let i = 0; i < w.qty; i++) a.anadas.push(w.an);
      if (w.vivino !== null && (!a.mejorVivino || w.vivino > a.mejorVivino.vivino)) {
        a.mejorVivino = { vino: w.vino, an: w.an, vivino: w.vivino };
      }
      const vk = `${w.vino}|${w.an ?? 'nv'}|${w.bod}`;
      const ex = a.vinos.get(vk);
      if (ex) ex.qty += w.qty;
      else a.vinos.set(vk, { vino: w.vino, an: w.an, bod: w.bod, qty: w.qty });
    }

    for (const c of consRecs) {
      const cant = Number(c.fields[FC.cantidad]) || 0;
      if (cant <= 0) continue;
      const a = tomaCepa(str1(c.fields[FC.cepaL]), str1(c.fields[FC.tipoL]));
      if (a) a.abiertas += cant;
    }

    if (sinFicha.size) {
      console.warn('[api/cava] cepas sin fila en la tabla Cepas:', [...sinFicha].join(', '));
    }

    const cepasList = [...cepasAgg.values()]
      .sort((x, y) => (y.enGuarda - x.enGuarda) || (y.abiertas - x.abiertas))
      .map(a => {
        const anadas = a.anadas.slice().sort((p, q) => p - q);
        const anadaPromedio = anadas.length
          ? Math.round(anadas.reduce((s, v) => s + v, 0) / anadas.length) : null;
        return {
          nombre:   a.etiqueta,
          fila:     a.fila,
          color:    a.color,
          tipoUva:  a.tipoUva,
          esUva:    a.esUva,
          enGuarda: a.enGuarda,
          abiertas: a.abiertas,
          regiones: [...a.regiones].sort(),
          anadaPromedio,
          anadaMasVieja: anadas.length ? anadas[0] : null,
          mejorVivino: a.mejorVivino,
          vinos: [...a.vinos.values()].sort((p, q) => (q.qty - p.qty) || ((q.an ?? 0) - (p.an ?? 0))),
          ficha: a.ficha ? {
            colorCopa: a.ficha.colorCopa, intensidad: a.ficha.intensidad,
            taninos: a.ficha.taninos, acidez: a.ficha.acidez, aromas: a.ficha.aromas,
            origen: a.ficha.origen, terroirsAr: a.ficha.terroirsAr,
            terroirsMundo: a.ficha.terroirsMundo, maridajes: a.ficha.maridajes,
            temperatura: a.ficha.temperatura, descripcion: a.ficha.descripcion,
          } : null,
        };
      });

    // "Cepas distintas" cuenta sólo uvas: los cortes no cuentan.
    const cepasEnGuarda  = cepasList.filter(c => c.esUva && c.enGuarda > 0).length;
    const cepasProbadas  = cepasList.filter(c => c.esUva && c.abiertas > 0).length;
    // Compradas: uvas distintas en todo lo que entró, esté en guarda o abierto.
    const cepasCompradas = cepasList.filter(c => c.esUva && (c.enGuarda + c.abiertas) > 0).length;
    const masTomadaC     = cepasList.filter(c => c.abiertas > 0)
      .sort((x, y) => y.abiertas - x.abiertas)[0] ?? null;
    // La más guardada: sale de la misma lista que el mosaico (misma
    // normalización de cepas), así que el número coincide con el del mosaico.
    const masGuardadaC   = cepasList.filter(c => c.enGuarda > 0)
      .sort((x, y) => y.enGuarda - x.enGuarda)[0] ?? null;

    // Año de la primera compra de la cava.
    const primerIngreso = allBotEvo.reduce(
      (min, e) => (e.fechaIngTs < min ? e.fechaIngTs : min), Infinity);
    const anioPrimeraCompra = Number.isFinite(primerIngreso)
      ? new Date(primerIngreso).getUTCFullYear() : null;

    // Composición por tipo de vino, en guarda y abiertas
    const tiposDesconocidos = new Set<string>();
    function porTipo(fuente: { tipo: string; qty: number }[]) {
      const agg: Record<string, number> = {};
      for (const f of fuente) if (f.tipo) agg[f.tipo] = (agg[f.tipo] || 0) + f.qty;
      const total = Object.values(agg).reduce((s, v) => s + v, 0);
      const orden = (t: string) => {
        const i = TIPO_ORDEN.indexOf(t);
        return i < 0 ? TIPO_ORDEN.length : i;
      };
      return {
        total,
        items: Object.entries(agg)
          .sort((a, b) => orden(a[0]) - orden(b[0]) || b[1] - a[1])
          .map(([tipo, count]) => {
            if (!TIPO_COLORES[tipo]) tiposDesconocidos.add(tipo);
            return {
              tipo, count,
              pct: total ? Math.round(count / total * 100) : 0,
              color: TIPO_COLORES[tipo] ?? TIPO_SIN_COLOR,
            };
          }),
      };
    }
    const tipoGuarda = porTipo(wines.map(w => ({ tipo: w.tipo, qty: w.qty })));
    const tipoAbiertas = porTipo(consRecs.map(c => ({
      tipo: str1(c.fields[FC.tipoL]).toLowerCase(),
      qty: Number(c.fields[FC.cantidad]) || 0,
    })));
    if (tiposDesconocidos.size) {
      console.warn('[api/cava] tipos de vino sin color en TIPO_COLORES:',
        [...tiposDesconocidos].join(', '));
    }

    // 7c. Tramos de edad de lo que está en guarda ──────────────────
    // Edad = año actual − añada. Las botellas sin añada no entran.
    const tramosEdad = TRAMOS_EDAD.map(t => ({ tramo: t.tramo, botellas: 0, color: t.color }));
    for (const w of wines) {
      if (!w.an) continue;
      const edad = NOW_YEAR - w.an;
      let i = TRAMOS_EDAD.findIndex(t => edad <= t.hasta);
      if (i < 0) i = TRAMOS_EDAD.length - 1;
      tramosEdad[i].botellas += w.qty;
    }

    // 7c2. Añadas ───────────────────────────────────────────────────
    // Todo por botellas, nunca valores. Las botellas sin añada no entran en
    // los cortes por año; se cuentan aparte para la nota al pie.
    const guardaPorAnada = new Map<number, number>();
    const cepaAnada = new Map<string, { cepa: string; color: string; an: number; botellas: number }>();
    const vetMap = new Map<string, { vino: string; bodega: string; anada: number; botellas: number }>();
    // una fila por vino + añada (suma las compras del mismo vino); alimenta el panel de cada año
    const etiqMap = new Map<string, { an: number; vino: string; bodega: string; cepa: string; tipo: string; botellas: number; vivino: number | null }>();
    let sinAnadaEsp = 0, sinAnadaResto = 0;
    for (const w of wines) {
      if (!w.an) {
        if (w.tipo === 'espumante') sinAnadaEsp += w.qty; else sinAnadaResto += w.qty;
        continue;
      }
      guardaPorAnada.set(w.an, (guardaPorAnada.get(w.an) ?? 0) + w.qty);

      const a = cepasAgg.get(norm(filaDeCepa(w.cepa, w.tipo)));
      const cepaNombre = a?.etiqueta ?? (str1(w.cepa) || 'Sin cepa');
      const ck = `${cepaNombre}|${w.an}`;
      const ce = cepaAnada.get(ck);
      if (ce) ce.botellas += w.qty;
      else cepaAnada.set(ck, { cepa: cepaNombre, color: a?.color ?? CEPA_SIN_FICHA, an: w.an, botellas: w.qty });

      const ek = `${w.vino.toLowerCase()}|${w.an}`;
      const ee = etiqMap.get(ek);
      if (ee) {
        ee.botellas += w.qty;
        if (w.vivino !== null && (ee.vivino === null || w.vivino > ee.vivino)) ee.vivino = w.vivino;
      } else {
        etiqMap.set(ek, { an: w.an, vino: w.vino, bodega: w.bod, cepa: cepaNombre, tipo: w.tipo, botellas: w.qty, vivino: w.vivino });
      }

      const vk = ek;
      const ve = vetMap.get(vk);
      if (ve) ve.botellas += w.qty;
      else vetMap.set(vk, { vino: w.vino, bodega: w.bod, anada: w.an, botellas: w.qty });
    }
    const abiertasPorAnada = new Map<number, number>();
    for (const c of consRecs) {
      const an = num1(c.fields[FC.anadaR]);
      const cant = Number(c.fields[FC.cantidad]) || 0;
      if (!an || cant <= 0) continue;
      abiertasPorAnada.set(an, (abiertasPorAnada.get(an) ?? 0) + cant);
    }
    const porAnio = (m: Map<number, number>) => [...m.entries()]
      .sort((x, y) => x[0] - y[0]).map(([an, botellas]) => ({ an, botellas }));
    const anadasBloque = {
      enGuarda: porAnio(guardaPorAnada),
      abiertas: porAnio(abiertasPorAnada),
      cepaAnada: [...cepaAnada.values()],
      etiquetas: [...etiqMap.values()],
      // las 5 de añada más antigua; empate, alfabético
      veteranas: [...vetMap.values()]
        .sort((x, y) => x.anada - y.anada || x.vino.localeCompare(y.vino, 'es'))
        .slice(0, 5),
      sinAnada: { espumantes: sinAnadaEsp, otras: sinAnadaResto },
    };

    // 7c3. Calidad ──────────────────────────────────────────────────
    // Sólo lo que está en guarda. "Puntuadas" = botellas con Vivino. Nada de valores.
    const v1 = (v: number) => Math.round(v * 10) / 10;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const punt = wines.filter(w => w.vivino !== null);
    const botPunt = punt.reduce((s, w) => s + w.qty, 0);
    const promDe = (ws: any[]) => {
      const n = ws.reduce((s, w) => s + w.qty, 0);
      return n ? r2(ws.reduce((s, w) => s + w.vivino * w.qty, 0) / n) : null;
    };
    type EtiqCal = {
      vino: string; bodega: string; anada: number | null; cepa: string; tipo: string;
      botellas: number; vivino: number | null; icono: boolean; val: number | null;
    };
    // una fila por vino + añada (suma las compras del mismo vino)
    function agruparCal(ws: any[]): EtiqCal[] {
      const m = new Map<string, EtiqCal>();
      for (const w of ws) {
        const k = `${w.vino.toLowerCase()}|${w.an ?? 'nv'}`;
        const ex = m.get(k);
        const pv = w.vivino !== null ? v1(w.vivino) : null;
        if (ex) {
          ex.botellas += w.qty;
          if (pv !== null && (ex.vivino === null || pv > ex.vivino)) ex.vivino = pv;
          if (w.val !== null && (ex.val === null || w.val > ex.val)) ex.val = w.val;
          if (w.icono) ex.icono = true;
        } else {
          const a = cepasAgg.get(norm(filaDeCepa(w.cepa, w.tipo)));
          m.set(k, {
            vino: w.vino, bodega: w.bod, anada: w.an, cepa: a?.etiqueta ?? (str1(w.cepa) || 'Sin cepa'),
            tipo: w.tipo, botellas: w.qty, vivino: pv, icono: w.icono, val: w.val,
          });
        }
      }
      return [...m.values()];
    }
    const tramoDe = (w: any) => TRAMOS_VIVINO.findIndex(t => v1(w.vivino) >= t.desde);
    const tramosCal = TRAMOS_VIVINO.map((t, i) => {
      const ws = punt.filter(w => tramoDe(w) === i);
      const botellas = ws.reduce((s, w) => s + w.qty, 0);
      return {
        tramo: t.tramo, color: t.color, botellas,
        pct: botPunt ? Math.round(botellas / botPunt * 100) : 0,
      };
    });
    const porDecimaMap = new Map<number, EtiqCal[]>();
    for (const e of agruparCal(punt)) {
      const k = e.vivino as number;
      if (!porDecimaMap.has(k)) porDecimaMap.set(k, []);
      porDecimaMap.get(k)!.push(e);
    }
    const porDecima = [...porDecimaMap.entries()].sort((a, b) => a[0] - b[0]).map(([vivino, es]) => ({
      vivino,
      botellas: es.reduce((s, e) => s + e.botellas, 0),
      vinos: es
        .sort((a, b) => b.botellas - a.botellas || (b.val ?? 0) - (a.val ?? 0) || a.vino.localeCompare(b.vino, 'es'))
        .map(e => ({ vino: e.vino, anada: e.anada, botellas: e.botellas, valoraciones: e.val, icono: e.icono })),
    }));

    const ico = wines.filter(w => w.icono);
    const icoBot = ico.reduce((s, w) => s + w.qty, 0);
    const icoPunt = ico.filter(w => w.vivino !== null);
    const restoPunt = punt.filter(w => !w.icono);
    const iconosCal = {
      botellas: icoBot,
      total: totalEnGuarda,
      pct: totalEnGuarda ? Math.round(icoBot / totalEnGuarda * 100) : 0,
      puntuadasIconos: icoPunt.reduce((s, w) => s + w.qty, 0),
      puntuadasResto: restoPunt.reduce((s, w) => s + w.qty, 0),
      promedioIconos: promDe(icoPunt),
      promedioResto: promDe(restoPunt),
      de45: icoPunt.filter(w => v1(w.vivino) >= 4.5).reduce((s, w) => s + w.qty, 0),
      lista: agruparCal(ico).sort((a, b) =>
        (b.vivino ?? -1) - (a.vivino ?? -1)
        || (b.val ?? 0) - (a.val ?? 0)
        || b.botellas - a.botellas
        || a.vino.localeCompare(b.vino, 'es')),
    };

    // podio: Vivino ↓ → valoraciones ↓ (vacío = 0) → botellas en guarda ↓ → alfabético
    const ranking = agruparCal(punt).sort((a, b) =>
      (b.vivino as number) - (a.vivino as number)
      || (b.val ?? 0) - (a.val ?? 0)
      || b.botellas - a.botellas
      || a.vino.localeCompare(b.vino, 'es'));
    const maxVivino = ranking.length ? (ranking[0].vivino as number) : null;
    const conMax = ranking.filter(e => e.vivino === maxVivino);
    const filaPodio = (e: EtiqCal) => ({
      vino: e.vino, bodega: e.bodega, anada: e.anada, cepa: e.cepa, tipo: e.tipo, icono: e.icono,
      vivino: e.vivino, valoraciones: e.val, botellas: e.botellas,
    });
    const calidadBloque = {
      puntuadas: botPunt,
      sinPuntaje: totalEnGuarda - botPunt,
      promedio: promDe(punt),
      con40: tramosCal.slice(0, 3).reduce((s, t) => s + t.botellas, 0),
      con45: tramosCal[0].botellas,
      porDecima,
      tramos: tramosCal,
      mejor: maxVivino !== null ? { vivino: maxVivino, vinos: conMax.length, botellas: conMax.reduce((s, e) => s + e.botellas, 0) } : null,
      iconos: iconosCal,
      podio: ranking.slice(0, 5).map(filaPodio),
      // si más de 5 comparten el máximo, la lista completa de los que lo comparten
      empateMax: conMax.length > 5 ? conMax.map(filaPodio) : [],
    };

    // 7d. Última juntada: todos los consumos de un mismo mes ────────
    // El puntaje Vivino vive en la botella, no en el consumo.
    const botVivino = new Map<string, number | null>();
    for (const r of botRecs) botVivino.set(r.id, num1(r.fields[F.vivino]));

    type JuntVino = { vino: string; anada: number | null; vivino: number | null; cant: number };
    const juntadas = new Map<string, { botellas: number; vinos: Map<string, JuntVino> }>();
    for (const c of consRecs) {
      const botId = (c.fields[FC.botella] as string[] | undefined)?.[0];
      const cant = Number(c.fields[FC.cantidad]) || 0;
      const fechStr = c.fields[FC.fecha] as string | undefined;
      if (!botId || !fechStr || cant <= 0) continue;
      let dt = new Date(fechStr + 'T00:00:00.000Z');
      const ing = botIngreso.get(botId);
      if (ing && dt < ing) dt = ing;
      const mes = mesKey(dt);
      if (!juntadas.has(mes)) juntadas.set(mes, { botellas: 0, vinos: new Map() });
      const j = juntadas.get(mes)!;
      j.botellas += cant;
      const vino = str1(c.fields[FC.vinoL]);
      const anada = num1(c.fields[FC.anadaR]);
      const k = `${vino.toLowerCase()}|${anada ?? 'nv'}`;
      const ex = j.vinos.get(k);
      if (ex) ex.cant += cant;
      else j.vinos.set(k, { vino, anada, vivino: botVivino.get(botId) ?? null, cant });
    }
    const mesesJuntadas = [...juntadas.keys()].sort();
    const mesUltimaJuntada = mesesJuntadas.length ? mesesJuntadas[mesesJuntadas.length - 1] : null;
    // el mes del primer consumo de la cava
    const primerConsumo = mesesJuntadas.length ? mesesJuntadas[0] : null;
    let ultimaJuntada: {
      mes: string; botellas: number;
      vinos: { vino: string; anada: number | null; vivino: number | null }[];
      resto: number;
      foto: boolean;
      notas?: string;
      maridaje?: string;
    } | null = null;
    if (mesUltimaJuntada) {
      const j = juntadas.get(mesUltimaJuntada)!;
      // mejor Vivino primero; empate, la añada más nueva (así el orden no
      // depende de cómo vinieron los registros de Airtable)
      const top = [...j.vinos.values()]
        .sort((a, b) => (b.vivino ?? -1) - (a.vivino ?? -1) || (b.anada ?? 0) - (a.anada ?? 0))
        .slice(0, 3);
      // La juntada de Airtable se cruza por cava + mes de Fecha. Las URLs de los
      // adjuntos vencen en horas y esta respuesta se cachea: acá sólo viaja si
      // hay foto; la imagen sale de /api/juntada-foto.
      const reg = juntadasRecs.find((r: any) => {
        const f = r.fields[FJ.fecha] as string | undefined;
        return !!f && f.slice(0, 7) === mesUltimaJuntada;
      });
      const nota = reg ? str1(reg.fields[FJ.notas]) : '';
      const maridaje = reg ? str1(reg.fields[FJ.maridaje]) : '';
      ultimaJuntada = {
        mes: mesUltimaJuntada,
        botellas: j.botellas,
        vinos: top.map(v => ({ vino: v.vino, anada: v.anada, vivino: v.vivino })),
        resto: Math.max(j.botellas - top.reduce((s, v) => s + v.cant, 0), 0),
        foto: ((reg?.fields[FJ.fotos] as unknown[] | undefined)?.length ?? 0) > 0,
        ...(nota ? { notas: nota } : {}),
        ...(maridaje ? { maridaje } : {}),
      };
    }

    // 7e. Compras: lo que entró, por mes de ingreso ─────────────────
    type EntradaEtiq = { vino: string; anada: number | null; bodega: string; botellas: number };
    function agruparEntradas(pasa: (origen: string) => boolean) {
      const porMes = new Map<string, { botellas: number; etiquetas: Map<string, EntradaEtiq> }>();
      for (const r of botRecs) {
        if (!pasa(str1(r.fields[F.origen]))) continue;
        const cant = Number(r.fields[F.cantComp]) || 0;
        const ing = botIngreso.get(r.id);
        if (!ing || cant <= 0) continue;
        const mes = mesKey(ing);
        if (!porMes.has(mes)) porMes.set(mes, { botellas: 0, etiquetas: new Map() });
        const m = porMes.get(mes)!;
        m.botellas += cant;
        const vino = str1(r.fields[F.vino]);
        const anada = num1(r.fields[F.anada]);
        const bodega = str1(r.fields[F.bodega]);
        const k = `${vino.toLowerCase()}|${anada ?? 'nv'}|${bodega.toLowerCase()}`;
        const ex = m.etiquetas.get(k);
        if (ex) ex.botellas += cant;
        else m.etiquetas.set(k, { vino, anada, bodega, botellas: cant });
      }
      return [...porMes.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))   // del mes más nuevo al más viejo
        .map(([mes, m]) => ({
          mes,
          botellas: m.botellas,
          etiquetas: [...m.etiquetas.values()]
            .sort((a, b) => b.botellas - a.botellas || a.vino.localeCompare(b.vino, 'es')),
        }));
    }
    const compras = agruparEntradas(o => o === ORIGEN_CLUB);
    const otrasEntradas = agruparEntradas(o => !!o && o !== ORIGEN_CLUB);
    const ultimaCompra = compras.length
      ? { mes: compras[0].mes, botellas: compras[0].botellas } : null;
    const sinOrigen = botRecs.filter((r: any) => !str1(r.fields[F.origen])).length;
    if (sinOrigen) console.warn('[api/cava] botellas sin Origen:', sinOrigen);

    // 8. Strip internal fields from wine objects before returning
    const wineList = wines.map(({ cantComp: _a, fechaIngTs: _b, _provincia: _c, ...w }) => w);

    // 9. Response
    // Configuración de la cava. `cuotaMensual` es la cuota del club (lo que
    // pone cada miembro), no un valor de botellas. Más adelante, de Airtable.
    const configCava = {
      nombre: 'Club EDB #001', alias: 'Barraquitas', tipo: 'grupo',
      fundado: 2021, miembros: 7, cuotaMensual: 50, cuotaMoneda: 'USD',
    };

    const body = {
      // `config` es el nombre canónico; `perfiles` queda para no romper nada.
      config: configCava,
      perfiles: { grupal: configCava },
      data: { grupal: wineList },
      cons: { grupal: { total: consTotal, juntadas: consJuntadas, byYear } },
      stats: {
        enGuarda: totalEnGuarda,
        eq750: totalEq750,
        etiquetas,
        pctIcono,
        vivinoPromedio,
        pctVivinoAlto,
        top5Vivino,
        tipoComposicion,
        evolution,
        anadaPromedio,
        anadaMin,
        anadaMax,
        anadasCount,
        cepasCount: cepasEnGuarda,
        regionesCount,
        bodegasCount,
        paisesCount,
        edadPromedioGuarda,
        vivinoAlto43Count,
        // Países distintos en los consumos.
        paisesConsumidasCount: new Set(consRecs.map((c: any) => normProv(str1(c.fields[FC.provPaisL])).pais)).size,
      },
      geografia,
      cepas: {
        lista: cepasList,
        enGuarda: cepasEnGuarda,
        probadas: cepasProbadas,
        compradas: cepasCompradas,
        anioPrimeraCompra,
        masTomada: masTomadaC ? { nombre: masTomadaC.nombre, abiertas: masTomadaC.abiertas } : null,
        masGuardada: masGuardadaC ? { cepa: masGuardadaC.nombre, botellas: masGuardadaC.enGuarda } : null,
        sinFicha: [...sinFicha],
        tipo: { enGuarda: tipoGuarda, abiertas: tipoAbiertas },
      },
      // Bloques del Inicio de la app
      tramosEdad,
      anadas: anadasBloque,
      calidad: calidadBloque,
      masTomada: masTomadaC
        ? { cepa: masTomadaC.nombre, botellas: masTomadaC.abiertas } : null,
      ultimaJuntada,
      primerConsumo,
      compras,
      otrasEntradas,
      ultimaCompra,
      landing: { enGuarda: totalEnGuarda, abiertas: consTotal },
    };

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json(body);

  } catch (err) {
    console.error('[api/cava] error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
