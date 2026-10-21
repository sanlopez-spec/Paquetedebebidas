// Genera el path SVG de la ilustración de Geografía: el contorno real de
// Argentina, tomado de public/geo/world.geojson, reproyectado a un viewBox
// 0 0 100 100 y redondeado a 1 decimal.
//
//   node scripts/gen-ill-argentina.mjs            → imprime el atributo d
//
// El resultado está pegado en el símbolo #ill-geo de src/club/ClubCava.tsx.
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { geoMercator } from 'd3-geo';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gj = JSON.parse(readFileSync(join(ROOT, 'public', 'geo', 'world.geojson'), 'utf8'));

const arg = gj.features.find(f => f.properties?.key === 'Argentina');
if (!arg) { console.error('No encontré Argentina en world.geojson'); process.exit(1); }

const feat = { type: 'Feature', geometry: arg.geometry, properties: {} };
const proj = geoMercator().fitSize([100, 100], feat);

const polys = arg.geometry.type === 'Polygon' ? [arg.geometry.coordinates] : arg.geometry.coordinates;

function ringArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

const parts = [];
for (const poly of polys) {
  for (const ring of poly) {
    let pts = ring.map(c => proj(c)).filter(p => p && Number.isFinite(p[0]));
    while (pts.length > 1 &&
           pts[0][0] === pts[pts.length - 1][0] &&
           pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 3) continue;
    if (ringArea(pts) < 0.5) continue;
    parts.push('M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z');
  }
}

const d = parts.join('');
console.error(`anillos: ${parts.length}  caracteres: ${d.length}`);
console.log(d);
