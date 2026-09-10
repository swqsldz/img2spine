import path from "node:path";
import { articulatedArtIssues } from "./articulated-art.ts";
import {
  checkPresentation,
  actionViews,
  presentation,
} from "./presentation.ts";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import {
  checkRig,
  jobSchema,
  manifestSchema,
  rigSchema,
  motionSchema,
  type JobSpec,
  type AssetManifest,
  type RigSpec,
  type MotionSpec,
} from "./schema.ts";
import { checkMotion, compileClip } from "./motion.ts";
import { worlds, inverse, transform } from "./math.ts";
import { createMesh, assetToWorld } from "./mesh.ts";
import { packAtlas, reconstruct } from "./assets.ts";
import {
  assertRuntime,
  LOCK,
  RUNTIME,
  hash,
  writeJson,
  readJson,
} from "./io.ts";
import { assetPlanSchema, productionIssues } from "./production.ts";
import { compareMaster } from "./master-comparison.ts";
export async function compile(
  jobInput: JobSpec,
  assetInput: AssetManifest,
  rigInput: RigSpec,
  motionInput: MotionSpec,
  base: string,
  out: string,
) {
  assertRuntime();
  const job = jobSchema.parse(jobInput),
    assets = manifestSchema.parse(assetInput),
    rig = rigSchema.parse(rigInput),
    motion = motionSchema.parse(motionInput);
  checkRig(rig, assets);
  let productionPlan;
  try {
    productionPlan = assetPlanSchema.parse(
      await readJson(path.join(base, "asset-plan.json")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (productionPlan) {
    const issues = productionIssues(job, productionPlan, assets, rig);
    if (issues.length) throw new Error(issues.join("\n"));
  }
  checkMotion(motion, job, rig);
  checkPresentation(job, assets, rig, motion);
  const artIssues = articulatedArtIssues(job, assets, rig, motion);
  if (artIssues.length)
    throw new Error(artIssues.map((i) => `${i.code}: ${i.message}`).join("\n"));
  await mkdir(out, { recursive: true });
  if (productionPlan)
    await writeJson(path.join(out, "asset-plan.json"), productionPlan);
  const wm = worlds(rig.bones),
    attachments: any = {};
  for (const slot of rig.slots) {
    attachments[slot.name] = {};
    for (const att of slot.attachments) {
      const asset = assets.assets.find((a) => a.id === att.asset)!;
      if (!asset.normalizedFile) throw new Error(`Run ingest for ${asset.id}`);
      if (att.type === "mesh")
        attachments[slot.name][att.name] = await createMesh(
          path.resolve(base, asset.normalizedFile),
          asset,
          job,
          rig.bones,
          att.influences.length ? att.influences : [slot.bone],
          att.spacing,
          att.jointBlend,
        );
      else {
        const inv = inverse(wm.get(slot.bone)!);
        const origin = transform(
          inv,
          assetToWorld(asset, job, [
            asset.placement.width / 2,
            asset.placement.height / 2,
          ]),
        );
        const bx = transform(
          inv,
          assetToWorld(asset, job, [
            asset.placement.width / 2 + 1,
            asset.placement.height / 2,
          ]),
        );
        const by = transform(
          inv,
          assetToWorld(asset, job, [
            asset.placement.width / 2,
            asset.placement.height / 2 - 1,
          ]),
        );
        const dx = bx[0] - origin[0],
          dy = bx[1] - origin[1],
          ex = by[0] - origin[0],
          ey = by[1] - origin[1];
        if (Math.abs(dx * ex + dy * ey) > 1e-5)
          throw new Error(
            `Region ${att.name} requires shear compensation; use mesh for this bind transform`,
          );
        attachments[slot.name][att.name] = {
          type: "region",
          path: asset.id,
          x: origin[0],
          y: origin[1],
          rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
          scaleX: Math.hypot(dx, dy),
          scaleY: Math.hypot(ex, ey) * Math.sign(dx * ey - dy * ex),
          width: asset.placement.width,
          height: asset.placement.height,
        };
      }
    }
  }
  const skeleton: any = {
    skeleton: {
      spine: LOCK.dataVersion,
      hash: "",
      x: -job.canvas.origin[0],
      y: job.canvas.origin[1] - job.canvas.height,
      width: job.canvas.width,
      height: job.canvas.height,
      fps: job.fps,
      images: "./",
    },
    bones: rig.bones.map(({ range, ...b }) => b),
    slots: rig.slots.map((s) => ({
      name: s.name,
      bone: s.bone,
      attachment: s.attachment,
    })),
    constraints: rig.ik.map((i) => ({ type: "ik", ...i })),
    skins: [{ name: "default", attachments }],
    animations: Object.fromEntries(
      motion.clips.map((c) => [c.name, compileClip(c, rig, job.fps)]),
    ),
  };
  for (const c of motion.clips)
    for (const d of c.deforms) {
      const att = attachments[d.slot][d.attachment];
      let count = 0;
      for (let i = 0; i < att.vertices.length; ) {
        const n = att.vertices[i];
        count += n * 2;
        i += 1 + n * 4;
      }
      if (d.keys.some((k) => k.vertices.length !== count))
        throw new Error(
          `Deform ${d.slot}/${d.attachment} requires ${count} weighted offsets`,
        );
    }
  skeleton.skeleton.hash = hash(JSON.stringify(skeleton));
  const packed = await packAtlas(assets, base, out, job.name);
  const skeletonFile = `${job.name}.json`;
  await writeJson(path.join(out, skeletonFile), skeleton);
  const resources = [skeletonFile, packed.atlas, ...packed.pages];
  const hashes: Record<string, string> = {};
  for (const file of resources)
    hashes[file] = hash(await readFile(path.join(out, file)));
  const bundle = {
    schemaVersion: 1,
    name: job.name,
    runtime: LOCK,
    skeleton: skeletonFile,
    ...packed,
    hashes,
    animations: job.actions.map((a) => ({ ...a, views: actionViews(job, a) })),
    presentation: presentation(job),
    reviewContextHash: hash(
      JSON.stringify({
        character: job.character,
        presentation: presentation(job),
        actions: job.actions,
        anatomy: assets.assets.map((a) => ({
          id: a.id,
          depth: a.depth,
          anatomy: a.anatomy,
          sha256: a.sha256,
          sourceRect: a.sourceRect,
        })),
        layerRules: rig.layerRules,
      }),
    ),
    job,
    rig,
    motion,
    assetSummary: assets.assets.map((a) => ({
      id: a.id,
      view: a.view,
      generation: a.generation,
      sha256: a.sha256,
      depth: a.depth,
      anatomy: a.anatomy,
      sourceRect: a.sourceRect,
    })),
    assets,
    createdAt: new Date().toISOString(),
  };
  await writeJson(path.join(out, "bundle.json"), bundle);
  const order = rig.slots.flatMap((s) =>
    s.attachment
      ? [s.attachments.find((a) => a.name === s.attachment)!.asset]
      : [],
  );
  await reconstruct(
    job,
    assets,
    base,
    order,
    path.join(out, "reconstruction.png"),
  );
  const comparison = await compareMaster(
    job,
    assets,
    base,
    path.join(out, "reconstruction.png"),
    path.join(out, "comparison"),
  );
  Object.assign(bundle, {
    masterComparison: {
      required: !!productionPlan || !!assets.master,
      ...comparison,
    },
  });
  await writeJson(path.join(out, "bundle.json"), bundle);
  await copyFile(
    path.join(RUNTIME, "LICENSE"),
    path.join(out, "SPINE-LICENSE.txt"),
  );
  return bundle;
}
