// La pestaña Consumos: arriba la juntada (con navegación por año y juntada por juntada); abajo un informe filtrable por años,
// armado con los mismos gráficos de las secciones de Mi cava pero alimentados con las botellas abiertas.
// Los gráficos son los de ClubCava.tsx (se exportan de ahí); acá sólo se arman los datos y los carruseles.
// Sin dinero: lo que llega de /api/cava son vinos, cepas, lugares y puntajes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AnadasTramos, BarrasAnio, EspejoFilas, FichaCepaPanel, FilaBarra, GraficoEdad, MedidorVivino, MosaicoCepas, NorteSur, OLIVA,
  PanelDetalle, PanelPuntaje, Podio, PODIO_CALIDAD, PuntajeBarras, COLOR_NEUTRO,
  barrasPuntaje, fmtN, mesLargo, plural,
} from './ClubCava';
import type { BarraAnio, CepasBloque, GeoBloque, TramoEdad } from './ClubCava';
import { BotonesRespuesta, BotonPuntuar, BotonSubirFoto, Iniciales, LineaAsistentes, ListadoIndividual, botellasPara, cuandoFalta, diaMes, diaSemana, fechaLarga, subirFotos } from './Juntadas';
import type { ConsumoPriv, EstadoJuntadas, JuntadaPriv } from './Juntadas';
import './consumos.css';

export interface FilaCons {
  vino: string; anada: number | null; cepa: string; tipo: string; vivino: number | null;
  bodega: string; pais: string; provincia: string; region: string; n: number;
  orden?: number | null;   // el campo "Orden" de Consumos, si se cargó
}
export interface JuntadaCons { clave: string; mes: string; dia: number | null; foto: boolean; filas: FilaCons[]; programada?: boolean }
export interface ConsumosApi { juntadas: JuntadaCons[] }

const COLOR_CONS = '#A8384F';
const COLOR_RITMO = COLOR_CONS, COLOR_CEPAS = '#6B1E2E', COLOR_GEO = '#5E6B3A', COLOR_ANADAS = '#6B4A2B', COLOR_CALIDAD = '#8C6A22';
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
// En Consumos el espumante va en champagne oscuro, con borde, para que se distinga del fondo crema.
const ESPUMANTE = '#D9CBA0', ESPUMANTE_BORDE = '#B8A882';
const TIPO_COLOR: Record<string, string> = { tinto: '#6B1E2E', blanco: '#E2CC6F', rosado: '#C25A5A', naranjo: '#C8823A', espumante: ESPUMANTE };
const TIPO_ORDEN = ['tinto', 'blanco', 'rosado', 'naranjo', 'espumante'];
const TRAMOS = [
  { tramo: 'hasta 5 años', color: '#E2CFA6', ok: (e: number) => e <= 5 },
  { tramo: '6 a 10', color: '#B88A57', ok: (e: number) => e >= 6 && e <= 10 },
  { tramo: '11 a 15', color: '#80532F', ok: (e: number) => e >= 11 && e <= 15 },
  { tramo: 'más de 15 años', color: '#3E2717', ok: (e: number) => e > 15 },
];
const MIN_INFORME = 5;       // botellas en el filtro para mostrar los carruseles
const MIN_DESBLOQUEO = 10;   // botellas abiertas para ver el informe de la cava
const MIN_PUNTUADAS = 10;    // botellas con puntaje para el gráfico por puntaje
const FILAS_LISTA = 10;      // regiones, bodegas y cepas del espejo

type Fila = FilaCons & { anio: number; mesN: number; ji: number; juntada: string };

const diaTxt = (j: JuntadaCons) => {
  if (!j.dia) return '';
  const [y, m] = j.mes.split('-').map(Number);
  const sem = new Date(Date.UTC(y, m - 1, j.dia)).toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'UTC' });
  return `${sem} ${j.dia}/${String(m).padStart(2, '0')}`;
};
const edadDe = (f: { anio: number; anada: number | null }) => (f.anada ? f.anio - f.anada : null);
const anios = (n: number) => `${fmtN(n)} ${plural(n, 'año', 'años')}`;
const anioDe = (j: JuntadaCons) => Number(j.mes.slice(0, 4));

// "Todos los años" · "2025" · "2023 a 2025" · "2022 y 2025" · "2021, 2023 y 2025"
function periodo(sel: number[] | null): string {
  if (!sel) return 'Todos los años';
  const ys = [...sel].sort((a, b) => a - b);
  if (ys.length === 1) return String(ys[0]);
  if (ys.every((y, i) => i === 0 || y === ys[i - 1] + 1)) return `${ys[0]} a ${ys[ys.length - 1]}`;
  return `${ys.slice(0, -1).join(', ')} y ${ys[ys.length - 1]}`;
}

// Orden de la lista de una juntada: el "Orden" cargado; si no hay, blancos, rosados y naranjos, después tintos y los
// espumantes al final; dentro de cada grupo, de la añada más joven a la más vieja, y sin añada al final del grupo.
const grupoTipo = (t: string) => (t === 'espumante' ? 2 : t === 'tinto' ? 1 : 0);
function ordenarVinos(filas: FilaCons[]): FilaCons[] {
  const porDefecto = (a: FilaCons, b: FilaCons) => grupoTipo(a.tipo) - grupoTipo(b.tipo)
    || (a.anada ? 0 : 1) - (b.anada ? 0 : 1) || (b.anada ?? 0) - (a.anada ?? 0) || a.vino.localeCompare(b.vino, 'es');
  const conOrden = filas.some(f => f.orden != null);
  return [...filas].sort((a, b) => (conOrden ? (a.orden ?? Infinity) - (b.orden ?? Infinity) : 0) || porDefecto(a, b));
}

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
// ¿la pantalla tiene puntero fino (mouse)? En celular no hay flechas en los carruseles.
function usePunteroFino() {
  const q = '(hover: hover) and (pointer: fine)';
  const [fino, setFino] = useState(typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const fn = (e: MediaQueryListEvent) => setFino(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return fino;
}

// ── la lista "2026 ▾": todas las juntadas por año, de la más nueva a la más vieja ──
const MES_NOM = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIA_CORTO: Record<string, string> = { domingo: 'dom', lunes: 'lun', martes: 'mar', 'miércoles': 'mié', jueves: 'jue', viernes: 'vie', 'sábado': 'sáb' };
const fechaDe = (j: JuntadaCons) => (j.dia ? `${j.mes}-${String(j.dia).padStart(2, '0')}` : null);
const vinosDe = (j: JuntadaCons, pj: JuntadaPriv | null) => (j.programada ? pj?.designados.length ?? 0 : j.filas.reduce((s, f) => s + f.n, 0));
function ListaAnios({ juntadas, idx, pjDe, onIr, onCerrar }: {
  juntadas: JuntadaCons[]; idx: number; pjDe: (j: JuntadaCons) => JuntadaPriv | null; onIr: (i: number) => void; onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anioAct = anioDe(juntadas[idx]);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set([anioAct]));
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onCerrar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('keydown', esc); };
  }, [onCerrar]);
  const anios = [...new Set(juntadas.map(anioDe))].sort((a, b) => b - a);
  return (
    <div className="cj-lista-anios" ref={ref} role="dialog" aria-label="Elegir juntada" data-cj="lista-anios">
      {anios.map(y => {
        const del = juntadas.map((j, i) => ({ j, i })).filter(x => anioDe(x.j) === y).reverse();
        const abierto = abiertos.has(y);
        const realizadas = del.filter(x => !x.j.programada).length;
        return (
          <div key={y} className="cj-la-anio" data-anio={y}>
            <button type="button" className="cj-la-cab" aria-expanded={abierto} onClick={() => setAbiertos(a => { const n = new Set(a); if (n.has(y)) n.delete(y); else n.add(y); return n; })}>
              <b>{y}</b><span>{fmtN(realizadas)} {plural(realizadas, 'juntada', 'juntadas')}</span><i aria-hidden="true">{abierto ? '⌄' : '›'}</i>
            </button>
            {abierto && del.map(({ j, i }) => {
              const f = fechaDe(j);
              const n = vinosDe(j, pjDe(j));
              return (
                <button key={j.clave} type="button" className={'cj-la-fila' + (i === idx ? ' on' : '')} data-j={i} aria-current={i === idx ? 'true' : undefined}
                  onClick={() => { onIr(i); onCerrar(); }}>
                  <span>{MES_NOM[Number(j.mes.slice(5, 7)) - 1]}{f ? ` · ${DIA_CORTO[diaSemana(f)] ?? ''} ${diaMes(f)}` : ''}{j.programada && <em className="cj-sello">Programada</em>}</span>
                  <small>{fmtN(n)} {plural(n, 'vino', 'vinos')}</small>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── la línea de la juntada: ‹ título › con la fecha debajo; a la derecha "2026 ▾" y las acciones de quien puede ──
function NavJuntadas({ juntadas, idx, onIr, pj, priv, acc }: {
  juntadas: JuntadaCons[]; idx: number; onIr: (i: number) => void; pj: JuntadaPriv | null; priv: EstadoJuntadas | null; acc: AccionesJuntada | null;
}) {
  const [lista, setLista] = useState(false);
  const cerrar = useCallback(() => setLista(false), []);
  const j = juntadas[idx];
  const realizadas = juntadas.filter(x => !x.programada);
  const k = realizadas.indexOf(j);
  const pjDe = (x: JuntadaCons) => priv?.juntadas.find(p => x.clave === 't:' + p.nombre) ?? null;
  const f = fechaDe(j);
  const sub = j.programada && pj
    ? [`${diaSemana(pj.fecha)} ${diaMes(pj.fecha)}`, pj.hora, priv ? cuandoFalta(pj.fecha, priv.hoy) : ''].filter(Boolean).join(' · ')
    : [f ? `${diaSemana(f)} ${diaMes(f)}` : '', `juntada ${k + 1} de ${realizadas.length}`].filter(Boolean).join(' · ');
  return (
    <div className="cj-nav2" data-cj="nav">
      <div className="cj-nav-tit">
        <button type="button" className="cj-flecha" data-cj="prev" aria-label="Juntada anterior" disabled={idx <= 0} onClick={() => onIr(idx - 1)}>‹</button>
        <div className="cj-nav-txt" data-cj="titulo">
          <h3>{j.programada ? <>Próxima juntada <em className="cj-sello" data-cj="sello">Programada</em></> : mesLargo(j.mes, true)}</h3>
          <span data-cj="fecha">{sub}</span>
        </div>
        <button type="button" className="cj-flecha" data-cj="next" aria-label="Juntada siguiente" disabled={idx >= juntadas.length - 1} onClick={() => onIr(idx + 1)}>›</button>
      </div>
      <div className="cj-nav-acc">
        <span className="cj-anio-wrap">
          <button type="button" className="cj-pill" data-cj="anio-btn" aria-haspopup="dialog" aria-expanded={lista} onClick={() => setLista(v => !v)}>{anioDe(j)} ▾</button>
          {lista && <ListaAnios juntadas={juntadas} idx={idx} pjDe={pjDe} onIr={onIr} onCerrar={cerrar} />}
        </span>
        {pj?.puedeEditar && acc && <button type="button" className="cj-pill cj-pill-borde" data-jt="editar" onClick={() => acc.editar(pj)}>Editar</button>}
        {pj?.puedeBorrar && acc && <button type="button" className="cj-pill cj-pill-borde" data-jt="borrar" onClick={() => acc.borrar(pj)}>Borrar</button>}
        {pj?.puedeEmpezar && acc && <button type="button" className="cj-pill cj-pill-lleno" data-jt="empezar" onClick={() => acc.empezar(pj)}>Empezamos</button>}
      </div>
    </div>
  );
}

// Acciones de socio sobre la juntada (las hojas viven en ClubCava; acá sólo se piden)
export interface AccionesJuntada {
  puntuar: (c: ConsumoPriv, puedeVotar: boolean) => void;
  galeria: (j: JuntadaPriv) => void;
  editar: (j: JuntadaPriv) => void;
  borrar: (j: JuntadaPriv) => void;
  empezar: (j: JuntadaPriv) => void;
  confirmados: (j: JuntadaPriv) => void;
  recargar: () => void;
  deshacer: (c: ConsumoPriv) => void;   // abre la confirmación de "Deshacer apertura"
  cavaTxt: string;                      // "#003", para el mensaje de "Volver a comprar"
}
type FilaTarjeta = FilaCons & { consumo?: ConsumoPriv };

// Las estadísticas en renglones: nombre a la izquierda, valor a la derecha (completo; si no entra, baja a dos renglones)
function Stats({ filas }: { filas: [string, string][] }) {
  return (
    <div className="cj-stats" data-cj="pie">
      {filas.map(([n, v]) => <div key={n} className="cj-stat"><span>{n}</span><b>{v}</b></div>)}
    </div>
  );
}
function MaridajeNotas({ pj }: { pj: JuntadaPriv | null }) {
  if (!pj || (!pj.maridaje && !pj.notas)) return null;
  return (
    <div className="cj-mn" data-cj="maridaje">
      {pj.maridaje && <p><b>Maridaje</b>{pj.maridaje}</p>}
      {pj.notas && <p><b>Notas</b>{pj.notas}</p>}
    </div>
  );
}

// ── la tarjeta de una juntada realizada ──
// Desktop: dos columnas; el alto lo marca la izquierda (foto 3:2 + estadísticas) y la derecha scrollea por dentro. Celular: una columna, sin alto fijo.
function TarjetaJuntada({ j, esGrupo, colorDe, abrirFicha, priv, pj, acc }: {
  j: JuntadaCons; esGrupo: boolean; colorDe: (cepa: string) => string; abrirFicha: (vino: string, an: number) => void;
  priv: EstadoJuntadas | null; pj: JuntadaPriv | null; acc: AccionesJuntada | null;
}) {
  const [rota, setRota] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  useEffect(() => setRota(false), [j.clave]);
  const anio = anioDe(j);
  // con el registro de Juntadas, la lista sale de sus consumos (con el orden cargado); la cepa normalizada, de la API pública
  const cepaPub = new Map(j.filas.map(f => [`${f.vino}|${f.anada || ''}`, f.cepa]));
  const filas: FilaTarjeta[] = pj
    ? pj.consumos.map(c => ({ vino: c.vino, anada: c.anada, cepa: cepaPub.get(`${c.vino}|${c.anada || ''}`) ?? c.cepa, tipo: c.tipo, vivino: c.vivino, bodega: c.bodega, pais: '', provincia: '', region: '', n: 1, orden: c.orden, consumo: c }))
    : j.filas;
  const vinos = ordenarVinos(filas.map(f => ({ ...f, anada: f.anada || null }))) as FilaTarjeta[];
  const fs = vinos.map(f => ({ ...f, anio, mesN: 0, ji: 0, juntada: j.clave }));
  const r = resumir(fs);
  const vieja = fs.filter(f => f.anada).sort((a, b) => (a.anada as number) - (b.anada as number))[0];
  // puntaje club: sólo de los vinos cuyos votos la persona ya puede ver
  const clubes = vinos.map(v => (v.consumo ? priv?.puntajes[v.consumo.id]?.club?.promedio : undefined)).filter((x): x is number => x != null);
  const clubProm = clubes.length ? clubes.reduce((s, x) => s + x, 0) / clubes.length : null;
  const portadaPriv = pj?.portada;
  const conFoto = !!portadaPriv || (esGrupo && j.foto && !rota);
  const puedeVotar = !!pj && pj.abierta && pj.soyAsistente;
  const puedeSubir = !!pj && !!acc && pj.puedeFotos;
  const soltar = async (ev: React.DragEvent) => {
    ev.preventDefault(); setArrastrando(false);
    if (!pj || !acc || !pj.puedeFotos) return;
    setSubiendo(true);
    await subirFotos(pj.id, [...ev.dataTransfer.files]);
    setSubiendo(false); acc.recargar();
  };
  const stats: [string, string][] = vinos.length ? [
    ['Edad al abrir', r.edad != null ? `${fmtN(r.edad, 1)} años` : '—'],
    ...(clubProm != null ? [['Puntaje club promedio', fmtN(clubProm, 1)] as [string, string]] : []),
    ['Vivino promedio', r.vivino != null ? fmtN(r.vivino, 1) : '—'],
    ['La más vieja de la noche', vieja ? `${vieja.bodega || vieja.vino} ${vieja.anada}` : '—'],
  ] : [];
  return (
    <div className="cj-card" data-cj="tarjeta" data-mes={j.mes}>
      <div className="cj-col cj-col-a">
        <div className={'cj-foto' + (conFoto ? ' con-foto' : '') + (arrastrando ? ' arrastrando' : '')} data-cj="foto"
          {...(puedeSubir ? { onDragOver: (ev: React.DragEvent) => { ev.preventDefault(); setArrastrando(true); }, onDragLeave: () => setArrastrando(false), onDrop: soltar } : {})}>
          {conFoto
            ? <img src={portadaPriv || `/api/juntada-foto?cava=001&mes=${j.mes}`} alt={`Botellas de la juntada de ${mesLargo(j.mes)}`} loading="lazy" onError={() => setRota(true)} />
            : <><svg className="cj-cam" aria-hidden="true"><use href="#ic-camara" /></svg><span>{puedeSubir ? 'Subí la foto de la juntada' : 'Foto de la juntada'}</span></>}
          {pj?.portadaPor && conFoto && <span className="cj-portada-por">Portada elegida por {pj.portadaPor}</span>}
          {(arrastrando || subiendo) && <span className="cj-soltar" data-cj="soltar">{subiendo ? 'Subiendo…' : 'Soltá para subir'}</span>}
          {pj && acc && (pj.fotos > 0 || pj.puedeFotos) && (
            <span className="cj-foto-bar">
              {pj.fotos > 0 && <button type="button" className="jt-subir" data-jt="ver-fotos" onClick={() => acc.galeria(pj)}>Fotos ({pj.fotos})</button>}
              {pj.puedeFotos && <BotonSubirFoto juntada={pj.id} onSubida={acc.recargar} texto="Subir" />}
            </span>
          )}
        </div>
        <Stats filas={stats} />
      </div>
      <div className="cj-col cj-col-b">
        <div className="cj-col-b-in">
          {pj && priv && <LineaAsistentes pj={pj} totalSocios={priv.totalSocios} />}
          <ol className="cj-vinos">
            {vinos.map((v, i) => {
              const e = edadDe({ anio, anada: v.anada });
              const pc = v.consumo ? priv?.puntajes[v.consumo.id] : undefined;
              const nombre = (
                <>
                  <span className="cj-num">{i + 1}</span>
                  <i className="cj-dot" style={{ background: colorDe(v.cepa), border: v.tipo === 'espumante' ? `1px solid ${ESPUMANTE_BORDE}` : undefined }} />
                  <span className="cj-vtxt">
                    <span className="cj-vnom"><span className="cj-vn">{v.vino}</span><span className="cj-va">{v.anada ? ` · ${v.anada}` : ''}{v.n > 1 ? ` ×${v.n}` : ''}</span></span>
                    <small>{[v.cepa, e != null ? `abierta con ${anios(e)}` : null].filter(Boolean).join(' · ')}</small>
                  </span>
                </>
              );
              return (
                <li key={v.consumo?.id ?? `${v.vino}|${v.anada ?? 'nv'}`} data-tipo={v.tipo}>
                  <div className="cj-vino" data-cj="vino">
                    {v.anada
                      ? <button type="button" className="cj-vino-abre" onClick={() => abrirFicha(v.vino, v.anada as number)}>{nombre}</button>
                      : <span className="cj-vino-abre">{nombre}</span>}
                    <span className="cj-der">
                      {pc?.club && v.consumo && acc && <button type="button" className="cj-club" data-cj="club" title="Puntaje del club" onClick={() => acc.puntuar(v.consumo as ConsumoPriv, puedeVotar)}>{fmtN(Math.round(pc.club.promedio))}</button>}
                      {v.consumo && acc && puedeVotar && <span data-cj="puntuar"><BotonPuntuar total={pc?.mio ? (pc.mio.total ?? null) : undefined} onClick={() => acc.puntuar(v.consumo as ConsumoPriv, true)} /></span>}
                      <span className="cj-viv">{v.vivino != null ? fmtN(v.vivino, 1) : ''}</span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <MaridajeNotas pj={pj} />
        </div>
      </div>
    </div>
  );
}

// ── la tarjeta de la juntada programada: fecha y sede, tu respuesta, confirmados y vinos designados ──
function TarjetaProgramada({ pj, priv, acc, colorDe, abrirFicha }: {
  pj: JuntadaPriv; priv: EstadoJuntadas; acc: AccionesJuntada | null; colorDe: (cepa: string) => string; abrirFicha: (vino: string, an: number) => void;
}) {
  const anio = Number(pj.fecha.slice(0, 4));
  const conAn = pj.designados.filter(d => d.anada);
  const edad = conAn.length ? conAn.reduce((s, d) => s + (anio - (d.anada as number)), 0) / conAn.length : null;
  const vieja = [...conAn].sort((a, b) => (a.anada as number) - (b.anada as number))[0];
  const van = pj.van.length;
  const botellas = botellasPara(van || priv.totalSocios);
  const sobran = pj.designados.length - botellas;
  const lineaBot = van
    ? `Con ${fmtN(van)} ${plural(van, 'confirmado', 'confirmados')} van ${fmtN(botellas)} ${plural(botellas, 'botella', 'botellas')}${sobran > 0 ? ` · ${plural(sobran, 'sobra', 'sobran')} ${fmtN(sobran)}` : sobran < 0 ? ` · ${plural(-sobran, 'falta', 'faltan')} ${fmtN(-sobran)}` : ''}`
    : `Con los ${fmtN(priv.totalSocios)} van ${fmtN(botellas)} ${plural(botellas, 'botella', 'botellas')}`;
  const nombres = pj.van.map(id => ({ id, nombre: priv.socios.find(x => x.id === id)?.nombre ?? '' }));
  const vencida = pj.puedeEmpezar && pj.fecha < priv.hoy;
  return (
    <div className="cj-card cj-prog" data-cj="tarjeta" data-programada>
      <div className="cj-col cj-col-a">
        <div className="cj-foto cj-prog-fecha" data-cj="bloque-fecha">
          <b>{fechaLarga(pj.fecha)}</b>
          {pj.hora && <span className="cj-prog-hora">{pj.hora} h</span>}
          {pj.sede && <span>Sede: {pj.sede}</span>}
          {pj.maridaje && <span>Maridaje: {pj.maridaje}</span>}
        </div>
        <Stats filas={pj.designados.length ? [
          ['Edad promedio al abrir', edad != null ? `${fmtN(edad, 1)} años` : '—'],
          ['La más vieja', vieja ? `${vieja.bodega || vieja.vino} ${vieja.anada}` : '—'],
        ] : []} />
      </div>
      <div className="cj-col cj-col-b">
        <div className="cj-col-b-in">
          {vencida && <p className="cj-aviso" data-cj="aviso-empezar">¿Se hizo la juntada? Tocá Empezamos para cargar lo que se abrió.</p>}
          <button type="button" className="cj-asis-btn cj-confirmados" data-cj="confirmados" onClick={() => acc?.confirmados(pj)}>
            <span className="cj-asis-rot">Confirmados</span>
            <b>{fmtN(van)} de {fmtN(priv.totalSocios)}</b>
            {nombres.length > 0 && <Iniciales nombres={nombres} />}
          </button>
          <div className="cj-tu-resp">
            <BotonesRespuesta pj={pj} onRespondido={() => acc?.recargar()} />
          </div>
          <ol className="cj-vinos" data-cj="designados">
            {pj.designados.map((d, i) => {
              const e = d.anada ? anio - d.anada : null;
              const nombre = (
                <>
                  <span className="cj-num">{i + 1}</span>
                  <i className="cj-dot" style={{ background: colorDe(d.cepa) }} />
                  <span className="cj-vtxt">
                    <span className="cj-vnom"><span className="cj-vn">{d.vino}</span><span className="cj-va">{d.anada ? ` · ${d.anada}` : ''}</span></span>
                    <small>{[d.cepa, e != null ? `va a tener ${anios(e)}` : null].filter(Boolean).join(' · ')}</small>
                  </span>
                </>
              );
              return (
                <li key={d.botella + i}>
                  <div className="cj-vino" data-cj="vino">
                    {d.anada ? <button type="button" className="cj-vino-abre" onClick={() => abrirFicha(d.vino, d.anada as number)}>{nombre}</button> : <span className="cj-vino-abre">{nombre}</span>}
                    <span className="cj-der"><span className="cj-viv">{d.vivino != null ? fmtN(d.vivino, 1) : ''}</span></span>
                  </div>
                </li>
              );
            })}
          </ol>
          {pj.designados.length === 0 && <p className="jt-vacio">Todavía no hay vinos designados.</p>}
          <p className="cj-linea-bot" data-cj="linea-botellas">{lineaBot}</p>
          {pj.notas && <div className="cj-mn"><p><b>Notas</b>{pj.notas}</p></div>}
        </div>
      </div>
    </div>
  );
}

// ── el filtro de años, tipo Excel ──
function FiltroAnios({ anios: ys, draft, onCambio, onCerrar }: {
  anios: number[]; draft: Set<number>; onCambio: (d: Set<number>) => void; onCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onCerrar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('mousedown', fuera);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('keydown', esc); };
  }, [onCerrar]);
  const todos = draft.size === ys.length;
  const alternar = (y: number) => { const d = new Set(draft); if (d.has(y)) d.delete(y); else d.add(y); onCambio(d); };
  return (
    <div className="ci-filtro" ref={ref} role="dialog" aria-label="Elegir años" data-cons="filtro">
      <label className="ci-op ci-op-todos">
        <input type="checkbox" checked={todos} data-anio-op="todos" onChange={() => onCambio(todos ? new Set() : new Set(ys))} />
        <span>Todos los años</span>
      </label>
      {ys.map(y => (
        <label key={y} className="ci-op">
          <input type="checkbox" checked={draft.has(y)} data-anio-op={y} onChange={() => alternar(y)} />
          <span>{y}</span>
        </label>
      ))}
      {draft.size === 0 && <p className="ci-aviso">Elegí al menos un año.</p>}
    </div>
  );
}

// ── el carrusel común ──
type Tarjeta = { key: string; titulo: string; bajada?: string; nodo: React.ReactNode };
function Carrusel({ id, nombre, color, tarjetas, fino }: { id: string; nombre: string; color: string; tarjetas: Tarjeta[]; fino: boolean }) {
  const pista = useRef<HTMLDivElement>(null);
  const [act, setAct] = useState(0);
  const [bordes, setBordes] = useState({ ini: true, fin: false });
  const medir = useCallback(() => {
    const p = pista.current;
    if (!p) return;
    const t = p.children[0] as HTMLElement | undefined;
    if (t) setAct(Math.min(p.children.length - 1, Math.max(0, Math.round(p.scrollLeft / (t.offsetWidth + 12)))));
    setBordes({ ini: p.scrollLeft <= 2, fin: p.scrollLeft + p.clientWidth >= p.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir, tarjetas.length]);
  if (!tarjetas.length) return null;
  const mover = (dir: number) => {
    const p = pista.current, t = p?.children[0] as HTMLElement | undefined;
    if (p && t) p.scrollBy({ left: dir * (t.offsetWidth + 12), behavior: 'smooth' });
  };
  return (
    <div className="cons-car" data-car={id} style={{ ['--sec-c' as string]: color }}>
      <div className="cc-cab">
        <i className="cc-cuad" />
        <h3 className="cc-nombre">{nombre}</h3>
        <span className="cc-n">{tarjetas.length} {plural(tarjetas.length, 'gráfico', 'gráficos')}{fino ? '' : ' · deslizá'}</span>
        {fino && (
          <span className="cc-flechas">
            <button type="button" className="cc-fl" data-cc="prev" aria-label={`${nombre}: gráfico anterior`} disabled={bordes.ini} onClick={() => mover(-1)}>‹</button>
            <button type="button" className="cc-fl" data-cc="next" aria-label={`${nombre}: gráfico siguiente`} disabled={bordes.fin} onClick={() => mover(1)}>›</button>
          </span>
        )}
      </div>
      <div className="cc-pista" ref={pista} onScroll={medir}>
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
    </div>
  );
}

// ── la dona del tipo de vino ──
function Dona({ items, total }: { items: { tipo: string; n: number }[]; total: number }) {
  const R = 74, W = 40, C = 2 * Math.PI * R;
  let acum = 0;
  const seg = (it: { tipo: string; n: number }, desde: number) => {
    const largo = it.n / total * C;
    const comun = { cx: 100, cy: 100, r: R, fill: 'none', strokeDasharray: `${largo} ${C - largo}`, strokeDashoffset: -desde, transform: 'rotate(-90 100 100)' };
    return { largo, comun };
  };
  return (
    <div className="cs-dona">
      <div className="cs-dona-svg">
        <svg viewBox="0 0 200 200" role="img" aria-label="Tinto, blanco o espumante">
          {items.map(it => {
            const { largo, comun } = seg(it, acum);
            acum += largo;
            const claro = it.tipo === 'espumante';
            return (
              <g key={it.tipo} data-tipo={it.tipo}>
                {claro && <circle {...comun} stroke={ESPUMANTE_BORDE} strokeWidth={W + 2} />}
                <circle {...comun} stroke={TIPO_COLOR[it.tipo] ?? COLOR_NEUTRO} strokeWidth={claro ? W - 1 : W} />
              </g>
            );
          })}
        </svg>
        <div className="cs-dona-centro"><b>{fmtN(total)}</b><span>abiertas</span></div>
      </div>
      <div className="cs-leyenda">
        {items.map(it => {
          const p = it.n / total * 100;
          return (
            <span key={it.tipo} className="cs-leg" data-tipo={it.tipo}>
              <i style={{ background: TIPO_COLOR[it.tipo] ?? COLOR_NEUTRO, border: it.tipo === 'espumante' ? `1px solid ${ESPUMANTE_BORDE}` : undefined }} />
              <span>{it.tipo.charAt(0).toUpperCase() + it.tipo.slice(1)} <b>{fmtN(it.n)}</b> · {p < 1 ? 'menos de 1%' : `${fmtN(Math.round(p))}%`}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ── la pestaña ──
// El informe de la cava #001 (público, sin dinero), desenfocado y sin poder tocarse, debajo de un candado con el avance hacia las 10 botellas.
function InformeBloqueado({ n }: { n: number }) {
  const [d, setD] = useState<{ consumos?: ConsumosApi; cepas?: CepasBloque } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch('/api/cava').then(r => r.json()).then(x => { if (vivo && !x.error) setD(x); }).catch(() => {});
    return () => { vivo = false; };
  }, []);
  return (
    <div className="cons-bloq" data-cons="bloqueado">
      <div className="cons-bloq-informe" aria-hidden="true" {...({ inert: '' } as object)}>
        {d?.consumos && <Consumos datos={d.consumos} cargando={false} esGrupo cepas={d.cepas} abrirFicha={() => {}} soloInforme />}
      </div>
      <div className="cons-bloq-aviso" role="status">
        <svg className="lk" aria-hidden="true"><use href="#lock" /></svg>
        <b>Abrí {MIN_DESBLOQUEO} botellas para desbloquear tu informe de consumos</b>
        <div className="cons-bloq-barra" role="progressbar" aria-valuemin={0} aria-valuemax={MIN_DESBLOQUEO} aria-valuenow={n}><i style={{ width: `${Math.min(100, n / MIN_DESBLOQUEO * 100)}%` }} /></div>
        <span data-cons="avance">{fmtN(n)} de {MIN_DESBLOQUEO}</span>
      </div>
    </div>
  );
}

export default function Consumos({ datos, cargando, esGrupo, cepas, abrirFicha, priv = null, acc = null, armar, abrirBotella, foco, soloInforme = false }: {
  datos: ConsumosApi | undefined; cargando: boolean; esGrupo: boolean; cepas?: CepasBloque; abrirFicha: (vino: string, an: number) => void;
  priv?: EstadoJuntadas | null; acc?: AccionesJuntada | null; armar?: () => void; abrirBotella?: () => void; foco?: { nombre: string; n: number } | null;
  soloInforme?: boolean;   // sólo el informe, quieto (el que va desenfocado detrás del candado)
}) {
  const ahora = new Date().getFullYear();
  const publicas = datos?.juntadas ?? [];
  const juntadas = useMemo(() => {
    const extra: JuntadaCons[] = (priv?.individual ? [] : priv?.juntadas ?? [])
      .filter(pj => (pj.consumos.length || pj.programada) && !publicas.some(j => j.clave === 't:' + pj.nombre))
      .map(pj => ({ clave: 't:' + pj.nombre, mes: pj.fecha.slice(0, 7), dia: pj.exacto ? Number(pj.fecha.slice(8, 10)) : null, foto: pj.fotos > 0, programada: pj.programada,
        filas: pj.consumos.map(c => ({ vino: c.vino, anada: c.anada, cepa: c.cepa, tipo: c.tipo, vivino: c.vivino, bodega: c.bodega, pais: '', provincia: '', region: '', n: 1, orden: c.orden })) }));
    return extra.length ? [...publicas, ...extra].sort((a, b) => Number(!!a.programada) - Number(!!b.programada) || a.mes.localeCompare(b.mes) || (a.dia ?? 0) - (b.dia ?? 0)) : publicas;
  }, [publicas, priv]);
  const fino = usePunteroFino();
  const [idx, setIdx] = useState(-1);
  // años elegidos: null = todos. El borrador es lo que muestran las casillas (puede quedar vacío un momento).
  const [aplic, setAplic] = useState<number[] | null>(null);
  const [draft, setDraft] = useState<Set<number> | null>(null);
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  const [cepaSel, setCepaSel] = useState<string | null>(null);
  const [anadaSel, setAnadaSel] = useState<string | number | null>(null);
  const [barraSel, setBarraSel] = useState<string | null>(null);
  const [podio, setPodio] = useState<string | null>(null);
  const ultimaHecha = juntadas.reduce((u, x, i) => (x.programada ? u : i), juntadas.length - 1);
  const actual = idx < 0 ? ultimaHecha : Math.min(idx, juntadas.length - 1);
  const nRealizadas = juntadas.filter(x => !x.programada).length;

  const todas: Fila[] = useMemo(() => publicas.flatMap((j, ji) =>
    j.filas.map(f => ({ ...f, anada: f.anada || null, anio: anioDe(j), mesN: Number(j.mes.slice(5, 7)), ji, juntada: j.clave }))), [publicas]);
  const aniosConConsumos = useMemo(() => [...new Set(todas.map(f => f.anio))].sort((a, b) => b - a), [todas]);
  const filtro = useMemo(() => (aplic ? todas.filter(f => aplic.includes(f.anio)) : todas), [todas, aplic]);
  const claveFiltro = aplic ? aplic.join(',') : 'todos';
  useEffect(() => { setCepaSel(null); setAnadaSel(null); setBarraSel(null); setPodio(null); }, [claveFiltro]);
  useEffect(() => {
    if (!foco) return;
    const k = juntadas.findIndex(j => j.clave === 't:' + foco.nombre);
    if (k >= 0) setIdx(k);
  }, [foco, juntadas]);
  const cerrarFiltro = useCallback(() => setFiltroAbierto(false), []);

  const cepaPor = useMemo(() => new Map((cepas?.lista ?? []).map(c => [c.nombre, c])), [cepas]);
  const colorDe = (cepa: string) => (cepa === 'Espumantes' ? ESPUMANTE : cepaPor.get(cepa)?.color ?? COLOR_NEUTRO);

  const total = resumir(todas);
  if (!datos && cargando) return <div className="cons-sec"><div className="cons-cab"><h2>Consumos</h2><p>Cargando…</p></div></div>;
  const individual = !!priv?.individual;
  const bloqueado = !soloInforme && total.botellas < MIN_DESBLOQUEO;
  // cava individual: el promedio de los puntajes totales de la persona, sin decimales
  const misPuntajes = individual && priv ? priv.individuales.map(c => priv.puntajes[c.id]?.mio?.total).filter((x): x is number => x != null) : [];
  const miPromedio = misPuntajes.length ? Math.round(misPuntajes.reduce((s, x) => s + x, 0) / misPuntajes.length) : null;
  const unAnioTodo = aniosConConsumos.length === 1;
  const botonArmar = priv?.puedeArmar && armar
    ? <button type="button" className="jt-armar" data-jt="armar-juntada" onClick={armar}>+ Armar juntada</button> : null;
  if (!juntadas.length && !individual && !soloInforme) {
    return (
      <div className="cons-sec" data-cons="vacio">
        <div className="cons-cab"><h2>Consumos</h2></div>
        {botonArmar}
        <div className="cons-vacio"><svg aria-hidden="true"><use href="#nv-consumos" /></svg><span>Todavía no abrieron botellas. Cuando abran la primera, aparece acá.</span></div>
      </div>
    );
  }
  const primerAnio = aniosConConsumos[aniosConConsumos.length - 1];
  const j = juntadas[actual];
  const pjAct = j ? priv?.juntadas.find(x => j.clave === 't:' + x.nombre) ?? null : null;
  const aniosAsc = [...aniosConConsumos].reverse();
  const elegir = (d: Set<number>) => {
    setDraft(d);
    if (d.size) setAplic(d.size === aniosAsc.length ? null : [...d].sort((a, b) => a - b));
  };
  const soloAnio = (y: number) => elegir(new Set([y]));

  // ── el informe ──
  const r = resumir(filtro);
  const completo = r.botellas >= MIN_INFORME;
  const unAnio = aplic && aplic.length === 1 ? aplic[0] : null;

  // Ritmo
  const ritmo: Tarjeta[] = [];
  const GRAD = 'linear-gradient(to top, #7E2238, #B9485F)';
  if (unAnio == null) {
    const porAnio = sumarPor(filtro, f => f.anio);
    const ys = [...porAnio.keys()].sort((a, b) => a - b);
    if (ys.length >= 2) {
      ritmo.push({
        key: 'anios', titulo: 'Botellas por año', bajada: ys.includes(ahora) ? `tocá una barra para ver ese año · ${ahora} parcial` : 'tocá una barra para ver ese año',
        nodo: <BarrasAnio activa={null} minAlto={3} onPick={y => soloAnio(y as number)}
          barras={ys.map(y => ({ clave: y, rot: `'${String(y).slice(2)}`, mostrarRot: true, v: porAnio.get(y) ?? 0, fondo: GRAD }))} />,
      });
    }
  } else {
    const porMes = sumarPor(filtro, f => f.mesN);
    ritmo.push({
      key: 'meses', titulo: 'Mes por mes', bajada: `botellas abiertas en ${unAnio}${unAnio === ahora ? ' · parcial' : ''}`,
      nodo: <BarrasAnio activa={null} minAlto={3}
        barras={MESES_CORTOS.map((m, i) => ({ clave: m, rot: m, mostrarRot: true, v: porMes.get(i + 1) ?? 0, num: porMes.get(i + 1) ? undefined : '', fondo: GRAD }))} />,
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
    cepasCar.push({ key: 'tipo', titulo: 'Tinto, blanco o espumante', bajada: `${fmtN(r.botellas)} abiertas, por tipo`, nodo: <Dona items={tiposOrd.map(([tipo, n]) => ({ tipo, n }))} total={r.botellas} /> });
  }
  const porCepa = [...sumarPor(filtro, f => f.cepa).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
  if (porCepa.length) {
    const sel = cepaSel ? cepaPor.get(cepaSel) ?? null : null;
    cepasCar.push({
      key: 'mosaico', titulo: 'Las cepas de un vistazo', bajada: `${fmtN(porCepa.length)} ${plural(porCepa.length, 'cepa probada', 'cepas probadas')} · el tamaño es lo que se abrió`,
      nodo: (
        <>
          <MosaicoCepas items={porCepa.map(([nombre, valor]) => ({ nombre, color: colorDe(nombre), valor }))}
            sel={cepaSel} chicasMax={8} onPick={n => setCepaSel(s => (s === n ? null : n))} />
          {sel && <FichaCepaPanel cepa={sel} onClose={() => setCepaSel(null)} />}
        </>
      ),
    });
  }
  if (porCepa.length >= 2) {
    cepasCar.push({
      key: 'espejo', titulo: '¿Se guarda o se toma?', bajada: 'lo abierto en este período, contra lo que hoy está en guarda',
      nodo: <EspejoFilas nombres cabecera={['abiertas', 'guarda', '% guardado']} filas={porCepa.slice(0, FILAS_LISTA).map(([nombre, ab]) => ({
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
  // filas en dos renglones: el nombre completo arriba; la barra, el número y el % abajo
  const filasBarra = (orden: [string, number][], ds: (k: string) => Record<string, string>, rot: (k: string) => string) => {
    const tope = Math.max(1, ...orden.map(o => o[1]));
    return <div className="tr-lista cs-2r">{orden.map(([k, n]) => <FilaBarra key={k} rot={rot(k)} n={n} tope={tope} total={r.botellas} color={OLIVA} datos={ds(k)} />)}</div>;
  };
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es')).slice(0, FILAS_LISTA);
  const porRegion = new Map<string, number>();
  const nomRegion = new Map<string, string>();
  for (const f of filtro) {
    if (!f.region) continue;
    const k = `${f.pais}|${f.region}`;
    porRegion.set(k, (porRegion.get(k) ?? 0) + f.n);
    nomRegion.set(k, f.pais && f.pais !== 'Argentina' ? `${f.region} (${f.pais})` : f.region);
  }
  if (porRegion.size) {
    const o = top(porRegion);
    geoCar.push({ key: 'regiones', titulo: 'Las regiones', bajada: `las ${fmtN(o.length)} más abiertas`, nodo: filasBarra(o, k => ({ 'data-region': k }), k => nomRegion.get(k) ?? k) });
  }
  const porBodega = sumarPor(filtro, f => f.bodega);
  if (porBodega.size) {
    const o = top(porBodega);
    geoCar.push({ key: 'bodegas', titulo: 'Las bodegas', bajada: `las ${fmtN(o.length)} más abiertas`, nodo: filasBarra(o, k => ({ 'data-bodega': k }), k => k) });
  }

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
    for (let y = agrupar ? corte : min; y <= max; y++) barras.push({ clave: y, rot: `'${String(y).slice(2)}`, mostrarRot: (max - y) % 4 === 0 && !(agrupar && y - corte < 2), v: porAnada.get(y) ?? 0 });
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
          cajas={[{ n: fmtN(new Set(fs.map(f => f.cepa)).size), l: 'Cepas' }, { n: fmtN(new Set(fs.map(f => f.bodega)).size), l: 'Bodegas' }]}
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
      nodo: <div className="cs-medidor"><MedidorVivino promedio={r.vivino} /><b data-prom={r.vivino}>{fmtN(r.vivino, 1)}</b></div>,
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

  const borrador = draft ?? new Set(aplic ?? aniosAsc);
  return (
    <div className="cons-sec" data-cons="raiz" style={{ ['--sec-c' as string]: COLOR_CONS }}>
      {!soloInforme && <div className="cons-cab">
        <h2>Consumos</h2>
        {publicas.length > 0 && !individual && <p data-cons="linea">{fmtN(nRealizadas)} {plural(nRealizadas, 'juntada', 'juntadas')} · {fmtN(total.botellas)} {plural(total.botellas, 'botella abierta', 'botellas abiertas')} desde {primerAnio}</p>}
        {individual && publicas.length > 0 && <p data-cons="linea">{fmtN(total.botellas)} {plural(total.botellas, 'botella abierta', 'botellas abiertas')} {unAnioTodo ? `en ${primerAnio}` : `desde ${primerAnio}`}</p>}
      </div>}

      {soloInforme ? null : individual && priv ? (
        <ListadoIndividual e={priv} cavaTxt={acc?.cavaTxt ?? ''} onPuntuar={c => acc?.puntuar(c, priv.esDueno)} onAbrir={() => abrirBotella?.()} onDeshacer={c => acc?.deshacer(c)} />
      ) : (<>
      {botonArmar}
      <NavJuntadas juntadas={juntadas} idx={actual} onIr={setIdx} pj={pjAct} priv={priv} acc={acc} />
      {j.programada && pjAct && priv
        ? <TarjetaProgramada pj={pjAct} priv={priv} acc={acc} colorDe={colorDe} abrirFicha={abrirFicha} />
        : <TarjetaJuntada j={j} esGrupo={esGrupo} colorDe={colorDe} abrirFicha={abrirFicha} priv={priv} pj={pjAct} acc={acc} />}
      </>)}

      {(publicas.length > 0 || individual) && (<>
      {bloqueado ? null : soloInforme ? (
        <div className="ci-head ci-head-quieto"><span className="ci-titulo"><span className="ci-tt">Informe de consumos · Todos los años</span></span></div>
      ) : <div className="ci-head" data-cons="chips">
        <button type="button" className="ci-titulo" data-cons="informe" aria-expanded={filtroAbierto} aria-haspopup="dialog"
          onClick={() => { setDraft(new Set(aplic ?? aniosAsc)); setFiltroAbierto(v => !v); }}>
          <span className="ci-tt">Informe de consumos · <span data-cons="periodo">{periodo(aplic)}</span></span>
          <span className="ci-flecha" aria-hidden="true">▾</span>
        </button>
        {filtroAbierto && <FiltroAnios anios={aniosAsc} draft={borrador} onCambio={elegir} onCerrar={cerrarFiltro} />}
      </div>}
      <div className={'ci-cajas' + (bloqueado ? ' ci-cajas-sola' : '')} data-cons="cajas">
        <div><b>{fmtN(r.botellas)}</b><span>Botellas</span></div>
        {individual
          ? <div><b data-cons="mi-puntaje">{miPromedio != null ? fmtN(miPromedio) : '—'}</b><span>Tu puntaje prom.</span></div>
          : <div><b>{fmtN(r.juntadas)}</b><span>{plural(r.juntadas, 'Juntada', 'Juntadas')}</span></div>}
        <div><b>{r.edad != null ? fmtN(r.edad, 1) : '—'}</b><span>Años al abrir</span></div>
        <div><b>{r.vivino != null ? fmtN(r.vivino, 1) : '—'}</b><span>Vivino prom.</span></div>
      </div>

      {bloqueado ? <InformeBloqueado n={total.botellas} /> : <>
      <Carrusel id="ritmo" nombre="Ritmo" color={COLOR_RITMO} tarjetas={ritmo} fino={fino && !soloInforme} />
      {completo && (
        <>
          <Carrusel id="cepas" nombre="Cepas y estilos" color={COLOR_CEPAS} tarjetas={cepasCar} fino={fino && !soloInforme} />
          <Carrusel id="geografia" nombre="Geografía" color={COLOR_GEO} tarjetas={geoCar} fino={fino && !soloInforme} />
          <Carrusel id="anadas" nombre="Añadas" color={COLOR_ANADAS} tarjetas={anadasCar} fino={fino && !soloInforme} />
          <Carrusel id="calidad" nombre="Calidad" color={COLOR_CALIDAD} tarjetas={calCar} fino={fino && !soloInforme} />
        </>
      )}
      </>}
      </>)}
    </div>
  );
}
