// La pestaña Consumos: arriba la juntada (con navegación entre juntadas); abajo un informe filtrable por año,
// armado con los mismos gráficos de las secciones de Mi cava pero alimentados con las botellas abiertas.
// Los gráficos son los de ClubCava.tsx (se exportan de ahí); acá sólo se arman los datos y los carruseles.
// Sin dinero: lo que llega de /api/cava son vinos, cepas, lugares y puntajes.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnadasTramos, BarrasAnio, EspejoFilas, FichaCepaPanel, FilaBarra, GraficoEdad, MedidorVivino, MosaicoCepas, NorteSur, OLIVA,
  PanelDetalle, PanelPuntaje, Podio, PODIO_CALIDAD, PuntajeBarras, TIPO_BORDE, TIPO_CLARO, COLOR_NEUTRO,
  barrasPuntaje, fmtN, mesLargo, plural,
} from './ClubCava';
import type { BarraAnio, CepasBloque, GeoBloque, TramoEdad } from './ClubCava';
import './consumos.css';

export interface FilaCons {
  vino: string; anada: number | null; cepa: string; tipo: string; vivino: number | null;
  bodega: string; pais: string; provincia: string; region: string; n: number;
}
export interface JuntadaCons { clave: string; mes: string; dia: number | null; foto: boolean; filas: FilaCons[] }
export interface ConsumosApi { juntadas: JuntadaCons[] }

const COLOR_CONS = '#A8384F';
const COLOR_RITMO = COLOR_CONS, COLOR_CEPAS = '#6B1E2E', COLOR_GEO = '#5E6B3A', COLOR_ANADAS = '#6B4A2B', COLOR_CALIDAD = '#8C6A22';
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const TIPO_COLOR: Record<string, string> = { tinto: '#6B1E2E', blanco: '#E2CC6F', rosado: '#C25A5A', naranjo: '#C8823A', espumante: '#F1EBD6' };
const TIPO_ORDEN = ['tinto', 'blanco', 'rosado', 'naranjo', 'espumante'];
const TRAMOS = [
  { tramo: 'hasta 5 años', color: '#E2CFA6', ok: (e: number) => e <= 5 },
  { tramo: '6 a 10', color: '#B88A57', ok: (e: number) => e >= 6 && e <= 10 },
  { tramo: '11 a 15', color: '#80532F', ok: (e: number) => e >= 11 && e <= 15 },
  { tramo: 'más de 15 años', color: '#3E2717', ok: (e: number) => e > 15 },
];
const MIN_INFORME = 5;       // botellas en el filtro para mostrar los carruseles
const MIN_PUNTUADAS = 10;    // botellas con puntaje para el gráfico por puntaje

type Fila = FilaCons & { anio: number; mesN: number; ji: number; juntada: string };

const diaTxt = (j: JuntadaCons) => {
  if (!j.dia) return '';
  const [y, m] = j.mes.split('-').map(Number);
  const sem = new Date(Date.UTC(y, m - 1, j.dia)).toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' });
  return `${sem} ${j.dia}/${String(m).padStart(2, '0')}`;
};
const edadDe = (f: { anio: number; anada: number | null }) => (f.anada ? f.anio - f.anada : null);
const anios = (n: number) => `${fmtN(n)} ${plural(n, 'año', 'años')}`;

// ── resumen de un conjunto de filas ──
function resumir(fs: Fila[]) {
  let bot = 0, eW = 0, eN = 0, vW = 0, vN = 0;
  const js = new Set<number>();
  for (const f of fs) {
    bot += f.n; js.add(f.ji);
    const e = edadDe(f);
    if (e != null) { eW += e * f.n; eN += f.n; }
    if (f.vivino != null) { vW += f.vivino * f.n; vN += f.n; }
  }
  return { botellas: bot, juntadas: js.size, edad: eN ? eW / eN : null, vivino: vN ? vW / vN : null, puntuadas: vN };
}
function sumarPor<T extends string | number>(fs: Fila[], clave: (f: Fila) => T | null) {
  const m = new Map<T, number>();
  for (const f of fs) { const k = clave(f); if (k == null || k === '') continue; m.set(k, (m.get(k) ?? 0) + f.n); }
  return m;
}

// ── el navegador de juntadas ──
function NavJuntadas({ juntadas, idx, onIr }: { juntadas: JuntadaCons[]; idx: number; onIr: (i: number) => void }) {
  const tira = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  const grupos = useMemo(() => {
    const g: { anio: string; items: number[] }[] = [];
    juntadas.forEach((j, i) => {
      const a = j.mes.slice(0, 4);
      if (!g.length || g[g.length - 1].anio !== a) g.push({ anio: a, items: [] });
      g[g.length - 1].items.push(i);
    });
    return g;
  }, [juntadas]);
  // la tira se mueve sola para dejar la juntada activa en el centro
  useEffect(() => {
    const t = tira.current, p = t?.querySelector<HTMLElement>(`[data-j="${idx}"]`);
    if (!t || !p) return;
    t.scrollTo({ left: p.offsetLeft - t.clientWidth / 2 + p.offsetWidth / 2, behavior: primera.current ? 'auto' : 'smooth' });
    primera.current = false;
  }, [idx]);
  return (
    <div className="cj-nav" data-cj="nav">
      <button type="button" className="cj-flecha" data-cj="prev" aria-label="Juntada anterior" disabled={idx <= 0} onClick={() => onIr(idx - 1)}>‹</button>
      <div className="cj-tira" ref={tira}>
        {grupos.map(g => (
          <div key={g.anio} className="cj-grupo">
            <span className="cj-anio">{g.anio}</span>
            <div className="cj-puntos">
              {g.items.map(i => (
                <button key={i} type="button" data-j={i} className={'cj-punto' + (i === idx ? ' on' : '')}
                  aria-label={mesLargo(juntadas[i].mes, true)} aria-current={i === idx ? 'true' : undefined} onClick={() => onIr(i)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="cj-flecha" data-cj="next" aria-label="Juntada siguiente" disabled={idx >= juntadas.length - 1} onClick={() => onIr(idx + 1)}>›</button>
    </div>
  );
}

// ── la tarjeta de la juntada ──
function TarjetaJuntada({ j, esGrupo, colorDe, abrirFicha }: {
  j: JuntadaCons; esGrupo: boolean; colorDe: (cepa: string) => string; abrirFicha: (vino: string, an: number) => void;
}) {
  const [rota, setRota] = useState(false);
  useEffect(() => setRota(false), [j.clave]);
  const anio = Number(j.mes.slice(0, 4));
  const vinos = [...j.filas].sort((a, b) => (b.vivino ?? -1) - (a.vivino ?? -1) || (b.anada ?? 0) - (a.anada ?? 0) || a.vino.localeCompare(b.vino, 'es'));
  const fs = j.filas.map(f => ({ ...f, anio, mesN: 0, ji: 0, juntada: j.clave }));
  const r = resumir(fs);
  const conFoto = esGrupo && j.foto && !rota;
  return (
    <div className="cj-card" data-cj="tarjeta" data-mes={j.mes}>
      <div className={'cj-foto' + (conFoto ? ' con-foto' : '')}>
        {conFoto
          ? <img src={`/api/juntada-foto?cava=001&mes=${j.mes}`} alt={`Botellas de la juntada de ${mesLargo(j.mes)}`} loading="lazy" onError={() => setRota(true)} />
          : <><svg className="cj-cam" aria-hidden="true"><use href="#ic-camara" /></svg><span>Sumá la foto de la juntada</span></>}
      </div>
      <div className="cj-cuerpo">
        <div className="cj-vinos">
          {vinos.map(v => {
            const e = edadDe({ anio, anada: v.anada });
            const fila = (
              <>
                <i className="cj-dot" style={{ background: colorDe(v.cepa) }} />
                <span className="cj-vtxt">
                  <span className="cj-vnom">{v.vino}{v.anada ? ` · ${v.anada}` : ''}{v.n > 1 ? ` ×${v.n}` : ''}</span>
                  <small>{[v.cepa, e != null ? `abierta con ${anios(e)}` : null].filter(Boolean).join(' · ')}</small>
                </span>
                {v.vivino != null && <span className="cj-viv">{fmtN(v.vivino, 1)}</span>}
              </>
            );
            return v.anada
              ? <button key={`${v.vino}|${v.anada}`} type="button" className="cj-vino" data-cj="vino" onClick={() => abrirFicha(v.vino, v.anada as number)}>{fila}</button>
              : <div key={`${v.vino}|nv`} className="cj-vino">{fila}</div>;
          })}
        </div>
        <div className="cj-pie">
          <div><b>{fmtN(r.botellas)}</b><span>{plural(r.botellas, 'botella', 'botellas')}</span></div>
          <div><b>{r.edad != null ? fmtN(r.edad, 1) : '—'}</b><span>años, edad al abrir</span></div>
          <div><b>{r.vivino != null ? fmtN(r.vivino, 2) : '—'}</b><span>Vivino prom.</span></div>
        </div>
        <p className="cj-nota">★ Desde la próxima juntada, cada socio puntúa acá lo que se abrió.</p>
      </div>
    </div>
  );
}

// ── el carrusel común ──
type Tarjeta = { key: string; titulo: string; bajada?: string; nodo: React.ReactNode };
function Carrusel({ id, nombre, color, tarjetas }: { id: string; nombre: string; color: string; tarjetas: Tarjeta[] }) {
  const pista = useRef<HTMLDivElement>(null);
  const [act, setAct] = useState(0);
  if (!tarjetas.length) return null;
  const alDeslizar = () => {
    const p = pista.current;
    if (!p) return;
    const t = p.children[0] as HTMLElement | undefined;
    if (!t) return;
    const paso = t.offsetWidth + 12;
    setAct(Math.min(tarjetas.length - 1, Math.max(0, Math.round(p.scrollLeft / paso))));
  };
  return (
    <section className="cc" data-car={id} style={{ ['--sec-c' as string]: color }}>
      <div className="cc-cab">
        <i className="cc-cuad" />
        <h3 className="cc-nombre">{nombre}</h3>
        <span className="cc-n">{tarjetas.length} {plural(tarjetas.length, 'gráfico', 'gráficos')} · deslizá</span>
      </div>
      <div className="cc-pista" ref={pista} onScroll={alDeslizar}>
        {tarjetas.map(t => (
          <article key={t.key} className="cc-card" data-card={t.key}>
            <h4>{t.titulo}</h4>
            {t.bajada && <p className="cc-baj">{t.bajada}</p>}
            <div className="cc-cuerpo">{t.nodo}</div>
          </article>
        ))}
      </div>
      {tarjetas.length > 1 && (
        <div className="cc-puntos" aria-hidden="true">
          {tarjetas.map((t, i) => <i key={t.key} className={i === act ? 'on' : ''} />)}
        </div>
      )}
    </section>
  );
}

// ── la dona del tipo de vino ──
function Dona({ items, total }: { items: { tipo: string; n: number }[]; total: number }) {
  const R = 78, W = 34, C = 2 * Math.PI * R;
  let acum = 0;
  return (
    <div className="cs-dona">
      <div className="cs-dona-svg">
        <svg viewBox="0 0 200 200" role="img" aria-label="Tinto, blanco o espumante">
          <circle cx="100" cy="100" r={R + W / 2} fill="none" stroke={TIPO_BORDE} strokeWidth="1" />
          <circle cx="100" cy="100" r={R - W / 2} fill="none" stroke={TIPO_BORDE} strokeWidth="1" />
          {items.map(it => {
            const largo = it.n / total * C;
            const el = (
              <circle key={it.tipo} cx="100" cy="100" r={R} fill="none" stroke={TIPO_COLOR[it.tipo] ?? COLOR_NEUTRO} strokeWidth={W}
                strokeDasharray={`${largo} ${C - largo}`} strokeDashoffset={-acum} transform="rotate(-90 100 100)" data-tipo={it.tipo} />
            );
            acum += largo;
            return el;
          })}
        </svg>
        <div className="cs-dona-centro"><b>{fmtN(total)}</b><span>abiertas</span></div>
      </div>
      <div className="cs-leyenda">
        {items.map(it => {
          const p = it.n / total * 100;
          return (
            <span key={it.tipo} className="cs-leg" data-tipo={it.tipo}>
              <i style={{ background: TIPO_COLOR[it.tipo] ?? COLOR_NEUTRO, border: TIPO_CLARO.has(it.tipo) ? `1px solid ${TIPO_BORDE}` : undefined }} />
              {it.tipo.charAt(0).toUpperCase() + it.tipo.slice(1)} {p < 1 ? fmtN(it.n) : `${fmtN(Math.round(p))}%`}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── la pestaña ──
export default function Consumos({ datos, cargando, esGrupo, cepas, abrirFicha }: {
  datos: ConsumosApi | undefined; cargando: boolean; esGrupo: boolean; cepas?: CepasBloque; abrirFicha: (vino: string, an: number) => void;
}) {
  const ahora = new Date().getFullYear();
  const juntadas = datos?.juntadas ?? [];
  const [idx, setIdx] = useState(-1);
  const [anio, setAnio] = useState<number | 'todo'>('todo');
  const [cepaSel, setCepaSel] = useState<string | null>(null);
  const [anadaSel, setAnadaSel] = useState<string | number | null>(null);
  const [barraSel, setBarraSel] = useState<string | null>(null);
  const [podio, setPodio] = useState<string | null>(null);
  const actual = idx < 0 ? juntadas.length - 1 : Math.min(idx, juntadas.length - 1);

  const todas: Fila[] = useMemo(() => juntadas.flatMap((j, ji) =>
    j.filas.map(f => ({ ...f, anio: Number(j.mes.slice(0, 4)), mesN: Number(j.mes.slice(5, 7)), ji, juntada: j.clave }))), [juntadas]);
  const aniosConConsumos = useMemo(() => [...new Set(todas.map(f => f.anio))].sort((a, b) => b - a), [todas]);
  const filtro = useMemo(() => (anio === 'todo' ? todas : todas.filter(f => f.anio === anio)), [todas, anio]);
  useEffect(() => { setCepaSel(null); setAnadaSel(null); setBarraSel(null); setPodio(null); }, [anio]);

  const cepaPor = useMemo(() => new Map((cepas?.lista ?? []).map(c => [c.nombre, c])), [cepas]);
  const colorDe = (cepa: string) => cepaPor.get(cepa)?.color ?? COLOR_NEUTRO;

  const total = resumir(todas);
  if (!datos && cargando) return <div className="cons-sec"><div className="cons-cab"><h2>Consumos</h2><p>Cargando…</p></div></div>;
  if (!juntadas.length) {
    return (
      <div className="cons-sec" data-cons="vacio">
        <div className="cons-cab"><h2>Consumos</h2></div>
        <div className="cons-vacio">Todavía no abrieron botellas. Cuando abran la primera, aparece acá.</div>
      </div>
    );
  }
  const primerAnio = aniosConConsumos[aniosConConsumos.length - 1];
  const j = juntadas[actual];

  // ── el informe ──
  const r = resumir(filtro);
  const completo = r.botellas >= MIN_INFORME;
  const parcial = anio === 'todo' ? false : anio === ahora;
  const tituloInforme = !esGrupo ? (anio === 'todo' ? 'Tu informe' : `Tu informe ${anio}${parcial ? ' · parcial' : ''}`)
    : anio === 'todo' ? `Informe del club · ${primerAnio} a hoy` : `Informe ${anio}${parcial ? ' · parcial' : ''}`;

  // Ritmo
  const ritmo: Tarjeta[] = [];
  const GRAD = 'linear-gradient(to top, #7E2238, #B9485F)';
  if (anio === 'todo') {
    const porAnio = sumarPor(filtro, f => f.anio);
    const ys: number[] = [];
    for (let y = Math.min(...porAnio.keys()); y <= Math.max(...porAnio.keys()); y++) ys.push(y);
    if (ys.length >= 2) {
      ritmo.push({
        key: 'anios', titulo: 'Botellas por año', bajada: parcial || ys.includes(ahora) ? `tocá una barra para ver ese año · ${ahora} parcial` : 'tocá una barra para ver ese año',
        nodo: <BarrasAnio activa={null} minAlto={3} onPick={y => setAnio(y as number)}
          barras={ys.map(y => ({ clave: y, rot: `'${String(y).slice(2)}`, mostrarRot: true, v: porAnio.get(y) ?? 0, fondo: GRAD }))} />,
      });
    }
  } else {
    const porMes = sumarPor(filtro, f => f.mesN);
    ritmo.push({
      key: 'meses', titulo: 'Mes por mes', bajada: `botellas abiertas en ${anio}`,
      nodo: <BarrasAnio activa={null} minAlto={3}
        barras={MESES_CORTOS.map((m, i) => ({ clave: m, rot: m, mostrarRot: true, v: porMes.get(i + 1) ?? 0, fondo: GRAD }))} />,
    });
  }
  const conEdad = filtro.filter(f => f.anada);
  const botEdad = conEdad.reduce((s, f) => s + f.n, 0);
  if (botEdad >= MIN_INFORME) {
    const tramos: TramoEdad[] = TRAMOS.map(t => ({ tramo: t.tramo, color: t.color, botellas: conEdad.filter(f => t.ok(edadDe(f) as number)).reduce((s, f) => s + f.n, 0) }));
    const vieja = [...conEdad].sort((a, b) => (edadDe(b) as number) - (edadDe(a) as number))[0];
    ritmo.push({
      key: 'edad', titulo: '¿A qué edad las abrimos?', bajada: `${fmtN(botEdad)} con añada`,
      nodo: (
        <div className="cs-edad">
          <GraficoEdad edad={r.edad ?? 0} tramos={tramos} cosechas={null} />
          <AnadasTramos tramos={tramos} />
          {vieja && <p className="cs-pie">La más vieja: {vieja.vino} {vieja.anada}, con {anios(edadDe(vieja) as number)}.</p>}
        </div>
      ),
    });
  }

  // Cepas y estilos
  const cepasCar: Tarjeta[] = [];
  const porTipo = sumarPor(filtro, f => f.tipo);
  const tiposOrd = [...porTipo.entries()].sort((a, b) => (TIPO_ORDEN.indexOf(a[0]) + 1 || 99) - (TIPO_ORDEN.indexOf(b[0]) + 1 || 99) || b[1] - a[1]);
  if (tiposOrd.length) {
    cepasCar.push({ key: 'tipo', titulo: 'Tinto, blanco o espumante', nodo: <Dona items={tiposOrd.map(([tipo, n]) => ({ tipo, n }))} total={r.botellas} /> });
  }
  const porCepa = [...sumarPor(filtro, f => f.cepa).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  if (porCepa.length) {
    const sel = cepaSel ? cepaPor.get(cepaSel) ?? null : null;
    cepasCar.push({
      key: 'mosaico', titulo: 'Las cepas de un vistazo', bajada: `${fmtN(porCepa.length)} ${plural(porCepa.length, 'cepa probada', 'cepas probadas')} · el tamaño es lo que se abrió`,
      nodo: (
        <>
          <MosaicoCepas items={porCepa.map(([nombre, valor]) => ({ nombre, color: cepaPor.get(nombre)?.color ?? null, valor }))}
            sel={cepaSel} onPick={n => setCepaSel(s => (s === n ? null : n))} />
          {sel && <FichaCepaPanel cepa={sel} onClose={() => setCepaSel(null)} />}
        </>
      ),
    });
  }
  if (porCepa.length >= 2) {
    cepasCar.push({
      key: 'espejo', titulo: '¿Se guarda o se toma?', bajada: 'lo abierto en este período, contra lo que hoy está en guarda',
      nodo: <EspejoFilas nombres filas={porCepa.slice(0, 7).map(([nombre, ab]) => ({
        clave: nombre, rotulo: nombre, ab, gu: cepaPor.get(nombre)?.enGuarda ?? 0, color: colorDe(nombre),
      }))} />,
    });
  }

  // Geografía
  const geoCar: Tarjeta[] = [];
  const porProv = [...sumarPor(filtro, f => (f.pais === 'Argentina' ? f.provincia : null)).entries()];
  if (porProv.length) {
    const G = { provincias: porProv.map(([provincia, n]) => ({ provincia, enGuarda: n, abiertas: n })) } as unknown as GeoBloque;
    const mundo = [...sumarPor(filtro, f => (f.pais && f.pais !== 'Argentina' ? f.pais : null)).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    geoCar.push({
      key: 'norte-sur', titulo: 'De norte a sur', bajada: 'lo abierto a lo largo de la cordillera',
      nodo: (
        <>
          <NorteSur G={G} sel={null} onPick={() => {}} />
          {mundo.length > 0 && <p className="cs-mundo" data-cs="mundo"><b>Del mundo:</b> {mundo.map(([p, n]) => `${p} ${fmtN(n)}`).join(' · ')}</p>}
        </>
      ),
    });
  }
  const filasBarra = (claves: Map<string, number>, ds: (k: string) => Record<string, string>, rot: (k: string) => string) => {
    const orden = [...claves.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, 7);
    const tope = Math.max(1, ...orden.map(o => o[1]));
    return <div className="tr-lista">{orden.map(([k, n]) => <FilaBarra key={k} rot={rot(k)} n={n} tope={tope} total={r.botellas} color={OLIVA} datos={ds(k)} />)}</div>;
  };
  const porRegion = new Map<string, number>();
  const nomRegion = new Map<string, string>();
  for (const f of filtro) {
    if (!f.region) continue;
    const k = `${f.pais}|${f.region}`;
    porRegion.set(k, (porRegion.get(k) ?? 0) + f.n);
    nomRegion.set(k, f.pais && f.pais !== 'Argentina' ? `${f.region} (${f.pais})` : f.region);
  }
  if (porRegion.size) geoCar.push({ key: 'regiones', titulo: 'Las regiones', bajada: 'las 7 más abiertas', nodo: filasBarra(porRegion, k => ({ 'data-region': k }), k => nomRegion.get(k) ?? k) });
  const porBodega = sumarPor(filtro, f => f.bodega);
  if (porBodega.size) geoCar.push({ key: 'bodegas', titulo: 'Las bodegas', bajada: 'las 7 más abiertas', nodo: filasBarra(porBodega, k => ({ 'data-bodega': k }), k => k) });

  // Añadas
  const anadasCar: Tarjeta[] = [];
  const porAnada = sumarPor(filtro, f => f.anada);
  if (porAnada.size) {
    const max = Math.max(...porAnada.keys()), min = Math.min(...porAnada.keys());
    const corte = max - 20;
    const agrupar = max - min > 20;
    const barras: BarraAnio[] = [];
    if (agrupar) {
      const viejas = [...porAnada.entries()].filter(([y]) => y < corte).reduce((s, [, n]) => s + n, 0);
      if (viejas > 0) barras.push({ clave: 'viejas', rot: `≤'${String(corte - 1).slice(2)}`, mostrarRot: true, v: viejas });
    }
    for (let y = agrupar ? corte : min; y <= max; y++) barras.push({ clave: y, rot: `'${String(y).slice(2)}`, mostrarRot: (max - y) % 4 === 0, v: porAnada.get(y) ?? 0 });
    const tope = Math.max(...barras.map(b => b.v));
    const conNum = barras.map(b => (barras.length > 14 && b.v < tope * 0.5 ? { ...b, num: '' } : b));
    const del = (k: string | number) => filtro.filter(f => f.anada != null && (k === 'viejas' ? f.anada < corte : f.anada === k));
    const panel = () => {
      if (anadaSel == null) return null;
      const fs = del(anadaSel);
      const etiquetas = [...fs.reduce((m, f) => m.set(`${f.vino}|${f.anada}`, { key: `${f.vino}|${f.anada}`, vino: f.vino, bodega: f.bodega, botellas: (m.get(`${f.vino}|${f.anada}`)?.botellas ?? 0) + f.n }), new Map<string, { key: string; vino: string; bodega: string; botellas: number }>()).values()]
        .sort((a, b) => b.botellas - a.botellas || a.vino.localeCompare(b.vino, 'es'));
      const bot = fs.reduce((s, f) => s + f.n, 0);
      const titulo = anadaSel === 'viejas' ? `Hasta ${corte - 1}` : String(anadaSel);
      return (
        <PanelDetalle clave={String(anadaSel)} titulo={titulo} subtitulo={`${fmtN(bot)} ${plural(bot, 'botella abierta', 'botellas abiertas')}`}
          cajas={[{ n: fmtN(bot), l: 'Abiertas' }, { n: fmtN(new Set(fs.map(f => f.cepa)).size), l: 'Cepas' }, { n: fmtN(new Set(fs.map(f => f.bodega)).size), l: 'Bodegas' }]}
          lineas={[]} etiquetas={etiquetas} sufijoLista=" abiertas" onClose={() => setAnadaSel(null)} />
      );
    };
    anadasCar.push({
      key: 'cosechas', titulo: 'Cosecha por cosecha', bajada: 'botellas abiertas por añada · tocá una barra',
      nodo: <><BarrasAnio barras={conNum} activa={anadaSel} onPick={k => setAnadaSel(a => (a === k ? null : k))} />{panel()}</>,
    });
    const conAn = filtro.filter(f => f.anada);
    const botAn = conAn.reduce((s, f) => s + f.n, 0);
    const prom = Math.round(conAn.reduce((s, f) => s + (f.anada as number) * f.n, 0) / botAn);
    const unicos = [...new Map(conAn.map(f => [`${f.vino}|${f.anada}`, f])).values()].sort((a, b) => (a.anada as number) - (b.anada as number) || a.vino.localeCompare(b.vino, 'es')).slice(0, 5);
    anadasCar.push({
      key: 'veteranas', titulo: 'Las veteranas', bajada: 'las más viejas que se abrieron',
      nodo: (
        <>
          <div className="cs-cajas">
            <div><b>{prom}</b><span>añada promedio</span></div>
            <div><b>{min}</b><span>la más vieja</span></div>
            <div><b>{fmtN(porAnada.size)}</b><span>cosechas distintas</span></div>
          </div>
          <div className="cs-vet">
            {unicos.map(f => <div key={`${f.vino}|${f.anada}`} className="cs-vet-fila"><span>{f.vino}</span><b>{f.anada}</b></div>)}
          </div>
        </>
      ),
    });
  }

  // Calidad
  const calCar: Tarjeta[] = [];
  const conViv = filtro.filter(f => f.vivino != null);
  const botViv = conViv.reduce((s, f) => s + f.n, 0);
  if (botViv >= MIN_PUNTUADAS) {
    const porDec = new Map<number, { vivino: number; botellas: number; vinos: Map<string, { vino: string; anada: number | null; botellas: number; valoraciones: number | null; icono: boolean }> }>();
    for (const f of conViv) {
      const v = Math.round((f.vivino as number) * 10) / 10;
      const d = porDec.get(v) ?? { vivino: v, botellas: 0, vinos: new Map() };
      d.botellas += f.n;
      const k = `${f.vino}|${f.anada ?? 'nv'}`;
      const e = d.vinos.get(k);
      if (e) e.botellas += f.n; else d.vinos.set(k, { vino: f.vino, anada: f.anada, botellas: f.n, valoraciones: null, icono: false });
      porDec.set(v, d);
    }
    const barras = barrasPuntaje([...porDec.values()].sort((a, b) => a.vivino - b.vivino).map(d => ({ ...d, vinos: [...d.vinos.values()] })));
    const barra = barras.find(b => b.key === barraSel) ?? null;
    calCar.push({
      key: 'puntajes', titulo: 'Puntaje por puntaje', bajada: 'botellas abiertas · tocá un puntaje',
      nodo: <><PuntajeBarras barras={barras} paso={2} activa={barraSel} onPick={k => setBarraSel(b => (b === k ? null : k))} />
        {barra && <PanelPuntaje barra={barra} sufijo=" abiertas" onClose={() => setBarraSel(null)} />}</>,
    });
  }
  if (botViv >= MIN_PUNTUADAS && r.vivino != null) {
    calCar.push({
      key: 'medidor', titulo: 'Puntaje promedio de lo abierto', bajada: `${fmtN(botViv)} abiertas con puntaje Vivino`,
      nodo: <div className="cs-medidor"><MedidorVivino promedio={r.vivino} /><b data-prom={r.vivino}>{fmtN(r.vivino, 2)}</b></div>,
    });
  }
  const mejores = [...new Map(conViv.map(f => [`${f.vino}|${f.anada ?? 'nv'}`, f])).values()]
    .sort((a, b) => (b.vivino as number) - (a.vivino as number) || b.n - a.n || a.vino.localeCompare(b.vino, 'es')).slice(0, 5);
  if (mejores.length >= 3) {
    calCar.push({
      key: 'podio', titulo: 'Lo mejor que abrimos', bajada: 'los mejor puntuados',
      nodo: (
        <Podio grandeAbajo medallas colores={PODIO_CALIDAD.colores} alturas={PODIO_CALIDAD.alturas} abierto={podio} onPick={k => setPodio(p => (p === k ? null : k))}
          items={mejores.map(f => ({ key: `${f.vino}|${f.anada ?? 'nv'}`, grande: fmtN(f.vivino as number, 1), titulo: f.vino, sub: String(f.anada ?? 'N/V'), extra: String(f.anada ?? 'N/V'), filaSub: '', filaDer: fmtN(f.vivino as number, 1), meta: [] }))}
          ficha={k => {
            const f = mejores.find(x => `${x.vino}|${x.anada ?? 'nv'}` === k);
            return f ? <div className="wdetail"><div className="dhead">{f.bodega}{f.cepa ? ` · ${f.cepa}` : ''}</div></div> : null;
          }} />
      ),
    });
  }

  return (
    <div className="cons-sec" data-cons="raiz" style={{ ['--sec-c' as string]: COLOR_CONS }}>
      <div className="cons-cab">
        <h2>Consumos</h2>
        <p data-cons="linea">{fmtN(juntadas.length)} {plural(juntadas.length, 'juntada', 'juntadas')} · {fmtN(total.botellas)} {plural(total.botellas, 'botella abierta', 'botellas abiertas')} desde {primerAnio}</p>
      </div>

      <NavJuntadas juntadas={juntadas} idx={actual} onIr={setIdx} />
      <div className="cj-titulo" data-cj="titulo">
        <h3>{esGrupo ? mesLargo(j.mes, true) : `Abiertas en ${mesLargo(j.mes)}`}</h3>
        <span>{[diaTxt(j), `juntada ${actual + 1} de ${juntadas.length}`].filter(Boolean).join(' · ')}</span>
      </div>
      <TarjetaJuntada j={j} esGrupo={esGrupo} colorDe={colorDe} abrirFicha={abrirFicha} />

      <div className="ci-chips" data-cons="chips" role="group" aria-label="Año del informe">
        {(['todo', ...aniosConConsumos] as (number | 'todo')[]).map(a => (
          <button key={a} type="button" data-anio-chip={a} className={'ci-chip' + (anio === a ? ' on' : '')} aria-pressed={anio === a}
            onClick={() => setAnio(a)}>{a === 'todo' ? (esGrupo ? 'Todo el club' : 'Todo') : a}</button>
        ))}
      </div>

      <h3 className="ci-titulo" data-cons="informe">{tituloInforme}</h3>
      <div className="ci-cajas" data-cons="cajas">
        <div><b>{fmtN(r.botellas)}</b><span>Botellas</span></div>
        <div><b>{fmtN(r.juntadas)}</b><span>{plural(r.juntadas, 'Juntada', 'Juntadas')}</span></div>
        <div><b>{r.edad != null ? fmtN(r.edad, 1) : '—'}</b><span>Años al abrir</span></div>
        <div><b>{r.vivino != null ? fmtN(r.vivino, 2) : '—'}</b><span>Vivino prom.</span></div>
      </div>

      <Carrusel id="ritmo" nombre="Ritmo" color={COLOR_RITMO} tarjetas={ritmo} />
      {completo && (
        <>
          <Carrusel id="cepas" nombre="Cepas y estilos" color={COLOR_CEPAS} tarjetas={cepasCar} />
          <Carrusel id="geografia" nombre="Geografía" color={COLOR_GEO} tarjetas={geoCar} />
          <Carrusel id="anadas" nombre="Añadas" color={COLOR_ANADAS} tarjetas={anadasCar} />
          <Carrusel id="calidad" nombre="Calidad" color={COLOR_CALIDAD} tarjetas={calCar} />
        </>
      )}
    </div>
  );
}

