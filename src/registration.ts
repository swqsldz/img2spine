import type {
  AssetManifest,
  JobSpec,
  Point,
  RigSpec,
  BoneSpec,
} from "./schema.ts";
import { boneSchema, rigSchema } from "./schema.ts";
import {
  fitSimilarity,
  inverse,
  transform,
  worlds,
  matrix,
  identity,
} from "./math.ts";
/** Sources are coordinates in the current unrotated normalized part image; targets are master-canvas pixels. */
export function registerAssets(
  manifest: AssetManifest,
  matches: { asset: string; source: Point[]; target: Point[] }[],
) {
  const result = structuredClone(manifest);
  const errors: Record<string, number> = {};
  for (const match of matches) {
    const asset = result.assets.find((a) => a.id === match.asset);
    if (!asset) throw new Error(`Unknown asset ${match.asset}`);
    const fit = fitSimilarity(match.source, match.target),
      m = fit.matrix,
      scale = Math.hypot(m[0], m[1]);
    if (scale < 1e-6)
      throw new Error(`Degenerate registration for ${asset.id}`);
    const width = asset.placement.width * scale,
      height = asset.placement.height * scale;
    const center = transform(m, [
      asset.placement.width / 2,
      asset.placement.height / 2,
    ]);
    asset.placement = {
      ...asset.placement,
      x: center[0] - width / 2,
      y: center[1] - height / 2,
      width,
      height,
      rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
    };
    delete asset.normalizedFile;
    delete asset.trim;
    errors[asset.id] = fit.error;
  }
  return { manifest: result, errors };
}
export function bonesFromJoints(
  job: JobSpec,
  joints: { name: string; parent?: string; point: Point; tip?: Point }[],
): BoneSpec[] {
  const bones: BoneSpec[] = [];
  const wm = new Map<string, ReturnType<typeof matrix>>();
  for (const joint of joints) {
    if (wm.has(joint.name)) throw new Error(`Duplicate joint ${joint.name}`);
    if (joint.parent && !wm.has(joint.parent))
      throw new Error("Joints must be parent first");
    const p: Point = [
      joint.point[0] - job.canvas.origin[0],
      job.canvas.origin[1] - joint.point[1],
    ];
    const tip = joint.tip
      ? [
          joint.tip[0] - job.canvas.origin[0],
          job.canvas.origin[1] - joint.tip[1],
        ]
      : null;
    const angle = tip
      ? (Math.atan2(tip[1] - p[1], tip[0] - p[0]) * 180) / Math.PI
      : 0;
    const parent = joint.parent ? wm.get(joint.parent)! : identity;
    const local = transform(inverse(parent), p);
    const parentAngle = (Math.atan2(parent[1], parent[0]) * 180) / Math.PI;
    const b = boneSchema.parse({
      name: joint.name,
      parent: joint.parent,
      x: local[0],
      y: local[1],
      rotation: angle - parentAngle,
      length: tip ? Math.hypot(tip[0] - p[0], tip[1] - p[1]) : 0,
    });
    bones.push(b);
    wm.set(b.name, matrix(p[0], p[1], angle));
  }
  return bones;
}
