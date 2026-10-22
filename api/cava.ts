const BASE_ID  = 'appag1VLp4aN3tD3v';
const CAVA_ID  = 'rec7kgfT9LXzYPy6a';
const TBL_BOT  = 'tblZIXNa2Ck3DNCwS';
const TBL_CONS = 'tblvfDCiHNUXo1ZFQ';
const TBL_CEPA = 'tblbweXp5Dj6xKL5Q';

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
} as const;

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

const AR_PROVS = new Set([
  'Mendoza','Salta','San Juan','Rio Negro','Neuquen','Chubut','La Rioja','Catamarca',
]);

function normProv(raw: unknown): { pais: string; provincia: string } {
  let p = typeof raw === 'string' ? raw.trim() : '';
  if (p === 'Río Negro' || p === 'Patagonia') p = 'Rio Negro';
  if (AR_PROVS.has(p)) return { pais: 'Argentina', provincia: p };
  return { pais: p || 'Desconocido', provincia: '' };
}

const MENDOZA_ZONE: Record<string, string> = {
  'Valle de Uco': 'Valle de Uco',
  'Tupungato': 'Valle de Uco', 'Tunuyán': 'Valle de Uco', 'San Carlos': 'Valle de Uco',
  'Luján de Cuyo': 'Luján de Cuyo', 'Lujan de Cuyo': 'Luján de Cuyo',
  'Agrelo': 'Luján de Cuyo', 'Vistalba': 'Luján de Cuyo',
  'Maipú': 'Maipú', 'Maipu': 'Maipú',
  'San Rafael': 'San Rafael',
};

const REG_NORM: Record<string, string> = {
  'Lujan de Cuyo': 'Luján de Cuyo',
  'Maipu': 'Maipú',
  'Tunuyan': 'Tunuyán',
};

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
    // 1. Fetch Botellas — filter in memory (ARRAYJOIN formula resolves display names, not IDs)
    const botFields = Object.values(F);
    const allBotRecs = await fetchAll(TBL_BOT, botFields, {}, token);
    const botRecs = allBotRecs.filter((r: any) => {
      const cavas = r.fields[F.cava] as string[] | undefined;
      return cavas?.includes(CAVA_ID) ?? false;
    });

    // 2. Fetch Consumos
    const consFields = Object.values(FC);
    const allConsRecs = await fetchAll(TBL_CONS, consFields, {}, token);

    // 2b. Fetch Cepas (una fila por uva) — indexada por nombre normalizado
    const cepaRecs = await fetchAll(TBL_CEPA, Object.values(FU), {}, token);
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

      const provRaw = str1(f[F.provPais]);
      let { pais, provincia } = normProv(provRaw);
      const regionRaw = str1(f[F.region]);
      const region = REG_NORM[regionRaw] ?? regionRaw;

      // Cafayate correction
      if (provincia === 'Mendoza' && region.toLowerCase().includes('cafayate')) {
        provincia = 'Salta';
      }

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
        cantComp: Number(f[F.cantComp]) || 0,
        fechaIngTs: ingresoDate?.getTime() ?? null,
        // provincia for maps
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

    // Stats para tarjetas de sección. `cepasCount` se calcula más abajo, con
    // la tabla Cepas (sólo filas con "Es uva"), en el bloque 7b.
    const regionesCount = new Set(wines.filter(w => w.reg).map(w => w.reg)).size;
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

    // Maps ─────────────────────────────────────────────────────────
    type MapEntry = { count: number; wines: { vino: string; an: number | null; qty: number }[] };

    function addToMap(map: Map<string, MapEntry>, key: string, vino: string, an: number | null, qty: number) {
      if (!key) return;
      if (!map.has(key)) map.set(key, { count: 0, wines: [] });
      const e = map.get(key)!;
      e.count += qty;
      // Aggregate same etiqueta
      const ex = e.wines.find(w => w.vino === vino && w.an === an);
      if (ex) ex.qty += qty; else e.wines.push({ vino, an, qty });
    }

    // Guarda maps (from wines in guarda)
    const worldG = new Map<string, MapEntry>();
    const argG   = new Map<string, MapEntry>();
    const mendG  = new Map<string, MapEntry>();

    for (const w of wines) {
      addToMap(worldG, w.pais, w.vino, w.an, w.qty);
      if (w.pais === 'Argentina') {
        addToMap(argG, w._provincia, w.vino, w.an, w.qty);
        if (w._provincia === 'Mendoza') {
          const zone = MENDOZA_ZONE[w.reg] ?? null;
          if (zone) addToMap(mendG, zone, w.vino, w.an, w.qty);
        }
      }
    }

    // Consumidas maps
    const worldC = new Map<string, MapEntry>();
    const argC   = new Map<string, MapEntry>();
    const mendC  = new Map<string, MapEntry>();

    for (const c of consRecs) {
      const cant = Number(c.fields[FC.cantidad]) || 0;
      const paisRaw = str1(c.fields[FC.provPaisL]);
      let { pais, provincia } = normProv(paisRaw);
      const regionRawC = str1(c.fields[FC.regionL]);
      const regionC = REG_NORM[regionRawC] ?? regionRawC;
      if (provincia === 'Mendoza' && regionC.toLowerCase().includes('cafayate')) provincia = 'Salta';
      const vino = str1(c.fields[FC.vinoL]);
      const an   = num1(c.fields[FC.anadaR]);
      addToMap(worldC, pais, vino, an, cant);
      if (pais === 'Argentina') {
        addToMap(argC, provincia, vino, an, cant);
        if (provincia === 'Mendoza') {
          const zone = MENDOZA_ZONE[regionC] ?? null;
          if (zone) addToMap(mendC, zone, vino, an, cant);
        }
      }
    }

    // Regiones: país/provincia → región → bodega (solo en guarda)
    type RegGrp = { esArgentina: boolean; botellas: number; regMap: Map<string, { botellas: number; bodMap: Map<string, number> }> };
    const regionGrpMap = new Map<string, RegGrp>();
    for (const w of wines) {
      const grupo = w.pais === 'Argentina' ? (w._provincia || 'Sin provincia') : w.pais;
      const esArgentina = w.pais === 'Argentina';
      const region = w.reg || 'Sin región especificada';
      if (!regionGrpMap.has(grupo)) regionGrpMap.set(grupo, { esArgentina, botellas: 0, regMap: new Map() });
      const g = regionGrpMap.get(grupo)!;
      g.botellas += w.qty;
      if (!g.regMap.has(region)) g.regMap.set(region, { botellas: 0, bodMap: new Map() });
      const rv = g.regMap.get(region)!;
      rv.botellas += w.qty;
      rv.bodMap.set(w.bod, (rv.bodMap.get(w.bod) || 0) + w.qty);
    }
    const regiones = Array.from(regionGrpMap.entries())
      .sort((a, b) => b[1].botellas - a[1].botellas)
      .map(([grupo, g]) => ({
        grupo,
        esArgentina: g.esArgentina,
        botellas: g.botellas,
        regiones: Array.from(g.regMap.entries())
          .sort((a, b) => b[1].botellas - a[1].botellas)
          .map(([region, r]) => ({
            region,
            botellas: r.botellas,
            bodegas: Array.from(r.bodMap.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([bodega, botellas]) => ({ bodega, botellas })),
          })),
      }));

    function mapToDict(m: Map<string, MapEntry>) {
      const out: Record<string, { botellas: number; vinos: { vino: string; an: number | null; qty: number }[] }> = {};
      for (const [key, e] of m.entries()) {
        out[key] = { botellas: e.count, vinos: e.wines.sort((a, b) => b.qty - a.qty) };
      }
      return out;
    }

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
    const masTomadaC     = cepasList.filter(c => c.abiertas > 0)
      .sort((x, y) => y.abiertas - x.abiertas)[0] ?? null;

    // Composición por tipo de vino, en guarda y abiertas
    function porTipo(fuente: { tipo: string; qty: number }[]) {
      const agg: Record<string, number> = {};
      for (const f of fuente) if (f.tipo) agg[f.tipo] = (agg[f.tipo] || 0) + f.qty;
      const total = Object.values(agg).reduce((s, v) => s + v, 0);
      return {
        total,
        items: Object.entries(agg).sort((a, b) => b[1] - a[1])
          .map(([tipo, count]) => ({ tipo, count, pct: total ? Math.round(count / total * 100) : 0 })),
      };
    }
    const tipoGuarda = porTipo(wines.map(w => ({ tipo: w.tipo, qty: w.qty })));
    const tipoAbiertas = porTipo(consRecs.map(c => ({
      tipo: str1(c.fields[FC.tipoL]).toLowerCase(),
      qty: Number(c.fields[FC.cantidad]) || 0,
    })));

    // 8. Strip internal fields from wine objects before returning
    const wineList = wines.map(({ cantComp: _a, fechaIngTs: _b, _provincia: _c, ...w }) => w);

    // 9. Response
    const body = {
      perfiles: {
        // Configuración de la cava. `cuotaMensual` es la cuota del club (lo que
        // pone cada miembro), no un valor de botellas. Más adelante, de Airtable.
        grupal: {
          nombre: 'Club EDB #001', alias: 'Barraquitas', tipo: 'grupo',
          fundado: 2021, miembros: 7, cuotaMensual: 50, cuotaMoneda: 'USD',
        },
      },
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
        cepasCount: cepasEnGuarda,
        regionesCount,
        bodegasCount,
        paisesCount,
        edadPromedioGuarda,
        vivinoAlto43Count,
        // Países distintos en los consumos (los mismos que geo.mundo.consumidas).
        paisesConsumidasCount: worldC.size,
      },
      geo: {
        mundo:     { enGuarda: mapToDict(worldG), consumidas: mapToDict(worldC) },
        argentina: { enGuarda: mapToDict(argG),   consumidas: mapToDict(argC) },
        mendoza:   { enGuarda: mapToDict(mendG),  consumidas: mapToDict(mendC) },
      },
      regiones,
      cepas: {
        lista: cepasList,
        enGuarda: cepasEnGuarda,
        probadas: cepasProbadas,
        masTomada: masTomadaC ? { nombre: masTomadaC.nombre, abiertas: masTomadaC.abiertas } : null,
        sinFicha: [...sinFicha],
        tipo: { enGuarda: tipoGuarda, abiertas: tipoAbiertas },
      },
      landing: { enGuarda: totalEnGuarda, abiertas: consTotal },
    };

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(body);

  } catch (err) {
    console.error('[api/cava] error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
