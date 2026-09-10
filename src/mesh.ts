import sharp from "sharp";
import type { Asset, BoneSpec, JobSpec, Point } from "./schema.ts";
import { inverse, transform, worlds, matrix, distanceSegment } from "./math.ts";
export function assetToWorld(a: Asset, job: JobSpec, p: Point): Point {
  const center: Point = [
    a.placement.x + a.placement.width / 2,
    a.placement.y + a.placement.height / 2,
  ];
  const rotated = transform(
    matrix(center[0], center[1], a.placement.rotation),
    [p[0] - a.placement.width / 2, p[1] - a.placement.height / 2],
  );
  return [rotated[0] - job.canvas.origin[0], job.canvas.origin[1] - rotated[1]];
}
export async function createMesh(
  file: string,
  asset: Asset,
  job: JobSpec,
  bones: BoneSpec[],
  influences: string[],
  spacing: number,
  jointBlend = 0.3,
) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width,
    h = info.height,
    points: Point[] = [];
  const set = new Map<string, number>();
  const inside = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < w &&
    y < h &&
    data[(Math.floor(y) * w + Math.floor(x)) * 4 + 3] > 4;
  const add = (x: number, y: number) => {
    const key = `${x.toFixed(2)},${y.toFixed(2)}`;
    if (!set.has(key)) {
      set.set(key, points.length);
      points.push([x, y]);
    }
    return set.get(key)!;
  };
  // Retain complete grid cells touched by alpha. Sparse contour triangulation plus
  // midpoint filtering cuts holes in opaque edges; its unfiltered convex hull instead
  // creates long, thin triangles over concavities. Occupied cells preserve every pixel
  // with bounded triangle aspect ratios and shared internal vertices for skinning.
  const triangles: number[] = [];
  const nx = Math.max(1, Math.ceil(w / spacing));
  const ny = Math.max(1, Math.ceil(h / spacing));
  for (let iy = 0; iy < ny; iy++)
    for (let ix = 0; ix < nx; ix++) {
      const x0 = (ix * w) / nx,
        x1 = ((ix + 1) * w) / nx;
      const y0 = (iy * h) / ny,
        y1 = ((iy + 1) * h) / ny;
      let occupied = false;
      for (let y = Math.floor(y0); y < Math.ceil(y1) && !occupied; y++)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++)
          if (inside(x, y)) {
            occupied = true;
            break;
          }
      if (!occupied) continue;
      const a = add(x0, y0),
        b = add(x1, y0),
        c = add(x1, y1),
        d = add(x0, y1);
      triangles.push(a, b, c, a, c, d);
    }
  const wm = worlds(bones),
    allowed = influences.map((name) => {
      const index = bones.findIndex((b) => b.name === name);
      if (index < 0) throw new Error(`Unknown influence ${name}`);
      return { name, index, m: wm.get(name)!, length: bones[index].length };
    });
  if (points.length < 3)
    throw new Error(`Not enough opaque pixels for mesh ${asset.id}`);
  if (!triangles.length) throw new Error(`No valid triangles for ${asset.id}`);
  const weights = points.map((p) => {
    const wp = assetToWorld(asset, job, p);
    // A connected two-bone limb blends only across its joint band. Distance-only weights
    // otherwise give remote bones influence over rigid boots and shoulder caps.
    if (
      allowed.length === 2 &&
      bones[allowed[1].index].parent === allowed[0].name
    ) {
      const b = allowed[1],
        axis = transform(b.m, [1, 0]);
      const dx = axis[0] - b.m[4],
        dy = axis[1] - b.m[5],
        length = Math.hypot(dx, dy);
      const along = ((wp[0] - b.m[4]) * dx + (wp[1] - b.m[5]) * dy) / length;
      const radius = Math.max(
        6,
        Math.min(allowed[0].length, b.length) * jointBlend,
      );
      let t = Math.max(0, Math.min(1, (along + radius) / (radius * 2)));
      t = t * t * (3 - 2 * t);
      return [1 - t, t];
    }
    const raw = allowed.map(
      (b) =>
        1 /
        (distanceSegment(wp, [b.m[4], b.m[5]], transform(b.m, [b.length, 0])) **
          2 +
          36),
    );
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map((v) => v / total);
  });
  const neighbors = points.map(() => new Set<number>());
  for (let i = 0; i < triangles.length; i += 3)
    for (let j = 0; j < 3; j++) {
      const a = triangles[i + j],
        b = triangles[i + ((j + 1) % 3)];
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
  for (let pass = 0; pass < 2; pass++) {
    const old = weights.map((w) => [...w]);
    weights.forEach((w, i) => {
      if (!neighbors[i].size) return;
      w.forEach(
        (_, j) =>
          (w[j] =
            old[i][j] * 0.75 +
            ([...neighbors[i]].reduce((sum, k) => sum + old[k][j], 0) /
              neighbors[i].size) *
              0.25),
      );
    });
  }
  const vertices: number[] = [];
  points.forEach((p, i) => {
    const wp = assetToWorld(asset, job, p);
    const chosen = allowed
      .map((b, j) => ({ b, weight: weights[i][j] }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);
    const total = chosen.reduce((s, v) => s + v.weight, 0);
    vertices.push(chosen.length);
    for (const v of chosen) {
      const local = transform(inverse(v.b.m), wp);
      vertices.push(v.b.index, local[0], local[1], v.weight / total);
    }
  });
  return {
    type: "mesh",
    path: asset.id,
    uvs: points.flatMap(([x, y]) => [x / w, y / h]),
    triangles,
    vertices,
    hull: 0,
    width: w,
    height: h,
  };
}
