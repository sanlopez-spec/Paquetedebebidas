// Curvas suaves para los gráficos de áreas del tablero (las usan la evolución de la cava y la tarjeta de valor).
// Interpolación cúbica monótona (Fritsch–Carlson): suaviza sin pasarse de los
// valores reales, así el área no se hunde por debajo de cero en el origen.
// Devuelve sólo los segmentos C (el M inicial lo pone quien la usa).
export function monoCurves(pts: [number, number][]): string {
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
export const moveTo = (p: [number, number]) => `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
export const lineTo = (p: [number, number]) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`;
