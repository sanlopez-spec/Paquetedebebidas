import { useState, useMemo, useRef, useEffect } from 'react';
import './club.css';
import './tablero.css';
import cavaRaw from './data/cava-001.json';

// ---- types ----
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
const CAVA = cavaRaw as unknown as CavaData;

// ---- constants ----
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const MESN  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const TIPO_COLOR: Record<string, string> = { tinto: "#6b1622", blanco: "#d8b24a", espumante: "#ecd98a" };
const PIE_PALETTE = ["#571622","#8a2a34","#6d2440","#a9843c","#3f1420","#b5485a","#c9a24a","#7a5a3a","#9c5a4a"];
const OTROS_COLOR = "#c2b2a3";
const FMT: Record<number, string> = { 2:"Magnum", 4:"Jeroboam", 6:"Imperial", 8:"Matusalén", 12:"Salmanazar", 16:"Balthazar" };

// ---- helpers ----
function ratioOf(r: Wine) { return r.eq / r.qty; }
function fmtName(ratio: number): string {
  if (ratio < 1.75) return '';
  const k = Math.round(ratio);
  if (FMT[k]) return FMT[k];
  const L = Math.round(ratio * 0.75 * 100) / 100;
  return String(L).replace('.', ',') + ' L';
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

// ---- SVG symbols (shared across renders) ----
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
    <symbol id="x-icon" viewBox="0 0 24 24">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
    </symbol>
  </svg>
);

// ---- sub-components ----

function BarItem({ label, count, max, dataKey, dataVal, onClick }: {
  label: string; count: number; max: number;
  dataKey?: string; dataVal?: string; onClick?: () => void;
}) {
  const w = Math.round(count / max * 100);
  return (
    <button className="rbar" onClick={onClick} style={!onClick ? { cursor: 'default' } : undefined}>
      <div className="rb-top"><span>{label}</span><b>{count}</b></div>
      <div className="track"><div className="fill" style={{ width: w + '%' }} /></div>
    </button>
  );
}

function AnadaCol({ year, count, max, active, onClick }: {
  year: number; count: number; max: number; active: boolean; onClick: () => void;
}) {
  const h = Math.round(count / max * 100);
  return (
    <button className={'acol' + (active ? ' on' : '')} onClick={onClick}>
      <div className="av">{count}</div>
      <div className="abar" style={{ height: h + '%' }} />
      <div className="ay">'{String(year).slice(2)}</div>
    </button>
  );
}

function GrowthCol({ year, n, max, onClick }: {
  year: number; n: number; max: number; onClick: () => void;
}) {
  const H = Math.round(n / max * 100);
  return (
    <div className="gcol" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="gv">{n}</div>
      <div className="gstack" style={{ height: H + '%' }}>
        <div className="gseg" style={{ height: '100%' }} />
      </div>
      <div className="gy">'{String(year).slice(2)}</div>
    </div>
  );
}

// ---- year report modal ----
interface ReportState { scope: number | 'total'; }

function YearReport({ cons, scope, onClose }: {
  cons: ConsData; scope: number | 'total'; onClose: () => void;
}) {
  const [bodN, setBodN] = useState(8);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.scrollTo(0, 0);
    setBodN(8);
  }, [scope]);

  const isTotal = scope === 'total';
  const years = Object.keys(cons.byYear).map(Number).sort((a, b) => a - b);

  const wines: (ConsWine & { cy: number })[] = useMemo(() => {
    if (isTotal) {
      return years.flatMap(y => cons.byYear[y].wines.map(w => ({ ...w, cy: y })));
    }
    const yr = cons.byYear[scope as number];
    return yr ? yr.wines.map(w => ({ ...w, cy: scope as number })) : [];
  }, [scope]);

  const nbot = isTotal ? cons.total : (cons.byYear[scope as number]?.n ?? 0);
  const njun = isTotal ? cons.juntadas : (cons.byYear[scope as number]?.juntadas ?? 0);

  const { cepas, paises, anAgg, edad, oldest, newest, avgAn } = useMemo(() => {
    const cepas: Record<string, number> = {};
    const paises: Record<string, boolean> = {};
    const anAgg: Record<number, number> = {};
    let ageW = 0, ageN = 0, anW = 0, oldest = 9999, newest = 0;
    wines.forEach(w => {
      cepas[w.cepa] = (cepas[w.cepa] || 0) + w.cant;
      paises[w.pais] = true;
      if (w.an) {
        anAgg[w.an] = (anAgg[w.an] || 0) + w.cant;
        ageW += (w.cy - w.an) * w.cant; ageN += w.cant;
        anW += w.an * w.cant;
        if (w.an < oldest) oldest = w.an;
        if (w.an > newest) newest = w.an;
      }
    });
    const edad = ageN ? (ageW / ageN).toFixed(1) : '—';
    const avgAn = ageN ? Math.round(anW / ageN) : null;
    return { cepas, paises, anAgg, edad, oldest: oldest < 9999 ? oldest : null, newest: newest > 0 ? newest : null, avgAn };
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

  const title = isTotal ? 'Informe acumulado' : `Consumo ${scope}`;
  const subtitle = `${nbot} botellas abiertas · ${njun} juntada${njun !== 1 ? 's' : ''}${isTotal ? ' · ' + years.length + ' años' : ''}`;

  return (
    <div className="ymodal on" aria-hidden="false">
      <div className="ym-back" onClick={onClose} />
      <div className="ym-card" role="dialog" aria-modal="true" ref={cardRef}>
        <button className="ym-close" onClick={onClose} aria-label="Cerrar">✕</button>
        <div className="ym-title">{title}</div>
        <div className="ym-sub">{subtitle}</div>

        <div className="ym-stats">
          <div className="st"><div className="n">{nbot}</div><div className="l">botellas</div></div>
          <div className="st"><div className="n">{edad} <small>años</small></div><div className="l">edad prom. al abrir</div></div>
          <div className="st"><div className="n">{Object.keys(cepas).length}</div><div className="l">cepas</div></div>
          <div className="st"><div className="n">{Object.keys(paises).length}</div><div className="l">países</div></div>
        </div>

        {anYears.length > 0 && (
          <div className="ym-sec">
            <h4>Añadas abiertas</h4>
            <div className="astrip">
              {anYears.map(y => (
                <div key={y} className="acol" style={{ cursor: 'default' }}>
                  <div className="av">{anAgg[y]}</div>
                  <div className="abar" style={{ height: Math.round(anAgg[y] / amax * 100) + '%' }} />
                  <div className="ay">'{String(y).slice(2)}</div>
                </div>
              ))}
            </div>
            {oldest && newest && avgAn && (
              <div className="ahint">De la añada {oldest} a la {newest} · añada promedio {avgAn}</div>
            )}
          </div>
        )}

        {cepaArr.length > 0 && (
          <div className="ym-sec">
            <h4>Cepas abiertas</h4>
            <div className="rbars">
              {cepaArr.map(([k, v]) => (
                <div key={k} className="rbar" style={{ cursor: 'default' }}>
                  <div className="rb-top"><span>{k}</span><b>{v}</b></div>
                  <div className="track"><div className="fill" style={{ width: Math.round(v / cepaMax * 100) + '%' }} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {bodArr.length > 0 && (
          <div className="ym-sec">
            <h4>Bodegas abiertas</h4>
            <div className="rbars">
              {bodArr.slice(0, bodN).map(([k, v]) => (
                <div key={k} className="rbar" style={{ cursor: 'default' }}>
                  <div className="rb-top"><span>{k}</span><b>{v}</b></div>
                  <div className="track"><div className="fill" style={{ width: Math.round(v / bodArr[0][1] * 100) + '%' }} /></div>
                </div>
              ))}
            </div>
            {bodArr.length > bodN && (
              <button className="morebtn" onClick={() => setBodN(n => n + 5)}>
                {bodArr.length - bodN > 5 ? 'Mostrar 5 bodegas más' : `Mostrar las últimas ${bodArr.length - bodN}`}
              </button>
            )}
            {bodArr.length <= bodN && bodArr.length > 8 && (
              <button className="morebtn" onClick={() => setBodN(8)}>Mostrar menos</button>
            )}
          </div>
        )}

        <div className="ym-sec">
          <h4>{isTotal ? 'Por año' : 'Las juntadas del año'}</h4>
          {isTotal ? (
            years.map(y => {
              const d = cons.byYear[y];
              return (
                <div key={y} className="ym-junta">
                  <div className="jh">{y} · {d.n} botellas · {d.juntadas} juntada{d.juntadas !== 1 ? 's' : ''}</div>
                  {d.wines.slice().sort((a, b) => a.mes - b.mes).map((w, i) => (
                    <div key={i} className="ym-w">
                      <svg className="gl"><use href={`#gl-${w.tipo}`} /></svg>
                      <div className="wmid">
                        <div className="wv">{w.vino}{w.cant > 1 && <span style={{ color: '#8a6f63' }}> ×{w.cant}</span>}</div>
                        <div className="wb">{w.bod} · {w.reg} · {w.cepa}</div>
                      </div>
                      <div className="wy">{w.an || ''}</div>
                    </div>
                  ))}
                </div>
              );
            })
          ) : (() => {
            const byM: Record<number, ConsWine[]> = {};
            wines.forEach(w => { (byM[w.mes] = byM[w.mes] || []).push(w); });
            const meses = Object.keys(byM).map(Number).sort((a, b) => a - b);
            return meses.map(m => {
              const ws = byM[m];
              const n = ws.reduce((s, w) => s + w.cant, 0);
              return (
                <div key={m} className="ym-junta">
                  <div className="jh">Juntada de {MESN[m]} · {n} botella{n !== 1 ? 's' : ''}</div>
                  {ws.map((w, i) => (
                    <div key={i} className="ym-w">
                      <svg className="gl"><use href={`#gl-${w.tipo}`} /></svg>
                      <div className="wmid">
                        <div className="wv">{w.vino}{w.cant > 1 && <span style={{ color: '#8a6f63' }}> ×{w.cant}</span>}</div>
                        <div className="wb">{w.bod} · {w.reg} · {w.cepa}</div>
                      </div>
                      <div className="wy">{w.an || ''}</div>
                    </div>
                  ))}
                </div>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}

// ---- main component ----
export default function ClubCava() {
  type CavaPick = 'grupal' | 'individual';
  const [cava, setCava] = useState<CavaPick>('grupal');
  const [tipo, setTipo] = useState('todos');
  const [pais, setPais] = useState('todos');
  const [bodega, setBodega] = useState('todos');
  const [region, setRegion] = useState('todas');
  const [cepa, setCepa] = useState('todas');
  const [anada, setAnada] = useState('todas');
  const [fmt, setFmt] = useState('todos');
  const [q, setQ] = useState('');
  const [bodN, setBodN] = useState(8);
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<ReportState | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);

  const NOW = new Date().getFullYear();
  const rows = CAVA.data[cava] as Wine[];
  const cons = CAVA.cons[cava];
  const profile = CAVA.perfiles[cava];

  function switchCava(k: CavaPick) {
    setCava(k);
    setTipo('todos'); setPais('todos'); setBodega('todos');
    setRegion('todas'); setCepa('todas'); setAnada('todas');
    setFmt('todos'); setQ(''); setBodN(8); setOpenSet(new Set());
  }

  // ---- stats (whole cava, no filters) ----
  const stats = useMemo(() => {
    let bot = 0, eqt = 0, tw = 0, twn = 0;
    const bods = new Set<string>(), cepas = new Set<string>();
    rows.forEach(r => {
      bot += r.qty; eqt += r.eq;
      bods.add(r.bod); cepas.add(r.cepa);
      if (r.an) { tw += (NOW - r.an) * r.qty; twn += r.qty; }
    });
    const edad = twn ? (tw / twn).toFixed(1) : '—';
    return { bot, eqt, bods: bods.size, cepas: cepas.size, edad };
  }, [cava]);

  // ---- pie data (whole cava) ----
  const { pieItems, pieTotal, pieOtrosSet } = useMemo(() => {
    const agg: Record<string, number> = {};
    let tot = 0;
    rows.forEach(r => { agg[r.cepa] = (agg[r.cepa] || 0) + r.qty; tot += r.qty; });
    const all = Object.entries(agg).sort((a, b) => b[1] - a[1]) as [string, number][];
    const { shown, otrosSet } = capN(all, 9);
    return { pieItems: shown, pieTotal: tot, pieOtrosSet: otrosSet };
  }, [cava]);

  // ---- bar data (whole cava) ----
  const { bodArr, paisArr, regArr, paisOtrosSet, regOtrosSet } = useMemo(() => {
    const bodAgg: Record<string, number> = {};
    const paisAgg: Record<string, number> = {};
    const regAgg: Record<string, number> = {};
    rows.forEach(r => {
      bodAgg[r.bod] = (bodAgg[r.bod] || 0) + r.qty;
      paisAgg[r.pais] = (paisAgg[r.pais] || 0) + r.qty;
      if (r.pais === 'Argentina') regAgg[r.reg] = (regAgg[r.reg] || 0) + r.qty;
    });
    const bod = (Object.entries(bodAgg).sort((a, b) => b[1] - a[1])) as [string, number][];
    const paisRaw = (Object.entries(paisAgg).sort((a, b) => b[1] - a[1])) as [string, number][];
    const regRaw = (Object.entries(regAgg).sort((a, b) => b[1] - a[1])) as [string, number][];
    const { shown: pais, otrosSet: pOtros } = capN(paisRaw, 9);
    const { shown: reg, otrosSet: rOtros } = capN(regRaw, 9);
    return { bodArr: bod, paisArr: pais, regArr: reg, paisOtrosSet: pOtros, regOtrosSet: rOtros };
  }, [cava]);

  // ---- consumos ----
  const { growthYears, growthMax, movNote } = useMemo(() => {
    const years = Object.keys(cons.byYear).map(Number).sort((a, b) => a - b);
    const max = years.reduce((m, y) => Math.max(m, cons.byYear[y].n), 1);
    let aw = 0, an = 0;
    years.forEach(y => {
      cons.byYear[y].wines.forEach(w => {
        if (w.an) { aw += (y - w.an) * w.cant; an += w.cant; }
      });
    });
    const edad = an ? (aw / an).toFixed(1) : null;
    const note = cons.total
      ? `${cons.total} botellas abiertas en ${cons.juntadas} juntadas${edad ? ' · edad promedio al abrir ' + edad + ' años' : ''}. Tocá un año para ver el reporte.`
      : '';
    return { growthYears: years, growthMax: max, movNote: note };
  }, [cava]);

  // ---- añadas ----
  const { anadaItems, anadaMax, anadaHint } = useMemo(() => {
    const agg: Record<number, number> = {};
    rows.forEach(r => { if (r.an) agg[r.an] = (agg[r.an] || 0) + r.qty; });
    const years = Object.keys(agg).map(Number).sort((a, b) => a - b);
    const max = years.reduce((m, y) => Math.max(m, agg[y]), 1);
    const hint = years.length ? `De ${years[0]} a ${years[years.length - 1]} · ${years.length} cosechas en la cava.` : '';
    return { anadaItems: years.map(y => [y, agg[y]] as [number, number]), anadaMax: max, anadaHint: hint };
  }, [cava]);

  // ---- fmt chips (present formats only) ----
  const presentFmts = useMemo(() => {
    const fmts = new Set<string>();
    rows.forEach(r => { const n = fmtName(ratioOf(r)); if (n) fmts.add(n); });
    return Array.from(fmts);
  }, [cava]);

  // ---- filtered list ----
  const filteredRows = useMemo(() => {
    const qL = q.trim().toLowerCase();
    return rows.filter(r => {
      if (tipo !== 'todos' && r.tipo !== tipo) return false;
      if (pais !== 'todos') {
        if (pais === '__otros__') { if (!paisOtrosSet[r.pais]) return false; }
        else if (r.pais !== pais) return false;
      }
      if (bodega !== 'todos' && r.bod !== bodega) return false;
      if (region !== 'todas') {
        if (region === '__otros__') { if (!regOtrosSet[r.reg]) return false; }
        else if (r.reg !== region) return false;
      }
      if (cepa !== 'todas') {
        if (cepa === '__otros__') { if (!pieOtrosSet[r.cepa]) return false; }
        else if (r.cepa !== cepa) return false;
      }
      if (anada !== 'todas' && r.an !== +anada) return false;
      if (fmt !== 'todos' && fmtName(ratioOf(r)) !== fmt) return false;
      if (qL && !(r.vino + ' ' + r.bod).toLowerCase().includes(qL)) return false;
      return true;
    }).sort((a, b) => (a.an ?? 0) - (b.an ?? 0) || a.vino.localeCompare(b.vino, 'es'));
  }, [cava, tipo, pais, bodega, region, cepa, anada, fmt, q]);

  // active filters
  const activeFilters: [string, string][] = [];
  if (cepa !== 'todas') activeFilters.push(['cepa', cepa === '__otros__' ? 'Otras cepas' : cepa]);
  if (bodega !== 'todos') activeFilters.push(['bodega', bodega]);
  if (pais !== 'todos') activeFilters.push(['pais', pais === '__otros__' ? 'Otros países' : pais]);
  if (region !== 'todas') activeFilters.push(['region', region === '__otros__' ? 'Otras regiones' : region]);
  if (anada !== 'todas') activeFilters.push(['anada', 'Añada ' + anada]);
  if (fmt !== 'todos') activeFilters.push(['fmt', fmt]);

  function clearFilter(k: string) {
    if (k === 'cepa') setCepa('todas');
    else if (k === 'bodega') setBodega('todos');
    else if (k === 'pais') setPais('todos');
    else if (k === 'region') setRegion('todas');
    else if (k === 'anada') setAnada('todas');
    else if (k === 'fmt') setFmt('todos');
    setTimeout(() => listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function drill(setter: () => void) {
    setter();
    setTimeout(() => listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function toggleItem(idx: number) {
    setOpenSet(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function jumpTo(vino: string) {
    setQ(vino); setCepa('todas'); setRegion('todas'); setPais('todos'); setAnada('todas'); setFmt('todos');
    setTimeout(() => listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  const countBot = filteredRows.reduce((s, r) => s + r.qty, 0);
  const countLine = filteredRows.length
    ? `${filteredRows.length} etiqueta${filteredRows.length !== 1 ? 's' : ''} · ${countBot} botella${countBot !== 1 ? 's' : ''} · de la más vieja a la más nueva`
    : '';

  const owner = cava === 'grupal' ? 'del grupo' : 'cartera propia';

  // ---- pie SVG ----
  let piePaths = '';
  let a = 0;
  pieItems.forEach((item, i) => {
    const frac = item[1] / pieTotal;
    const a1 = a + frac * 360;
    const col = item[0] === '__otros__' ? OTROS_COLOR : PIE_PALETTE[i % PIE_PALETTE.length];
    piePaths += `<path d="${svgSlice(100, 100, 90, a, a1)}" fill="${col}" data-cepa="${item[0]}" style="cursor:pointer;transition:opacity .12s" />`;
    a = a1;
  });
  piePaths += '<circle class="hole" cx="100" cy="100" r="52" />';
  piePaths += `<text class="ctr" x="100" y="94" font-size="30">${pieTotal}</text>`;
  piePaths += '<text class="ctr" x="100" y="112" font-size="11" fill="#8a6f63" font-family="Archivo">botellas</text>';

  const bodShown = bodArr.slice(0, bodN);
  const bodMax = bodArr.length ? bodArr[0][1] : 1;

  return (
    <div className="club-root">
      {SVG_SYMBOLS}

      {/* sticky header */}
      <header className="stickyhead">
        <div className="demoband">
          Este es un modelo de tablero de una cava real de nuestro club — así vas a ver tu colección organizada.
        </div>
        <div className="tab-top">
          <div className="tab-top-in">
            <svg className="crest"><use href="#crest" /></svg>
            <b>Club EDB</b>
            <span className="tsub">Tu cava, en tiempo real</span>
          </div>
        </div>
      </header>

      <div className="tshell">
        {/* cava picker */}
        <div className="cavapick">
          <button className={cava === 'grupal' ? 'on' : ''} onClick={() => switchCava('grupal')}>
            Cava del club<small>Grupal · del grupo</small>
          </button>
          <button className={cava === 'individual' ? 'on' : ''} onClick={() => switchCava('individual')}>
            Cava individual<small>Cartera propia</small>
          </button>
        </div>

        {/* perfil */}
        <div className="tperfil">
          <div className="pf-av"><svg className="crest"><use href="#crest" /></svg></div>
          <div className="pf-main">
            <div className="pf-name">
              {profile.nombre}
              {profile.alias && <small>{profile.alias}</small>}
            </div>
            <div className="pf-meta">
              {profile.tipo === 'grupo'
                ? `Cava grupal · ${profile.miembros} miembros`
                : 'Cartera individual'}
              {' · '}Fundada {profile.fundado}
              {cons.total ? ` · ${cons.total} vinos consumidos` : ''}
            </div>
          </div>
        </div>

        {/* stats */}
        <div className="tstats">
          <div className="tstat">
            <div className="n">{stats.bot}</div>
            <div className="l">botellas en guarda</div>
            {stats.eqt > stats.bot && <div className="sub750">equivalen a {stats.eqt} de 750 ml</div>}
          </div>
          <div className="tstat">
            <div className="n">{stats.bods}</div>
            <div className="l">bodegas distintas</div>
          </div>
          <div className="tstat">
            <div className="n">{stats.edad} <small>años</small></div>
            <div className="l">edad promedio</div>
          </div>
          <div className="tstat">
            <div className="n">{stats.cepas}</div>
            <div className="l">cepas distintas</div>
          </div>
        </div>

        {/* lock card */}
        <div className="lockcard">
          <svg className="lk"><use href="#lock" /></svg>
          <div className="lt">
            <b>Valor de la cava</b>
            <span>Disponible para miembros del club</span>
          </div>
          <span className="ghost reg">USD ••••••</span>
        </div>

        {/* cepas pie */}
        <div className="sectitle">Cómo se reparte la cava</div>
        <div className="tpanel">
          <h3>Cepas <span>tocá una para filtrar</span></h3>
          <div className="pieblock">
            <svg
              className="tpie"
              viewBox="0 0 200 200"
              dangerouslySetInnerHTML={{ __html: piePaths }}
              onClick={e => {
                const p = (e.target as Element).closest('[data-cepa]') as HTMLElement | null;
                if (p?.dataset.cepa) drill(() => setCepa(p.dataset.cepa!));
              }}
            />
            <div className="tlegend">
              {pieItems.map((item, i) => {
                const pct = Math.round(item[1] / pieTotal * 100);
                const nm = item[0] === '__otros__' ? 'Otros' : item[0];
                const col = item[0] === '__otros__' ? OTROS_COLOR : PIE_PALETTE[i % PIE_PALETTE.length];
                return (
                  <button key={item[0]} className="lg" onClick={() => drill(() => setCepa(item[0]))}>
                    <span className="sw" style={{ background: col }} />
                    <span className="nm">{nm}</span>
                    <span className="qt">{item[1]} · {pct}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* bodegas */}
        <div className="tpanel">
          <h3>Bodegas <span>tocá una para filtrar</span></h3>
          <div className="rbars">
            {bodShown.map(([k, v]) => (
              <BarItem key={k} label={k} count={v} max={bodMax} onClick={() => drill(() => setBodega(k))} />
            ))}
          </div>
          {bodArr.length > bodN && (
            <button className="morebtn" onClick={() => setBodN(n => n + 5)}>
              {bodArr.length - bodN > 5 ? 'Mostrar 5 bodegas más' : `Mostrar las últimas ${bodArr.length - bodN}`}
            </button>
          )}
          {bodArr.length <= bodN && bodArr.length > 8 && (
            <button className="morebtn" onClick={() => setBodN(8)}>Mostrar menos</button>
          )}
        </div>

        {/* país */}
        <div className="tpanel">
          <h3>Por país <span>tocá uno para filtrar</span></h3>
          <div className="rbars">
            {paisArr.map(([k, v]) => {
              const nm = k === '__otros__' ? 'Otros' : k;
              const mx = paisArr[0][1];
              return <BarItem key={k} label={nm} count={v} max={mx} onClick={() => drill(() => setPais(k))} />;
            })}
          </div>
        </div>

        {/* regiones */}
        <div className="tpanel">
          <h3>Regiones de Argentina <span>tocá una para filtrar</span></h3>
          <div className="rbars">
            {regArr.map(([k, v]) => {
              const nm = k === '__otros__' ? 'Otras' : k;
              const mx = regArr[0][1];
              return <BarItem key={k} label={nm} count={v} max={mx} onClick={() => drill(() => setRegion(k))} />;
            })}
          </div>
        </div>

        {/* consumos */}
        <div className="sectitle">Consumos</div>
        <div className="tpanel">
          <h3>Botellas abiertas por año <span>lo que se tomó en las juntadas</span></h3>
          {growthYears.length > 0 ? (
            <div className="growth">
              {growthYears.map(y => (
                <GrowthCol key={y} year={y} n={cons.byYear[y].n} max={growthMax} onClick={() => setReport({ scope: y })} />
              ))}
            </div>
          ) : (
            <div className="growth-note">Todavía sin consumos cargados.</div>
          )}
          {movNote && <div className="growth-note">{movNote}</div>}
          {cons.total > 0 && (
            <button className="totbtn" onClick={() => setReport({ scope: 'total' })}>
              Ver informe acumulado del club →
            </button>
          )}
        </div>

        {/* añadas */}
        <div className="sectitle">Las etiquetas</div>
        <div className="tpanel">
          <h3>Añadas <span>tocá un año para ver esos vinos</span></h3>
          <div className="astrip">
            {anadaItems.map(([y, v]) => (
              <AnadaCol
                key={y}
                year={y}
                count={v}
                max={anadaMax}
                active={anada !== 'todas' && +anada === y}
                onClick={() => {
                  const next = anada !== 'todas' && +anada === y ? 'todas' : String(y);
                  setAnada(next);
                  setTimeout(() => listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
              />
            ))}
          </div>
          {anadaHint && <div className="ahint">{anadaHint}</div>}
        </div>

        {/* search */}
        <div className="tsearch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
          </svg>
          <input
            type="search"
            placeholder="Buscar vino o bodega"
            autoComplete="off"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>

        {/* tipo chips */}
        <div className="chiprow">
          {(['todos','tinto','blanco','espumante'] as const).map(t => (
            <button key={t} className={'chip' + (tipo === t ? ' on' : '')} onClick={() => { setTipo(t); }}>
              {t !== 'todos' && <span className="dot" style={{ background: TIPO_COLOR[t] }} />}
              {t === 'todos' ? 'Todos' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* fmt chips */}
        {presentFmts.length > 0 && (
          <div className="chiprow">
            <button className={'chip' + (fmt === 'todos' ? ' on' : '')} onClick={() => setFmt('todos')}>
              Todos los formatos
            </button>
            {presentFmts.map(f => (
              <button key={f} className={'chip' + (fmt === f ? ' on' : '')} onClick={() => setFmt(f)}>{f}</button>
            ))}
          </div>
        )}

        {/* active filters */}
        {activeFilters.length > 0 && (
          <div className="factive">
            <span className="fa-lbl">Filtrando:</span>
            {activeFilters.map(([k, label]) => (
              <button key={k} className="fa" onClick={() => clearFilter(k)}>
                {label} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            ))}
          </div>
        )}

        {/* count line */}
        {countLine && <div className="countline">{countLine}</div>}

        {/* list anchor */}
        <div ref={listTopRef} />

        {/* wine list */}
        <div className="wlist">
          {filteredRows.length === 0 ? (
            <div className="empty">No hay vinos con esos filtros.</div>
          ) : (
            filteredRows.map((r, idx) => {
              const isOpen = openSet.has(idx);
              const fname = fmtName(ratioOf(r));
              const dhead = `${r.qty} en guarda${r.cons ? ' · ' + r.cons + ' ya consumida' + (r.cons !== 1 ? 's' : '') : ''} · ${owner}`;
              const otrasAnadas = rows
                .filter(o => o !== r && o.vino === r.vino && o.bod === r.bod && o.an !== r.an)
                .map(o => o.an).filter((v, i, a) => v !== null && a.indexOf(v) === i).sort((a, b) => (a ?? 0) - (b ?? 0));

              return (
                <div key={idx} className={'lbl' + (isOpen ? ' open' : '')}>
                  <button className="lbl-row" aria-expanded={isOpen} onClick={() => toggleItem(idx)}>
                    <svg className="gl"><use href={`#gl-${r.tipo}`} /></svg>
                    <div className="lbl-mid">
                      <div className="v">
                        {r.vino}
                        {fname && <span className="fmtbadge">{fname}</span>}
                      </div>
                      <div className="b">{r.bod} · {r.reg}</div>
                      <div className="vv">{r.cepa}</div>
                    </div>
                    <div className="lbl-right">
                      <div className="yr">{r.an ?? 'N/V'}</div>
                      <div className="wqty">×{r.qty}</div>
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
                          <span className="dv">{r.consd.join(' · ')}</span>
                        </div>
                      )}
                      {otrasAnadas.length > 0 && (
                        <div className="drow">
                          <span className="dk">Otras añadas</span>
                          <span className="dv">
                            {otrasAnadas.map((y, i) => (
                              <button key={i} className="jump" onClick={() => jumpTo(r.vino)}>{y}</button>
                            ))}
                          </span>
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
          Datos reales de la cava (inventario y consumos). En la cava del club todas las botellas son del grupo, sin dueños individuales. El valor de la cava queda reservado para miembros.
        </p>
      </div>

      {/* year report modal */}
      {report && cons.total > 0 && (
        <YearReport cons={cons} scope={report.scope} onClose={() => setReport(null)} />
      )}
    </div>
  );
}
