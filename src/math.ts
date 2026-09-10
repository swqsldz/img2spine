import type { BoneSpec, Point } from "./schema.ts";
export type Matrix = [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function matrix(x = 0, y = 0, degrees = 0, sx = 1, sy = 1): Matrix {
  const r = (degrees * Math.PI) / 180;
  return [
    Math.cos(r) * sx,
    Math.sin(r) * sx,
    -Math.sin(r) * sy,
    Math.cos(r) * sy,
    x,
    y,
  ];
}
export function mul(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transform(m: Matrix, p: Point): Point {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}
export function inverse(m: Matrix): Matrix {
  const d = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(d) < 1e-10) throw new Error("Singular transform");
  return [
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ];
}
export function worlds(bones: BoneSpec[]) {
  const result = new Map<string, Matrix>();
  for (const b of bones)
    result.set(
      b.name,
      mul(
        b.parent ? result.get(b.parent)! : identity,
        matrix(b.x, b.y, b.rotation, b.scaleX, b.scaleY),
      ),
    );
  return result;
}
export function distanceSegment(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function fitSimilarity(source: Point[], target: Point[]) {
  if (source.length < 2 || source.length !== target.length)
    throw new Error("At least two matching landmarks required");
  const center = (ps: Point[]): Point => [
    ps.reduce((s, p) => s + p[0], 0) / ps.length,
    ps.reduce((s, p) => s + p[1], 0) / ps.length,
  ];
  const s = center(source),
    t = center(target);
  let dot = 0,
    cross = 0,
    den = 0;
  source.forEach((p, i) => {
    const x = p[0] - s[0],
      y = p[1] - s[1],
      u = target[i][0] - t[0],
      v = target[i][1] - t[1];
    dot += x * u + y * v;
    cross += x * v - y * u;
    den += x * x + y * y;
  });
  if (den < 1e-8) throw new Error("Degenerate landmarks");
  const a = dot / den,
    b = cross / den;
  const m: Matrix = [
    a,
    b,
    -b,
    a,
    t[0] - a * s[0] + b * s[1],
    t[1] - b * s[0] - a * s[1],
  ];
  return {
    matrix: m,
    error: Math.sqrt(
      source.reduce((sum, p, i) => {
        const q = transform(m, p);
        return sum + (q[0] - target[i][0]) ** 2 + (q[1] - target[i][1]) ** 2;
      }, 0) / source.length,
    ),
  };
}
