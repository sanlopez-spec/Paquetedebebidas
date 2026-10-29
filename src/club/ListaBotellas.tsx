// ── Las botellas: la herramienta para encontrar qué abrir ──────────────
// Un solo componente: buscador, vistas rápidas, filtros con contadores
// (facetados), orden, lista y ficha. Se usa como sección (`modo="seccion"`) o,
// más adelante, como hoja que otras secciones abren con un filtro puesto
// (`modo="hoja"`). El estado vive en el hash: #botellas?cepa=Malbec&orden=vivino.
import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';

// ── datos que necesita (compatibles con lo que ya trae /api/cava) ──
export interface BotWine {
  an: number | null; vino: string; bod: string; pais: string; reg: string; tipo: string; cepa: string;
  cf?: string; prov?: string; vivino: number | null; qty: number; start: [number, number] | null;
  eq: number; cons: number; consd: string[]; icono?: boolean;
}
export interface BotConsWine {
  vino: string; bod: string; cepa: string; cf?: string; pais: string; reg: string; gpais?: string; gprov?: string; greg?: string;
  an: number | null; tipo: string; cant: number; mes: number;
}
export interface BotCepa {
  fila: string; nombre: string;
  ficha: { intensidad: string; taninos: string; acidez?: string; aromas: string; maridajes: string; temperatura: string } | null;
}
export type Orden = 'anada' | 'vivino' | 'recien' | 'botellas' | 'bodega' | 'nombre';
export type Vista = 'todas' | 'ultima' | 'probadas' | 'iconos' | 'antiguas' | 'vivino45' | 'recien' | 'grandes';
export interface Filtros {
  tipo: string[]; cepa: string[]; region: string[]; anada: [number, number] | null; vivino: string[];
  icono: string[]; formato: string[]; bodega: string[]; pais: string[];
}
export interface EstadoBotellas { vista: Vista; q: string; orden: Orden; abiertas: boolean; filtros: Filtros }
type GrupoId = 'tipo' | 'cepa' | 'region' | 'anada' | 'vivino' | 'icono' | 'formato' | 'bodega' | 'pais';

export const FILTROS_VACIOS: Filtros = { tipo: [], cepa: [], region: [], anada: null, vivino: [], icono: [], formato: [], bodega: [], pais: [] };

// ── constantes ──
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const AHORA = new Date();
const NOW = AHORA.getFullYear();
const MES_ACTUAL = NOW * 12 + AHORA.getMonth();
const BORDO = '#6B1E2E';
const FILAS_PAGINA = 40;
const OPCIONES_VISIBLES = 8;
const FILAS_RELACIONADAS = 3;       // en la ficha: otras añadas y más de la bodega
const POP_ANCHO = 280;              // cuadro flotante de cada filtro (escritorio)
const EDAD_ANTIGUA = 15;
const MESES_RECIEN = 3;
const GRANDES = 1.75;                // desde un Magnum
const PATAGONIA = new Set(['Neuquén', 'Río Negro', 'Chubut']);
const FMT: Record<number, string> = { 2: 'Magnum', 4: 'Jeroboam', 6: 'Imperial', 8: 'Matusalén', 12: 'Salmanazar', 16: 'Balthazar' };
const TIPOS_ORDEN = ['tinto', 'blanco', 'espumante', 'rosado', 'naranjo'];
const VIVINO_OPCIONES = ['4,5 o más', '4,2 a 4,4', '4,0 a 4,1', 'Menos de 4', 'Sin puntaje'];
const FORMATO_OPCIONES = ['750', 'Magnum', 'Más grandes'];
const ICONO_OPCIONES = ['Sí', 'No'];
const GRUPOS: { id: GrupoId; titulo: string }[] = [
  { id: 'tipo', titulo: 'Tipo' }, { id: 'cepa', titulo: 'Cepa' }, { id: 'region', titulo: 'Región' }, { id: 'anada', titulo: 'Añada' },
  { id: 'vivino', titulo: 'Vivino' }, { id: 'icono', titulo: 'Ícono' }, { id: 'formato', titulo: 'Formato' },
  { id: 'bodega', titulo: 'Bodega' }, { id: 'pais', titulo: 'País' },
];
const VISTAS: { id: Vista; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' }, { id: 'ultima', rotulo: 'Última botella' }, { id: 'probadas', rotulo: 'Ya probadas' },
  { id: 'iconos', rotulo: 'Íconos' }, { id: 'antiguas', rotulo: `Más de ${EDAD_ANTIGUA} años` }, { id: 'vivino45', rotulo: 'Vivino 4,5 o más' },
  { id: 'recien', rotulo: 'Recién llegadas' }, { id: 'grandes', rotulo: 'Formatos grandes' },
];
const ORDENES: { id: Orden; rotulo: string }[] = [
  { id: 'anada', rotulo: 'Añada' }, { id: 'vivino', rotulo: 'Vivino' }, { id: 'recien', rotulo: 'Recién llegadas' },
  { id: 'botellas', rotulo: 'Más botellas' }, { id: 'bodega', rotulo: 'Bodega A–Z' }, { id: 'nombre', rotulo: 'Nombre A–Z' },
];

// ── helpers ──
const fmtN = (n: number, d = 0) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function fmtNombre(ratio: number): string {
  if (ratio < GRANDES) return '';
  const k = Math.round(ratio);
  if (FMT[k]) return FMT[k];
  return String(Math.round(ratio * 0.75 * 100) / 100).replace('.', ',') + ' L';
}
const grupoFormato = (ratio: number) => (ratio < GRANDES ? '750' : Math.round(ratio) === 2 ? 'Magnum' : 'Más grandes');
function bucketVivino(v: number | null): string {
  if (v == null) return 'Sin puntaje';
  if (v >= 4.5) return '4,5 o más';
  if (v >= 4.2) return '4,2 a 4,4';
  if (v >= 4.0) return '4,0 a 4,1';
  return 'Menos de 4';
}

// ── el modelo: registros (filas) agrupados en etiquetas ──
interface Et {
  key: string; vino: string; an: number | null; bod: string; regLabel: string; cepa: string; cf: string; tipo: string;
  qty: number; cons: number; consd: string[]; filas: Fila[]; ultima: boolean; probada: boolean; recien: boolean;
  start: number | null; ratioMax: number; icono: boolean; vivino: number | null; sinGuarda: boolean;
}
interface Fila {
  id: number; et: Et; vino: string; an: number | null; bod: string; regLabel: string; grupoRegion: string; pais: string;
  tipo: string; cepa: string; vivino: number | null; qty: number; ab: number; ratio: number; icono: boolean; hay: string; sinGuarda: boolean;
}
const keyDe = (vino: string, an: number | null) => `${vino.toLowerCase()}|${an ?? 'nv'}`;
const peso = (f: Fila) => f.qty || f.ab;

function grupoRegionDe(pais: string, prov: string): string {
  if (pais !== 'Argentina') return 'DEL MUNDO';
  if (PATAGONIA.has(prov)) return 'PATAGONIA';
  return (prov || 'ARGENTINA').toUpperCase();
}

function construir(rows: BotWine[], cons: { byYear: Record<string, { wines: BotConsWine[] }> }) {
  const etiquetas = new Map<string, Et>();
  const filas: Fila[] = [];
  let id = 0;
  const crearFila = (et: Et, o: Partial<Fila> & { vino: string; an: number | null; bod: string; reg: string; pais: string; prov: string; tipo: string; cepa: string }): Fila => {
    const regLabel = o.reg ? (o.pais !== 'Argentina' ? `${o.reg} (${o.pais})` : o.reg) : '';
    const f: Fila = {
      id: id++, et, vino: o.vino, an: o.an, bod: o.bod, regLabel, grupoRegion: grupoRegionDe(o.pais, o.prov), pais: o.pais, tipo: o.tipo, cepa: o.cepa,
      vivino: o.vivino ?? null, qty: o.qty ?? 0, ab: o.ab ?? 0, ratio: o.ratio ?? 1, icono: !!o.icono, sinGuarda: !!o.sinGuarda,
      hay: sinTildes([o.vino, o.bod, o.cepa, o.reg, o.pais, o.an ?? ''].join(' ')),
    };
    et.filas.push(f);
    filas.push(f);
    return f;
  };
  for (const r of rows) {
    if (!(r.qty > 0)) continue;
    const key = keyDe(r.vino, r.an);
    let et = etiquetas.get(key);
    if (!et) {
      et = { key, vino: r.vino, an: r.an, bod: r.bod, regLabel: '', cepa: r.cepa, cf: r.cf ?? r.cepa, tipo: r.tipo, qty: 0, cons: 0, consd: [], filas: [],
        ultima: false, probada: false, recien: false, start: null, ratioMax: 1, icono: false, vivino: null, sinGuarda: false };
      etiquetas.set(key, et);
    }
    const f = crearFila(et, { ...r, prov: r.prov ?? '', qty: r.qty, ratio: r.qty ? r.eq / r.qty : 1 });
    if (!et.regLabel) et.regLabel = f.regLabel;
    et.qty += r.qty; et.cons += r.cons; et.consd.push(...(r.consd ?? []));
    et.icono = et.icono || !!r.icono;
    et.ratioMax = Math.max(et.ratioMax, f.ratio);
    if (r.vivino != null) et.vivino = Math.max(et.vivino ?? 0, r.vivino);
    if (r.start) { const s = r.start[0] * 12 + r.start[1]; if (et.start == null || s > et.start) et.start = s; }
  }
  for (const et of etiquetas.values()) {
    et.ultima = et.qty === 1;
    et.probada = et.cons > 0;
    et.recien = et.start != null && MES_ACTUAL - et.start <= MESES_RECIEN;
  }
  // las que se abrieron enteras: salen de Consumos
  const abiertas = new Map<string, { w: BotConsWine; n: number; fechas: string[] }>();
  for (const [y, yr] of Object.entries(cons.byYear)) {
    for (const w of yr.wines) {
      const key = keyDe(w.vino, w.an);
      if (etiquetas.has(key) || !(w.cant > 0)) continue;
      const a = abiertas.get(key) ?? { w, n: 0, fechas: [] as string[] };
      a.n += w.cant; a.fechas.push(`${MESES[w.mes]} ${y}`);
      abiertas.set(key, a);
    }
  }
  const soloAbiertas: Et[] = [];
  for (const [key, a] of abiertas) {
    const w = a.w;
    const pais = w.gpais ?? w.pais, reg = w.greg ?? w.reg;
    const et: Et = { key, vino: w.vino, an: w.an, bod: w.bod, regLabel: '', cepa: w.cepa, cf: w.cf ?? w.cepa, tipo: w.tipo, qty: 0, cons: a.n, consd: a.fechas, filas: [],
      ultima: false, probada: true, recien: false, start: null, ratioMax: 1, icono: false, vivino: null, sinGuarda: true };
    const f = crearFila(et, { vino: w.vino, an: w.an, bod: w.bod, reg, pais, prov: w.gprov ?? '', tipo: w.tipo, cepa: w.cepa, ab: a.n, sinGuarda: true });
    et.regLabel = f.regLabel;
    soloAbiertas.push(et);
  }
  return { filas, etiquetas, soloAbiertas };
}

// ── estado ⇄ hash ──
function leerQuery(query: string): Partial<EstadoBotellas> {
  const p = new URLSearchParams(query);
  const lista = (k: string) => (p.get(k) ?? '').split('|').filter(Boolean);
  const e: Partial<EstadoBotellas> = {};
  const vista = p.get('vista') as Vista | null;
  if (vista && VISTAS.some(v => v.id === vista)) e.vista = vista;
  if (p.get('q')) e.q = p.get('q')!;
  const orden = p.get('orden') as Orden | null;
  if (orden && ORDENES.some(o => o.id === orden)) e.orden = orden;
  if (p.get('abiertas') === '1') e.abiertas = true;
  const f: Filtros = { ...FILTROS_VACIOS };
  (['tipo', 'cepa', 'region', 'vivino', 'icono', 'formato', 'bodega', 'pais'] as const).forEach(k => { f[k] = lista(k); });
  const an = (p.get('anada') ?? '').match(/^(\d{4})-(\d{4})$/);
  if (an) f.anada = [Number(an[1]), Number(an[2])];
  e.filtros = f;
  return e;
}
function aQuery(e: EstadoBotellas, base: EstadoBotellas): string {
  const p = new URLSearchParams();
  if (e.vista !== 'todas') p.set('vista', e.vista);
  if (e.q) p.set('q', e.q);
  if (e.orden !== base.orden) p.set('orden', e.orden);
  if (e.abiertas) p.set('abiertas', '1');
  (['tipo', 'cepa', 'region', 'vivino', 'icono', 'formato', 'bodega', 'pais'] as const).forEach(k => { if (e.filtros[k].length) p.set(k, e.filtros[k].join('|')); });
  if (e.filtros.anada) p.set('anada', `${e.filtros.anada[0]}-${e.filtros.anada[1]}`);
  return p.toString();
}

// ── predicados ──
function valorDe(f: Fila, g: GrupoId): string | null {
  switch (g) {
    case 'tipo': return f.tipo || null;
    case 'cepa': return f.cepa || null;
    case 'region': return f.regLabel || null;
    case 'vivino': return bucketVivino(f.vivino);
    case 'icono': return f.icono ? 'Sí' : 'No';
    case 'formato': return grupoFormato(f.ratio);
    case 'bodega': return f.bod || null;
    case 'pais': return f.pais || null;
    default: return null;
  }
}
function pasaVista(f: Fila, v: Vista): boolean {
  switch (v) {
    case 'ultima': return f.et.ultima;
    case 'probadas': return f.et.probada;
    case 'iconos': return f.icono;
    case 'antiguas': return f.an != null && NOW - f.an > EDAD_ANTIGUA;
    case 'vivino45': return f.vivino != null && f.vivino >= 4.5;
    case 'recien': return f.et.recien;
    case 'grandes': return f.ratio >= GRANDES;
    default: return true;
  }
}
function pasa(f: Fila, e: EstadoBotellas, qn: string[], ignorar: GrupoId | 'vista' | null): boolean {
  if (f.sinGuarda && !e.abiertas) return false;
  if (ignorar !== 'vista' && !pasaVista(f, e.vista)) return false;
  for (const t of qn) if (!f.hay.includes(t)) return false;
  for (const g of GRUPOS) {
    if (g.id === ignorar) continue;
    if (g.id === 'anada') {
      const r = e.filtros.anada;
      if (r && (f.an == null || f.an < r[0] || f.an > r[1])) return false;
      continue;
    }
    const sel = e.filtros[g.id];
    if (sel.length && !sel.includes(valorDe(f, g.id) ?? '\u0000')) return false;
  }
  return true;
}

// ── el componente ──
export interface ListaBotellasProps {
  rows: BotWine[];
  cons: { byYear: Record<string, { wines: BotConsWine[] }> };
  cepas?: BotCepa[];
  modo: 'seccion' | 'hoja';
  filtrosIniciales?: Partial<Filtros>;
  ordenInicial?: Orden;
  consultaInicial?: string;        // lo que viene en el hash, después del "?"
  sincronizarHash?: boolean;       // en modo sección dentro de /club/cava
  onCerrar?: () => void;           // modo hoja
  valores?: Record<string, ValoresBotella>;   // por etiqueta, ya formateados; sólo con sesión
  posiciones?: Record<string, string>;        // por etiqueta: dónde está en la cava; sólo con sesión
  valoresEstado?: 'cargando' | 'listo';       // sin esto (o si falla) la ficha queda con candado
}

// Los montos sólo los ve un socio. Mientras no haya login, el bloque va con candado y no recibe ningún número.
export interface ValoresBotella { pagaste: string; valorHoy: string; ahorroClub: string; sumaGuarda: string }

export default function ListaBotellas({ rows, cons, cepas, modo, filtrosIniciales, ordenInicial = 'anada', consultaInicial = '', sincronizarHash = false, onCerrar, valores, valoresEstado, posiciones }: ListaBotellasProps) {
  const modelo = useMemo(() => construir(rows, cons), [rows, cons]);
  const { filas, etiquetas } = modelo;
  const base: EstadoBotellas = useMemo(() => ({ vista: 'todas', q: '', orden: ordenInicial, abiertas: false, filtros: { ...FILTROS_VACIOS, ...filtrosIniciales } }), []);  // eslint-disable-line react-hooks/exhaustive-deps
  const [est, setEst] = useState<EstadoBotellas>(() => {
    const d = consultaInicial ? leerQuery(consultaInicial) : {};
    return { ...base, ...d, filtros: { ...base.filtros, ...(d.filtros && (Object.values(d.filtros).some(v => (Array.isArray(v) ? v.length : v)) ) ? d.filtros : {}) } };
  });
  const [texto, setTexto] = useState('');
  const [enfocado, setEnfocado] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);   // el único menú de filtro abierto
  const [alinDer, setAlinDer] = useState(false);
  const [masAbierto, setMasAbierto] = useState<string | null>(null);
  const [fichaKey, setFichaKey] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [ancho, setAncho] = useState(0);
  const raiz = useRef<HTMLDivElement | null>(null);
  const esc = ancho >= 640;

  // ancho del contenido: decide escritorio o celular
  const refRaiz = useCallback((n: HTMLDivElement | null) => { raiz.current = n; }, []);
  useEffect(() => {
    const n = raiz.current; if (!n) return;
    const medir = () => setAncho(n.getBoundingClientRect().width);
    medir();
    const ro = new ResizeObserver(medir); ro.observe(n);
    return () => ro.disconnect();
  }, []);

  // el estado queda en el hash
  useEffect(() => {
    if (!sincronizarHash || modo !== 'seccion') return;
    const q = aQuery(est, base);
    const hash = '#botellas' + (q ? '?' + q : '');
    if (window.location.hash !== hash && decodeURIComponent(window.location.hash) !== decodeURIComponent(hash)) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + hash);
    }
  }, [est, base, sincronizarHash, modo]);

  useEffect(() => { setPagina(1); }, [est]);
  // si el hash cambia a mano (o con "atrás"), el estado lo sigue
  useEffect(() => {
    if (!sincronizarHash || modo !== 'seccion') return;
    const fn = () => {
      const h = window.location.hash;
      if (!h.startsWith('#botellas')) return;
      const i = h.indexOf('?');
      const d = leerQuery(i >= 0 ? h.slice(i + 1) : '');
      setEst({ ...base, ...d, filtros: { ...base.filtros, ...(d.filtros ?? {}) } });
    };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, [sincronizarHash, modo, base]);
  // la hoja de filtros y la ficha tapan la pantalla: no se scrollea el fondo
  useEffect(() => {
    if (!(abierto && !esc) && !fichaKey) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [abierto, fichaKey, esc]);
  useEffect(() => {
    const fn = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setAbierto(null); setFichaKey(null); } };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
  // escritorio: el cuadro flotante se cierra tocando afuera
  useEffect(() => {
    if (!abierto || !esc) return;
    const fn = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(`.bt-fb[data-menu="${abierto}"]`)) setAbierto(null);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [abierto, esc]);

  const qn = useMemo(() => sinTildes(est.q).split(/\s+/).filter(Boolean), [est.q]);
  const peso1 = (f: Fila) => peso(f);

  // lo que pasa todos los filtros
  const visibles = useMemo(() => filas.filter(f => pasa(f, est, qn, null)), [filas, est, qn]);
  const botVisibles = visibles.reduce((s, f) => s + peso1(f), 0);
  const etVisibles = useMemo(() => {
    const m = new Map<string, { et: Et; bot: number }>();
    for (const f of visibles) { const x = m.get(f.et.key) ?? { et: f.et, bot: 0 }; x.bot += peso1(f); m.set(f.et.key, x); }
    return [...m.values()];
  }, [visibles]);

  // contadores de cada opción: con los filtros de los otros grupos puestos
  const conteos = useMemo(() => {
    const out: Record<string, Map<string, number>> = {};
    for (const g of GRUPOS) {
      if (g.id === 'anada') continue;
      const m = new Map<string, number>();
      for (const f of filas) {
        if (!pasa(f, est, qn, g.id)) continue;
        const v = valorDe(f, g.id); if (v == null) continue;
        m.set(v, (m.get(v) ?? 0) + peso1(f));
      }
      out[g.id] = m;
    }
    const hist = new Map<number, number>();
    for (const f of filas) { if (f.an == null || !pasa(f, est, qn, 'anada')) continue; hist.set(f.an, (hist.get(f.an) ?? 0) + peso1(f)); }
    out.anada = new Map([...hist].map(([a, n]) => [String(a), n]));
    return out;
  }, [filas, est, qn]);

  // todas las opciones que existen (sin filtrar), en su orden
  const universo = useMemo(() => {
    const total: Record<string, Map<string, number>> = {};
    for (const g of GRUPOS) total[g.id] = new Map();
    const regionGrupo = new Map<string, string>();
    for (const f of filas) {
      if (f.sinGuarda && !est.abiertas) continue;
      for (const g of GRUPOS) {
        if (g.id === 'anada') continue;
        const v = valorDe(f, g.id); if (v == null) continue;
        total[g.id].set(v, (total[g.id].get(v) ?? 0) + peso1(f));
      }
      if (f.regLabel) regionGrupo.set(f.regLabel, f.grupoRegion);
    }
    const porPeso = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).map(x => x[0]);
    const tipos = [...total.tipo.keys()].sort((a, b) => {
      const ia = TIPOS_ORDEN.indexOf(a), ib = TIPOS_ORDEN.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'es');
    });
    const regiones = porPeso(total.region);
    const grupos = new Map<string, string[]>();
    for (const r of regiones) { const g = regionGrupo.get(r) ?? 'DEL MUNDO'; grupos.set(g, [...(grupos.get(g) ?? []), r]); }
    const suma = (rs: string[]) => rs.reduce((s, r) => s + (total.region.get(r) ?? 0), 0);
    const regionesAgrupadas = [...grupos.entries()].sort((a, b) => (a[0] === 'DEL MUNDO' ? 1 : 0) - (b[0] === 'DEL MUNDO' ? 1 : 0) || suma(b[1]) - suma(a[1]));
    const anios = filas.filter(f => f.an != null && !(f.sinGuarda && !est.abiertas)).map(f => f.an as number);
    return {
      total, tipo: tipos, cepa: porPeso(total.cepa), region: regiones, regionesAgrupadas, bodega: porPeso(total.bodega), pais: porPeso(total.pais),
      vivino: VIVINO_OPCIONES.filter(o => total.vivino.has(o)), icono: ICONO_OPCIONES.filter(o => total.icono.has(o)), formato: FORMATO_OPCIONES.filter(o => total.formato.has(o)),
      anioMin: anios.length ? Math.min(...anios) : NOW, anioMax: anios.length ? Math.max(...anios) : NOW,
    };
  }, [filas, est.abiertas]);

  // vistas rápidas: botellas de cada una (con la búsqueda y los filtros puestos)
  const vistasN = useMemo(() => {
    const n: Record<Vista, number> = { todas: 0, ultima: 0, probadas: 0, iconos: 0, antiguas: 0, vivino45: 0, recien: 0, grandes: 0 };
    const global: Record<Vista, number> = { ...n };
    const vacio: EstadoBotellas = { ...est, vista: 'todas', filtros: { ...FILTROS_VACIOS }, q: '' };
    for (const f of filas) {
      if (f.sinGuarda && !est.abiertas) continue;
      for (const v of VISTAS) if (pasaVista(f, v.id)) global[v.id] += peso1(f);
      if (!pasa(f, est, qn, 'vista')) continue;
      for (const v of VISTAS) if (pasaVista(f, v.id)) n[v.id] += peso1(f);
    }
    void vacio;
    return { n, global };
  }, [filas, est, qn]);
  const vistasVisibles = VISTAS.filter(v => v.id === 'todas' || v.id === est.vista || (vistasN.global[v.id] > 0 && vistasN.global[v.id] !== vistasN.global.todas));

  // ordenar
  const lista = useMemo(() => {
    const xs = [...etVisibles];
    const nombre = (a: Et, b: Et) => a.vino.localeCompare(b.vino, 'es');
    const viv = (a: Et, b: Et) => (b.vivino ?? -1) - (a.vivino ?? -1);
    const sinAn = (a: Et, b: Et) => (a.an == null ? 1 : 0) - (b.an == null ? 1 : 0);
    xs.sort((x, y) => {
      const a = x.et, b = y.et;
      const s = sinAn(a, b); if (s) return s;
      let c = 0;
      if (est.orden === 'anada') c = (a.an ?? 0) - (b.an ?? 0);
      else if (est.orden === 'vivino') c = viv(a, b);
      else if (est.orden === 'recien') c = (b.start ?? -1) - (a.start ?? -1);
      else if (est.orden === 'botellas') c = y.bot - x.bot;
      else if (est.orden === 'bodega') c = a.bod.localeCompare(b.bod, 'es');
      else c = nombre(a, b);
      return c || viv(a, b) || nombre(a, b);
    });
    return xs;
  }, [etVisibles, est.orden]);

  // ── acciones ──
  const poner = (p: Partial<EstadoBotellas>) => setEst(e => ({ ...e, ...p }));
  const ponerFiltro = (g: GrupoId, v: string[]) => setEst(e => ({ ...e, filtros: { ...e.filtros, [g]: v } }));
  const alternar = (g: GrupoId, v: string) => setEst(e => {
    const cur = e.filtros[g as Exclude<GrupoId, 'anada'>];
    return { ...e, filtros: { ...e.filtros, [g]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] } };
  });
  const limpiar = () => setEst(e => ({ ...e, q: '', vista: 'todas', filtros: { ...FILTROS_VACIOS, ...(modo === 'hoja' ? {} : {}) } }));
  const nFiltros = GRUPOS.reduce((s, g) => s + (g.id === 'anada' ? (est.filtros.anada ? 1 : 0) : est.filtros[g.id].length), 0);
  const hayAlgo = nFiltros > 0 || !!est.q || est.vista !== 'todas';

  // ── buscador ──
  const tn = sinTildes(texto);
  const sugerencias = useMemo(() => {
    if (tn.length < 2) return null;
    const dentro = (s: string) => sinTildes(s).includes(tn);
    const grupo = (g: GrupoId, tit: string, opciones: string[], conteo: Map<string, number>) => ({
      g, tit, items: opciones.filter(dentro).slice(0, 4).map(o => ({ valor: o, n: conteo.get(o) ?? 0 })),
    });
    const anios = [...new Set(filas.filter(f => f.an != null && String(f.an).includes(tn)).map(f => f.an as number))].sort((a, b) => a - b).slice(0, 4);
    const porAnio = new Map<string, number>();
    for (const f of filas) if (f.an != null && !(f.sinGuarda && !est.abiertas)) porAnio.set(String(f.an), (porAnio.get(String(f.an)) ?? 0) + peso1(f));
    const grupos = [
      grupo('region', 'REGIÓN', universo.region, universo.total.region),
      grupo('bodega', 'BODEGA', universo.bodega, universo.total.bodega),
      grupo('cepa', 'CEPA', universo.cepa, universo.total.cepa),
      { g: 'anada' as GrupoId, tit: 'AÑADA', items: anios.map(a => ({ valor: String(a), n: porAnio.get(String(a)) ?? 0 })) },
      grupo('formato', 'FORMATO', universo.formato, universo.total.formato),
    ].filter(x => x.items.length > 0);
    const vinos = [...etiquetas.values()].filter(e => sinTildes(e.vino).includes(tn)).slice(0, 5);
    return { grupos, vinos };
  }, [tn, filas, universo, etiquetas, est.abiertas]);
  const elegirSugerencia = (g: GrupoId, v: string) => {
    if (g === 'anada') poner({ filtros: { ...est.filtros, anada: [Number(v), Number(v)] } });
    else if (!est.filtros[g as Exclude<GrupoId, 'anada'>].includes(v)) alternar(g, v);
    setTexto('');
  };

  // ── ficha ──
  const etFicha = fichaKey ? (etiquetas.get(fichaKey) ?? modelo.soloAbiertas.find(e => e.key === fichaKey) ?? null) : null;

  // ── panel de filtros (el mismo en la hoja y en el lado) ──
  const [busqBod, setBusqBod] = useState('');
  const [verMas, setVerMas] = useState<Record<string, boolean>>({});
  const Opcion = ({ g, valor, rotulo }: { g: GrupoId; valor: string; rotulo?: string }) => {
    const sel = est.filtros[g as Exclude<GrupoId, 'anada'>].includes(valor);
    const n = conteos[g].get(valor) ?? 0;
    const apagada = n === 0 && !sel;
    return (
      <button type="button" className={'bt-op' + (sel ? ' on' : '') + (apagada ? ' off' : '')} data-grupo={g} data-valor={valor}
        aria-pressed={sel} disabled={apagada} onClick={() => alternar(g, valor)}>
        <span className="bt-op-c" aria-hidden="true">{sel ? '✓' : ''}</span>
        <span className="bt-op-t">{rotulo ?? valor}</span>
        <span className="bt-op-n">{fmtN(n)}</span>
      </button>
    );
  };
  const opcionesDe = (g: GrupoId): string[] => {
    if (g === 'tipo') return universo.tipo;
    if (g === 'cepa') return universo.cepa;
    if (g === 'vivino') return universo.vivino;
    if (g === 'icono') return universo.icono;
    if (g === 'formato') return universo.formato;
    if (g === 'bodega') return universo.bodega;
    if (g === 'pais') return universo.pais;
    return universo.region;
  };
  const grupoVisible = (g: GrupoId) => (g === 'anada' ? universo.anioMax > universo.anioMin : opcionesDe(g).length >= 2);
  const cuerpoGrupo = (g: GrupoId) => {
    if (g === 'anada') return <Anadas est={est} universo={universo} conteo={conteos.anada} onRango={r => poner({ filtros: { ...est.filtros, anada: r } })} />;
    if (g === 'region') {
      const abiertoTodo = verMas.region;
      const todas = universo.regionesAgrupadas;
      const primeras = new Set(universo.region.slice(0, OPCIONES_VISIBLES));
      est.filtros.region.forEach(r => primeras.add(r));
      const resto = universo.region.length - [...primeras].length;
      return (
        <div className="bt-ops">
          {todas.map(([gr, rs]) => {
            const mostrar = abiertoTodo ? rs : rs.filter(r => primeras.has(r));
            if (!mostrar.length) return null;
            return <Fragment key={gr}><div className="bt-gr">{gr}</div>{mostrar.map(r => <Opcion key={r} g="region" valor={r} />)}</Fragment>;
          })}
          {resto > 0 && <button type="button" className="bt-mas" onClick={() => setVerMas(v => ({ ...v, region: !v.region }))}>{abiertoTodo ? 'Ver menos' : `+${fmtN(resto)}`}</button>}
        </div>
      );
    }
    if (g === 'bodega') {
      const qb = sinTildes(busqBod);
      const ops = opcionesDe('bodega').filter(b => !qb || sinTildes(b).includes(qb));
      const vis = qb || verMas.bodega ? ops : ops.slice(0, OPCIONES_VISIBLES);
      est.filtros.bodega.forEach(b => { if (!vis.includes(b) && ops.includes(b)) vis.push(b); });
      return (
        <div className="bt-ops">
          <input type="search" className="bt-busq-mini" placeholder="Buscar bodega" value={busqBod} onChange={ev => setBusqBod(ev.target.value)} aria-label="Buscar bodega" />
          {vis.map(b => <Opcion key={b} g="bodega" valor={b} />)}
          {!qb && ops.length > OPCIONES_VISIBLES && <button type="button" className="bt-mas" onClick={() => setVerMas(v => ({ ...v, bodega: !v.bodega }))}>{verMas.bodega ? 'Ver menos' : `+${fmtN(ops.length - OPCIONES_VISIBLES)}`}</button>}
          {qb && ops.length === 0 && <div className="bt-vacio-mini">Ninguna bodega</div>}
        </div>
      );
    }
    const ops = opcionesDe(g);
    const limitado = g === 'cepa' && !verMas.cepa;
    const vis = limitado ? ops.slice(0, OPCIONES_VISIBLES) : ops;
    est.filtros.cepa.forEach(c => { if (g === 'cepa' && limitado && !vis.includes(c)) vis.push(c); });
    return (
      <div className="bt-ops">
        {vis.map(o => <Opcion key={o} g={g} valor={o} rotulo={g === 'tipo' ? cap(o) : undefined} />)}
        {g === 'cepa' && ops.length > OPCIONES_VISIBLES && <button type="button" className="bt-mas" onClick={() => setVerMas(v => ({ ...v, cepa: !v.cepa }))}>{verMas.cepa ? 'Ver menos' : `+${fmtN(ops.length - OPCIONES_VISIBLES)}`}</button>}
      </div>
    );
  };
  // ── la fila de botones de filtro: cada uno abre solo su grupo ──
  const MENUS: { id: string; rotulo: string; grupos: GrupoId[] }[] = [
    { id: 'tipo', rotulo: 'Tipo', grupos: ['tipo'] }, { id: 'cepa', rotulo: 'Cepa', grupos: ['cepa'] },
    { id: 'region', rotulo: 'Región', grupos: ['region'] }, { id: 'anada', rotulo: 'Añada', grupos: ['anada'] },
    { id: 'vivino', rotulo: 'Vivino', grupos: ['vivino'] }, { id: 'mas', rotulo: 'Más', grupos: ['icono', 'formato', 'bodega', 'pais'] },
  ];
  const menusVisibles = MENUS.filter(m => m.grupos.some(grupoVisible));
  const nDe = (g: GrupoId) => (g === 'anada' ? (est.filtros.anada ? 1 : 0) : est.filtros[g].length);
  const rotuloBoton = (m: { id: string; rotulo: string; grupos: GrupoId[] }) => {
    if (m.id === 'mas') { const n = m.grupos.reduce((s, g) => s + nDe(g), 0); return n ? `Más (${n})` : 'Más'; }
    const g = m.grupos[0];
    if (g === 'anada') { const r = est.filtros.anada; return r ? `Añada: ${r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}`}` : 'Añada'; }
    const sel = est.filtros[g];
    if (sel.length === 0) return m.rotulo;
    if (sel.length === 1) return `${m.rotulo}: ${g === 'tipo' ? cap(sel[0]) : sel[0]}`;
    return `${m.rotulo} (${sel.length})`;
  };
  const tieneAlgo = (m: { grupos: GrupoId[] }) => m.grupos.some(g => nDe(g) > 0);
  const abrirMenu = (id: string, el: HTMLElement) => {
    if (abierto === id) { setAbierto(null); return; }
    setAlinDer(el.getBoundingClientRect().left + POP_ANCHO > window.innerWidth - 8);
    setAbierto(id);
  };
  const cuerpoMenu = (m: { id: string; grupos: GrupoId[] }) => {
    if (m.id === 'orden') {
      return (
        <div className="bt-ops bt-orden-ops">
          {ORDENES.map(o => (
            <button key={o.id} type="button" className={'bt-op bt-orden-op' + (est.orden === o.id ? ' on' : '')} data-orden={o.id} aria-pressed={est.orden === o.id}
              onClick={() => { poner({ orden: o.id }); setAbierto(null); }}>
              <span className="bt-op-c" aria-hidden="true">{est.orden === o.id ? '●' : ''}</span><span className="bt-op-t">{o.rotulo}</span><span />
            </button>
          ))}
        </div>
      );
    }
    if (m.id === 'mas') {
      return (
        <div className="bt-filtros">
          {m.grupos.filter(grupoVisible).map(g => {
            const abre = masAbierto === g;
            const n = nDe(g);
            return (
              <div key={g} className="bt-grupo" data-grupo={g}>
                <button type="button" className="bt-grupo-t" aria-expanded={abre} onClick={() => setMasAbierto(abre ? null : g)}>
                  <span>{GRUPOS.find(x => x.id === g)!.titulo}{n > 0 && <b className="bt-grupo-n">{n}</b>}</span><span className="bt-chev" aria-hidden="true">{abre ? '–' : '+'}</span>
                </button>
                {abre && cuerpoGrupo(g)}
              </div>
            );
          })}
        </div>
      );
    }
    return <div className="bt-grupo" data-grupo={m.grupos[0]}>{cuerpoGrupo(m.grupos[0])}</div>;
  };
  const ordenActual = ORDENES.find(o => o.id === est.orden)!;
  const todosMenus = [...menusVisibles, { id: 'orden', rotulo: 'Ordenar', grupos: [] as GrupoId[] }];
  const filaFiltros = (
    <div className={'bt-filtros-fila' + (esc ? '' : ' bt-scroll')} role="group" aria-label="Filtros">
      {todosMenus.map(m => {
        const es = m.id === 'orden';
        return (
          <span key={m.id} className={'bt-fb' + (abierto === m.id && alinDer ? ' der' : '') + (es ? ' bt-fb-orden' : '')} data-menu={m.id}>
            <button type="button" className={'bt-fbtn' + (!es && tieneAlgo(m) ? ' on' : '')} data-menu-btn={m.id} aria-expanded={abierto === m.id} aria-haspopup="dialog"
              onClick={ev => abrirMenu(m.id, ev.currentTarget)}>
              <span className="bt-fbtn-t">{es ? `Ordenar: ${ordenActual.rotulo}` : rotuloBoton(m)}</span><span className="bt-fbtn-f" aria-hidden="true">▾</span>
            </button>
            {abierto === m.id && esc && <div className="bt-pop" role="dialog" aria-label={m.rotulo}>{cuerpoMenu(m)}</div>}
          </span>
        );
      })}
    </div>
  );

  // ── chips activos ──
  const chipsActivos: { k: string; rotulo: string; quitar: () => void }[] = [];
  if (est.q) chipsActivos.push({ k: 'q', rotulo: `“${est.q}”`, quitar: () => poner({ q: '' }) });
  for (const g of GRUPOS) {
    if (g.id === 'anada') {
      const r = est.filtros.anada;
      if (r) chipsActivos.push({ k: 'anada', rotulo: r[0] === r[1] ? `Añada ${r[0]}` : `Añada ${r[0]}–${r[1]}`, quitar: () => poner({ filtros: { ...est.filtros, anada: null } }) });
      continue;
    }
    for (const v of est.filtros[g.id]) {
      chipsActivos.push({ k: `${g.id}:${v}`, rotulo: g.id === 'tipo' ? cap(v) : g.id === 'vivino' ? `Vivino ${v}` : g.id === 'icono' ? (v === 'Sí' ? 'Ícono' : 'No ícono') : v, quitar: () => alternar(g.id, v) });
    }
  }

  const verMasFilas = () => setPagina(p => p + 1);
  const mostradas = lista.slice(0, FILAS_PAGINA * pagina);
  const restantes = lista.length - mostradas.length;
  const totalEt = [...etiquetas.values()].length;
  const totalBot = [...etiquetas.values()].reduce((s, e) => s + e.qty, 0);
  const aplicarEnter = () => { poner({ q: texto.trim() }); setTexto(''); setEnfocado(false); };

  const resumen = (
    <div className="bt-resumen">
      <div className="bt-res-izq">
        <div className="bt-cuenta" data-botellas={botVisibles} data-etiquetas={etVisibles.length}>
          <b>{fmtN(botVisibles)} {plural(botVisibles, 'botella', 'botellas')}</b> · {fmtN(etVisibles.length)} {plural(etVisibles.length, 'etiqueta', 'etiquetas')}
        </div>
        {(chipsActivos.length > 0 || est.vista !== 'todas') && (
          <div className="bt-activos">
            {chipsActivos.map(c => (
              <button key={c.k} type="button" className="bt-activo" onClick={c.quitar} aria-label={`Quitar ${c.rotulo}`}><span className="bt-activo-t">{c.rotulo}</span><span aria-hidden="true">×</span></button>
            ))}
            {hayAlgo && <button type="button" className="bt-limpiar" onClick={limpiar}>Limpiar</button>}
          </div>
        )}
      </div>
      {modo === 'seccion' && (
        <label className="bt-switch">
          <input type="checkbox" checked={est.abiertas} onChange={ev => poner({ abiertas: ev.target.checked })} />
          <span className="bt-sw" aria-hidden="true" /><span className="bt-switch-t">Incluir abiertas</span>
        </label>
      )}
    </div>
  );

  const cuerpo = (
    <div className="bt-cuerpo">
      <div className="bt-principal">
        <div className="bt-enc">
          <b>{fmtN(totalEt)} {plural(totalEt, 'etiqueta', 'etiquetas')}</b> · {fmtN(totalBot)} {plural(totalBot, 'botella', 'botellas')}
        </div>
        <div className="bt-buscador">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input type="search" placeholder="Buscar vino, bodega, cepa, región o añada" autoComplete="off" value={texto}
            onChange={ev => setTexto(ev.target.value)} onFocus={() => setEnfocado(true)} onBlur={() => setTimeout(() => setEnfocado(false), 150)}
            onKeyDown={ev => { if (ev.key === 'Enter') aplicarEnter(); }} aria-label="Buscar" />
          {enfocado && sugerencias && (sugerencias.grupos.length > 0 || sugerencias.vinos.length > 0) && (
            <div className="bt-sugs" role="listbox">
              {sugerencias.grupos.map(gr => (
                <div key={gr.g} className="bt-sug-g" data-grupo={gr.g}>
                  <div className="bt-sug-t">{gr.tit}</div>
                  {gr.items.map(it => (
                    <button key={it.valor} type="button" className="bt-sug" data-grupo={gr.g} data-valor={it.valor}
                      onMouseDown={ev => { ev.preventDefault(); elegirSugerencia(gr.g, it.valor); }}>
                      <span className="bt-sug-n">{it.valor}</span><span className="bt-sug-b">{fmtN(it.n)} bot.</span>
                    </button>
                  ))}
                </div>
              ))}
              {sugerencias.vinos.length > 0 && (
                <div className="bt-sug-g" data-grupo="vinos">
                  <div className="bt-sug-t">VINOS</div>
                  {sugerencias.vinos.map(v => (
                    <button key={v.key} type="button" className="bt-sug" data-grupo="vinos" data-valor={v.key}
                      onMouseDown={ev => { ev.preventDefault(); setFichaKey(v.key); setTexto(''); }}>
                      <span className="bt-sug-n">{v.vino}</span><span className="bt-sug-b">{v.an ?? 's/a'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="bt-vistas-wrap">
          <div className="bt-vistas" role="group" aria-label="Vistas rápidas">
            {vistasVisibles.map(v => (
              <button key={v.id} type="button" className={'bt-vista' + (est.vista === v.id ? ' on' : '')} data-vista={v.id} data-n={vistasN.n[v.id]}
                aria-pressed={est.vista === v.id} onClick={() => poner({ vista: v.id })}>
                <span className="bt-vista-t">{v.rotulo}</span><span className="bt-vista-n">{fmtN(vistasN.n[v.id])}</span>
              </button>
            ))}
          </div>
        </div>
        {filaFiltros}
        {resumen}
        <div className="bt-lista">
          {lista.length === 0 ? (
            <div className="bt-sin">No hay botellas con estos filtros · <button type="button" className="bt-limpiar" onClick={limpiar}>Limpiar</button></div>
          ) : mostradas.map(({ et, bot }) => <FilaEt key={et.key} et={et} bot={bot} onAbrir={() => setFichaKey(et.key)} abierta={fichaKey === et.key} posicion={et.sinGuarda ? undefined : posiciones?.[et.key]} />)}
          {restantes > 0 && <button type="button" className="bt-ver-mas" onClick={verMasFilas}>Ver {fmtN(Math.min(FILAS_PAGINA, restantes))} más</button>}
        </div>
      </div>
    </div>
  );

  // celular: cada botón abre la hoja con solo su grupo
  const menuAbierto = abierto ? todosMenus.find(m => m.id === abierto) ?? null : null;
  const hoja = menuAbierto && !esc && (
    <div className="bt-hoja-fondo" onClick={() => setAbierto(null)}>
      <div className="bt-hoja" role="dialog" aria-label={menuAbierto.rotulo} data-menu-hoja={menuAbierto.id} onClick={ev => ev.stopPropagation()}>
        <div className="bt-hoja-cab"><b>{menuAbierto.rotulo}</b><button type="button" className="bt-x" aria-label="Cerrar" onClick={() => setAbierto(null)}>✕</button></div>
        <div className="bt-hoja-cuerpo">{cuerpoMenu(menuAbierto)}</div>
        {menuAbierto.id !== 'orden' && (
          <div className="bt-hoja-pie">
            <button type="button" className="bt-btn-pri" onClick={() => setAbierto(null)}>Ver {fmtN(botVisibles)} {plural(botVisibles, 'botella', 'botellas')}</button>
          </div>
        )}
      </div>
    </div>
  );

  // desde la ficha, "y N más" aplica el filtro de ese vino o esa bodega y la cierra
  const filtrarDesdeFicha = (tipo: 'vino' | 'bodega', valor: string) => {
    setFichaKey(null);
    if (tipo === 'bodega') setEst(e => ({ ...e, q: '', vista: 'todas', filtros: { ...e.filtros, bodega: [valor] } }));
    else setEst(e => ({ ...e, q: valor, vista: 'todas' }));
  };
  const ficha = etFicha && (
    <Ficha et={etFicha} etiquetas={etiquetas} cepas={cepas} esc={esc} onCerrar={() => setFichaKey(null)} onAbrir={setFichaKey} onFiltrar={filtrarDesdeFicha} posicion={etFicha.sinGuarda ? undefined : posiciones?.[etFicha.key]} valores={valoresEstado === 'listo' ? (valores?.[etFicha.key] ?? VALORES_CERO) : undefined} cargando={valoresEstado === 'cargando'} />
  );

  return (
    <div className={'bt-raiz' + (esc ? ' bt-wide' : '') + (modo === 'hoja' ? ' bt-modo-hoja' : '')} ref={refRaiz} data-modo={modo}>
      {modo === 'hoja' && <div className="bt-hoja-tit"><b>Botellas</b>{onCerrar && <button type="button" className="bt-x" aria-label="Cerrar" onClick={onCerrar}>✕</button>}</div>}
      {cuerpo}
      {hoja}
      {ficha}
    </div>
  );
}

// ── una fila ──
function FilaEt({ et, bot, onAbrir, abierta, posicion }: { et: Et; bot: number; onAbrir: () => void; abierta: boolean; posicion?: string }) {
  const fmt = fmtNombre(et.ratioMax);
  return (
    <button type="button" className={'bt-fila' + (abierta ? ' on' : '') + (et.sinGuarda ? ' ab' : '')} data-key={et.key} data-bot={bot} onClick={onAbrir}>
      <span className="bt-f-izq">
        <span className="bt-f-nom"><span className="bt-f-vino" title={et.vino}>{et.vino}</span><span className="bt-f-an">{et.an ?? 's/a'}</span></span>
        <span className="bt-f-sub">
          <span className="bt-f-txt">{et.sinGuarda ? `Abierta · ${et.consd[0] ?? ''} · ` : ''}{[et.bod, et.regLabel, et.cepa].filter(Boolean).join(' · ')}</span>
          {posicion && <span className="bt-f-pos" data-posicion>Posición: {posicion}</span>}
          {et.vivino != null && <span className="bt-marca bt-m-viv">★ {fmtN(et.vivino, 1)}</span>}
          {et.icono && <span className="bt-marca bt-m-icono">Ícono</span>}
          {fmt && <span className="bt-marca bt-m-fmt">{fmt}</span>}
          {et.ultima && <span className="bt-marca bt-m-ultima">Última</span>}
          {et.probada && !et.sinGuarda && <span className="bt-marca bt-m-probada">Probada</span>}
        </span>
      </span>
      <span className="bt-f-der">
        {et.sinGuarda
          ? <span className="bt-f-ab">abierta</span>
          : <><span className="bt-f-n">{fmtN(bot)}</span><span className="bt-f-u">{bot === 1 ? 'botella' : 'bot.'}</span></>}
      </span>
    </button>
  );
}

// ── añada: histograma con rango de dos manijas ──
function Anadas({ est, universo, conteo, onRango }: {
  est: EstadoBotellas; universo: { anioMin: number; anioMax: number }; conteo: Map<string, number>; onRango: (r: [number, number] | null) => void;
}) {
  const { anioMin, anioMax } = universo;
  const r = est.filtros.anada ?? [anioMin, anioMax];
  const anios: number[] = [];
  for (let a = anioMin; a <= anioMax; a++) anios.push(a);
  const tope = Math.max(1, ...anios.map(a => conteo.get(String(a)) ?? 0));
  const cambiar = (i: 0 | 1, v: number) => {
    const n: [number, number] = i === 0 ? [Math.min(v, r[1]), r[1]] : [r[0], Math.max(v, r[0])];
    onRango(n[0] === anioMin && n[1] === anioMax ? null : n);
  };
  return (
    <div className="bt-anadas">
      <div className="bt-hist" aria-hidden="true">
        {anios.map(a => {
          const n = conteo.get(String(a)) ?? 0;
          const dentro = a >= r[0] && a <= r[1];
          return <span key={a} className={'bt-hist-b' + (dentro ? ' on' : '')} style={{ height: `${Math.max(n ? 8 : 2, n / tope * 100)}%`, background: dentro ? BORDO : '#D9CDB0' }} title={`${a}: ${n}`} />;
        })}
      </div>
      <div className="bt-rango">
        <input type="range" min={anioMin} max={anioMax} step={1} value={r[0]} onChange={ev => cambiar(0, Number(ev.target.value))} aria-label="Añada desde" data-manija="desde" />
        <input type="range" min={anioMin} max={anioMax} step={1} value={r[1]} onChange={ev => cambiar(1, Number(ev.target.value))} aria-label="Añada hasta" data-manija="hasta" />
      </div>
      <div className="bt-rango-t">desde {r[0]} · hasta {r[1]}</div>
    </div>
  );
}

// ── la ficha de una botella ──
function Ficha({ et, etiquetas, cepas, esc, onCerrar, onAbrir, onFiltrar, valores, cargando, posicion }: {
  et: Et; etiquetas: Map<string, Et>; cepas?: BotCepa[]; esc: boolean; onCerrar: () => void; onAbrir: (k: string) => void;
  onFiltrar: (tipo: 'vino' | 'bodega', valor: string) => void; valores?: ValoresBotella; cargando?: boolean; posicion?: string;
}) {
  const [masCepa, setMasCepa] = useState(false);
  const fmt = fmtNombre(et.ratioMax);
  const edad = et.an != null ? NOW - et.an : null;
  const cepaInfo = cepas?.find(c => c.fila === et.cf || c.nombre === et.cf) ?? null;
  const cf = cepaInfo?.ficha ?? null;
  const masDeLaCepa: [string, string][] = cf ? ([['Taninos', cf.taninos], ['Acidez', cf.acidez ?? ''], ['Maridajes', cf.maridajes]] as [string, string][]).filter(x => x[1]) : [];
  const otrasTodas = [...etiquetas.values()].filter(e => e.vino.toLowerCase() === et.vino.toLowerCase() && e.key !== et.key)
    .sort((a, b) => (a.an ?? 9999) - (b.an ?? 9999));
  const bodTodas = [...etiquetas.values()].filter(e => e.bod === et.bod && e.vino.toLowerCase() !== et.vino.toLowerCase())
    .sort((a, b) => b.qty - a.qty || a.vino.localeCompare(b.vino, 'es'));
  const otras = otrasTodas.slice(0, FILAS_RELACIONADAS), delaBodega = bodTodas.slice(0, FILAS_RELACIONADAS);
  const fechaAb = et.consd.length ? `${et.consd[0]}${et.consd.length > 1 ? ` +${et.consd.length - 1}` : ''}` : '';
  const cajas: { n: string; l: string; f?: string }[] = [
    { n: fmtN(et.qty), l: 'En guarda' },
    ...(et.vivino != null ? [{ n: fmtN(et.vivino, 1), l: 'Vivino' }] : []),
    ...(edad != null ? [{ n: `${fmtN(edad)} ${plural(edad, 'año', 'años')}`, l: 'Edad' }] : []),
    ...(et.cons > 0 ? [{ n: fmtN(et.cons), l: plural(et.cons, 'Abierta', 'Abiertas'), f: fechaAb }] : []),
  ];
  const lista = (items: Et[], total: number, tipo: 'vino' | 'bodega', valor: string) => (
    <>
      {items.map(o => <button key={o.key} type="button" className="bt-rel" onClick={() => onAbrir(o.key)}><span>{o.vino} <i>{o.an ?? 's/a'}</i></span><b>{fmtN(o.qty)} bot.</b></button>)}
      {total > items.length && <button type="button" className="bt-mas bt-rel-mas" onClick={() => onFiltrar(tipo, valor)}>y {fmtN(total - items.length)} más</button>}
    </>
  );
  return (
    <div className={'bt-ficha-fondo' + (esc ? ' bt-ficha-der' : '')} onClick={onCerrar} data-velo>
      <div className="bt-ficha" role="dialog" aria-label={et.vino} data-ficha={et.key} onClick={ev => ev.stopPropagation()}>
        <div className="bt-ficha-cab">
          <div className="bt-ficha-tit">
            <div className="bt-ficha-t">{et.vino} <span className="bt-ficha-an">{et.an ?? 's/a'}</span></div>
            <div className="bt-ficha-s">{[et.bod, et.regLabel, et.cepa].filter(Boolean).join(' · ')}</div>
            {posicion && <div className="bt-ficha-pos" data-posicion>Posición: {posicion}</div>}
            <div className="bt-marcas">
              {et.vivino != null && <span className="bt-marca bt-m-viv">★ {fmtN(et.vivino, 1)}</span>}
              {et.icono && <span className="bt-marca bt-m-icono">Ícono</span>}
              {fmt && <span className="bt-marca bt-m-fmt">{fmt}</span>}
              {et.ultima && <span className="bt-marca bt-m-ultima">Última</span>}
              {et.probada && <span className="bt-marca bt-m-probada">Probada</span>}
            </div>
          </div>
          <button type="button" className="bt-x" aria-label="Cerrar" onClick={onCerrar}>✕</button>
        </div>
        <div className="bt-cajas">
          {cajas.map(c => <div key={c.l} className="bt-caja"><b>{c.n}</b><span>{c.l}</span>{c.f && <small>{c.f}</small>}</div>)}
        </div>
        <BloqueValor valores={valores} cargando={cargando} />
        {cf && (cf.intensidad || cf.temperatura || cf.aromas) && (
          <div className="bt-bloque bt-cepa" data-bloque="cepa">
            <div className="bt-cepa-1"><b>{cepaInfo!.nombre}</b>{cf.intensidad ? ` · intensidad ${cf.intensidad.toLowerCase()}` : ''}{cf.temperatura ? ` · ${cf.temperatura}` : ''}</div>
            {cf.aromas && <div className="bt-cepa-2">{cf.aromas}</div>}
            {masDeLaCepa.length > 0 && <button type="button" className="bt-mas" aria-expanded={masCepa} onClick={() => setMasCepa(v => !v)}>{masCepa ? 'Ver menos' : 'Ver más de la cepa'}</button>}
            {masCepa && <dl className="bt-dl">{masDeLaCepa.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>}
          </div>
        )}
        {otras.length > 0 && (
          <div className="bt-bloque" data-bloque="otras">
            <div className="bt-bloque-t">Otras añadas de este vino</div>
            {lista(otras, otrasTodas.length, 'vino', et.vino)}
          </div>
        )}
        {delaBodega.length > 0 && (
          <div className="bt-bloque" data-bloque="bodega">
            <div className="bt-bloque-t">Más de esta bodega en tu cava</div>
            {lista(delaBodega, bodTodas.length, 'bodega', et.bod)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── el valor de la botella: Pagaste · Valor hoy · Ahorro club · Suma por la guarda ──
const VALOR_TAPADO = 'USD ●●●●';
const VALORES_CERO: ValoresBotella = { pagaste: 'USD 0', valorHoy: 'USD 0', ahorroClub: 'USD 0', sumaGuarda: 'USD 0' };
function BloqueValor({ valores, cargando }: { valores?: ValoresBotella; cargando?: boolean }) {
  const filas: [string, keyof ValoresBotella][] = [['Pagaste', 'pagaste'], ['Valor hoy', 'valorHoy'], ['Ahorro club', 'ahorroClub'], ['Suma por la guarda', 'sumaGuarda']];
  return (
    <div className="bt-bloque bt-valor" data-bloque="valor">
      <div className="bt-bloque-t">Valor</div>
      {filas.map(([rotulo, k]) => (
        <div key={k} className="bt-val-fila">
          <span className="bt-val-r">{rotulo}</span>
          <span className="bt-val-v">{!valores && !cargando && <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>}{valores ? valores[k] : cargando ? '…' : VALOR_TAPADO}</span>
        </div>
      ))}
      {!valores && !cargando && <p className="bt-val-pie">Visible para los socios del club</p>}
    </div>
  );
}
