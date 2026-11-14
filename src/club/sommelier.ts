// "El sommelier sugiere": las reglas de los banners de Mi cava. Sin React ni red: reciben lo que ya devolvió /api/cava.
// Sin precios ni urgencia, y nunca "valuación", "tasación", "ganancia", "inversión" ni "rendimiento".
import { WHATSAPP_NUMBER } from '../app/data';

export type ReglaId = 'vertical' | 'pais' | 'cepa' | 'equilibrio' | 'formato' | 'presupuesto';
export interface Banner { id: ReglaId; titulo: string; texto: string }

// lo mínimo que se lee de la respuesta de /api/cava (los tipos completos viven en ClubCava)
export interface DatosSommelier {
  data?: { grupal?: { pais: string; tipo: string; qty: number; eq: number }[] };
  cons?: { grupal?: { byYear: Record<string, { wines: { pais: string }[] }> } };
  colecciones?: { verticales: { vino: string; anios: { an: number }[] }[] };
  cepas?: { porDescubrir?: { nombre: string; descripcion: string }[] };
}

export const PAISES_SUGERIDOS = ['Francia', 'Italia', 'España', 'Portugal', 'EEUU', 'Chile', 'Uruguay'];
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const ALIAS: Record<string, string> = { 'estados unidos': 'eeuu', 'ee.uu.': 'eeuu', 'ee uu': 'eeuu', usa: 'eeuu' };
const clavePais = (p: string) => { const k = sinTildes(p); return ALIAS[k] ?? k; };

const UMBRAL_TINTOS = 0.85;
const RATIO_FORMATO_GRANDE = 1.75;   // equivalencia 750 / botellas: un Magnum es 2

type Azar = () => number;

// Todas las reglas que aplican a esta cava, con el texto ya armado. La vertical, si aplica, va primera (es la más fuerte).
export function reglasQueAplican(d: DatosSommelier, opts: { individualConCuota: boolean }, azar: Azar = Math.random): Banner[] {
  const filas = d.data?.grupal ?? [];
  const enGuarda = filas.filter(w => w.qty > 0);
  const total = enGuarda.reduce((s, w) => s + w.qty, 0);
  const out: Banner[] = [];

  // 1. Vertical incompleta: la que le falta una sola añada primero (la más fácil de completar); empate, el orden de la API
  const faltantes = (d.colecciones?.verticales ?? []).map(v => {
    const ans = [...new Set(v.anios.map(a => a.an))].sort((a, b) => a - b);
    const faltan: number[] = [];
    for (let y = ans[0] + 1; y < ans[ans.length - 1]; y++) if (!ans.includes(y)) faltan.push(y);
    return { vino: v.vino, primera: ans[0], ultima: ans[ans.length - 1], faltan };
  }).filter(v => v.faltan.length > 0);
  if (faltantes.length) {
    const v = faltantes.reduce((m, x) => (x.faltan.length < m.faltan.length ? x : m));
    out.push({ id: 'vertical', titulo: `Completá la vertical de ${v.vino}`, texto: `Te falta la añada ${v.faltan[0]} entre ${v.primera} y ${v.ultima}.` });
  }

  // 2. País nuevo: de la lista, los que nunca entraron (ni en guarda ni abiertos). Se sortea uno.
  if (total > 0) {
    const entraron = new Set<string>(filas.filter(w => w.qty > 0).map(w => clavePais(w.pais)));
    for (const y of Object.values(d.cons?.grupal?.byYear ?? {})) for (const w of y.wines) entraron.add(clavePais(w.pais));
    const faltan = PAISES_SUGERIDOS.filter(p => !entraron.has(clavePais(p)));
    if (faltan.length) out.push({ id: 'pais', titulo: `Nunca entró un vino de ${faltan[Math.floor(azar() * faltan.length)]} a tu cava`, texto: '¿Lo probamos este mes?' });
  }

  // 3. Cepa por descubrir: una de la tabla Cepas sin botellas en esta cava. Se sortea una.
  const nuevas = (d.cepas?.porDescubrir ?? []).filter(c => c.nombre && c.descripcion);
  if (total > 0 && nuevas.length) {
    const c = nuevas[Math.floor(azar() * nuevas.length)];
    out.push({ id: 'cepa', titulo: `Todavía no probaste ${c.nombre}`, texto: c.descripcion });
  }

  // 4. Equilibrio: los tintos pasan el 85 % de lo que está en guarda
  const tintos = enGuarda.filter(w => w.tipo === 'tinto').reduce((s, w) => s + w.qty, 0);
  if (total > 0 && tintos / total > UMBRAL_TINTOS) {
    out.push({ id: 'equilibrio', titulo: `${Math.round((tintos / total) * 10)} de cada 10 botellas de tu cava son tintas`, texto: 'Un blanco de guarda puede sorprenderte.' });
  }

  // 5. Formato grande: ni un Magnum ni nada mayor en guarda
  if (total > 0 && !enGuarda.some(w => w.eq / w.qty >= RATIO_FORMATO_GRANDE)) {
    out.push({ id: 'formato', titulo: 'Ningún Magnum en tu cava', texto: 'Los formatos grandes añejan más lento y mejor.' });
  }

  // 6. Presupuesto: sólo cavas individuales con cuota
  if (opts.individualConCuota) {
    out.push({ id: 'presupuesto', titulo: '¿Subimos tu presupuesto?', texto: 'Más margen para los vinos escasos cuando aparecen.' });
  }
  return out;
}

// De las que aplican, `cuantos` distintas: la vertical primero si está; el resto al azar. Lo último que se mostró queda afuera
// mientras alcancen las demás, para no repetir dos visitas seguidas.
export function elegirBanners(aplican: Banner[], cuantos: number, ultimos: string[], azar: Azar = Math.random): Banner[] {
  let pool = aplican.filter(b => !ultimos.includes(b.id));
  if (pool.length < cuantos) pool = aplican;
  const resto = pool.filter(b => b.id !== 'vertical');
  for (let i = resto.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [resto[i], resto[j]] = [resto[j], resto[i]]; }
  const vertical = pool.find(b => b.id === 'vertical');
  return [...(vertical ? [vertical] : []), ...resto].slice(0, cuantos);
}

export const urlPedido = (titulo: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Hola! Vi en mi cava la sugerencia «${titulo}» y me interesa.`)}`;
