import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react';
import { geoPath, geoNaturalEarth1, geoMercator } from 'd3-geo';
import { useLocation, useNavigate } from 'react-router';
import './club.css';
import './tablero.css';
import cavaRaw from './data/cava-001.json';
import { sumGuarda } from './data/cava-stats';
import { lockScroll, unlockScroll } from './scroll-lock';

// ── tipos ──────────────────────────────────────────────────────────
interface Wine {
  an: number | null;
  vino: string;
  bod: string;
  pais: string;
  reg: string;
  tipo: string;
  cepa: string;
  vivino: number | null;
  qty: number;
  start: [number, number] | null;
  eq: number;
  cons: number;
  consd: string[];
  icono?: boolean;
}
interface ConsWine {
  vino: string; bod: string; cepa: string; pais: string; reg: string;
  an: number | null; tipo: string; cant: number; mes: number;
}
interface ConsYear { n: number; juntadas: number; wines: ConsWine[]; }
interface ConsData { total: number; juntadas: number; byYear: Record<string, ConsYear>; }
interface Perfil {
  nombre: string; alias: string; tipo: string; fundado: number; miembros: number;
  // cuota del club (lo que pone cada miembro por mes), no valor de botellas
  cuotaMensual?: number; cuotaMoneda?: string;
}
interface CavaData {
  perfiles: { grupal: Perfil; individual: Perfil };
  data: { grupal: Wine[]; individual: Wine[] };
  cons: { grupal: ConsData; individual: ConsData };
}
interface EvoEntry { label: string; ts: number; compradas: number; abiertas: number; enGuarda: number; edadAlAbrir: number | null; }
interface ApiStats {
  enGuarda: number; eq750: number; etiquetas: number; pctIcono: number;
  vivinoPromedio: number | null; pctVivinoAlto: number | null;
  top5Vivino: { vino: string; bod: string; an: number | null; vivino: number; qty: number }[];
  tipoComposicion: { tipo: string; count: number; pct: number }[];
  evolution: EvoEntry[];
  anadaPromedio: number | null; anadaMin: number | null;
  cepasCount: number | null;
  regionesCount: number | null;
  bodegasCount: number | null;
  paisesCount: number | null;
  edadPromedioGuarda: number | null;
  anadaMax: number | null;
  anadasCount: number | null;
  vivinoAlto43Count: number | null;
  paisesConsumidasCount: number | null;
}
interface CepaFicha {
  colorCopa: string; intensidad: string; taninos: string; acidez: string;
  aromas: string; origen: string; terroirsAr: string; terroirsMundo: string;
  maridajes: string; temperatura: string; descripcion: string;
}
interface CepaVino { vino: string; an: number | null; bod: string; qty: number; }
interface Cepa {
  nombre: string; fila: string; color: string; tipoUva: string; esUva: boolean;
  enGuarda: number; abiertas: number; regiones: string[];
  anadaPromedio: number | null; anadaMasVieja: number | null;
  mejorVivino: { vino: string; an: number | null; vivino: number } | null;
  vinos: CepaVino[]; ficha: CepaFicha | null;
}
interface TipoComp { total: number; items: { tipo: string; count: number; pct: number; color: string }[]; }
interface CepasBloque {
  lista: Cepa[]; enGuarda: number; probadas: number;
  compradas: number; anioPrimeraCompra: number | null;
  masTomada: { nombre: string; abiertas: number } | null;
  masGuardada?: { cepa: string; botellas: number } | null;
  sinFicha: string[];
  tipo: { enGuarda: TipoComp; abiertas: TipoComp };
}
interface GeoLugar { botellas: number; vinos: { vino: string; an: number | null; qty: number }[]; }
type GeoTab = 'mundo' | 'argentina' | 'mendoza';
type GeoMode = 'enGuarda' | 'consumidas';
interface RegionesBodega { bodega: string; botellas: number; }
interface RegionesRegion { region: string; botellas: number; bodegas: RegionesBodega[]; }
interface RegionesGrupo { grupo: string; esArgentina: boolean; botellas: number; regiones: RegionesRegion[]; }
// ── bloques del Inicio de la app ──
interface TramoEdad { tramo: string; botellas: number; color: string; }
interface JuntadaVino { vino: string; anada: number | null; vivino: number | null; }
interface UltimaJuntada {
  mes: string; botellas: number; vinos: JuntadaVino[]; resto: number;
  // hay al menos una foto en Airtable; la imagen sale de /api/juntada-foto
  foto?: boolean; notas?: string; maridaje?: string;
}
interface EntradaEtiqueta { vino: string; anada: number | null; bodega: string; botellas: number; }
interface EntradaMes { mes: string; botellas: number; etiquetas: EntradaEtiqueta[]; }
interface AnadasBloque {
  enGuarda: { an: number; botellas: number }[];
  abiertas: { an: number; botellas: number }[];
  cepaAnada: { cepa: string; color: string; an: number; botellas: number }[];
  etiquetas: { an: number; vino: string; bodega: string; cepa: string; tipo: string; botellas: number; vivino: number | null }[];
  veteranas: { vino: string; bodega: string; anada: number; botellas: number }[];
  sinAnada: { espumantes: number; otras: number };
}
interface CavaApiResponse {
  error?: string;
  anadas?: AnadasBloque;
  config?: Perfil;
  perfiles?: { grupal: Perfil };
  data?: { grupal: Wine[] };
  cons?: { grupal: ConsData };
  stats?: ApiStats;
  landing?: { enGuarda: number; abiertas: number };
  geo?: {
    mundo:     { enGuarda: Record<string, GeoLugar>; consumidas: Record<string, GeoLugar> };
    argentina: { enGuarda: Record<string, GeoLugar>; consumidas: Record<string, GeoLugar> };
    mendoza:   { enGuarda: Record<string, GeoLugar>; consumidas: Record<string, GeoLugar> };
  };
  regiones?: RegionesGrupo[];
  cepas?: CepasBloque;
  tramosEdad?: TramoEdad[];
  masTomada?: { cepa: string; botellas: number } | null;
  ultimaJuntada?: UltimaJuntada | null;
  primerConsumo?: string | null;
  compras?: EntradaMes[];
  otrasEntradas?: EntradaMes[];
  ultimaCompra?: { mes: string; botellas: number } | null;
}

const CAVA = cavaRaw as unknown as CavaData;

// ── constantes ─────────────────────────────────────────────────────
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESN  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const TIPO_COLOR: Record<string, string> = { tinto:'#6B1E2E', blanco:'#C8922A', espumante:'#D4B86A', rosado:'#C47A8A' };
const FMT: Record<number, string> = { 2:'Magnum', 4:'Jeroboam', 6:'Imperial', 8:'Matusalén', 12:'Salmanazar', 16:'Balthazar' };
const NOW_DATE = new Date();
const NOW = NOW_DATE.getFullYear();
const CUR_MES = MESES[NOW_DATE.getMonth()];
// Las pantallas de "Mi cava": son las que aparecen en los chips y a las que
// lleva la grilla de 2×2 del Inicio.
const SECTIONS = [
  { id: 'cepas',     label: 'Cepas y estilos' },
  { id: 'geografia', label: 'Geografía'        },
  { id: 'anadas',    label: 'Añadas'           },
  { id: 'calidad',   label: 'Calidad'          },
  { id: 'botellas',  label: 'Las botellas'     },
] as const;
// Todas las pantallas de la app. '' es el Inicio.
const PANTALLAS = [
  'cava', 'cepas', 'geografia', 'anadas', 'calidad', 'botellas', 'consumos', 'compras', 'valor',
] as const;
type SectionId = typeof PANTALLAS[number] | '';
// Las que viven dentro de "Mi cava": con cualquiera de ellas abierta, el ítem
// marcado en la barra de abajo es "Mi cava".
const EN_MI_CAVA = new Set<string>(SECTIONS.map(s => s.id));
// Barra fija de abajo. El "+" va en el medio y no es una pantalla.
const NAV = [
  { id: '',         label: 'Inicio',   ico: 'nv-inicio'   },
  { id: 'cava',     label: 'Mi cava',  ico: 'nv-cava'     },
  { id: 'consumos', label: 'Consumos', ico: 'nv-consumos' },
  { id: 'compras',  label: 'Compras',  ico: 'nv-compras'  },
] as const;
// Cuántos píxeles tiene que medir un tramo de la barra de edad para que el
// porcentaje entre adentro.
const ANCHO_MIN_PCT = 34;
// Código público de la cava del club para /api/juntada-foto.
const CAVA_CODIGO = '001';
// Mínimo de botellas con añada para que valga la pena mostrar los tramos.
const MIN_BOT_TRAMOS = 10;

// ── helpers ────────────────────────────────────────────────────────
function ratioOf(r: Wine) { return r.eq / r.qty; }
function fmtName(ratio: number): string {
  if (ratio < 1.75) return '';
  const k = Math.round(ratio);
  if (FMT[k]) return FMT[k];
  const L = Math.round(ratio * 0.75 * 100) / 100;
  return String(L).replace('.', ',') + ' L';
}
function fmtN(n: number, d = 0): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(n);
}
function pol(cx: number, cy: number, r: number, ang: number) {
  const a = (ang - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function svgSlice(cx: number, cy: number, r: number, a0: number, a1: number) {
  const lg = (a1 - a0) > 180 ? 1 : 0;
  const p0 = pol(cx, cy, r, a0), p1 = pol(cx, cy, r, a1);
  return `M${cx} ${cy} L${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A${r} ${r} 0 ${lg} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}
function capN(items: [string, number][], n: number) {
  if (items.length <= n + 1) return { shown: items, otrosSet: {} as Record<string, boolean> };
  const shown = items.slice(0, n);
  const rest = items.slice(n);
  const otrosSet: Record<string, boolean> = {};
  let count = 0;
  rest.forEach(([k, v]) => { count += v; otrosSet[k] = true; });
  return { shown: [...shown, ['__otros__', count] as [string, number]], otrosSet };
}
function ingreso(r: Wine) {
  return r.start ? MESES[r.start[1]] + ' ' + r.start[0] : '';
}
// "2026-09" → "septiembre 2026". Con `cap`, "Septiembre 2026".
function mesLargo(ym: string, cap = false): string {
  const [y, m] = ym.split('-').map(Number);
  const nombre = MESN[(m || 1) - 1] ?? '';
  return `${cap ? nombre : nombre.toLowerCase()} ${y}`;
}
function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios;
}
// Sube al tope del contenedor que scrollea de verdad: dentro del modal es
// .tablero-modal-body, suelto en /club/cava es la ventana.
function scrollToTop(desde: HTMLElement | null) {
  for (let n = desde?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) {
      n.scrollTop = 0;
      return;
    }
  }
  window.scrollTo(0, 0);
}

// ── SVG symbols ────────────────────────────────────────────────────
const SVG_SYMBOLS = (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
    <symbol id="crest" viewBox="0 0 60 72">
      <path d="M4 6 H56 V40 C56 56 44 66 30 71 C16 66 4 56 4 40 Z" fill="none" stroke="currentColor" strokeWidth="2.5"/>
      <path d="M21 20 H39 M22 20 C22 30 26 34 30 34 C34 34 38 30 38 20" fill="none" stroke="currentColor" strokeWidth="2"/>
      <path d="M30 34 V48 M23 49 H37" fill="none" stroke="currentColor" strokeWidth="2"/>
    </symbol>
    <symbol id="gl-tinto" viewBox="0 0 24 40">
      <path d="M5 3 H19 C19 11 15.5 15 12 15 C8.5 15 5 11 5 3 Z" fill="rgba(255,255,255,.35)" stroke="rgba(36,19,24,.5)" strokeWidth="1"/>
      <path d="M6.2 6.6 C7.2 11.4 9.5 14 12 14 C14.5 14 16.8 11.4 17.8 6.6 Z" fill="#6b1622"/>
      <path d="M12 15 V29 M7.5 30 H16.5" stroke="rgba(36,19,24,.5)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </symbol>
    <symbol id="gl-blanco" viewBox="0 0 24 40">
      <path d="M7 3 H17 C17 11 14.5 15 12 15 C9.5 15 7 11 7 3 Z" fill="rgba(255,255,255,.35)" stroke="rgba(36,19,24,.5)" strokeWidth="1"/>
      <path d="M8 7.2 C8.8 11.6 10.2 14 12 14 C13.8 14 15.2 11.6 16 7.2 Z" fill="#d8b24a"/>
      <path d="M12 15 V29 M7.5 30 H16.5" stroke="rgba(36,19,24,.5)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </symbol>
    <symbol id="gl-espumante" viewBox="0 0 24 40">
      <path d="M9 2 C9 9 9.4 14 12 15 C14.6 14 15 9 15 2 Z" fill="rgba(255,255,255,.35)" stroke="rgba(36,19,24,.5)" strokeWidth="1"/>
      <path d="M9.5 5 C9.7 10.5 10.4 14 12 14.6 C13.6 14 14.3 10.5 14.5 5 Z" fill="#ecd98a"/>
      <circle cx="11.6" cy="11" r=".55" fill="#fff" opacity=".9"/>
      <circle cx="12.5" cy="8.5" r=".5" fill="#fff" opacity=".8"/>
      <circle cx="11.9" cy="6.4" r=".45" fill="#fff" opacity=".7"/>
      <path d="M12 15 V29 M7.5 30 H16.5" stroke="rgba(36,19,24,.5)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    </symbol>
    <symbol id="lock" viewBox="0 0 24 24">
      <rect x="5" y="10.5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" fill="none" stroke="currentColor" strokeWidth="2"/>
    </symbol>

    {/* ── íconos de línea de la barra de abajo y de la app ── */}
    <symbol id="nv-inicio" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 10.5 12 3.5l8.5 7"/>
        <path d="M5.5 9.8V20h13V9.8"/>
        <path d="M10 20v-5.2h4V20"/>
      </g>
    </symbol>
    <symbol id="nv-cava" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <rect x="3.5" y="3.5" width="17" height="17" rx="2"/>
        <path d="M8 7.5v9M12 7.5v9M16 7.5v9"/>
      </g>
    </symbol>
    <symbol id="nv-consumos" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M7 3.5h10l-.9 7.2A4.2 4.2 0 0 1 12 14.5a4.2 4.2 0 0 1-4.1-3.8Z"/>
        <path d="M12 14.5v6M8.5 20.5h7"/>
      </g>
    </symbol>
    <symbol id="nv-compras" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M5 7.5h14l-1.2 13H6.2Z"/>
        <path d="M9 7.5a3 3 0 0 1 6 0"/>
      </g>
    </symbol>
    <symbol id="nv-mas" viewBox="0 0 24 24">
      <path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
    </symbol>
    <symbol id="ic-botella" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
        <path d="M10.4 2.5h3.2v3.8c0 1.3 2.1 2.4 2.1 4.6v9.1a1.5 1.5 0 0 1-1.5 1.5H9.8a1.5 1.5 0 0 1-1.5-1.5v-9.1c0-2.2 2.1-3.3 2.1-4.6Z"/>
        <path d="M8.3 13.5h7.4"/>
      </g>
    </symbol>
    <symbol id="ic-camara" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M3.5 7.8h3.3l1.4-2.3h7.6l1.4 2.3h3.3v11H3.5Z"/>
        <circle cx="12" cy="13.2" r="3.4"/>
      </g>
    </symbol>
  </svg>
);

// ── BarItem ────────────────────────────────────────────────────────
function BarItem({ label, count, max, onClick }: {
  label: string; count: number; max: number; onClick?: () => void;
}) {
  const w = Math.max(Math.round(count / max * 100), count > 0 ? 1 : 0);
  return (
    <button className="rbar" onClick={onClick} style={!onClick ? { cursor: 'default' } : undefined}>
      <div className="rb-top"><span>{label}</span><b>{fmtN(count)}</b></div>
      <div className="track"><div className="fill" style={{ width: w + '%', minWidth: count > 0 ? 3 : 0 }} /></div>
    </button>
  );
}

// ── AnadaCol ───────────────────────────────────────────────────────
function AnadaCol({ year, count, max, active, isCurrent, onClick }: {
  year: number; count: number; max: number; active: boolean; isCurrent: boolean; onClick: () => void;
}) {
  const h = Math.max(Math.round(count / max * 100), 3);
  return (
    <button className={'acol' + (active ? ' on' : '')} onClick={onClick} title={isCurrent ? `${year} · parcial hasta ${CUR_MES}` : undefined}>
      <div className="av">{count}</div>
      <div className="abar" style={{ height: h + '%' }} />
      <div className="ay">'{String(year).slice(2)}{isCurrent ? '*' : ''}</div>
    </button>
  );
}

// ── GrowthCol ──────────────────────────────────────────────────────
function GrowthCol({ year, n, max, isCurrent, onClick }: {
  year: number; n: number; max: number; isCurrent: boolean; onClick: () => void;
}) {
  const H = Math.max(Math.round(n / max * 100), n > 0 ? 3 : 0);
  return (
    <div className="gcol" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="gv">{n}</div>
      <div className="gstack" style={{ height: H + '%' }}>
        <div className="gseg" style={{ height: '100%', opacity: isCurrent ? 0.65 : 1 }} />
      </div>
      <div className="gy">'{String(year).slice(2)}{isCurrent ? '*' : ''}</div>
    </div>
  );
}

// ── GeoPanel ───────────────────────────────────────────────────────
const GEO_DIMS: Record<GeoTab, [number, number]> = {
  mundo:     [800, 420],
  argentina: [380, 560],
  mendoza:   [340, 440],
};
const GEO_FILES: Record<GeoTab, string> = {
  mundo:     '/geo/world.geojson',
  argentina: '/geo/argentina.geojson',
  mendoza:   '/geo/mendoza.geojson',
};

function lerpColor(t: number, c1: string, c2: string): string {
  const h = (s: string) => [parseInt(s.slice(1,3),16), parseInt(s.slice(3,5),16), parseInt(s.slice(5,7),16)] as [number,number,number];
  const [r1,g1,b1] = h(c1), [r2,g2,b2] = h(c2);
  const r = Math.round(r1+(r2-r1)*t), g = Math.round(g1+(g2-g1)*t), b = Math.round(b1+(b2-b1)*t);
  return `rgb(${r},${g},${b})`;
}
function featureColor(key: string | null, data: Record<string, GeoLugar>, maxBoth: number, mode: GeoMode): string {
  if (key === null) return '#ECE6DA';
  const lugar = data[key];
  if (!lugar) return '#DEDAD4';
  if (maxBoth === 0) return '#C9B8A8';
  const t = Math.sqrt(lugar.botellas) / Math.sqrt(maxBoth);
  return mode === 'enGuarda'
    ? lerpColor(Math.min(t, 1), '#E9C9CF', '#6B1E2E')
    : lerpColor(Math.min(t, 1), '#F1E2C2', '#8C6A22');
}

function GeoPanel({ geo }: { geo: NonNullable<CavaApiResponse['geo']> }) {
  const [tab, setTab] = useState<GeoTab>('mundo');
  const [mode, setMode] = useState<GeoMode>('enGuarda');
  const [geoFiles, setGeoFiles] = useState<Partial<Record<GeoTab, any>>>({});
  const [loadingTab, setLoadingTab] = useState<GeoTab | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const [isMob, setIsMob] = useState(() => typeof window !== 'undefined' && window.innerWidth < 641);
  const svgWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const fn = (e: MediaQueryListEvent) => { setIsMob(e.matches); setSelected(null); };
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  async function loadGeo(t: GeoTab) {
    if (geoFiles[t]) return;
    setLoadingTab(t);
    try {
      const r = await fetch(GEO_FILES[t]);
      const d = await r.json();
      setGeoFiles(prev => ({ ...prev, [t]: d }));
    } finally {
      setLoadingTab(null);
    }
  }

  useEffect(() => { loadGeo('mundo'); }, []);

  function changeTab(t: GeoTab) { setTab(t); setSelected(null); loadGeo(t); }
  function changeMode(m: GeoMode) { setMode(m); setSelected(null); }

  const geoData = geo[tab];
  const modeData = geoData[mode];
  const maxBoth = Math.max(
    ...Object.values(geoData.enGuarda).map(d => d.botellas),
    ...Object.values(geoData.consumidas).map(d => d.botellas),
    1
  );
  const totalBott = Object.values(modeData).reduce((s, d) => s + d.botellas, 0);
  const placeCount = Object.keys(modeData).length;
  const modeLabel = mode === 'enGuarda' ? 'En guarda' : 'Consumidas';
  const placeWord = tab === 'mundo' ? (placeCount === 1 ? 'país' : 'países')
    : tab === 'argentina' ? (placeCount === 1 ? 'provincia' : 'provincias')
    : (placeCount === 1 ? 'zona' : 'zonas');
  const selInfo = selected ? modeData[selected] : null;

  const geojson = geoFiles[tab];
  const [vw, vh] = GEO_DIMS[tab];

  let svgContent: React.ReactNode = null;
  if (geojson?.features) {
    const proj = tab === 'mundo'
      ? geoNaturalEarth1().fitSize([vw, vh], geojson)
      : geoMercator().fitSize([vw, vh], geojson);
    const pathGen = geoPath(proj as any);
    const paths = geojson.features.map((f: any, i: number) => {
      const key: string | null = f.properties?.key ?? null;
      const d = pathGen(f);
      if (!d) return null;
      const fill = featureColor(key, modeData, maxBoth, mode);
      const isSelected = selected !== null && key === selected;
      const hasData = key !== null && !!modeData[key];
      const cnt = hasData ? modeData[key].botellas : 0;
      const area = pathGen.area(f);
      const centroid = area > 1200 ? pathGen.centroid(f) : null;
      return (
        <g key={key ?? `ctx-${i}`}>
          <path
            d={d}
            fill={fill}
            stroke={isSelected ? '#fff' : '#fffaf6'}
            strokeWidth={isSelected ? 1.5 : 0.5}
            style={{ cursor: hasData ? 'pointer' : 'default', opacity: isSelected ? 1 : 0.92, transition: 'opacity .1s' }}
            onMouseEnter={e => {
              if (!key || isMob) return;
              const rect = svgWrapRef.current?.getBoundingClientRect();
              if (rect) setTipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
              setSelected(key);
            }}
            onMouseLeave={() => { if (!isMob) setSelected(null); }}
            onClick={() => { if (!key) return; setSelected(prev => prev === key ? null : key); }}
          />
          {hasData && centroid && !isNaN(centroid[0]) && !isNaN(centroid[1]) && (
            <text x={centroid[0]} y={centroid[1]}
              fontSize={tab === 'mundo' ? 7 : 10} fill="#fff"
              textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
              style={{ fontFamily: 'Archivo, sans-serif', fontWeight: 700, opacity: .85 }}
            >{cnt}</text>
          )}
        </g>
      );
    });
    svgContent = paths;
  }

  const listItems = Object.entries(modeData).sort((a, b) => b[1].botellas - a[1].botellas);

  return (
    <div className="tpanel geo-panel">
      <h3>De dónde vienen</h3>
      <div className="geo-tabs">
        {(['mundo','argentina','mendoza'] as GeoTab[]).map(t => (
          <button key={t} className={`geo-tab${tab === t ? ' on' : ''}`} onClick={() => changeTab(t)}>
            {t === 'mundo' ? 'Mundo' : t === 'argentina' ? 'Argentina' : 'Mendoza'}
          </button>
        ))}
      </div>
      <div className="geo-modes">
        <button className={`geo-mode${mode === 'enGuarda' ? ' on' : ''}`} onClick={() => changeMode('enGuarda')}>En guarda</button>
        <button className={`geo-mode${mode === 'consumidas' ? ' on' : ''}`} onClick={() => changeMode('consumidas')}>Consumidas</button>
      </div>
      <div className="geo-title">{modeLabel} · {fmtN(totalBott)} botella{totalBott !== 1 ? 's' : ''} de {placeCount} {placeWord}</div>
      <div className="geo-map-wrap" ref={svgWrapRef}>
        {loadingTab === tab ? (
          <div className="geo-loading">Cargando mapa…</div>
        ) : geojson?.features ? (
          <>
            <svg viewBox={`0 0 ${vw} ${vh}`} className="geo-svg"
              style={{ background: tab === 'mundo' ? '#d4e8f5' : '#f3eee8' }}>
              {svgContent}
            </svg>
            {!isMob && selected && selInfo && (
              <div className="geo-tooltip" style={{ left: Math.min(tipPos.x + 12, vw - 160), top: Math.max(tipPos.y - 8, 4) }}>
                <div className="geo-tip-name">{selected}</div>
                <div className="geo-tip-count">{fmtN(selInfo.botellas)} botella{selInfo.botellas !== 1 ? 's' : ''}</div>
                <div className="geo-tip-wines">
                  {selInfo.vinos.slice(0, 4).map((w, i) => (
                    <div key={i} className="geo-tip-w">{w.vino}{w.an ? ` ${w.an}` : ''} ×{w.qty}</div>
                  ))}
                  {selInfo.vinos.length > 4 && <div className="geo-tip-more">+{selInfo.vinos.length - 4} más</div>}
                </div>
              </div>
            )}
            {isMob && selected && selInfo && (
              <div className="geo-infobox">
                <button className="geo-ib-close" onClick={() => setSelected(null)}>✕</button>
                <div className="geo-tip-name">{selected} · {fmtN(selInfo.botellas)} bot.</div>
                <div className="geo-tip-wines" style={{ marginTop: 6 }}>
                  {selInfo.vinos.slice(0, 3).map((w, i) => (
                    <div key={i} className="geo-tip-w">{w.vino}{w.an ? ` ${w.an}` : ''} ×{w.qty}</div>
                  ))}
                  {selInfo.vinos.length > 3 && <div className="geo-tip-more">+{selInfo.vinos.length - 3} más</div>}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="geo-loading">Cargando…</div>
        )}
      </div>
      {listItems.length > 0 && (
        <div className="geo-list">
          {listItems.map(([key, lugar]) => (
            <button key={key} className={`geo-list-item${selected === key ? ' on' : ''}`}
              onClick={() => setSelected(prev => prev === key ? null : key)}>
              <span className="geo-li-name">{key}</span>
              <span className="geo-li-count">{fmtN(lugar.botellas)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── RegionesList ───────────────────────────────────────────────────
function RegionesList({ regiones }: { regiones: RegionesGrupo[] }) {
  const [openGrupos, setOpenGrupos] = useState<Set<string>>(new Set(['Mendoza']));
  const [openRegs, setOpenRegs] = useState<Set<string>>(new Set());

  function toggleGrupo(g: string) {
    setOpenGrupos(prev => { const n = new Set(prev); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }
  function toggleReg(key: string) {
    setOpenRegs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="tpanel">
      <h3>Regiones y bodegas</h3>
      <div className="reg-list">
        {regiones.map(grp => {
          const gOpen = openGrupos.has(grp.grupo);
          return (
            <div key={grp.grupo} className="reg-grupo">
              <button className={`reg-grupo-btn${gOpen ? ' open' : ''}`} onClick={() => toggleGrupo(grp.grupo)}>
                <span className="reg-grupo-name">{grp.grupo}</span>
                <span className="reg-grupo-bot">{fmtN(grp.botellas)} bot.</span>
                <span className="reg-chevron">{gOpen ? '▲' : '▼'}</span>
              </button>
              {gOpen && (
                <div className="reg-regs">
                  {grp.regiones.map(reg => {
                    const rKey = grp.grupo + '|' + reg.region;
                    const rOpen = openRegs.has(rKey);
                    return (
                      <div key={reg.region} className="reg-region">
                        <button className={`reg-region-btn${rOpen ? ' open' : ''}`} onClick={() => toggleReg(rKey)}>
                          <span className="reg-region-name">{reg.region}</span>
                          <span className="reg-region-bot">{fmtN(reg.botellas)}</span>
                          <span className="reg-chevron-sm">{rOpen ? '▲' : '▼'}</span>
                        </button>
                        {rOpen && (
                          <div className="reg-bodegas">
                            {reg.bodegas.map(b => (
                              <div key={b.bodega} className="reg-bodega-row">
                                <span className="reg-bodega-name">{b.bodega}</span>
                                <span className="reg-bodega-bot">{fmtN(b.botellas)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── YearReport (modal) ─────────────────────────────────────────────
function YearReport({ cons, scope, onClose }: {
  cons: ConsData; scope: number | 'total'; onClose: () => void;
}) {
  const [bodN, setBodN] = useState(8);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => { cardRef.current?.scrollTo(0, 0); setBodN(8); }, [scope]);

  const isTotal = scope === 'total';
  const years = Object.keys(cons.byYear).map(Number).sort((a, b) => a - b);

  const wines: (ConsWine & { cy: number })[] = useMemo(() => {
    if (isTotal) return years.flatMap(y => cons.byYear[y].wines.map(w => ({ ...w, cy: y })));
    const yr = cons.byYear[scope as number];
    return yr ? yr.wines.map(w => ({ ...w, cy: scope as number })) : [];
  }, [scope]);

  const nbot = isTotal ? cons.total : (cons.byYear[scope as number]?.n ?? 0);

  const { cepas, anAgg, edad } = useMemo(() => {
    const cepas: Record<string, number> = {};
    const anAgg: Record<number, number> = {};
    let ageW = 0, ageN = 0;
    wines.forEach(w => {
      cepas[w.cepa] = (cepas[w.cepa] || 0) + w.cant;
      if (w.an) {
        anAgg[w.an] = (anAgg[w.an] || 0) + w.cant;
        ageW += (w.cy - w.an) * w.cant; ageN += w.cant;
      }
    });
    return { cepas, anAgg, edad: ageN ? fmtN(ageW / ageN, 1) : '—' };
  }, [wines]);

  const anYears = Object.keys(anAgg).map(Number).sort((a, b) => a - b);
  const amax = anYears.reduce((m, y) => Math.max(m, anAgg[y]), 1);
  const bodArr = useMemo(() => {
    const bagg: Record<string, number> = {};
    wines.forEach(w => { bagg[w.bod] = (bagg[w.bod] || 0) + w.cant; });
    return Object.entries(bagg).sort((a, b) => b[1] - a[1]) as [string, number][];
  }, [wines]);
  const cepaArr = Object.entries(cepas).sort((a, b) => b[1] - a[1]) as [string, number][];
  const cepaMax = cepaArr.length ? cepaArr[0][1] : 1;
  const bodShown = bodArr.slice(0, bodN);
  const bodMax = bodArr.length ? bodArr[0][1] : 1;

  // Group wines by month for display
  const byMonth = useMemo(() => {
    const m: Record<string, (ConsWine & { cy: number })[]> = {};
    wines.forEach(w => {
      const k = MESN[w.mes] + (isTotal ? ' ' + w.cy : '');
      if (!m[k]) m[k] = [];
      m[k].push(w);
    });
    return m;
  }, [wines, isTotal]);

  const title = isTotal ? 'Informe acumulado' : `Consumo ${scope}`;
  const subtitle = `${fmtN(nbot)} botellas abiertas`;

  return (
    <div className="ymodal on" aria-hidden="false">
      <div className="ym-back" onClick={onClose} />
      <div className="ym-card" role="dialog" aria-modal="true" ref={cardRef}>
        <button className="ym-close" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="ym-title">{title}</div>
        <div className="ym-sub">{subtitle}</div>
        <div className="ym-stats">
          <div className="st"><div className="n">{fmtN(nbot)}</div><div className="l">botellas</div></div>
          <div className="st"><div className="n">{edad} <small>años</small></div><div className="l">edad prom. al abrir</div></div>
        </div>
        {cepaArr.length > 0 && (
          <div className="ym-sec">
            <h4>Cepas más tomadas</h4>
            <div className="rbars">
              {cepaArr.slice(0, 5).map(([k, v]) => (
                <BarItem key={k} label={k} count={v} max={cepaMax} />
              ))}
            </div>
          </div>
        )}
        {anYears.length > 0 && (
          <div className="ym-sec">
            <h4>Por añada</h4>
            <div className="astrip" style={{ height: 100 }}>
              {anYears.map(y => (
                <AnadaCol key={y} year={y} count={anAgg[y]} max={amax} active={false} isCurrent={false} onClick={() => {}} />
              ))}
            </div>
          </div>
        )}
        {bodArr.length > 0 && (
          <div className="ym-sec">
            <h4>Bodegas</h4>
            <div className="rbars">
              {bodShown.map(([k, v]) => <BarItem key={k} label={k} count={v} max={bodMax} />)}
            </div>
            {bodArr.length > bodN && (
              <button className="morebtn" onClick={() => setBodN(n => n + 5)}>Mostrar más bodegas</button>
            )}
          </div>
        )}
        {Object.keys(byMonth).length > 0 && (
          <div className="ym-sec">
            <h4>Por juntada</h4>
            {Object.entries(byMonth).map(([mes, ws]) => (
              <div key={mes} className="ym-junta">
                <div className="ym-junta .jh">{mes}</div>
                {ws.map((w, i) => (
                  <div key={i} className="ym-w">
                    <svg className="gl"><use href={`#gl-${w.tipo || 'tinto'}`} /></svg>
                    <div className="wmid">
                      <div className="wv">{w.vino}</div>
                      <div className="wb">{w.bod}</div>
                    </div>
                    <div className="wy">{w.an ?? 'N/V'}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ResumenEvoChart ────────────────────────────────────────────────
// Escala propia y fija de la línea "Edad al abrir": 0 a 12 años, mapeada a
// todo el alto del gráfico y sin eje visible.
const EDAD_TOPE = 12;

// Interpolación cúbica monótona (Fritsch–Carlson): suaviza sin pasarse de los
// valores reales, así el área no se hunde por debajo de cero en el origen.
// Devuelve sólo los segmentos C (el M inicial lo pone quien la usa).
function monoCurves(pts: [number, number][]): string {
  const n = pts.length;
  if (n < 2) return '';
  const f = (v: number) => v.toFixed(1);
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1][0] - pts[i][0];
    dx.push(h);
    m.push((pts[i + 1][1] - pts[i][1]) / (h || 1e-6));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) { t.push(0); continue; }
    const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
    t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
  }
  t.push(m[n - 2]);
  const d: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d.push(`C${f(pts[i][0] + h)},${f(pts[i][1] + t[i] * h)} ` +
           `${f(pts[i + 1][0] - h)},${f(pts[i + 1][1] - t[i + 1] * h)} ` +
           `${f(pts[i + 1][0])},${f(pts[i + 1][1])}`);
  }
  return d.join(' ');
}
const moveTo = (p: [number, number]) => `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const lineTo = (p: [number, number]) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`;

// Mientras llega /api/cava: ocupa exactamente el mismo alto que el gráfico,
// así no empuja nada cuando aparecen los datos.
function EvoCargando() {
  return (
    <div className="evo-chart-wrap evo-cargando" role="status">
      {/* mismo markup que el gráfico real, con el texto tapado: así el alto
          del recuadro es idéntico y no salta nada al llegar los datos */}
      <div className="evo-head">
        <div className="evo-head-main">
          <div className="evo-hero-num sk-text" aria-hidden="true">———</div>
          <div className="evo-hero-label sk-text" aria-hidden="true">botellas compradas desde el principio</div>
        </div>
        <div className="evo-legend">
          <span className="evo-leg-item sk-text" aria-hidden="true">En guarda · Abiertas · Edad al abrir</span>
        </div>
      </div>
      <div className="evo-tooltip-row" />
      <div className="evo-plot-wrap">
        <div className="evo-plot">
          <svg viewBox="0 0 1000 1000" className="evo-svg" preserveAspectRatio="none" aria-hidden="true">
            <path className="evo-cargando-area"
              d="M0,1000 C200,980 340,880 500,700 C660,520 820,320 1000,140 L1000,1000 Z"
              fill="#6B1E2E" />
          </svg>
          <div className="evo-cargando-msg">
            Una cava que crece sin parar
            <span className="evo-puntos"><i /><i /><i /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumenEvoChart({ evo }: { evo: EvoEntry[] }) {
  const [hov, setHov] = useState<number | null>(null);
  const N = evo.length;
  if (N < 2) return null;

  const last = evo[N - 1];
  const t0 = evo[0].ts;
  const span = Math.max(last.ts - t0, 1);
  const maxV = Math.max(...evo.map(e => e.compradas), 1);

  // Coordenadas normalizadas 0–1000: el SVG se estira al alto del contenedor,
  // así que los textos y los puntos van en HTML por encima (sin deformarse).
  const px  = (ts: number) => (ts - t0) / span * 1000;
  const pyV = (v: number)  => (1 - v / maxV) * 1000;
  const xs  = evo.map(e => px(e.ts));
  const pct = (v: number) => `${(v / 10).toFixed(2)}%`;

  const guardaPts: [number, number][] = evo.map((e, i) => [xs[i], pyV(e.enGuarda)]);
  const comprPts:  [number, number][] = evo.map((e, i) => [xs[i], pyV(e.compradas)]);
  const revGuarda = [...guardaPts].reverse();

  const guardaArea = `${moveTo(guardaPts[0])} ${monoCurves(guardaPts)} L1000,1000 L0,1000 Z`;
  const abiertasArea = `${moveTo(comprPts[0])} ${monoCurves(comprPts)} ` +
                       `${lineTo(guardaPts[N - 1])} ${monoCurves(revGuarda)} Z`;

  // Edad al abrir: un punto por período del club, en el centro del período.
  const edad = evo.flatMap((e, i) =>
    i === 0 || e.edadAlAbrir == null ? [] : [{
      i,
      x: (xs[i - 1] + xs[i]) / 2,
      y: (1 - e.edadAlAbrir / EDAD_TOPE) * 1000,
      v: e.edadAlAbrir,
    }]);
  const edadPath = edad.length > 1
    ? `${moveTo([edad[0].x, edad[0].y])} ${monoCurves(edad.map(p => [p.x, p.y] as [number, number]))}`
    : '';

  // Etiquetas finales: a media altura de cada banda, al costado del último punto.
  const yGuardaMid  = (pyV(last.enGuarda) + 1000) / 2;
  const yAbiertaMid = (pyV(last.compradas) + pyV(last.enGuarda)) / 2;

  const cur = hov !== null ? evo[hov] : null;

  return (
    <div className="evo-chart-wrap">
      <div className="evo-head">
        <div className="evo-head-main">
          <div className="evo-hero-num">{fmtN(last.compradas)}</div>
          <div className="evo-hero-label">botellas compradas desde abril 2021</div>
        </div>
        <div className="evo-legend">
          <span className="evo-leg-item"><span className="evo-leg-sq guard" />En guarda</span>
          <span className="evo-leg-item"><span className="evo-leg-sq abier" />Abiertas</span>
          <span className="evo-leg-item"><span className="evo-leg-line" />Edad al abrir (años)</span>
        </div>
      </div>

      <div className="evo-tooltip-row">
        {cur && <>
          <span className="evo-tt-cut">{cur.label}</span>
          <span className="evo-tt-item guard">{fmtN(cur.enGuarda)} en guarda</span>
          <span className="evo-tt-item abier">{fmtN(cur.abiertas)} abiertas</span>
          <span className="evo-tt-item comp">{fmtN(cur.compradas)} compradas</span>
          {cur.edadAlAbrir != null &&
            <span className="evo-tt-item edad">{fmtN(cur.edadAlAbrir, 1)} años al abrir</span>}
        </>}
      </div>

      <div className="evo-plot-wrap">
        <div className="evo-plot">
          <svg viewBox="0 0 1000 1000" className="evo-svg" preserveAspectRatio="none" aria-hidden="true">
            <path className="evo-area-guarda" d={guardaArea} fill="#6B1E2E" opacity="0.9" />
            <path className="evo-area-abiertas" d={abiertasArea} fill="#C8922A" opacity="0.8" />
            {hov !== null && (
              <line x1={xs[hov].toFixed(1)} y1="0" x2={xs[hov].toFixed(1)} y2="1000"
                stroke="rgba(36,19,24,.4)" strokeWidth="1.5" strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke" />
            )}
            {edadPath && <path d={edadPath} fill="none" stroke="#2A1A1E" strokeWidth="2"
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
          </svg>

          {/* Puntos y números de la línea de edad (HTML, para no deformarse) */}
          {edad.map(p => (
            <span key={p.i} className={`evo-edad-pt${p.i === N - 1 ? ' last' : ''}`}
              style={{ left: pct(p.x), top: pct(p.y) }}>
              <b className="evo-edad-n">{fmtN(p.v, 1)}</b>
            </span>
          ))}

          {/* Punto resaltado al pasar por un corte */}
          {hov !== null && <>
            <span className="evo-dot guard" style={{ left: pct(xs[hov]), top: pct(guardaPts[hov][1]) }} />
            <span className="evo-dot abier" style={{ left: pct(xs[hov]), top: pct(comprPts[hov][1]) }} />
          </>}

          {/* Etiquetas finales */}
          <span className="evo-end guard" style={{ top: pct(yGuardaMid) }}>{fmtN(last.enGuarda)}</span>
          <span className="evo-end abier" style={{ top: pct(yAbiertaMid) }}>{fmtN(last.abiertas)}</span>

          {/* Eje X temporal: cada marca en su posición real */}
          {evo.map((e, i) => (
            <span key={e.label}
              className={`evo-xlabel${i === N - 1 ? ' last' : ''}${i === 0 ? ' first' : ''}${hov === i ? ' hov' : ''}`}
              style={{ left: pct(xs[i]) }}>{e.label}</span>
          ))}

          {/* Zonas de hover */}
          {evo.map((_, i) => {
            const a = i === 0 ? 0 : (xs[i - 1] + xs[i]) / 2;
            const b = i === N - 1 ? 1000 : (xs[i] + xs[i + 1]) / 2;
            return <span key={i} className="evo-hit" style={{ left: pct(a), width: pct(b - a) }}
              onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}
              onClick={() => setHov(hov === i ? null : i)} />;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Cepas y estilos ────────────────────────────────────────────────
// Los colores de los tipos de vino salen de la API (mapa único en api/cava.ts),
// así un estilo nuevo no necesita tocar el frontend.
const TIPO_BORDE = '#CDBFAA';
const TIPO_CLARO = new Set(['espumante']); // los muy claros llevan borde
// Si la API no mandó color (por ejemplo, una respuesta vieja todavía cacheada
// durante un deploy), se usa este gris en vez de romper la pantalla.
const COLOR_NEUTRO = '#B8AC9C';
const ABIERTAS_GRIS = '#4A4340';

// Texto claro u oscuro según la luminancia del fondo (contraste AA).
function textoSobre(hex: string | undefined | null): string {
  const h = (hex ?? '').replace('#', '');
  if (h.length < 6) return '#2A1A1E';
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(parseInt(h.slice(0, 2), 16))
          + 0.7152 * lin(parseInt(h.slice(2, 4), 16))
          + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
  // contraste contra blanco vs. contra el tinta del club
  const cBlanco = 1.05 / (L + 0.05);
  const cOscuro = (L + 0.05) / 0.075;
  return cBlanco >= cOscuro ? '#FFF8EC' : '#2A1A1E';
}

// Treemap squarified, sin dependencias nuevas.
type Rect<T> = { item: T; x: number; y: number; w: number; h: number };
function squarify<T>(items: T[], valor: (t: T) => number, W: number, H: number): Rect<T>[] {
  const datos = items.map(i => ({ item: i, v: valor(i) })).filter(d => d.v > 0);
  const total = datos.reduce((s, d) => s + d.v, 0);
  if (!total || W <= 0 || H <= 0) return [];
  const escala = (W * H) / total;
  const areas = datos.map(d => ({ item: d.item, area: d.v * escala }));

  const peor = (fila: { area: number }[], suma: number, corto: number) => {
    if (!fila.length || suma <= 0 || corto <= 0) return Infinity;
    const max = Math.max(...fila.map(d => d.area));
    const min = Math.min(...fila.map(d => d.area));
    if (min <= 0) return Infinity;
    const s2 = suma * suma, c2 = corto * corto;
    return Math.max((c2 * max) / s2, s2 / (c2 * min));
  };

  const out: Rect<T>[] = [];
  let x = 0, y = 0, w = W, h = H, i = 0;
  while (i < areas.length) {
    const corto = Math.min(w, h);
    const fila: { item: T; area: number }[] = [];
    let suma = 0, mejor = Infinity;
    while (i < areas.length) {
      const nueva = suma + areas[i].area;
      const p = peor([...fila, areas[i]], nueva, corto);
      if (!fila.length || p <= mejor) { fila.push(areas[i]); suma = nueva; mejor = p; i++; }
      else break;
    }
    const grosor = corto > 0 ? suma / corto : 0;
    let off = 0;
    for (const d of fila) {
      const largo = grosor > 0 ? d.area / grosor : 0;
      if (w >= h) out.push({ item: d.item, x, y: y + off, w: grosor, h: largo });
      else        out.push({ item: d.item, x: x + off, y, w: largo, h: grosor });
      off += largo;
    }
    if (w >= h) { x += grosor; w -= grosor; } else { y += grosor; h -= grosor; }
    if (w < 0.5 || h < 0.5) break;
  }
  return out;
}

// Mide el ancho del contenedor para calcular el treemap en píxeles reales.
// Va con callback ref: el mosaico recién existe cuando llegó /api/cava, así que
// un useRef + efecto al montar no llegaría a engancharlo nunca.
function useAncho<T extends HTMLElement>() {
  const [nodo, setNodo] = useState<T | null>(null);
  const [ancho, setAncho] = useState(0);
  const ref = useCallback((n: T | null) => setNodo(n), []);
  useEffect(() => {
    if (!nodo) return;
    const medir = () => setAncho(nodo.getBoundingClientRect().width);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(nodo);
    return () => ro.disconnect();
  }, [nodo]);
  return [ref, ancho] as const;
}

// ── barra partida por tipo de vino ─────────────────────────────────
// La barra no lleva texto adentro: el desglose va debajo, en texto normal.
function BarraTipo({ rotulo, comp }: { rotulo: string; comp: TipoComp }) {
  if (!comp.total) return null;
  const estilo = (tipo: string, color: string | undefined) => ({
    background: color ?? COLOR_NEUTRO,
    border: TIPO_CLARO.has(tipo) ? `1px solid ${TIPO_BORDE}` : undefined,
  });
  return (
    <div className="bt-fila">
      <div className="bt-rotulo">
        <b>{rotulo}</b>
        <span>{fmtN(comp.total)} botella{comp.total !== 1 ? 's' : ''}</span>
      </div>
      <div className="bt-cuerpo">
        <div className="bt-barra">
          {comp.items.map(it => (
            <div key={it.tipo} className="bt-seg" data-tipo={it.tipo}
              style={{ width: `${it.count / comp.total * 100}%`, ...estilo(it.tipo, it.color) }}
              title={`${it.tipo}: ${fmtN(it.count)}`} />
          ))}
        </div>
        <div className="bt-desglose">
          {comp.items.map(it => {
            // por debajo del 1% el porcentaje redondea a cero: va la cantidad
            const pct = it.count / comp.total * 100;
            return (
              <span key={it.tipo} className="bt-item" data-tipo={it.tipo}>
                <i style={estilo(it.tipo, it.color)} />
                {it.tipo.charAt(0).toUpperCase() + it.tipo.slice(1)}{' '}
                {pct < 1 ? fmtN(it.count) : `${fmtN(Math.round(pct))}%`}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── ficha de una cepa ──────────────────────────────────────────────
function FichaCepaPanel({ cepa, onClose }: { cepa: Cepa; onClose: () => void }) {
  // La lista arranca cerrada: el Malbec tiene ~90 etiquetas.
  const [verVinos, setVerVinos] = useState(false);
  useEffect(() => { setVerVinos(false); }, [cepa.nombre]);
  const f = cepa.ficha;
  // Con el Malbec, "Terroirs en el mundo" repite el origen (Cahors): una sola vez.
  const mismoQueOrigen = (v: string) =>
    !!f && v.trim().toLowerCase() === f.origen.trim().toLowerCase();
  const chips = f ? ([
    ['Intensidad', f.intensidad], ['Taninos', f.taninos], ['Acidez', f.acidez],
  ] as [string, string][]).filter(([, v]) => v) : [];
  const datos = ([
    ['En guarda', cepa.enGuarda ? fmtN(cepa.enGuarda) : null],
    ['Abiertas', cepa.abiertas ? fmtN(cepa.abiertas) : null],
    ['Regiones', cepa.regiones.length ? fmtN(cepa.regiones.length) : null],
    ['Añada promedio', cepa.anadaPromedio != null ? String(cepa.anadaPromedio) : null],
    ['La más vieja', cepa.anadaMasVieja != null ? String(cepa.anadaMasVieja) : null],
  ] as [string, string | null][]).filter(([, v]) => v);

  return (
    <div className="cepa-ficha" data-cepa={cepa.nombre}>
      <button className="cepa-ficha-x" onClick={onClose} aria-label="Cerrar la ficha">✕</button>
      <div className="cepa-ficha-head">
        <span className="cepa-muestra" style={{ background: cepa.color ?? COLOR_NEUTRO }} aria-hidden="true" />
        <div>
          <div className="cepa-ficha-nombre">{cepa.nombre}</div>
          {f?.colorCopa && <div className="cepa-ficha-copa">{f.colorCopa}</div>}
        </div>
      </div>

      {f?.descripcion && <p className="cepa-desc">{f.descripcion}</p>}

      <div className="cepa-datos">
        {datos.map(([k, v]) => (
          <div key={k} className="cepa-dato"><b>{v}</b><span>{k}</span></div>
        ))}
      </div>
      {cepa.mejorVivino && (
        <div className="cepa-vivino">
          Mejor puntaje Vivino: <b>{fmtN(cepa.mejorVivino.vivino, 1)}</b>
          {' · '}{cepa.mejorVivino.vino}{cepa.mejorVivino.an ? ` ${cepa.mejorVivino.an}` : ''}
        </div>
      )}

      {chips.length > 0 && (
        <div className="cepa-chips">
          {chips.map(([k, v]) => <span key={k} className="cepa-chip"><i>{k}</i>{v}</span>)}
        </div>
      )}

      {f && (
        <dl className="cepa-atrib">
          {f.aromas && <><dt>Aromas típicos</dt><dd>{f.aromas}</dd></>}
          {f.maridajes && <><dt>Maridajes</dt><dd>{f.maridajes}</dd></>}
          {f.temperatura && <><dt>Temperatura de servicio</dt><dd>{f.temperatura}</dd></>}
          {f.terroirsAr && <><dt>Terroirs en Argentina</dt><dd>{f.terroirsAr}</dd></>}
          {f.terroirsMundo && !mismoQueOrigen(f.terroirsMundo) &&
            <><dt>Terroirs en el mundo</dt><dd>{f.terroirsMundo}</dd></>}
          {f.origen && <><dt>Origen</dt><dd>{f.origen}</dd></>}
        </dl>
      )}

      {cepa.vinos.length > 0 && (
        <div className="cepa-vinos">
          <button className="cepa-vinos-mas" aria-expanded={verVinos}
            onClick={() => setVerVinos(v => !v)}>
            {verVinos
              ? 'Ocultar etiquetas'
              : `Ver las ${fmtN(cepa.vinos.length)} etiqueta${cepa.vinos.length !== 1 ? 's' : ''} en guarda`}
          </button>
          {verVinos && cepa.vinos.map((v, i) => (
            <div key={i} className="cepa-vino">
              <span className="cv-nom">{v.vino}{v.an ? ` ${v.an}` : ''}</span>
              <span className="cv-bod">{v.bod}</span>
              <span className="cv-qty">{fmtN(v.qty)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── montos con candado ─────────────────────────────────────────────
// Placeholders fijos: no salen de Airtable ni viajan en la respuesta de la API.
function BloqueMontos() {
  return (
    <div className="montos">
      <div className="montos-cols">
        <div className="monto"><span>Presupuesto del mes</span><b>USD ●●●●</b></div>
        <div className="monto"><span>Asignado a la cava</span><b>USD ●●●●</b></div>
      </div>
      <div className="montos-pie">
        <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>
        <span>Montos visibles para miembros del club</span>
      </div>
    </div>
  );
}

// ── tarjeta de la última juntada ───────────────────────────────────
// "Juntada" = todos los consumos de la cava en un mismo mes.
function TarjetaJuntada({ j, esGrupo, onVer }: {
  j: UltimaJuntada; esGrupo: boolean; onVer?: () => void;
}) {
  const Caja = onVer ? 'button' : 'div';
  // Si la imagen no carga (por ejemplo, la URL de Airtable venció justo ahora),
  // la tarjeta vuelve al espacio vacío en vez de mostrar una imagen rota.
  const [rota, setRota] = useState(false);
  const conFoto = !!j.foto && !rota;
  return (
    <div className="junta-caja">
    <Caja className={'tarjeta-clara junta' + (onVer ? ' junta-link' : '')}
      data-mes={j.mes} {...(onVer ? { type: 'button' as const, onClick: onVer } : {})}>
      <div className={'junta-foto' + (conFoto ? ' con-foto' : '')}>
        {conFoto ? (
          <img className="junta-img"
            src={`/api/juntada-foto?cava=${CAVA_CODIGO}&mes=${j.mes}`}
            alt={`Botellas de la juntada de ${mesLargo(j.mes)}`}
            loading="lazy" onError={() => setRota(true)} />
        ) : (
          <>
            <svg className="junta-cam" aria-hidden="true"><use href="#ic-camara" /></svg>
            <span>Sumá la foto de la juntada</span>
          </>
        )}
        {onVer && <span className="junta-pill">Ver juntada ›</span>}
      </div>
      <div className="junta-cuerpo">
        <div className="junta-t">
          {esGrupo ? 'Última juntada' : 'Último consumo'} · {mesLargo(j.mes)}
        </div>
        <div className="junta-sub">
          {fmtN(j.botellas)} {plural(j.botellas, 'vino abierto', 'vinos abiertos')}
        </div>
        {j.vinos.length > 0 && (
          <div className="junta-vinos">
            {j.vinos.map((v, i) => (
              <div key={i} className="junta-v">
                <span className="jv-nom">{v.vino}{v.anada ? ` · ${v.anada}` : ''}</span>
                {v.vivino != null && <span className="jv-viv">{fmtN(v.vivino, 1)}</span>}
              </div>
            ))}
          </div>
        )}
        {j.resto > 0 && (
          <div className="junta-mas">y {fmtN(j.resto)} más · puntaje Vivino</div>
        )}
      </div>
    </Caja>
    </div>
  );
}

// ── ¿cuánto tiempo tiene tu cava? ──────────────────────────────────
// Barra partida por tramos de edad de lo que está en guarda. El porcentaje
// entra adentro del tramo sólo si el tramo mide lo suficiente.
function GraficoEdad({ edad, tramos, cosechas }: {
  edad: number; tramos: TramoEdad[];
  cosechas: { min: number; max: number; cuantas: number } | null;
}) {
  const [barraRef, ancho] = useAncho<HTMLDivElement>();
  const items = tramos.filter(t => t.botellas > 0);
  const total = items.reduce((s, t) => s + t.botellas, 0);
  if (!total) return null;
  // Los tramos que no tienen lugar para su % adentro lo muestran al costado.
  const afuera = items.filter(t => ancho > 0 && ancho * (t.botellas / total) <= ANCHO_MIN_PCT);
  return (
    <div className="edad-cuerpo">
      <div className="edad-hero">
        <b>{fmtN(edad, 1)}</b>
        <span>años de edad promedio</span>
      </div>
      <div className="edad-barra-fila">
        <div className="edad-barra" ref={barraRef}>
        {items.map(t => {
          const pct = t.botellas / total * 100;
          const cabe = ancho > 0 && ancho * pct / 100 > ANCHO_MIN_PCT;
          return (
            <div key={t.tramo} className="edad-seg" data-tramo={t.tramo}
              style={{ width: `${pct}%`, background: t.color, color: textoSobre(t.color) }}
              title={`${t.tramo}: ${fmtN(t.botellas)}`}>
              {cabe && <span className="edad-pct">{fmtN(Math.round(pct))}%</span>}
            </div>
          );
        })}
        </div>
        {afuera.length > 0 && (
          <div className="edad-pct-fuera">
            {afuera.map(t => (
              <span key={t.tramo} data-tramo={t.tramo} style={{ color: t.color }}>
                {fmtN(Math.round(t.botellas / total * 100))}%
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="edad-leyenda">
        {items.map(t => (
          <span key={t.tramo} className="edad-leg" data-tramo={t.tramo}>
            <i style={{ background: t.color }} />
            {t.tramo} <b>{fmtN(t.botellas)}</b>
          </span>
        ))}
      </div>
      {cosechas && (
        <div className="edad-mini">
          <div className="edad-mini-it">
            <b>{cosechas.min}</b>
            <span>la cosecha más antigua en guarda</span>
          </div>
          <div className="edad-mini-it">
            <b>{fmtN(cosechas.cuantas)}</b>
            <span>cosechas distintas, de {cosechas.min} a {cosechas.max}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Añadas ─────────────────────────────────────────────────────────
const ANADA_COLOR = '#6B4A2B';          // roble
const OTRAS_COLOR = '#8A7E70';
const PERGAMINO = '#F2EAD8';            // fondo de los paneles, para mezclar la opacidad
// Mínimos para que cada bloque aparezca.
const MIN_BOT_EPOCA = 5;                // botellas para mostrar el % de una fila
const MIN_ABIERTAS_ESPEJO = 5;
const MIN_CEPAS_MAPA = 4;
const MAX_CEPAS_MAPA = 8;
const PODIO_VETERANAS = {
  colores: ['#3E2717', '#80532F', '#B88A57'],   // los de los tramos de edad
  alturas: [84, 62, 46],
};
const PLOT_ALTO = 96;                   // px de la barra más alta del gráfico

const epocaIni = (an: number) => Math.floor(an / 5) * 5;
const epocaCorta = (e: number) => `${e}–${String(e + 4).slice(2)}`;
const epocaMapa = (e: number) => `'${String(e).slice(2)}–${String(e + 4).slice(2)}`;

// La añada que más botellas tiene en guarda; empate, la más reciente.
function anadaTop(A: AnadasBloque) {
  return A.enGuarda.reduce<{ an: number; botellas: number } | null>(
    (m, x) => (!m || x.botellas > m.botellas || (x.botellas === m.botellas && x.an > m.an) ? x : m), null);
}

type FilaEpoca = { rotulo: string; ab: number; gu: number };
// Épocas de 5 años; las más viejas con menos de 5 botellas se juntan en "Antes de …".
function filasEspejo(A: AnadasBloque): FilaEpoca[] {
  const m = new Map<number, { ab: number; gu: number }>();
  const toma = (e: number) => {
    if (!m.has(e)) m.set(e, { ab: 0, gu: 0 });
    return m.get(e)!;
  };
  A.abiertas.forEach(x => { toma(epocaIni(x.an)).ab += x.botellas; });
  A.enGuarda.forEach(x => { toma(epocaIni(x.an)).gu += x.botellas; });
  const eras = [...m.entries()].sort((a, b) => a[0] - b[0]);
  const stop = eras.findIndex(([, v]) => v.ab + v.gu >= MIN_BOT_EPOCA);
  const filas: FilaEpoca[] = [];
  let desde = 0;
  if (stop > 0) {
    const viejas = eras.slice(0, stop);
    filas.push({
      rotulo: `Antes de ${eras[stop][0]}`,
      ab: viejas.reduce((s, [, v]) => s + v.ab, 0),
      gu: viejas.reduce((s, [, v]) => s + v.gu, 0),
    });
    desde = stop;
  }
  eras.slice(desde).forEach(([e, v]) => filas.push({ rotulo: epocaCorta(e), ab: v.ab, gu: v.gu }));
  return filas;
}

type MapaFila = { cepa: string; color: string; cel: Map<number, number>; tot: number };
// Las cepas con más botellas en guarda con añada, por época de 5 años.
function mapaCalor(A: AnadasBloque) {
  const por = new Map<string, MapaFila>();
  A.cepaAnada.forEach(c => {
    if (!por.has(c.cepa)) por.set(c.cepa, { cepa: c.cepa, color: c.color, cel: new Map(), tot: 0 });
    const f = por.get(c.cepa)!;
    const e = epocaIni(c.an);
    f.cel.set(e, (f.cel.get(e) ?? 0) + c.botellas);
    f.tot += c.botellas;
  });
  const lista = [...por.values()].sort((a, b) => b.tot - a.tot || a.cepa.localeCompare(b.cepa, 'es'));
  const filas = lista.slice(0, MAX_CEPAS_MAPA);
  const resto = lista.slice(MAX_CEPAS_MAPA);
  if (resto.length) {
    const cel = new Map<number, number>();
    resto.forEach(f => f.cel.forEach((v, e) => cel.set(e, (cel.get(e) ?? 0) + v)));
    filas.push({ cepa: 'Otras', color: OTRAS_COLOR, cel, tot: resto.reduce((s, f) => s + f.tot, 0) });
  }
  const conDatos = new Set<number>();
  lista.forEach(f => f.cel.forEach((v, e) => { if (v > 0) conDatos.add(e); }));
  const epocas: number[] = [];
  if (conDatos.size) {
    const ini = Math.min(...conDatos), fin = Math.max(...conDatos);
    for (let e = ini; e <= fin; e += 5) epocas.push(e);
  }
  const max = Math.max(1, ...filas.flatMap(f => [...f.cel.values()]));
  return { filas, epocas, max, cepas: lista.length, epocasConDatos: conDatos.size };
}

const rgbDe = (hex: string) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
};

// Año por año, con los años en 0 como hueco. Todo entra en el ancho: no hay scroll.
function AnadasBarras({ A, activa, onPick }: {
  A: AnadasBloque; activa: number | null; onPick: (y: number) => void;
}) {
  const porAnio = new Map(A.enGuarda.map(x => [x.an, x.botellas]));
  const min = A.enGuarda[0].an, max = A.enGuarda[A.enGuarda.length - 1].an;
  const anios: number[] = [];
  for (let y = min; y <= max; y++) anios.push(y);
  const tope = Math.max(...A.enGuarda.map(x => x.botellas));
  const paso = anios.length > 30 ? 3 : 2;
  return (
    <div className={'an-chart' + (activa != null ? ' sel' : '')} style={{ ['--an-n' as string]: anios.length }}>
      {anios.map(y => {
        const v = porAnio.get(y) ?? 0;
        const rot = (max - y) % paso === 0;
        const cuerpo = (
          <>
            <span className="an-n">{fmtN(v)}</span>
            <span className="an-bar" style={{ height: Math.round(v / tope * PLOT_ALTO) }} />
            <span className="an-y">{rot ? `'${String(y).slice(2)}` : ''}</span>
          </>
        );
        return v > 0 ? (
          <button key={y} type="button" data-anio={y} data-n={v}
            className={'an-col' + (activa === y ? ' on' : '')} onClick={() => onPick(y)}
            title={`${y}: ${fmtN(v)}`}>{cuerpo}</button>
        ) : (
          <div key={y} data-anio={y} data-n={0} className="an-col hueco">{cuerpo}</div>
        );
      })}
    </div>
  );
}

// ── nombres de cepa que entran en su celda ────────────────────────
// Nombre corto para las cepas que no entran completas.
const CEPA_CORTA: Record<string, string> = {
  'Cabernet Sauvignon': 'Cab. Sauvignon',
  'Cabernet Franc': 'Cab. Franc',
  'Sauvignon Blanc': 'Sauv. Blanc',
};
// En el treemap, donde hay menos lugar, los cortos son más cortos.
const CEPA_CORTA_MOS: Record<string, string> = { ...CEPA_CORTA, 'Cabernet Sauvignon': 'Cab. Sauv.' };
// Si una cepa no tiene corto escrito: las palabras de después de la primera
// quedan en inicial ("Petit Verdot" → "Petit V."); una sola palabra, sus 5 letras.
function abreviar(n: string, mapa: Record<string, string> = CEPA_CORTA): string {
  if (mapa[n]) return mapa[n];
  const p = n.split(' ');
  return p.length > 1 ? [p[0], ...p.slice(1).map(x => x.charAt(0) + '.')].join(' ') : n.slice(0, 5) + '.';
}

// Se mide el texto completo contra el ancho de su celda (no contra lo que se ve
// ahora), así el resultado no depende de la vuelta anterior. Los elementos a
// medir llevan data-cepa con el nombre completo.
function useNombresCortos(selector: string) {
  const [medirRef, ancho] = useAncho<HTMLDivElement>();
  const nodo = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback((n: HTMLDivElement | null) => { nodo.current = n; medirRef(n); }, [medirRef]);
  const [cortas, setCortas] = useState<Set<string>>(new Set());
  const [fuentes, setFuentes] = useState(0);
  useEffect(() => { document.fonts?.ready.then(() => setFuentes(n => n + 1)); }, []);
  useEffect(() => {
    const g = nodo.current;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!g || !ctx) return;
    const nuevo = new Set<string>();
    g.querySelectorAll<HTMLElement>(selector).forEach(el => {
      const cepa = el.dataset.cepa ?? '';
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const disponible = el.clientWidth - parseFloat(cs.paddingRight) - parseFloat(cs.paddingLeft);
      if (ctx.measureText(cepa).width > disponible) nuevo.add(cepa);
    });
    setCortas(prev => (prev.size === nuevo.size && [...nuevo].every(c => prev.has(c)) ? prev : nuevo));
  });   // sin lista de dependencias: re-mide si cambia el contenido; sólo re-renderiza si el resultado cambió
  void ancho; void fuentes;
  return { setRefs, nombre: (n: string) => (cortas.has(n) ? abreviar(n) : n) };
}

// ── ¿Se guarda o se toma? (Añadas por época, Cepas por cepa) ───────
// Una sola línea por fila: rótulo · abiertas · eje · en guarda · %.
// Con `nombres`, el rótulo es una cepa: usa el corto si el completo no entra.
type FilaEsp = { clave: string; rotulo: string; ab: number; gu: number; color?: string };
function EspejoFilas({ filas, nombres }: { filas: FilaEsp[]; nombres?: boolean }) {
  const maxLado = Math.max(1, ...filas.map(f => Math.max(f.ab, f.gu)));
  const { setRefs, nombre } = useNombresCortos('.ae-rot[data-cepa]');
  return (
    <div className={'ae' + (nombres ? ' ae-nombres' : '')} ref={setRefs}>
      <div className="ae-fila ae-cab">
        <span />
        <div className="ae-barras"><span className="ae-h1">abiertas</span><span className="ae-h2">en guarda</span></div>
        <span className="ae-pct">% guardado</span>
      </div>
      <div className="ae-lista">
        {filas.map(f => {
          const tot = f.ab + f.gu;
          return (
            <div key={f.clave} className="ae-fila"
              {...(nombres ? { 'data-cepa': f.clave } : { 'data-epoca': f.clave })}>
              <span className="ae-rot" title={f.rotulo} {...(nombres ? { 'data-cepa': f.rotulo } : {})}>
                {nombres ? nombre(f.rotulo) : f.rotulo}
              </span>
              <div className="ae-barras">
                <div className="ae-izq">
                  <span className="ae-num">{fmtN(f.ab)}</span>
                  <span className="ae-b ae-ab"
                    style={{ width: `calc((100% - var(--ae-num) - 6px) * ${f.ab / maxLado})`, background: ABIERTAS_GRIS }} />
                </div>
                <span className="ae-eje" aria-hidden="true" />
                <div className="ae-der">
                  <span className="ae-b ae-gu"
                    style={{ width: `calc((100% - var(--ae-num) - 6px) * ${f.gu / maxLado})`, background: f.color ?? ANADA_COLOR }} />
                  <span className="ae-num">{fmtN(f.gu)}</span>
                </div>
              </div>
              <span className="ae-pct">{tot >= MIN_BOT_EPOCA ? `${fmtN(Math.round(f.gu / tot * 100))}%` : ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnadasMapa({ m }: { m: ReturnType<typeof mapaCalor> }) {
  const [pr, pg, pb] = rgbDe(PERGAMINO);
  const { setRefs, nombre } = useNombresCortos('.am-cepa');
  return (
    <div className="am-grid" ref={setRefs} style={{ ['--am-cols' as string]: m.epocas.length }}>
      <span />
      {m.epocas.map(e => <span key={e} className="am-h" data-epoca={epocaMapa(e)}>{epocaMapa(e)}</span>)}
      {m.filas.map(f => {
        const [r, g, b] = rgbDe(f.color);
        return (
          <Fragment key={f.cepa}>
            <span className="am-cepa" data-cepa={f.cepa} title={f.cepa}>{nombre(f.cepa)}</span>
            {m.epocas.map(e => {
              const v = f.cel.get(e) ?? 0;
              if (v <= 0) return <span key={e} className="am-cel vacia" data-v={0} />;
              const a = 0.22 + 0.78 * Math.sqrt(v / m.max);
              const mezcla = '#' + [r * a + pr * (1 - a), g * a + pg * (1 - a), b * a + pb * (1 - a)]
                .map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
              return (
                <span key={e} className="am-cel" data-v={v} data-a={a.toFixed(3)} data-cepa={f.cepa}
                  style={{ background: `rgba(${r},${g},${b},${a})`, color: textoSobre(mezcla) }}>
                  {fmtN(v)}
                </span>
              );
            })}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── podio (reutilizable) ───────────────────────────────────────────
// Los 3 primeros en columnas 2 · 1 · 3 con su escalón; del 4.º en adelante,
// filas. Con menos de 3, sólo filas. Tocar un puesto abre su ficha.
type PodioItem = {
  key: string;
  grande: string;       // el dato grande de la columna (en Veteranas, la añada)
  titulo: string;       // nombre; puede ir en varias líneas
  sub: string;          // línea chica y gris de la columna
  meta: string[];       // renglones chicos de la columna, cada uno entero
  filaSub: string;      // línea chica de la fila
  filaDer: string;      // lo que va a la derecha de la fila
};
function Podio({ items, colores, alturas, abierto, onPick, ficha }: {
  items: PodioItem[]; colores: string[]; alturas: number[];
  abierto: string | null; onPick: (key: string) => void;
  ficha: (key: string) => React.ReactNode;
}) {
  const hayPodio = items.length >= 3;
  const top = hayPodio ? items.slice(0, 3) : [];
  const orden = [1, 0, 2];   // columnas: 2.º · 1.º · 3.º
  const filas = hayPodio ? items.slice(3) : items;
  const desde = hayPodio ? 3 : 0;
  return (
    <div className="pd">
      {hayPodio && (
        <>
          <div className="pd-podio">
            {orden.map(i => {
              const it = top[i];
              return (
                <div key={it.key} className="pd-col" data-puesto={i + 1}>
                  <button type="button" className={'pd-txt' + (abierto === it.key ? ' on' : '')}
                    aria-expanded={abierto === it.key} onClick={() => onPick(it.key)}>
                    <span className="pd-grande">{it.grande}</span>
                    <span className="pd-vino">{it.titulo}</span>
                    <span className="pd-bod">{it.sub}</span>
                    <span className="pd-meta">{it.meta.map(m => <span key={m}>{m}</span>)}</span>
                  </button>
                  <div className="pd-escalon"
                    style={{ height: alturas[i], background: colores[i], color: textoSobre(colores[i]) }}>{i + 1}</div>
                </div>
              );
            })}
          </div>
          {top.some(t => t.key === abierto) && abierto && ficha(abierto)}
        </>
      )}
      {filas.length > 0 && (
        <div className="pd-filas">
          {filas.map((it, k) => (
            <div key={it.key} className="pd-item" data-puesto={desde + k + 1}>
              <button type="button" className="pd-fila" aria-expanded={abierto === it.key} onClick={() => onPick(it.key)}>
                <span className="pd-pues">{desde + k + 1}</span>
                <span className="pd-mid">
                  <span className="pd-vino">{it.titulo}</span>
                  <span className="pd-fsub">{it.filaSub}</span>
                </span>
                <span className="pd-der">{it.filaDer}</span>
              </button>
              {abierto === it.key && ficha(it.key)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── rótulos del treemap de Cepas ───────────────────────────────────
// Completo si entran nombre y número; si no, nombre corto y número; si no,
// sólo el número; si ni eso entra, nada. Nunca un texto cortado.
const FONT_MOS_NOM = '600 11px Archivo, sans-serif';
const FONT_MOS_QTY = '400 16px Fraunces, serif';
let _lienzo: CanvasRenderingContext2D | null | undefined;
function anchoTexto(txt: string, font: string): number {
  if (_lienzo === undefined) _lienzo = document.createElement('canvas').getContext('2d');
  if (!_lienzo) return 0;
  _lienzo.font = font;
  return _lienzo.measureText(txt).width;
}
function rotuloMosaico(nombre: string, qty: number, w: number, h: number): { nom: string | null; qty: boolean } {
  // el rectángulo mide w−2 × h−2 y tiene 7 px de relleno a los lados y 5 arriba y abajo
  const iw = w - 2 - 14 - 1, ih = h - 2 - 10;
  const altoNom = 11 * 1.2, altoQty = 16 * 1.1;
  if (anchoTexto(fmtN(qty), FONT_MOS_QTY) > iw || altoQty > ih) return { nom: null, qty: false };
  if (altoNom + altoQty <= ih) {
    for (const n of [nombre, abreviar(nombre, CEPA_CORTA_MOS)]) {
      if (anchoTexto(n, FONT_MOS_NOM) <= iw) return { nom: n, qty: true };
    }
  }
  return { nom: null, qty: true };
}

// ¿Cuánto tiempo tiene tu cava?, una fila por tramo (sólo en Añadas).
function AnadasTramos({ tramos }: { tramos: TramoEdad[] }) {
  const items = tramos.filter(t => t.botellas > 0);
  const total = items.reduce((s, t) => s + t.botellas, 0);
  const tope = Math.max(1, ...items.map(t => t.botellas));
  // la API manda "6 a 10": acá se lee mejor con la unidad
  const rotulo = (t: string) => (/^\d+ a \d+$/.test(t) ? `${t} años` : t);
  return (
    <div className="tr-lista">
      {items.map(t => (
        <div key={t.tramo} className="tr-fila" data-tramo={t.tramo}>
          <span className="tr-rot">{rotulo(t.tramo)}</span>
          <span className="tr-pista">
            <span className="tr-barra" style={{ width: `${t.botellas / tope * 100}%`, background: t.color }} />
          </span>
          <span className="tr-n">{fmtN(t.botellas)}</span>
          <span className="tr-pct">{fmtN(Math.round(t.botellas / total * 100))}%</span>
        </div>
      ))}
    </div>
  );
}

// ── panel de detalle (común) ───────────────────────────────────────
// Encabezado, cajas, líneas de dato y etiquetas desplegables. Hoy lo usa sólo
// Añadas; está armado para reusarlo en Geografía y Calidad.
type EtiquetaFila = { key: string; vino: string; bodega: string; botellas: number };
function PanelDetalle({ clave, titulo, subtitulo, cajas, lineas, etiquetas, ficha, onClose }: {
  clave: string; titulo: string; subtitulo: string;
  cajas: { n: string; l: string }[];
  lineas: React.ReactNode[];
  etiquetas: EtiquetaFila[];
  ficha: (e: EtiquetaFila) => React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [lista, setLista] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  // al abrir o cambiar: si el encabezado queda fuera de pantalla, scroll suave
  useEffect(() => {
    setLista(false); setAbierta(null);
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight - 140) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [clave]);
  const n = etiquetas.length;
  return (
    <div className="det-panel" ref={ref} data-det={clave}>
      <div className="det-cab">
        <div className="det-tit">
          <div className="det-t">{titulo}</div>
          <div className="det-s">{subtitulo}</div>
        </div>
        <button type="button" className="det-x" aria-label="Cerrar" onClick={onClose}>✕</button>
      </div>
      <div className="cepa-kpis det-cajas">
        {cajas.map(c => <div key={c.l} className="cepa-kpi"><b>{c.n}</b><span>{c.l}</span></div>)}
      </div>
      {lineas.map((l, i) => <p key={i} className="det-linea">{l}</p>)}
      {n > 0 && (
        <button type="button" className="cepa-vinos-mas det-mas" onClick={() => setLista(v => !v)}>
          {lista ? 'Ocultar etiquetas' : `Ver ${n === 1 ? 'la etiqueta' : `las ${fmtN(n)} etiquetas`} en guarda`}
        </button>
      )}
      {lista && (
        <div className="det-lista">
          {etiquetas.map(e => (
            <div key={e.key} className="det-et" data-et={e.key}>
              <button type="button" className="det-et-fila" aria-expanded={abierta === e.key}
                onClick={() => setAbierta(abierta === e.key ? null : e.key)}>
                <span className="det-et-vino">{e.vino}</span>
                <span className="det-et-n">{fmtN(e.botellas)}</span>
                <span className="det-et-bod">{e.bodega}</span>
              </button>
              {abierta === e.key && ficha(e)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── carrusel "El club en números" ──────────────────────────────────
type Grafico = { id: string; titulo: string; nodo: React.ReactNode };

function tarjetas(pista: HTMLElement): HTMLElement[] {
  return [...pista.children].filter(e => e.classList.contains('num-card')) as HTMLElement[];
}
// El paso lo da la distancia real entre dos tarjetas: así el ancho y la
// separación viven sólo en el CSS.
function pasoDe(pista: HTMLElement): number {
  const t = tarjetas(pista);
  if (t.length > 1) {
    const d = t[1].getBoundingClientRect().left - t[0].getBoundingClientRect().left;
    if (d > 1) return d;
  }
  return Math.max(t[0]?.getBoundingClientRect().width ?? pista.clientWidth, 1);
}
function indiceDe(pista: HTMLElement, n: number): number {
  return Math.max(0, Math.min(n - 1, Math.round(pista.scrollLeft / pasoDe(pista))));
}

function CarruselNumeros({ graficos }: { graficos: Grafico[] }) {
  const pistaRef = useRef<HTMLDivElement>(null);
  const [activo, setActivo] = useState(0);
  const [tocado, setTocado] = useState(false);
  const N = graficos.length;

  // El puntito activo sale de dónde quedó el scroll, no de un contador
  // aparte: así coincide siempre con lo que se está viendo.
  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    let raf = 0;
    const leer = () => { raf = 0; setActivo(indiceDe(pista, N)); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(leer); };
    pista.addEventListener('scroll', onScroll, { passive: true });
    leer();
    return () => {
      pista.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [N]);

  function irA(i: number, suave = true) {
    const pista = pistaRef.current;
    if (!pista) return;
    const t = tarjetas(pista)[i];
    if (!t) return;
    const left = pista.scrollLeft + t.getBoundingClientRect().left - pista.getBoundingClientRect().left;
    pista.scrollTo({ left, behavior: suave ? 'smooth' : 'auto' });
  }

  // Avanza solo cada 7 s y se detiene para siempre en cuanto alguien lo toca.
  useEffect(() => {
    if (tocado || N < 2) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => {
      const pista = pistaRef.current;
      if (!pista) return;
      irA((indiceDe(pista, N) + 1) % N);
    }, 7000);
    return () => clearInterval(t);
  }, [tocado, N]);

  const frenar = () => setTocado(true);

  return (
    <div className="num-wrap" data-tocado={tocado ? 'si' : 'no'}>
      <div className="bloque-head">
        <h2 className="bloque-t">El club en números</h2>
        {N > 1 && (
          <span className="bloque-dato num-pos">{fmtN(activo + 1)} de {fmtN(N)} · deslizá</span>
        )}
      </div>
      <div className="num-carrusel" ref={pistaRef}
        onPointerDown={frenar} onTouchStart={frenar} onWheel={frenar} onKeyDown={frenar}>
        {graficos.map(g => (
          <div key={g.id} className="num-card tarjeta-clara" data-gra={g.id}>{g.nodo}</div>
        ))}
        {/* cola: deja que la última tarjeta también pueda alinearse a la izquierda */}
        <div className="num-sp" aria-hidden="true" />
      </div>
      {N > 1 && (
        <div className="num-dots">
          {graficos.map((g, i) => (
            <button key={g.id} className={'num-dot' + (i === activo ? ' on' : '')}
              aria-label={g.titulo} aria-current={i === activo ? 'true' : undefined}
              onClick={() => { frenar(); irA(i); }} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── acordeón de meses (Compras) ────────────────────────────────────
function AcordeonMeses({ meses }: { meses: EntradaMes[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <div className="acc">
      {meses.map(m => {
        const on = abierto === m.mes;
        return (
          <div key={m.mes} className="acc-item" data-mes={m.mes} data-bot={m.botellas}>
            <button className={'acc-btn' + (on ? ' open' : '')} aria-expanded={on}
              onClick={() => setAbierto(p => (p === m.mes ? null : m.mes))}>
              <span className="acc-mes">{mesLargo(m.mes, true)}</span>
              <span className="acc-bot">
                {fmtN(m.botellas)} {plural(m.botellas, 'botella', 'botellas')}
              </span>
              <span className="acc-chev" aria-hidden="true">{on ? '▲' : '▼'}</span>
            </button>
            {on && (
              <div className="acc-cuerpo">
                {m.etiquetas.map((e, i) => (
                  <div key={i} className="acc-fila">
                    <span className="acc-vino">{e.vino}{e.anada ? ` · ${e.anada}` : ''}</span>
                    <span className="acc-bod">{e.bodega}</span>
                    <span className="acc-qty">{fmtN(e.botellas)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── panel "Cargar" (demo: no guarda nada) ──────────────────────────
// `cargar-abierto` también lo lee el modal de /club para no cerrarse cuando
// el "atrás" lo que tiene que cerrar es este panel.
function PanelCargar({ onCerrar }: { onCerrar: () => void }) {
  const [aviso, setAviso] = useState(false);
  const OPCIONES = [
    { id: 'consumo', ico: 'nv-consumos', t: 'Un consumo',
      d: 'Una botella de la cava que se abrió: puntaje, opinión y con qué se maridó.' },
    { id: 'afuera', ico: 'ic-botella', t: 'Una botella de afuera',
      d: 'Un regalo o una compra fuera del club. Queda catalogada en tu cava.' },
  ];
  return (
    <div className="cargar-back cargar-abierto" onClick={onCerrar}>
      <div className="cargar-sheet" role="dialog" aria-modal="true" aria-label="Cargar"
        onClick={e => e.stopPropagation()}>
        <div className="cargar-handle" aria-hidden="true" />
        <button className="cargar-x" type="button" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="cargar-t">¿Qué querés cargar?</div>
        <div className="cargar-opts">
          {OPCIONES.map(o => (
            <button key={o.id} className="cargar-opt" type="button" data-opt={o.id}
              onClick={() => setAviso(true)}>
              <svg className="co-ico" aria-hidden="true"><use href={`#${o.ico}`} /></svg>
              <span className="co-txt"><b>{o.t}</b><small>{o.d}</small></span>
            </button>
          ))}
        </div>
        {aviso && (
          <div className="cargar-aviso" role="status">
            <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>
            <span>Disponible para miembros del club</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── pantalla "Valor de la cava" ────────────────────────────────────
// En el demo está toda bloqueada: ningún monto ni porcentaje sale de la API
// ni de ningún otro lado, son todos placeholders. Lo único real es la
// cantidad de botellas en guarda, los años de la cava y los miembros.
const VALOR_TRAMOS = [
  { id: 'pagado',  rotulo: 'Pagado a precio club',   color: '#8A7F75' },
  { id: 'ahorro',  rotulo: 'Ahorro por precio club', color: '#C9A35C' },
  { id: 'guarda',  rotulo: 'Sumado por la guarda',   color: '#E8D29C' },
];
const VALOR_SIGNIFICA = [
  { id: 'gondola', texto: 'menos que en góndola' },
  { id: 'guarda',  texto: 'sumó la guarda sobre el precio de góndola' },
];
const TAPADO = 'USD ●●●●';
const TAPADO_PCT = '●●%';
const FILAS_RANKING = 5;

function PantallaValor({ enGuarda, anios, miembros, onVolver }: {
  enGuarda: number; anios: number[]; miembros: number; onVolver: () => void;
}) {
  return (
    <>
      <header className="tab-top valor-top">
        <div className="tab-top-in">
          <button className="tab-back" type="button" onClick={onVolver}
            aria-label="Volver al inicio">←</button>
          <b>Valor de la cava</b>
          <span className="valor-top-sub">
            <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>
            Solo miembros · Club EDB #001
          </span>
        </div>
      </header>

      <div className="inicio">
        {/* 1 — el número tapado y lo que significa */}
        <section className="banda banda-a" data-banda="1">
          <div className="banda-in">
            <div className="lockcard valor-hoy">
              <div className="valor-card-label">Valor estimado hoy</div>
              <div className="valor-hoy-num">{TAPADO}</div>
              <div className="valor-hoy-sub">
                de las {fmtN(enGuarda)} {plural(enGuarda, 'botella', 'botellas')} en guarda
              </div>
              {/* tres tramos de igual ancho: la proporción real es de miembros */}
              <div className="valor-barra">
                {VALOR_TRAMOS.map(t => (
                  <span key={t.id} data-tramo={t.id} style={{ background: t.color }} />
                ))}
              </div>
              <div className="valor-barra-leg">
                {VALOR_TRAMOS.map(t => (
                  <div key={t.id} className="valor-leg-it" data-tramo={t.id}>
                    <i style={{ background: t.color }} />
                    <span>{t.rotulo}</span>
                    <b>{TAPADO}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="bloque">
              <div className="bloque-head"><h2 className="bloque-t">Lo que significa</h2></div>
              <div className="valor-significa">
                {VALOR_SIGNIFICA.map(s => (
                  <div key={s.id} className="tarjeta-clara valor-sig" data-sig={s.id}>
                    <b>{TAPADO_PCT}</b>
                    <span>{s.texto}</span>
                  </div>
                ))}
              </div>
              <div className="valor-parte">
                <span className="vp-rot">Tu parte · 1 de {fmtN(miembros)}</span>
                <b>{TAPADO}</b>
              </div>
            </div>
          </div>
        </section>

        {/* 2 — el gráfico por año, con barras genéricas */}
        <section className="banda banda-b" data-banda="2">
          <div className="banda-in">
            <div className="bloque">
              <div className="bloque-head">
                <h2 className="bloque-t">Cuotas y compras por año</h2>
              </div>
              <div className="tarjeta-clara valor-graf">
                <div className="vg-plot" aria-hidden="true">
                  {anios.map(a => (
                    <div key={a} className="vg-col">
                      <span className="vg-barra vg-compras" />
                      <span className="vg-barra vg-cuotas" />
                      <span className="vg-anio">{a}</span>
                    </div>
                  ))}
                </div>
                <div className="vg-leg">
                  <span><i className="vg-sw vg-compras" />Comprado a precio club</span>
                  <span><i className="vg-sw vg-cuotas" />Cuotas del año</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3 — el ranking, en esqueleto: sale de montos */}
        <section className="banda banda-a" data-banda="3">
          <div className="banda-in">
            <div className="bloque">
              <div className="bloque-head">
                <h2 className="bloque-t">Las que más valor sumaron</h2>
              </div>
              <div className="tarjeta-clara valor-rank">
                {Array.from({ length: FILAS_RANKING }, (_, i) => (
                  <div key={i} className="vr-fila">
                    <span className="vr-skel" aria-hidden="true" />
                    <b>+USD ●●●</b>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4 — la descarga, bloqueada */}
        <section className="banda banda-b" data-banda="4">
          <div className="banda-in">
            <button className="valor-pdf" type="button" disabled>
              <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>
              Descargar el informe anual (PDF)
            </button>
            <p className="tnote">
              Disponible para miembros del club. El valor se estima con el precio
              sugerido en dólares al momento de la compra, más lo que suma cada año
              de guarda. Es una estimación, no un precio de venta.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

// ── barra fija de abajo ────────────────────────────────────────────
function BarraApp({ activo, ir, abrirCargar }: {
  activo: string; ir: (s: SectionId) => void; abrirCargar: () => void;
}) {
  const item = (n: typeof NAV[number]) => {
    const on = activo === n.id;
    return (
      <button key={n.id || 'inicio'} type="button"
        className={'appbar-item' + (on ? ' on' : '')}
        data-pantalla={n.id || 'inicio'} aria-current={on ? 'page' : undefined}
        onClick={() => ir(n.id as SectionId)}>
        <svg className="appbar-ico" aria-hidden="true"><use href={`#${n.ico}`} /></svg>
        <span className="appbar-lbl">{n.label}</span>
      </button>
    );
  };
  return (
    <nav className="appbar" aria-label="Secciones de la app">
      <div className="appbar-in">
        {NAV.slice(0, 2).map(item)}
        <div className="appbar-item appbar-item-mas">
          <button className="appbar-mas-btn" type="button" onClick={abrirCargar}
            aria-label="Cargar">
            <svg aria-hidden="true"><use href="#nv-mas" /></svg>
          </button>
          <span className="appbar-lbl">Cargar</span>
        </div>
        {NAV.slice(2).map(item)}
      </div>
    </nav>
  );
}

// ── Componente principal ───────────────────────────────────────────
export default function ClubCava() {
  const location = useLocation();
  const navigate = useNavigate();
  // En /club/cava manda el hash de la URL. Embebido en el modal de /club, la
  // sección es estado interno: navegar el router desmontaría Club entero
  // (y con él, el modal).
  const isStandalone = location.pathname === '/club/cava';
  const rootRef = useRef<HTMLDivElement>(null);

// El hash puede traer un detalle después de la barra: #consumos/2026-09.
  const hashRuta = useMemo(() => {
    const [h, detalle = ''] = location.hash.replace('#', '').trim().split('/');
    return (PANTALLAS as readonly string[]).includes(h)
      ? { s: h as SectionId, detalle }
      : { s: '' as SectionId, detalle: '' };
  }, [location.hash]);

  const [embeddedRuta, setEmbeddedRuta] = useState<{ s: SectionId; detalle: string }>(
    { s: '', detalle: '' });
  const ruta = isStandalone ? hashRuta : embeddedRuta;
  const section: SectionId = ruta.s;

  function goSection(s: SectionId, detalle = '') {
    const hash = s ? '#' + s + (detalle ? '/' + detalle : '') : '';
    if (isStandalone) navigate(`/club/cava${hash}`, { replace: false });
    else setEmbeddedRuta({ s, detalle });
  }
  // Las pantallas de "Mi cava" vuelven a Mi cava, no al Inicio.
  function goBack() { goSection('cava'); }

  // Al cambiar de sección, arriba de todo — pero del contenedor que realmente
  // scrollea, que dentro del modal no es la ventana. Si el hash trae un mes
  // (#consumos/2026-09), la pantalla queda parada en ese mes.
  useEffect(() => {
    const mes = ruta.detalle;
    if (!mes) { scrollToTop(rootRef.current); return; }
    const t = setTimeout(() => {
      const el = rootRef.current?.querySelector(`[data-mes="${mes}"]`);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
      else scrollToTop(rootRef.current);
    }, 80);
    return () => clearTimeout(t);
  }, [section, ruta.detalle]);

  // ── panel "Cargar" ──
  // Se abre empujando una entrada de historia, así el "atrás" del celular lo
  // cierra. Cerrarlo con la X o tocando afuera hace history.back(): el panel
  // se cierra siempre en el popstate, de una sola manera.
  const [cargarAbierto, setCargarAbierto] = useState(false);

  function abrirCargar() {
    if (cargarAbierto) return;
    history.pushState({ cargarPanel: true }, '');
    setCargarAbierto(true);
  }
  function cerrarCargar() {
    if (!cargarAbierto) return;
    history.back();
  }

  useEffect(() => {
    if (!cargarAbierto) return;
    lockScroll();
    return unlockScroll;
  }, [cargarAbierto]);

  useEffect(() => {
    if (!cargarAbierto) return;
    function onPop() { setCargarAbierto(false); }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') history.back(); }
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [cargarAbierto]);

  type CavaPick = 'grupal' | 'individual';
  const [cava, setCava] = useState<CavaPick>('grupal');

  // filtros (solo para sección botellas)
  const [tipo, setTipo] = useState('todos');
  const [cepa, setCepa] = useState('todas');
  const [anada, setAnada] = useState('todas');
  const [fmt, setFmt] = useState('todos');
  const [q, setQ] = useState('');
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<{ scope: number | 'total' } | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);


  const [apiData, setApiData] = useState<CavaApiResponse | null>(null);
  const [apiEstado, setApiEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');

  useEffect(() => {
    let vivo = true;
    fetch('/api/cava')
      .then(r => r.json())
      .then((d: CavaApiResponse) => {
        if (!vivo) return;
        if (d.error) { setApiEstado('error'); return; }
        setApiData(d);
        setApiEstado('listo');
      })
      .catch(() => { if (vivo) setApiEstado('error'); });
    return () => { vivo = false; };
  }, []);

  // En la cava del club el JSON de respaldo entra SOLO si la API falla, nunca
  // mientras carga: si no, se ven los números viejos y un instante después saltan.
  const cargando = cava === 'grupal' && apiEstado === 'cargando';
  const rows: Wine[] = cava !== 'grupal'
    ? (CAVA.data[cava] as Wine[])
    : apiData?.data?.grupal ?? (apiEstado === 'error' ? (CAVA.data.grupal as Wine[]) : []);
  const cons: ConsData = cava !== 'grupal'
    ? CAVA.cons[cava]
    : apiData?.cons?.grupal ?? (apiEstado === 'error' ? CAVA.cons.grupal : { total: 0, juntadas: 0, byYear: {} });
  // La configuración de la cava sale de la API cuando está; si no, del JSON.
  const apiConfig = apiData?.config ?? apiData?.perfiles?.grupal;
  const profile: Perfil = (cava === 'grupal' && apiConfig) ? apiConfig : CAVA.perfiles[cava];
  const apiStats: ApiStats | undefined = cava === 'grupal' ? apiData?.stats : undefined;

  // ── sección Cepas: mosaico + ficha ──
  const [cepaSel, setCepaSel] = useState<string | null>(null);
  const [vetAbierta, setVetAbierta] = useState<string | null>(null);
  const [anioSel, setAnioSel] = useState<number | null>(null);
  const [mosaicoRef, mosaicoAncho] = useAncho<HTMLDivElement>();
  const [esMobil, setEsMobil] = useState(
    typeof window !== 'undefined' && window.matchMedia('(max-width: 599px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 599px)');
    const fn = (e: MediaQueryListEvent) => setEsMobil(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  const mosaicoAlto = esMobil ? 300 : 340;

  // Cepas cuyo rectángulo no tiene lugar para el nombre (ni completo ni corto):
  // van en la línea "También: …", con el mismo criterio que el mosaico.
  // Los rótulos se miden con las fuentes ya cargadas: al llegar, se vuelve a medir.
  const [fuentesMos, setFuentesMos] = useState(0);
  useEffect(() => { document.fonts?.ready.then(() => setFuentesMos(n => n + 1)); }, []);
  const mosaicoChicas = useMemo(() => {
    const lista = apiData?.cepas?.lista.filter(c => c.enGuarda > 0) ?? [];
    if (!lista.length || mosaicoAncho <= 0) return [] as Cepa[];
    return squarify(lista, c => c.enGuarda, mosaicoAncho, mosaicoAlto)
      .filter(r => !rotuloMosaico(r.item.nombre, r.item.enGuarda, r.w, r.h).nom)
      .map(r => r.item);
  }, [apiData, mosaicoAncho, mosaicoAlto, fuentesMos]);

  // Al abrir una ficha en celular, subir hasta su arriba.
  const fichaRef = useRef<string | null>(null);
  useEffect(() => {
    if (!cepaSel || cepaSel === fichaRef.current) { fichaRef.current = cepaSel; return; }
    fichaRef.current = cepaSel;
    if (!esMobil) return;
    const t = setTimeout(() => {
      document.querySelector('.cepa-ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(t);
  }, [cepaSel, esMobil]);

  function switchCava(k: CavaPick) {
    setCava(k);
    setTipo('todos'); setCepa('todas'); setAnada('todas');
    setFmt('todos'); setQ(''); setOpenSet(new Set());
    goSection('');
  }

  // ── stats globales ──
  const stats = useMemo(() => {
    let bot = sumGuarda(rows), eqt = 0, tw = 0, twn = 0;
    const bods = new Set<string>(), cepas = new Set<string>(), etiqSet = new Set<string>();
    let iconoQty = 0;
    rows.forEach(r => {
      eqt += r.eq;
      bods.add(r.bod); cepas.add(r.cepa);
      etiqSet.add((r.vino + '|' + (r.an ?? 'nv')).toLowerCase());
      if (r.icono) iconoQty += r.qty;
      if (r.an) { tw += (NOW - r.an) * r.qty; twn += r.qty; }
    });
    const etiquetas = apiStats?.etiquetas ?? etiqSet.size;
    const pctIcono = apiStats?.pctIcono ?? (bot ? Math.round(iconoQty / bot * 100) : 0);
    return { bot, eqt, bods: bods.size, cepas: cepas.size, etiquetas, pctIcono };
  }, [rows, apiStats]);

  // ── pie / donut data ──
  const { tipoPie, cepaOtrosSet } = useMemo(() => {
    const tipoAgg: Record<string, number> = {};
    const cepaAgg: Record<string, number> = {};
    let totCepa = 0;
    rows.forEach(r => {
      tipoAgg[r.tipo] = (tipoAgg[r.tipo] || 0) + r.qty;
      cepaAgg[r.cepa] = (cepaAgg[r.cepa] || 0) + r.qty;
      totCepa += r.qty;
    });
    const tipoAll = Object.entries(tipoAgg).sort((a, b) => b[1] - a[1]) as [string, number][];
    const cepaAll = Object.entries(cepaAgg).sort((a, b) => b[1] - a[1]) as [string, number][];
    // cepaOtrosSet lo usa el filtro de la sección "Las botellas"
    const { otrosSet } = capN(cepaAll, 5);
    return {
      tipoPie: { items: tipoAll as [string, number][], total: totCepa },
      cepaOtrosSet: otrosSet,
    };
  }, [rows]);

  // ── añadas ──
  const { anadaItems, anadaMax, anadaStats } = useMemo(() => {
    const agg: Record<number, number> = {};
    rows.forEach(r => { if (r.an) agg[r.an] = (agg[r.an] || 0) + r.qty; });
    const years = Object.keys(agg).map(Number).sort((a, b) => a - b);
    const max = years.reduce((m, y) => Math.max(m, agg[y]), 1);
    const promedio = apiStats?.anadaPromedio ?? (years.length
      ? Math.round(years.reduce((s, y) => s + y * (agg[y] ?? 0), 0) / (years.reduce((s, y) => s + (agg[y] ?? 0), 0) || 1))
      : null);
    const min = years.length ? years[0] : null;
    return {
      anadaItems: years.map(y => [y, agg[y]] as [number, number]),
      anadaMax: max,
      anadaStats: { promedio, min, count: years.length },
    };
  }, [rows, apiStats]);

  // ── consumos ──
  const { growthYears, growthMax } = useMemo(() => {
    const years = Object.keys(cons.byYear).map(Number).sort((a, b) => a - b);
    const max = years.reduce((m, y) => Math.max(m, cons.byYear[y].n), 1);
    return { growthYears: years, growthMax: Math.max(max, 1) };
  }, [cons]);

  // edad promedio al abrir (sobre todos los consumos)
  const edadAlAbrir = useMemo(() => {
    let aw = 0, an = 0;
    growthYears.forEach(y => {
      cons.byYear[y].wines.forEach(w => {
        if (w.an) { aw += (y - w.an) * w.cant; an += w.cant; }
      });
    });
    return an ? fmtN(aw / an, 1) : null;
  }, [cons, growthYears]);

  // ── lista de botellas (deduplicada por vino+añada+formato) ──
  const presentFmts = useMemo(() => {
    const fmts = new Set<string>();
    rows.forEach(r => { const n = fmtName(ratioOf(r)); if (n) fmts.add(n); });
    return Array.from(fmts);
  }, [rows]);

  const filteredBase = useMemo(() => {
    const qL = q.trim().toLowerCase();
    return rows.filter(r => {
      if (tipo !== 'todos' && r.tipo !== tipo) return false;
      if (cepa !== 'todas') {
        if (cepa === '__otros__') { if (!cepaOtrosSet[r.cepa]) return false; }
        else if (r.cepa !== cepa) return false;
      }
      if (anada !== 'todas' && r.an !== +anada) return false;
      if (fmt !== 'todos' && fmtName(ratioOf(r)) !== fmt) return false;
      if (qL && !(r.vino + ' ' + r.bod).toLowerCase().includes(qL)) return false;
      return true;
    });
  }, [rows, tipo, cepa, anada, fmt, q, cepaOtrosSet]);

  // deduplicar por vino+añada+ratio (misma etiqueta, distintas compras)
  const filteredRows = useMemo(() => {
    const grouped = new Map<string, Wine & { qty: number; cons: number; consd: string[] }>();
    filteredBase.forEach(r => {
      const key = `${r.vino.toLowerCase()}|${r.an ?? 'nv'}|${Math.round(ratioOf(r) * 100)}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...r, qty: r.qty, cons: r.cons, consd: [...(r.consd || [])] });
      } else {
        const ex = grouped.get(key)!;
        ex.qty += r.qty;
        ex.cons += r.cons;
        ex.consd = [...ex.consd, ...(r.consd || [])];
      }
    });
    return Array.from(grouped.values())
      .sort((a, b) => (a.an ?? 9999) - (b.an ?? 9999) || a.vino.localeCompare(b.vino, 'es'));
  }, [filteredBase]);

  const countBot = filteredRows.reduce((s, r) => s + r.qty, 0);
  const activeFilters: [string, string][] = [];
  if (cepa !== 'todas') activeFilters.push(['cepa', cepa === '__otros__' ? 'Otras cepas' : cepa]);
  if (anada !== 'todas') activeFilters.push(['anada', 'Añada ' + anada]);
  if (fmt !== 'todos') activeFilters.push(['fmt', fmt]);
  if (tipo !== 'todos') activeFilters.push(['tipo', tipo]);

  function clearFilter(k: string) {
    if (k === 'cepa') setCepa('todas');
    else if (k === 'anada') setAnada('todas');
    else if (k === 'fmt') setFmt('todos');
    else if (k === 'tipo') setTipo('todos');
    setTimeout(() => listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function toggleItem(idx: number) {
    setOpenSet(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n; });
  }

  const owner = cava === 'grupal' ? 'del grupo' : 'cartera propia';

  // ── datos resumen para tarjetas ──
  const paisCount = useMemo(() => new Set(rows.map(r => r.pais)).size, [rows]);

  // Edad y añada promedio: los usan la tarjeta de Añadas del Inicio y el
  // destacado de la sección. Una sola cuenta, así nunca difieren.
  const edadGuarda = apiStats?.edadPromedioGuarda
    ?? (anadaStats.promedio ? Math.round((NOW - anadaStats.promedio) * 10) / 10 : null);
  const anadaProm = apiStats?.anadaPromedio ?? anadaStats.promedio;

  // ── render ──────────────────────────────────────────────────────
  // Cabecera: no es fija, se va con el scroll. En la página directa el
  // "volver al club" es la flecha de la izquierda, dentro del mismo header.
  const header = (
    <header className="tab-top">
      <div className="tab-top-in">
        {isStandalone && (
          <a href="/club" className="tab-back" aria-label="Volver al club">←</a>
        )}
        <svg className="crest"><use href="#crest" /></svg>
        <b>Club EDB</b>
        <span className="tsub">Cava real del club · así se verá tu propio tablero</span>
      </div>
    </header>
  );

  // ── Barra de sección (back + chips) ──
  // Sólo en las pantallas de "Mi cava": Inicio, Consumos y Compras se mueven
  // con la barra de abajo.
  const secBar = EN_MI_CAVA.has(section) && (
    <div className="sec-back-bar">
      <div className="sec-back-bar-in">
        <button className="sec-back-btn" onClick={goBack}>← Volver</button>
        <div className="sec-chipbar-wrap">
          <div className="sec-chipbar">
            {SECTIONS.map(s => (
              <button key={s.id} className={`sec-chip${section === s.id ? ' on' : ''}`}
                onClick={() => goSection(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="sec-chipbar-fade" />
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────
  // DATOS DE LAS TARJETAS DE "MI CAVA"
  // ─────────────────────────────────────────────────────────────────
  // Las 4 tarjetas de la grilla. Todos los números salen de /api/cava: el
  // número grande, la palabra al lado y el subtítulo.
  const SUM_CARDS = useMemo(() => {
    const base = [
      { id: 'cepas',     tema: 't-bordo',  etiqueta: 'Cepas y estilos' },
      { id: 'geografia', tema: 't-oliva',  etiqueta: 'Geografía'       },
      { id: 'anadas',    tema: 't-roble',  etiqueta: 'Añadas'          },
      { id: 'calidad',   tema: 't-dorado', etiqueta: 'Calidad'         },
    ] as const;

    if (cargando) return base.map(b => ({ ...b, num: '', palabra: '', sub: '' }));

    // El % es el del tipo con más botellas en guarda.
    const topTipo = apiStats?.tipoComposicion?.[0]
      ?? (tipoPie.items[0] && tipoPie.total
        ? { tipo: tipoPie.items[0][0], pct: Math.round(tipoPie.items[0][1] / tipoPie.total * 100) }
        : null);
    const vivino43 = apiStats?.vivinoAlto43Count;

    const datos = {
      cepas: {
        num: fmtN(apiStats?.cepasCount ?? stats.cepas), palabra: 'cepas',
        sub: topTipo ? `${fmtN(topTipo.pct)}% ${topTipo.tipo}s` : '—',
      },
      geografia: {
        num: fmtN(apiStats?.regionesCount ?? paisCount), palabra: 'regiones',
        sub: `${fmtN(apiStats?.bodegasCount ?? stats.bods)} bodegas de ${fmtN(apiStats?.paisesCount ?? paisCount)} países`,
      },
      anadas: {
        num: edadGuarda != null ? fmtN(edadGuarda, 1) : '—', palabra: 'edad prom.',
        sub: `añada promedio ${anadaProm ?? '—'}`,
      },
      calidad: {
        num: apiStats?.vivinoPromedio != null ? fmtN(apiStats.vivinoPromedio, 1) : '—',
        palabra: 'en Vivino',
        sub: vivino43 != null ? `${fmtN(vivino43)} con 4,3 o más` : '—',
      },
    } as Record<string, { num: string; palabra: string; sub: string }>;

    return base.map(b => ({ ...b, ...datos[b.id] }));
  }, [cargando, apiStats, stats, paisCount, anadaStats, tipoPie, edadGuarda, anadaProm]);

  const paisesCons = apiStats?.paisesConsumidasCount
    ?? (apiData?.geo ? Object.keys(apiData.geo.mundo.consumidas).length : null);
  const enGuardaTotal = apiStats?.enGuarda ?? stats.bot;
  const esGrupo = profile.tipo === 'grupo';
  const juntada = cava === 'grupal' ? apiData?.ultimaJuntada ?? null : null;
  const masTomada = cava === 'grupal' ? apiData?.masTomada ?? null : null;
  const ultimaCompra = cava === 'grupal' ? apiData?.ultimaCompra ?? null : null;
  const comprasMeses = (cava === 'grupal' ? apiData?.compras : null) ?? [];
  const otrasEntradas = (cava === 'grupal' ? apiData?.otrasEntradas : null) ?? [];
  const comprasTotal = comprasMeses.reduce((s, c) => s + c.botellas, 0);
  const primerConsumo = cava === 'grupal' ? apiData?.primerConsumo ?? null : null;

  // ── bloque "Mi cava": la grilla de 2×2 y el link a las botellas ──
  const bloqueMiCava = (
    <div className="bloque" data-bloque="cava">
      <div className="bloque-head">
        <h2 className="bloque-t">Mi cava</h2>
        {!cargando && (
          <span className="bloque-dato">
            {fmtN(enGuardaTotal)} en guarda · {fmtN(stats.etiquetas)} etiquetas
          </span>
        )}
      </div>
      <div className="sum-cards">
        {SUM_CARDS.map(c => (
          <button key={c.id} className={`sec-card ${c.tema}`} onClick={() => goSection(c.id)}>
            <span className="sec-card-label">{c.etiqueta}</span>
            {cargando ? (
              <>
                {/* mismo markup con el texto tapado: el alto no cambia al llegar los datos */}
                <div className="sec-card-big" aria-hidden="true">
                  <b className="sk-text">———</b> <span className="sk-text">en guarda</span>
                </div>
                <div className="sec-card-sub sk-text" aria-hidden="true">bodegas de países</div>
                <span className="visually-hidden">Cargando…</span>
              </>
            ) : (
              <>
                <div className="sec-card-big">
                  <b>{c.num}</b> <span>{c.palabra}</span>
                </div>
                <div className="sec-card-sub">{c.sub}</div>
              </>
            )}
            <span className="sec-card-pill">Ver ›</span>
          </button>
        ))}
      </div>
      <button className="link-botellas" onClick={() => goSection('botellas')}>
        <svg className="lb-ico" aria-hidden="true"><use href="#ic-botella" /></svg>
        <span className="lb-txt">
          Ver las {cargando ? <b className="sk-text">———</b> : fmtN(enGuardaTotal)} botellas
        </span>
        <span className="lb-chev" aria-hidden="true">›</span>
      </button>
    </div>
  );

  // ── bloque "Consumos" del Inicio ──
  const bloqueConsumos = (
    <div className="bloque" data-bloque="consumos">
      {/* sin título de bloque: la tarjeta de color es el título */}
      {cons.total > 0 && (
        <button className="sec-card sec-card-ancha t-rosado"
          onClick={() => goSection('consumos')}>
          <span className="sec-card-label">Consumos</span>
          <div className="sec-card-big"><b>{fmtN(cons.total)}</b> <span>abiertas</span></div>
          <div className="sec-card-sub">
            {[paisesCons != null ? `de ${fmtN(paisesCons)} países` : null,
              masTomada ? `${masTomada.cepa}, la más tomada` : null,
              primerConsumo ? `desde ${mesLargo(primerConsumo)}` : null]
              .filter(Boolean).join(' · ')}
          </div>
          <span className="sec-card-pill">Ver ›</span>
        </button>
      )}
      {juntada && (
        <TarjetaJuntada j={juntada} esGrupo={esGrupo}
          onVer={() => goSection('consumos', juntada.mes)} />
      )}
      <button className="btn-cargar" type="button" onClick={abrirCargar}>
        + Cargar consumo o botella
      </button>
    </div>
  );

  // ── bloque "Compras" del Inicio ──
  const bloqueCompras = (
    <div className="bloque" data-bloque="compras">
      {/* sin título de bloque: la tarjeta de color es el título */}
      {comprasTotal > 0 && (
        <button className="sec-card sec-card-ancha t-pizarra"
          onClick={() => goSection('compras')}>
          <span className="sec-card-label">Compras</span>
          <div className="sec-card-big">
            <b>{fmtN(comprasTotal)}</b> <span>{plural(comprasTotal, 'botella comprada', 'botellas compradas')}</span>
          </div>
          <div className="sec-card-sub">
            {ultimaCompra
              ? `última: ${mesLargo(ultimaCompra.mes)} · ${fmtN(ultimaCompra.botellas)} ${plural(ultimaCompra.botellas, 'botella', 'botellas')}`
              : '—'}
          </div>
          <span className="sec-card-pill">Ver ›</span>
        </button>
      )}
      <div className="tarjeta-clara compra-card"><BloqueMontos /></div>
    </div>
  );

  // ── el carrusel "El club en números" ──
  const graficos = useMemo<Grafico[]>(() => {
    const g: Grafico[] = [];
    g.push({
      id: 'evo', titulo: 'Evolución de la cava',
      nodo: (
        <>
          <h3>Evolución de la cava</h3>
          {apiStats?.evolution?.length
            ? <ResumenEvoChart evo={apiStats.evolution} />
            : <EvoCargando />}
        </>
      ),
    });
    const tramos = (cava === 'grupal' ? apiData?.tramosEdad : null) ?? [];
    const conAnada = tramos.reduce((s, t) => s + t.botellas, 0);
    const edad = apiStats?.edadPromedioGuarda ?? null;
    // los mini indicadores necesitan al menos dos cosechas distintas
    const cosechas = (apiStats?.anadasCount ?? 0) >= 2
      && apiStats?.anadaMin != null && apiStats?.anadaMax != null
      ? { min: apiStats.anadaMin, max: apiStats.anadaMax, cuantas: apiStats.anadasCount as number }
      : null;
    if (conAnada >= MIN_BOT_TRAMOS && edad != null) {
      g.push({
        id: 'edad', titulo: '¿Cuánto tiempo tiene tu cava?',
        nodo: (
          <>
            <h3>¿Cuánto tiempo tiene tu cava?</h3>
            <GraficoEdad edad={edad} tramos={tramos} cosechas={cosechas} />
          </>
        ),
      });
    }
    return g;
  }, [apiStats, apiData, cava]);

  // ── bloque "Valor de la cava" + nota al pie ──
  const bloqueValor = (
    <>
      <div className="lockcard valor-card">
        <div className="valor-card-head">
          <span className="valor-card-label">Valor de la cava</span>
          <button className="valor-card-pill" type="button" onClick={() => goSection('valor')}>
            Ver informe ›
          </button>
        </div>
        <div className="lock-cols">
          {/* "Valor de la cava" ya lo dice la etiqueta de arriba */}
          <div className="lock-col"><span>Valor estimado</span><b>USD ●●●●</b></div>
          <div className="lock-col"><span>Ahorro por precio club</span><b>USD ●●●●</b></div>
          <div className="lock-col"><span>Valor sumado por la guarda</span><b>USD ●●●●</b></div>
        </div>
        <div className="lock-foot">
          <svg className="lk"><use href="#lock" /></svg>
          <span>Disponible para miembros del club</span>
        </div>
      </div>
      <p className="tnote">Datos reales de la cava: inventario y consumos.</p>
    </>
  );

  // La barra de abajo marca "Mi cava" también desde sus pantallas internas.
  const navActivo = section === '' ? '' : (EN_MI_CAVA.has(section) ? 'cava' : section);
  const barra = <BarraApp activo={navActivo} ir={goSection} abrirCargar={abrirCargar} />;
  const panelCargar = cargarAbierto ? <PanelCargar onCerrar={cerrarCargar} /> : null;

  // ─────────────────────────────────────────────────────────────────
  // INICIO
  // ─────────────────────────────────────────────────────────────────
  if (!section) {
    return (
      <div className="club-root tablero-app" ref={rootRef} data-pantalla={section || 'inicio'}>
        {SVG_SYMBOLS}
        {header}

        <div className="inicio">
          {/* 1 — la ficha del grupo y el carrusel de gráficos */}
          <section className="banda banda-a" data-banda="1">
            <div className="banda-in">
              <div className="tperfil ficha-grupo">
                <div className="pf-av"><svg className="crest"><use href="#crest" /></svg></div>
                <div className="pf-main">
                  <div className="pf-name">
                    {profile.nombre}{profile.alias && <small>{profile.alias}</small>}
                  </div>
                  {/* cada ítem entero: en 390 px la línea parte entre ítems, nunca
                      en medio de "USD 50 por mes cada uno" */}
                  <div className="pf-meta">
                    {[
                      esGrupo ? 'Cava grupal' : 'Cartera individual',
                      profile.cuotaMensual
                        ? `${profile.cuotaMoneda ?? 'USD'} ${fmtN(profile.cuotaMensual)} por mes cada uno`
                        : null,
                      `Fundada ${profile.fundado}`,
                    ].filter(Boolean).map((item, i) => (
                      <span key={i} className="pf-item">{item}</span>
                    ))}
                  </div>
                  {esGrupo && profile.miembros > 0 && (
                    <div className="pf-miembros">
                      <span className="pf-circulos" aria-hidden="true"><i /><i /><i /></span>
                      <span className="pf-miembros-n">{fmtN(profile.miembros)} miembros</span>
                    </div>
                  )}
                </div>
              </div>

              <CarruselNumeros graficos={graficos} />
            </div>
          </section>

          {/* 2 — Mi cava */}
          <section className="banda banda-b" data-banda="2">
            <div className="banda-in">{bloqueMiCava}</div>
          </section>

          {/* 3 — Consumos */}
          <section className="banda banda-a" data-banda="3">
            <div className="banda-in">{bloqueConsumos}</div>
          </section>

          {/* 4 — Compras */}
          <section className="banda banda-b" data-banda="4">
            <div className="banda-in">{bloqueCompras}</div>
          </section>

          {/* 5 — Valor de la cava */}
          <section className="banda banda-a" data-banda="5">
            <div className="banda-in">{bloqueValor}</div>
          </section>
        </div>

        {barra}
        {panelCargar}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // VALOR DE LA CAVA (bloqueada en el demo)
  // ─────────────────────────────────────────────────────────────────
  if (section === 'valor') {
    const anios: number[] = [];
    for (let a = profile.fundado; a <= NOW; a++) anios.push(a);
    return (
      <div className="club-root tablero-app" ref={rootRef} data-pantalla="valor">
        {SVG_SYMBOLS}
        <PantallaValor enGuarda={enGuardaTotal} anios={anios}
          miembros={profile.miembros} onVolver={() => goSection('')} />
        {barra}
        {panelCargar}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // SECCIONES
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="club-root tablero-app" ref={rootRef} data-pantalla={section || 'inicio'}>
      {SVG_SYMBOLS}
      {header}
      {secBar}
      <div className="tshell">

        {/* ── MI CAVA ── */}
        {section === 'cava' && bloqueMiCava}

        {/* ── COMPRAS ── */}
        {section === 'compras' && (() => {
          const total = comprasMeses.reduce((s, c) => s + c.botellas, 0);
          const desde = comprasMeses.length ? comprasMeses[comprasMeses.length - 1].mes : null;
          const otrasTotal = otrasEntradas.reduce((s, c) => s + c.botellas, 0);
          return (
            <>
              {total > 0 && (
                <div className="sec-hero">
                  <div className="sec-hero-num">
                    {fmtN(total)} {plural(total, 'botella', 'botellas')}
                  </div>
                  <div className="sec-hero-text">
                    compradas por el club{desde ? ` desde ${mesLargo(desde)}` : ''}
                  </div>
                </div>
              )}

              <div className="tpanel"><BloqueMontos /></div>

              {comprasMeses.length > 0 && (
                <div className="tpanel">
                  <h3>Compras del club <span>tocá un mes para ver las etiquetas</span></h3>
                  <AcordeonMeses meses={comprasMeses} />
                </div>
              )}

              {otrasTotal > 0 && (
                <div className="tpanel" data-panel="otras">
                  <h3>
                    Regalos y aportes
                    <span>{fmtN(otrasTotal)} {plural(otrasTotal, 'botella', 'botellas')}</span>
                  </h3>
                  <AcordeonMeses meses={otrasEntradas} />
                </div>
              )}
            </>
          );
        })()}

        {/* ── CEPAS Y ESTILOS ── */}
        {section === 'cepas' && (() => {
          const C = apiData?.cepas;
          if (!C) return <div className="tpanel"><h3>Cepas y estilos</h3><p className="ahint">Cargando…</p></div>;

          const enGuarda = C.lista.filter(c => c.enGuarda > 0);
          const hayAbiertas = C.tipo.abiertas.total > 0;
          // ¿Se guarda o se toma?: mínimo de datos para que el bloque diga algo
          const conTotal = C.lista
            .map(c => ({ ...c, total: c.enGuarda + c.abiertas }))
            .filter(c => c.total > 0)
            .sort((a, b) => b.total - a.total);
          const mostrarEspejo = C.tipo.abiertas.total >= 5
            && conTotal.filter(c => c.total >= 3).length >= 2;
          const espejo = conTotal.slice(0, 10);

          const abrir = (nombre: string) => {
            setCepaSel(s => (s === nombre ? null : nombre));
          };
          const sel = cepaSel ? (C.lista.find(c => c.nombre === cepaSel) ?? null) : null;

          return (
            <>
              <div className="sec-hero">
                <div className="sec-hero-num">{fmtN(C.compradas)} cepas</div>
                <div className="sec-hero-text">
                  compradas{C.anioPrimeraCompra ? ` desde ${C.anioPrimeraCompra}` : ''}
                </div>
              </div>

              {/* indicadores */}
              <div className="cepa-kpis">
                <div className="cepa-kpi">
                  <b>{fmtN(C.enGuarda)}</b><span>Cepas en guarda</span>
                </div>
                {hayAbiertas && (
                  <div className="cepa-kpi">
                    <b>{fmtN(C.probadas)}</b><span>Cepas probadas</span>
                  </div>
                )}
                {C.masGuardada && (
                  <div className="cepa-kpi">
                    <b>{C.masGuardada.cepa}</b>
                    <span>La más guardada · {fmtN(C.masGuardada.botellas)}</span>
                  </div>
                )}
              </div>

              {/* tipo de vino: barras partidas */}
              {C.tipo.enGuarda.total > 0 && (
                <div className="tpanel">
                  <h3>Tipo de vino</h3>
                  <div className="bt-wrap">
                    <BarraTipo rotulo="En guarda" comp={C.tipo.enGuarda} />
                    {hayAbiertas && <BarraTipo rotulo="Abiertas" comp={C.tipo.abiertas} />}
                  </div>
                </div>
              )}

              {/* mosaico de cepas */}
              {enGuarda.length > 0 && (
                <div className="tpanel">
                  <h3>Cepas en guarda <span>tocá una para ver su ficha</span></h3>
                  <div className="mosaico" ref={mosaicoRef}
                    style={{ height: mosaicoAlto }}>
                    {mosaicoAncho > 0 && squarify(enGuarda, c => c.enGuarda, mosaicoAncho, mosaicoAlto)
                      .map(r => {
                        const t = rotuloMosaico(r.item.nombre, r.item.enGuarda, r.w, r.h);
                        return (
                          <button key={r.item.nombre}
                            className={`mos-rect${cepaSel === r.item.nombre ? ' on' : ''}`}
                            style={{
                              left: r.x, top: r.y, width: Math.max(0, r.w - 2), height: Math.max(0, r.h - 2),
                              background: r.item.color ?? COLOR_NEUTRO, color: textoSobre(r.item.color),
                            }}
                            data-cepa={r.item.nombre} data-qty={r.item.enGuarda}
                            onClick={() => abrir(r.item.nombre)}
                            title={`${r.item.nombre}: ${fmtN(r.item.enGuarda)}`}>
                            {t.nom && <span className="mos-nom">{t.nom}</span>}
                            {t.qty && <span className="mos-qty">{fmtN(r.item.enGuarda)}</span>}
                          </button>
                        );
                      })}
                  </div>

                  {/* cepas que no entraron con su nombre */}
                  {mosaicoChicas.length > 0 && (
                    <div className="mos-chicas">
                      <span>También:</span>
                      {mosaicoChicas.map((c, i) => (
                        <button key={c.nombre} className="mos-chica" onClick={() => abrir(c.nombre)}>
                          {c.nombre} <b>{fmtN(c.enGuarda)}</b>{i < mosaicoChicas.length - 1 ? ' ·' : ''}
                        </button>
                      ))}
                    </div>
                  )}

                  {sel && <FichaCepaPanel cepa={sel} onClose={() => setCepaSel(null)} />}
                </div>
              )}

              {/* ¿se guarda o se toma? */}
              {mostrarEspejo && (
                <div className="tpanel">
                  <h3>¿Se guarda o se toma?</h3>
                  <EspejoFilas nombres
                    filas={espejo.map(c => ({
                      clave: c.nombre, rotulo: c.nombre, ab: c.abiertas, gu: c.enGuarda, color: c.color ?? COLOR_NEUTRO,
                    }))} />
                </div>
              )}
            </>
          );
        })()}

        {/* ── GEOGRAFÍA ── */}
        {section === 'geografia' && (
          <>
            <div className="sec-hero">
              <div className="sec-hero-num">{fmtN(paisCount)} {paisCount === 1 ? 'país' : 'países'}</div>
              <div className="sec-hero-text">{fmtN(stats.bods)} bodegas en {fmtN(stats.bot)} botellas</div>
            </div>

            {/* mapas */}
            {cava === 'grupal' && apiData?.geo ? (
              <GeoPanel geo={apiData.geo} />
            ) : (
              <div className="tpanel"><div className="empty">Mapas disponibles solo para la cava grupal.</div></div>
            )}

            {/* regiones accordion */}
            {cava === 'grupal' && apiData?.regiones && apiData.regiones.length > 0 ? (
              <RegionesList regiones={apiData.regiones} />
            ) : cava === 'individual' && (() => {
              // compute client-side for individual
              const grpMap = new Map<string, { botellas: number; regMap: Map<string, { botellas: number; bodMap: Map<string, number> }> }>();
              rows.forEach(r => {
                const g = r.pais; const reg = r.reg || 'Sin región'; const bod = r.bod;
                if (!grpMap.has(g)) grpMap.set(g, { botellas: 0, regMap: new Map() });
                const gv = grpMap.get(g)!; gv.botellas += r.qty;
                if (!gv.regMap.has(reg)) gv.regMap.set(reg, { botellas: 0, bodMap: new Map() });
                const rv = gv.regMap.get(reg)!; rv.botellas += r.qty;
                rv.bodMap.set(bod, (rv.bodMap.get(bod) || 0) + r.qty);
              });
              const regs: RegionesGrupo[] = Array.from(grpMap.entries())
                .sort((a, b) => b[1].botellas - a[1].botellas)
                .map(([g, gv]) => ({
                  grupo: g, esArgentina: false, botellas: gv.botellas,
                  regiones: Array.from(gv.regMap.entries()).sort((a, b) => b[1].botellas - a[1].botellas)
                    .map(([reg, rv]) => ({
                      region: reg, botellas: rv.botellas,
                      bodegas: Array.from(rv.bodMap.entries()).sort((a, b) => b[1] - a[1])
                        .map(([bod, bot]) => ({ bodega: bod, botellas: bot }))
                    }))
                }));
              return regs.length > 0 ? <RegionesList regiones={regs} /> : null;
            })()}
          </>
        )}

        {/* ── AÑADAS ── */}
        {section === 'anadas' && (() => {
          const A = apiData?.anadas;
          if (!A) return <div className="tpanel"><h3>Añadas</h3><p className="ahint">Cargando…</p></div>;

          const botConAnada = A.enGuarda.reduce((s, x) => s + x.botellas, 0);
          const masAntigua = A.enGuarda[0]?.an ?? null;
          const top = anadaTop(A);
          const cajas = A.enGuarda.length >= 2 && masAntigua != null && top;

          const tramos = apiData?.tramosEdad ?? [];
          const verTramos = botConAnada >= MIN_BOT_TRAMOS && edadGuarda != null;

          const filasEsp = filasEspejo(A);
          const abiertasConAnada = A.abiertas.reduce((s, x) => s + x.botellas, 0);
          const verEspejo = abiertasConAnada >= MIN_ABIERTAS_ESPEJO && filasEsp.length >= 2;

          const mapa = mapaCalor(A);
          const verMapa = mapa.cepas >= MIN_CEPAS_MAPA && mapa.epocasConDatos >= 2;

          const sin = A.sinAnada.espumantes + A.sinAnada.otras;
          const partes = [
            A.sinAnada.espumantes > 0 ? `${fmtN(A.sinAnada.espumantes)} ${plural(A.sinAnada.espumantes, 'espumante', 'espumantes')}` : null,
            A.sinAnada.otras > 0 ? `${fmtN(A.sinAnada.otras)} por completar` : null,
          ].filter(Boolean).join(' y ');

          // la misma ficha que el listado de botellas, para una etiqueta (vino + añada)
          const fichaDe = (vino: string, an: number, botellas: number) => {
            const mias = rows.filter(r => r.vino === vino && r.an === an);
            const base = mias[0];
            const cons = mias.reduce((s, r) => s + r.cons, 0);
            const consd = mias.flatMap(r => r.consd || []);
            return (
              <div className="wdetail">
                <div className="dhead">
                  {fmtN(botellas)} en guarda{cons ? ' · ' + fmtN(cons) + ' ya consumida' + (cons !== 1 ? 's' : '') : ''} · {owner}
                </div>
                {base?.start && (
                  <div className="drow"><span className="dk">Ingresó</span><span className="dv">{ingreso(base)}</span></div>
                )}
                {base?.pais && (
                  <div className="drow"><span className="dk">País</span><span className="dv">{base.pais}</span></div>
                )}
                {cons > 0 && consd.length > 0 && (
                  <div className="drow">
                    <span className="dk">Consumidas</span>
                    <span className="dv">{[...new Set(consd)].join(' · ')}</span>
                  </div>
                )}
              </div>
            );
          };

          // panel de un año: todo lo que está en guarda de esa añada, salvo "Abiertas"
          const panelAnio = (y: number) => {
            const et = A.etiquetas.filter(e => e.an === y)
              .sort((a, b) => b.botellas - a.botellas || a.vino.localeCompare(b.vino, 'es'));
            const enGuarda = et.reduce((s, e) => s + e.botellas, 0);
            const abiertas = A.abiertas.find(x => x.an === y)?.botellas ?? 0;
            const porCepa = new Map<string, number>();
            et.forEach(e => porCepa.set(e.cepa, (porCepa.get(e.cepa) ?? 0) + e.botellas));
            const cepasOrd = [...porCepa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
            const bodegas = new Set(et.map(e => e.bodega)).size;
            const mejor = et.filter(e => e.vivino != null)
              .sort((a, b) => (b.vivino as number) - (a.vivino as number) || b.botellas - a.botellas)[0];
            const sub = [`${fmtN(NOW - y)} ${plural(NOW - y, 'año', 'años')}`,
              top && y === top.an ? 'la cosecha más guardada' : null,
              y === masAntigua ? 'la más antigua' : null].filter(Boolean).join(' · ');
            const lineas: React.ReactNode[] = [];
            if (mejor) lineas.push(<>Mejor puntaje Vivino: <b className="det-it">{fmtN(mejor.vivino as number, 1)}</b> · {mejor.vino}</>);
            if (cepasOrd.length) {
              const primeras = cepasOrd.slice(0, 4);
              lineas.push(
                <>
                  Cepas: {primeras.map(([c, n], i) => (
                    <Fragment key={c}>{i > 0 ? ' · ' : ''}<span className="det-it">{c} {fmtN(n)}</span></Fragment>
                  ))}
                  {cepasOrd.length > 4 && <> · <span className="det-it">{fmtN(cepasOrd.length - 4)} más</span></>}
                </>);
            }
            return (
              <PanelDetalle clave={String(y)} titulo={String(y)} subtitulo={sub}
                cajas={[
                  { n: fmtN(enGuarda), l: 'En guarda' },
                  { n: fmtN(abiertas), l: 'Abiertas' },
                  { n: fmtN(cepasOrd.length), l: 'Cepas' },
                  { n: fmtN(bodegas), l: 'Bodegas' },
                ]}
                lineas={lineas}
                etiquetas={et.map(e => ({ key: e.vino, vino: e.vino, bodega: e.bodega, botellas: e.botellas }))}
                ficha={e => fichaDe(e.vino, y, e.botellas)}
                onClose={() => setAnioSel(null)} />
            );
          };

          return (
            <div className="an-sec">
              {botConAnada > 0 && edadGuarda != null && (
                <div className="sec-hero">
                  <div className="sec-hero-num">{fmtN(edadGuarda, 1)} años</div>
                  <div className="sec-hero-text">edad promedio · añada promedio {anadaProm ?? '—'}</div>
                </div>
              )}

              {cajas && top && (
                <div className="cepa-kpis">
                  <div className="cepa-kpi"><b>{masAntigua}</b><span>La más antigua</span></div>
                  <div className="cepa-kpi"><b>{fmtN(A.enGuarda.length)}</b><span>Cosechas distintas</span></div>
                  <div className="cepa-kpi"><b>{top.an}</b><span>La más guardada · {fmtN(top.botellas)}</span></div>
                </div>
              )}

              {A.enGuarda.length > 0 && (
                <div className="tpanel">
                  <h3>Añadas en guarda, año por año <span>tocá un año</span></h3>
                  <AnadasBarras A={A} activa={anioSel}
                    onPick={y => setAnioSel(anioSel === y ? null : y)} />
                  {anioSel != null && panelAnio(anioSel)}
                </div>
              )}

              {verTramos && edadGuarda != null && (
                <div className="tpanel">
                  <h3>¿Cuánto tiempo tiene tu cava? <span>{fmtN(botConAnada)} con añada</span></h3>
                  <AnadasTramos tramos={tramos} />
                </div>
              )}

              {verEspejo && (
                <div className="tpanel">
                  <h3>¿Se guarda o se toma? <span>añadas agrupadas cada 5 años</span></h3>
                  <EspejoFilas filas={filasEsp.map(f => ({ ...f, clave: f.rotulo }))} />
                </div>
              )}

              {verMapa && (
                <div className="tpanel">
                  <h3>Cepas y épocas <span>en guarda</span></h3>
                  <AnadasMapa m={mapa} />
                </div>
              )}

              {A.veteranas.length > 0 && (
                <div className="tpanel">
                  <h3>Las veteranas <span>las más viejas en guarda</span></h3>
                  <Podio
                    items={A.veteranas.map(v => {
                      const edad = `${fmtN(NOW - v.anada)} ${plural(NOW - v.anada, 'año', 'años')}`;
                      const bot = `${fmtN(v.botellas)} ${plural(v.botellas, 'botella', 'botellas')}`;
                      return {
                        key: `${v.vino}|${v.anada}`, grande: String(v.anada), titulo: v.vino, sub: v.bodega,
                        meta: [edad, bot], filaSub: `${v.bodega} · ${bot}`, filaDer: `${v.anada} · ${edad}`,
                      };
                    })}
                    colores={PODIO_VETERANAS.colores} alturas={PODIO_VETERANAS.alturas}
                    abierto={vetAbierta}
                    onPick={k => setVetAbierta(vetAbierta === k ? null : k)}
                    ficha={k => {
                      const v = A.veteranas.find(x => `${x.vino}|${x.anada}` === k);
                      return v ? fichaDe(v.vino, v.anada, v.botellas) : null;
                    }} />
                </div>
              )}

              {sin > 0 && (
                <p className="ahint an-nota">
                  {fmtN(sin)} {plural(sin, 'botella', 'botellas')} sin añada{partes ? ` (${partes})` : ''}
                </p>
              )}
            </div>
          );
        })()}

        {/* ── CALIDAD ── */}
        {section === 'calidad' && (
          <>
            <div className="sec-hero">
              {apiStats?.pctVivinoAlto != null
                ? <><div className="sec-hero-num">{fmtN(apiStats.pctVivinoAlto)}%</div>
                  <div className="sec-hero-text">de la cava tiene Vivino 4,2 o más</div></>
                : <div className="sec-hero-num">Calidad</div>
              }
            </div>

            {(apiStats?.vivinoPromedio != null || apiStats?.pctVivinoAlto != null) && (
              <div className="tpanel">
                <h3>Vivino</h3>
                <div className="viv-panel-stats">
                  {apiStats.vivinoPromedio != null && (
                    <div className="viv-stat">
                      <div className="n" style={{ color: 'var(--burgundy)' }}>{fmtN(apiStats.vivinoPromedio, 2)}</div>
                      <div className="l">promedio ponderado</div>
                    </div>
                  )}
                  {apiStats.pctVivinoAlto != null && (
                    <div className="viv-stat">
                      <div className="n" style={{ color: 'var(--burgundy)' }}>{fmtN(apiStats.pctVivinoAlto)}<small>%</small></div>
                      <div className="l">botellas ≥ 4,2</div>
                    </div>
                  )}
                </div>
                {apiStats.top5Vivino.length > 0 && (
                  <>
                    <div className="viv-h4">Top 5 por puntaje</div>
                    <div className="viv-top5">
                      {apiStats.top5Vivino.map((w, i) => (
                        <div key={i} className="viv-row">
                          <div className="viv-row-score" style={{ color: 'var(--brass)' }}>{fmtN(w.vivino, 2)}</div>
                          <div className="viv-row-info">
                            <div className="viv-row-vino">
                              {w.vino}{w.an ? <span style={{ color: '#8a6f63' }}> {w.an}</span> : null}
                            </div>
                            <div className="viv-row-meta">{w.bod} · {fmtN(w.qty)} bot.</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Íconos */}
            <div className="tpanel">
              <h3>Íconos</h3>
              <div className="viv-panel-stats">
                <div className="viv-stat">
                  <div className="n" style={{ color: 'var(--burgundy)' }}>{fmtN(stats.pctIcono)}<small>%</small></div>
                  <div className="l">de la cava</div>
                </div>
              </div>
              <div className="tnote" style={{ marginTop: 10 }}>
                Un "Ícono" es un vino de máxima categoría de su bodega: reservas especiales, vinos de autor o de parcela única. En el tablero se marcan con <span className="icono-badge" style={{ verticalAlign: 'middle' }}>Ícono</span> en el listado.
              </div>
            </div>
          </>
        )}

        {/* ── CONSUMOS ── */}
        {section === 'consumos' && (
          <>
            <div className="sec-hero">
              <div className="sec-hero-num">{fmtN(cons.total)}</div>
              <div className="sec-hero-text">
                botellas abiertas{edadAlAbrir ? ` · edad prom. ${edadAlAbrir} años al abrir` : ''}
              </div>
            </div>

            {/* lo mismo que en el Inicio: la última juntada y el botón de carga */}
            {juntada && <TarjetaJuntada j={juntada} esGrupo={esGrupo} />}
            <button className="btn-cargar" type="button" onClick={abrirCargar}>
              + Cargar consumo o botella
            </button>

            {/* Evolución */}
            {apiStats?.evolution && apiStats.evolution.length > 0 && (
              <div className="tpanel">
                <h3>Evolución de la cava</h3>
                <div className="evo-grid">
                  {(() => {
                    const maxComp = Math.max(...apiStats.evolution!.map(x => x.compradas), 1);
                    return apiStats.evolution!.map((e, i) => {
                      const hTotal = Math.round(e.compradas / maxComp * 100);
                      const hAb = Math.round(e.abiertas / maxComp * 100);
                      const hG = Math.max(hTotal - hAb, 0);
                      const hFiller = 100 - hTotal;
                      return (
                        <div key={i} className="evo-col">
                          <div className="evo-bar-wrap">
                            {hFiller > 0 && <div className="evo-seg" style={{ height: hFiller + '%', background: 'transparent' }} />}
                            <div className="evo-seg evo-seg-ab" style={{ height: hAb + '%', minHeight: hAb > 0 ? 3 : 0 }} />
                            <div className="evo-seg evo-seg-guard" style={{ height: hG + '%', minHeight: hG > 0 ? 3 : 0 }} />
                          </div>
                          <div className="evo-label">{e.label}</div>
                          <div className="evo-val">{fmtN(e.compradas)}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="evo-legend">
                  <span className="evo-leg-item"><span className="evo-leg-sw" style={{ background: 'linear-gradient(to top, var(--burgundy), var(--claret))' }} />En guarda</span>
                  <span className="evo-leg-item"><span className="evo-leg-sw" style={{ background: 'rgba(87,22,34,.38)' }} />Abiertas</span>
                  <span className="evo-leg-item" style={{ color: '#8a6f63', fontStyle: 'italic' }}>número = total compradas</span>
                </div>
              </div>
            )}

            {/* Barras anuales */}
            <div className="tpanel">
              <h3>Botellas abiertas por año <span>tocá para ver el reporte</span></h3>
              {growthYears.length > 0 ? (
                <>
                  <div className="growth">
                    {growthYears.map(y => (
                      <GrowthCol key={y} year={y} n={cons.byYear[y].n}
                        max={growthMax} isCurrent={y === NOW}
                        onClick={() => setReport({ scope: y })} />
                    ))}
                  </div>
                  {growthYears.includes(NOW) && (
                    <div className="growth-note">* {NOW} · parcial hasta {CUR_MES}</div>
                  )}
                </>
              ) : (
                <div className="growth-note">Todavía sin consumos cargados.</div>
              )}
              {cons.total > 0 && (
                <button className="totbtn" onClick={() => setReport({ scope: 'total' })}>
                  Ver informe acumulado del club →
                </button>
              )}
            </div>
          </>
        )}

        {/* ── LAS BOTELLAS ── */}
        {section === 'botellas' && (
          <>
            <div className="sec-hero">
              <div className="sec-hero-num">{fmtN(stats.etiquetas)}</div>
              <div className="sec-hero-text">etiquetas en guarda · {fmtN(stats.bot)} botellas</div>
            </div>

            {/* búsqueda */}
            <div className="tsearch">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
              </svg>
              <input type="search" placeholder="Buscar vino o bodega" autoComplete="off"
                value={q} onChange={e => setQ(e.target.value)} />
            </div>

            {/* tipo chips */}
            <div className="chiprow">
              {(['todos','tinto','blanco','espumante'] as const).map(t => (
                <button key={t} className={'chip' + (tipo === t ? ' on' : '')}
                  onClick={() => setTipo(t)}>
                  {t !== 'todos' && <span className="dot" style={{ background: TIPO_COLOR[t] }} />}
                  {t === 'todos' ? 'Todos' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* fmt chips scrollable con fade */}
            {presentFmts.length > 0 && (
              <div className="chiprow-wrap">
                <div className="chiprow">
                  <button className={'chip' + (fmt === 'todos' ? ' on' : '')} onClick={() => setFmt('todos')}>
                    Todos los formatos
                  </button>
                  {presentFmts.map(f => (
                    <button key={f} className={'chip' + (fmt === f ? ' on' : '')} onClick={() => setFmt(f)}>{f}</button>
                  ))}
                </div>
                <div className="chiprow-fade" />
              </div>
            )}

            {/* filtros activos */}
            {activeFilters.length > 0 && (
              <div className="factive">
                <span className="fa-lbl">Filtrando:</span>
                {activeFilters.map(([k, label]) => (
                  <button key={k} className="fa" onClick={() => clearFilter(k)}>
                    {label}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18"/>
                    </svg>
                  </button>
                ))}
              </div>
            )}

            {/* count line */}
            {filteredRows.length > 0 && (
              <div className="countline">
                {fmtN(countBot)} botellas · {fmtN(filteredRows.length)} etiqueta{filteredRows.length !== 1 ? 's' : ''} · de la más vieja a la más nueva (N/V al final)
              </div>
            )}

            {/* anchor */}
            <div ref={listTopRef} />

            {/* lista */}
            <div className="wlist">
              {filteredRows.length === 0 ? (
                <div className="empty">No hay vinos con esos filtros.</div>
              ) : (
                filteredRows.map((r, idx) => {
                  const isOpen = openSet.has(idx);
                  const fname = fmtName(ratioOf(r));
                  const dhead = `${fmtN(r.qty)} en guarda${r.cons ? ' · ' + fmtN(r.cons) + ' ya consumida' + (r.cons !== 1 ? 's' : '') : ''} · ${owner}`;
                  return (
                    <div key={idx} className={'lbl' + (isOpen ? ' open' : '')}>
                      <button className="lbl-row" aria-expanded={isOpen} onClick={() => toggleItem(idx)}>
                        <svg className="gl"><use href={`#gl-${r.tipo || 'tinto'}`} /></svg>
                        <div className="lbl-mid">
                          <div className="v">
                            {r.vino}
                            {fname && <span className="fmtbadge">{fname}</span>}
                            {r.icono && <span className="icono-badge">Ícono</span>}
                          </div>
                          <div className="b">{r.bod} · {r.reg}</div>
                          <div className="vv">
                            {r.cepa}
                            {r.vivino != null && (
                              <span className="viv-score">{fmtN(r.vivino as number, 1)}</span>
                            )}
                          </div>
                        </div>
                        <div className="lbl-right">
                          <div className="yr">{r.an ?? 'N/V'}</div>
                          <div className="wqty">×{fmtN(r.qty)}</div>
                        </div>
                        <svg className="wcaret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M9 6l6 6-6 6"/>
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="wdetail">
                          <div className="dhead">{dhead}</div>
                          {r.start && (
                            <div className="drow"><span className="dk">Ingresó</span><span className="dv">{ingreso(r)}</span></div>
                          )}
                          {r.pais && (
                            <div className="drow"><span className="dk">País</span><span className="dv">{r.pais}</span></div>
                          )}
                          {r.cons > 0 && r.consd?.length > 0 && (
                            <div className="drow">
                              <span className="dk">Consumidas</span>
                              <span className="dv">{[...new Set(r.consd)].join(' · ')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <p className="tnote">
              Datos reales de la cava (inventario y consumos). En la cava del club todas las botellas son del grupo, sin dueños individuales.
            </p>
          </>
        )}
      </div>

      {barra}
      {panelCargar}

      {/* modal año */}
      {report && cons.total > 0 && (
        <YearReport cons={cons} scope={report.scope} onClose={() => setReport(null)} />
      )}
    </div>
  );
}
