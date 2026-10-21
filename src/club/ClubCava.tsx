import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { geoPath, geoNaturalEarth1, geoMercator } from 'd3-geo';
import { useLocation, useNavigate } from 'react-router';
import './club.css';
import './tablero.css';
import cavaRaw from './data/cava-001.json';
import { sumGuarda } from './data/cava-stats';

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
interface Perfil { nombre: string; alias: string; tipo: string; fundado: number; miembros: number; }
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
  vivinoAlto43Count: number | null;
  paisesConsumidasCount: number | null;
}
interface GeoLugar { botellas: number; vinos: { vino: string; an: number | null; qty: number }[]; }
type GeoTab = 'mundo' | 'argentina' | 'mendoza';
type GeoMode = 'enGuarda' | 'consumidas';
interface RegionesBodega { bodega: string; botellas: number; }
interface RegionesRegion { region: string; botellas: number; bodegas: RegionesBodega[]; }
interface RegionesGrupo { grupo: string; esArgentina: boolean; botellas: number; regiones: RegionesRegion[]; }
interface CavaApiResponse {
  error?: string;
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
}

const CAVA = cavaRaw as unknown as CavaData;

// ── constantes ─────────────────────────────────────────────────────
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESN  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const TIPO_COLOR: Record<string, string> = { tinto:'#6B1E2E', blanco:'#C8922A', espumante:'#D4B86A', rosado:'#C47A8A' };
const PIE_PALETTE = ['#6B1E2E','#8a2a34','#6d2440','#8C6A22','#3f1420','#b5485a','#c9a24a','#7a5a3a','#9c5a4a'];
const OTROS_COLOR = '#c2b2a3';
const FMT: Record<number, string> = { 2:'Magnum', 4:'Jeroboam', 6:'Imperial', 8:'Matusalén', 12:'Salmanazar', 16:'Balthazar' };
const NOW_DATE = new Date();
const NOW = NOW_DATE.getFullYear();
const CUR_MES = MESES[NOW_DATE.getMonth()];
const SECTIONS = [
  { id: 'cepas',     label: 'Cepas y estilos' },
  { id: 'geografia', label: 'Geografía'        },
  { id: 'anadas',    label: 'Añadas'           },
  { id: 'calidad',   label: 'Calidad'          },
  { id: 'consumos',  label: 'Consumos'         },
  { id: 'botellas',  label: 'Las botellas'     },
] as const;
type SectionId = typeof SECTIONS[number]['id'] | '';

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

    {/* ── ilustraciones de tarjetas (línea, se usan al 15% de opacidad) ── */}
    <symbol id="ill-cepas" viewBox="0 0 100 100">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
        <path d="M46 30 C34 12 14 15 12 29 C10 43 30 46 46 30 Z"/>
        <path d="M46 30 C58 16 76 19 78 31"/>
        <path d="M46 30 L46 42"/>
        <circle cx="38" cy="50" r="7"/><circle cx="54" cy="50" r="7"/>
        <circle cx="30" cy="63" r="7"/><circle cx="46" cy="63" r="7"/><circle cx="62" cy="63" r="7"/>
        <circle cx="38" cy="76" r="7"/><circle cx="54" cy="76" r="7"/>
        <circle cx="46" cy="89" r="7"/>
      </g>
    </symbol>
    {/* Contorno real de Argentina — generado con scripts/gen-ill-argentina.mjs
        a partir de public/geo/world.geojson */}
    <symbol id="ill-geo" viewBox="26 -2 48 104">
      <path d="M38.2,91.2L42.0,100.0L38.2,99.9ZM63.5,21.4L61.6,31.4L65.4,39.9L63.2,43.6L55.2,45.8L53.1,51.0L46.3,52.2L48.0,57.8L45.2,64.7L40.6,68.8L45.1,71.9L37.0,84.2L38.3,89.9L30.7,88.9L27.4,82.9L31.5,66.4L30.1,55.8L32.5,39.2L35.5,32.2L33.8,24.5L35.0,19.2L39.0,12.8L38.7,6.7L41.7,2.2L43.6,-0.0L51.8,1.0L56.1,5.1L63.1,8.3L61.2,13.4L66.1,14.4L70.3,9.8L72.6,12.8Z"
        fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </symbol>
    <symbol id="ill-anadas" viewBox="0 0 100 100">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
        <rect x="10" y="60" width="15" height="33"/>
        <rect x="31" y="42" width="15" height="51"/>
        <rect x="52" y="52" width="15" height="41"/>
        <rect x="73" y="25" width="15" height="68"/>
      </g>
    </symbol>
    <symbol id="ill-calidad" viewBox="0 0 100 100">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
        <path d="M50 8 L62 37 L93 39 L69 59 L77 90 L50 73 L23 90 L31 59 L7 39 L38 37 Z"/>
      </g>
    </symbol>
    <symbol id="ill-consumos" viewBox="0 0 100 100">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
        <path d="M27 10 L73 10 L69 43 C69 58 60 65 50 65 C40 65 31 58 31 43 Z"/>
        <path d="M50 65 L50 85"/>
        <path d="M31 90 C36 86 43 85 50 85 C57 85 64 86 69 90"/>
      </g>
    </symbol>
    <symbol id="ill-botellas" viewBox="0 0 100 100">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round">
        <path d="M2 16 L46 16 L54 21 L76 21 L76 35 L54 35 L46 40 L2 40 Z"/>
        <path d="M2 43 L46 43 L54 48 L76 48 L76 62 L54 62 L46 67 L2 67 Z"/>
        <path d="M2 70 L46 70 L54 75 L76 75 L76 89 L54 89 L46 94 L2 94 Z"/>
      </g>
    </symbol>
  </svg>
);

// ── DonutChart ─────────────────────────────────────────────────────
function DonutChart({ items, total, palette, size = 160, onClick }: {
  items: [string, number][];
  total: number;
  palette: string[];
  size?: number;
  onClick?: (key: string) => void;
}) {
  const cx = size / 2, cy = size / 2, r = size * 0.44, ri = size * 0.27;
  let a = 0;
  const slices = items.map((item, i) => {
    const frac = Math.max(item[1] / total, 0.001);
    const a1 = a + frac * 360;
    const d = svgSlice(cx, cy, r, a, a1);
    const col = item[0] === '__otros__' ? OTROS_COLOR : palette[i % palette.length];
    a = a1;
    return { d, col, key: item[0] };
  });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="tpie" style={{ cursor: onClick ? 'pointer' : 'default' }}>
      {slices.map(s => (
        <path key={s.key} d={s.d} fill={s.col} data-cepa={s.key}
          style={{ transition: 'opacity .12s' }}
          onClick={() => onClick?.(s.key)}
        />
      ))}
      <circle cx={cx} cy={cy} r={ri} fill="var(--parchment-2)" />
    </svg>
  );
}

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

// ── Componente principal ───────────────────────────────────────────
export default function ClubCava() {
  const location = useLocation();
  const navigate = useNavigate();
  // En /club/cava manda el hash de la URL. Embebido en el modal de /club, la
  // sección es estado interno: navegar el router desmontaría Club entero
  // (y con él, el modal).
  const isStandalone = location.pathname === '/club/cava';
  const rootRef = useRef<HTMLDivElement>(null);

  const hashSection: SectionId = useMemo(() => {
    const h = location.hash.replace('#', '').trim();
    if (SECTIONS.some(s => s.id === h)) return h as SectionId;
    return '';
  }, [location.hash]);

  const [embeddedSection, setEmbeddedSection] = useState<SectionId>('');
  const section: SectionId = isStandalone ? hashSection : embeddedSection;

  function goSection(s: SectionId) {
    if (isStandalone) navigate(`/club/cava${s ? '#' + s : ''}`, { replace: false });
    else setEmbeddedSection(s);
  }
  function goBack() { goSection(''); }

  // Al cambiar de sección, arriba de todo — pero del contenedor que realmente
  // scrollea, que dentro del modal no es la ventana.
  useEffect(() => { scrollToTop(rootRef.current); }, [section]);

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
  const [openOtrasExpanded, setOpenOtrasExpanded] = useState(false);
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
  const profile = CAVA.perfiles[cava];
  const apiStats: ApiStats | undefined = cava === 'grupal' ? apiData?.stats : undefined;

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
  const { tipoPie, cepaPie, cepaOtrosSet } = useMemo(() => {
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
    const { shown: cepaShown, otrosSet } = capN(cepaAll, 5);
    return {
      tipoPie: { items: tipoAll as [string, number][], total: totCepa },
      cepaPie: { items: cepaShown as [string, number][], total: totCepa, all: cepaAll as [string, number][] },
      cepaOtrosSet: otrosSet,
    };
  }, [rows]);

  // ── top cepas consumidas ──
  const topCepasConsumidasArr = useMemo(() => {
    const agg: Record<string, number> = {};
    Object.values(cons.byYear).forEach(yr => {
      yr.wines.forEach(w => { agg[w.cepa] = (agg[w.cepa] || 0) + w.cant; });
    });
    return Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][];
  }, [cons]);

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
  const topCepa = cepaPie.items[0];
  const topCepaPct = topCepa && topCepa[0] !== '__otros__'
    ? Math.round(topCepa[1] / cepaPie.total * 100)
    : null;
  const paisCount = useMemo(() => new Set(rows.map(r => r.pais)).size, [rows]);

  // ── render ──────────────────────────────────────────────────────
  const sectionLabel = SECTIONS.find(s => s.id === section)?.label ?? '';

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
  const secBar = section && (
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
  // RESUMEN
  // ─────────────────────────────────────────────────────────────────
  // Las 6 tarjetas del resumen. Todos los números salen de /api/cava: el
  // número grande, la palabra al lado y el subtítulo.
  const SUM_CARDS = useMemo(() => {
    const base = [
      { id: 'cepas',     tema: 't-bordo',   ill: 'ill-cepas',     etiqueta: 'Cepas y estilos' },
      { id: 'geografia', tema: 't-oliva',   ill: 'ill-geo',       etiqueta: 'Geografía'       },
      { id: 'anadas',    tema: 't-roble',   ill: 'ill-anadas',    etiqueta: 'Añadas'          },
      { id: 'calidad',   tema: 't-dorado',  ill: 'ill-calidad',   etiqueta: 'Calidad'         },
      { id: 'consumos',  tema: 't-rosado',  ill: 'ill-consumos',  etiqueta: 'Consumos'        },
      { id: 'botellas',  tema: 't-pizarra', ill: 'ill-botellas',  etiqueta: 'Las botellas'    },
    ] as const;

    if (cargando) return base.map(b => ({ ...b, num: '', palabra: '', sub: '' }));

    // El % es el del tipo con más botellas en guarda.
    const topTipo = apiStats?.tipoComposicion?.[0]
      ?? (tipoPie.items[0] && tipoPie.total
        ? { tipo: tipoPie.items[0][0], pct: Math.round(tipoPie.items[0][1] / tipoPie.total * 100) }
        : null);
    const paisesCons = apiStats?.paisesConsumidasCount
      ?? (apiData?.geo ? Object.keys(apiData.geo.mundo.consumidas).length : null);
    const edadGuarda = apiStats?.edadPromedioGuarda
      ?? (anadaStats.promedio ? Math.round((NOW - anadaStats.promedio) * 10) / 10 : null);
    const anadaProm = apiStats?.anadaPromedio ?? anadaStats.promedio;
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
        num: edadGuarda != null ? fmtN(edadGuarda, 1) : '—', palabra: 'años',
        sub: `añada promedio ${anadaProm ?? '—'}`,
      },
      calidad: {
        num: apiStats?.vivinoPromedio != null ? fmtN(apiStats.vivinoPromedio, 1) : '—',
        palabra: 'promedio Vivino.com',
        sub: vivino43 != null ? `${fmtN(vivino43)} botellas con 4,3 o más` : '—',
      },
      consumos: {
        num: fmtN(cons.total), palabra: 'abiertas',
        sub: paisesCons != null ? `de ${fmtN(paisesCons)} países distintos` : '—',
      },
      botellas: {
        num: fmtN(apiStats?.enGuarda ?? stats.bot), palabra: 'en guarda',
        sub: `${fmtN(stats.etiquetas)} etiquetas`,
      },
    } as Record<string, { num: string; palabra: string; sub: string }>;

    return base.map(b => ({ ...b, ...datos[b.id] }));
  }, [cargando, apiStats, apiData, stats, cons, paisCount, anadaStats, tipoPie]);

  if (!section) {
    return (
      <div className="club-root" ref={rootRef}>
        {SVG_SYMBOLS}
        {header}
        <div className="tshell">

          {/* perfil */}
          <div className="tperfil">
            <div className="pf-av"><svg className="crest"><use href="#crest" /></svg></div>
            <div className="pf-main">
              <div className="pf-name">
                {profile.nombre}{profile.alias && <small>{profile.alias}</small>}
              </div>
              <div className="pf-meta">
                {profile.tipo === 'grupo' ? `Cava grupal · ${profile.miembros} miembros` : 'Cartera individual'}
                {' · '}Fundada {profile.fundado}
              </div>
            </div>
          </div>

          {/* gráfico evolución — el recuadro sale de entrada con su alto final,
              así cuando llegan los datos nada se mueve */}
          <div className="tpanel">
            <h3>Evolución de la cava</h3>
            {apiStats?.evolution?.length
              ? <ResumenEvoChart evo={apiStats.evolution} />
              : <EvoCargando />}
          </div>

          {/* tarjetas de sección */}
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
                <svg className="sec-card-ill" aria-hidden="true"><use href={`#${c.ill}`} /></svg>
              </button>
            ))}
          </div>

          {/* lock card */}
          <div className="lockcard">
            <div className="lock-cols">
              <div className="lock-col"><span>Valor de la cava</span><b>USD ●●●●</b></div>
              <div className="lock-col"><span>Ahorro por precio club</span><b>USD ●●●●</b></div>
              <div className="lock-col"><span>Valor sumado por la guarda</span><b>USD ●●●●</b></div>
            </div>
            <div className="lock-foot">
              <svg className="lk"><use href="#lock" /></svg>
              <span>Disponible para miembros del club</span>
            </div>
          </div>

          <p className="tnote">Datos reales de la cava: inventario y consumos.</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // SECCIONES
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="club-root" ref={rootRef}>
      {SVG_SYMBOLS}
      {header}
      {secBar}
      <div className="tshell">

        {/* ── CEPAS Y ESTILOS ── */}
        {section === 'cepas' && (() => {
          const topC = cepaPie.items[0];
          const topCNm = topC && topC[0] !== '__otros__' ? topC[0] : null;
          const topCPct = topC ? Math.round(topC[1] / cepaPie.total * 100) : 0;
          const otrasItems = cepaPie.all.slice(5);

          return (
            <>
              <div className="sec-hero">
                {topCNm
                  ? <><div className="sec-hero-num">{topCPct}%</div>
                    <div className="sec-hero-text">El {topCNm} domina la cava</div></>
                  : <div className="sec-hero-num">Cepas y estilos</div>
                }
              </div>

              {/* Donut por tipo */}
              {tipoPie.items.length > 0 && (
                <div className="tpanel">
                  <h3>Por tipo de vino</h3>
                  <div className="pieblock">
                    <DonutChart
                      items={tipoPie.items}
                      total={tipoPie.total}
                      palette={tipoPie.items.map(([t]) => TIPO_COLOR[t] ?? '#8a6f63')}
                    />
                    <div className="tlegend">
                      {tipoPie.items.map(([t, v]) => {
                        const pct = Math.round(v / tipoPie.total * 100);
                        const col = TIPO_COLOR[t] ?? '#8a6f63';
                        return (
                          <div key={t} className="lg" style={{ cursor: 'default' }}>
                            <span className="sw" style={{ background: col }} />
                            <span className="nm">{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                            <span className="qt">{fmtN(v)} · {pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Donut por cepa */}
              <div className="tpanel">
                <h3>Cepas <span>tocá una para ver esos vinos</span></h3>
                <div className="pieblock">
                  <DonutChart
                    items={cepaPie.items}
                    total={cepaPie.total}
                    palette={PIE_PALETTE}
                    onClick={key => {
                      if (key === '__otros__' && !openOtrasExpanded) { setOpenOtrasExpanded(true); return; }
                      setCepa(key); goSection('botellas');
                    }}
                  />
                  <div className="tlegend">
                    {cepaPie.items.map((item, i) => {
                      const pct = Math.round(item[1] / cepaPie.total * 100);
                      const nm = item[0] === '__otros__' ? 'Otras' : item[0];
                      const col = item[0] === '__otros__' ? OTROS_COLOR : PIE_PALETTE[i % PIE_PALETTE.length];
                      return (
                        <button key={item[0]} className="lg" onClick={() => {
                          if (item[0] === '__otros__') { setOpenOtrasExpanded(e => !e); return; }
                          setCepa(item[0]); goSection('botellas');
                        }}>
                          <span className="sw" style={{ background: col }} />
                          <span className="nm">{nm}</span>
                          <span className="qt">{fmtN(item[1])} · {pct}%</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* lista expandible de "Otras" */}
                {openOtrasExpanded && otrasItems.length > 0 && (
                  <div className="otras-list">
                    {otrasItems.map(([c, v]) => (
                      <button key={c} className="otras-item" onClick={() => { setCepa(c); goSection('botellas'); }}>
                        <span>{c}</span><span className="otras-qty">{fmtN(v)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Top cepas consumidas */}
              {topCepasConsumidasArr.length > 0 && (
                <div className="tpanel">
                  <h3>Cepas más tomadas</h3>
                  <div className="rbars">
                    {topCepasConsumidasArr.map(([k, v]) => (
                      <BarItem key={k} label={k} count={v} max={topCepasConsumidasArr[0][1]} />
                    ))}
                  </div>
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
        {section === 'anadas' && (
          <>
            <div className="sec-hero">
              {anadaStats.promedio
                ? <><div className="sec-hero-num">{anadaStats.promedio}</div>
                  <div className="sec-hero-text">Añada promedio de la cava</div></>
                : <div className="sec-hero-num">Añadas</div>
              }
            </div>

            <div className="tpanel">
              <h3>Añadas en guarda <span>tocá un año para ver esos vinos</span></h3>
              <div className="astrip">
                {anadaItems.map(([y, v]) => (
                  <AnadaCol
                    key={y} year={y} count={v} max={anadaMax}
                    active={anada !== 'todas' && +anada === y}
                    isCurrent={y === NOW}
                    onClick={() => {
                      const next = anada !== 'todas' && +anada === y ? 'todas' : String(y);
                      setAnada(next);
                      goSection('botellas');
                    }}
                  />
                ))}
              </div>
              {NOW in Object.fromEntries(anadaItems) && (
                <div className="ahint" style={{ marginTop: 4 }}>* {NOW} · parcial hasta {CUR_MES}</div>
              )}
              {anadaStats.min && anadaStats.promedio && (
                <div className="ahint">
                  De {anadaStats.min} a {Math.max(...anadaItems.map(([y]) => y))} · {anadaStats.count} cosechas · añada promedio {anadaStats.promedio}
                </div>
              )}
            </div>
          </>
        )}

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

      {/* modal año */}
      {report && cons.total > 0 && (
        <YearReport cons={cons} scope={report.scope} onClose={() => setReport(null)} />
      )}
    </div>
  );
}
