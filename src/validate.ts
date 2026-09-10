import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import {
  ROOT,
  LOCK,
  readJson,
  writeJson,
  hash,
  assertRuntime,
  contained,
  sameHashes,
} from "./io.ts";
import {
  type Issue,
  jobSchema,
  rigSchema,
  manifestSchema,
  motionSchema,
} from "./schema.ts";
import { articulatedArtIssues } from "./articulated-art.ts";
export async function runtime() {
  return import(pathToFileURL(path.join(ROOT, "dist/core.mjs")).href);
}
export function structural(s: any): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string, target?: string) =>
    issues.push({
      code: "STRUCTURE",
      stage: "compile",
      severity: "error",
      message,
      target,
    });
  const numeric = (v: any, p: string) => {
    if (typeof v === "number" && !Number.isFinite(v))
      error(`Non-finite number ${p}`);
    if (v && typeof v === "object")
      for (const [k, t] of Object.entries(v)) numeric(t, p + "." + k);
  };
  numeric(s, "skeleton");
  if (s.skeleton?.spine !== LOCK.dataVersion) error("Wrong data version");
  const names = new Set<string>();
  for (const [i, b] of (s.bones ?? []).entries()) {
    if (
      names.has(b.name) ||
      (b.parent && !names.has(b.parent)) ||
      (i > 0 && !b.parent)
    )
      error(`Invalid bone hierarchy ${b.name}`);
    names.add(b.name);
  }
  if (!names.size) error("No bones");
  const slots = new Set<string>();
  for (const slot of s.slots ?? []) {
    if (!names.has(slot.bone) || slots.has(slot.name))
      error(`Invalid slot ${slot.name}`);
    slots.add(slot.name);
  }
  for (const skin of s.skins ?? [])
    for (const [slot, atts] of Object.entries(skin.attachments ?? {})) {
      if (!slots.has(slot)) error(`Unknown skin slot ${slot}`);
      for (const [name, att] of Object.entries(atts as any)) {
        const a = att as any;
        if (a.type === "mesh") {
          const n = a.uvs?.length / 2;
          if (
            !Number.isInteger(n) ||
            n < 3 ||
            !a.triangles?.length ||
            a.triangles.length % 3
          )
            error("Invalid mesh arrays", name);
          if (
            a.triangles?.some(
              (i: number) => !Number.isInteger(i) || i < 0 || i >= n,
            )
          )
            error("Triangle index outside mesh", name);
          let count = 0;
          for (let i = 0; i < a.vertices?.length; ) {
            const c = a.vertices[i++];
            if (
              !Number.isInteger(c) ||
              c < 1 ||
              c > 4 ||
              i + c * 4 > a.vertices.length
            ) {
              error("Invalid weight encoding", name);
              break;
            }
            let sum = 0;
            for (let k = 0; k < c; k++) {
              const index = a.vertices[i],
                weight = a.vertices[i + 3];
              if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= names.size ||
                weight < 0
              )
                error("Invalid bone influence", name);
              sum += weight;
              i += 4;
            }
            if (Math.abs(sum - 1) > 1e-5)
              error("Weights are not normalized", name);
            count++;
          }
          if (count !== n) error("UV and weighted vertex count differs", name);
        }
      }
    }
  return issues;
}
export function geometry(S: any, skeleton: any) {
  const vertices: number[] = [];
  const attachments: {
    name: string;
    vertices: number[];
    triangles: number[];
  }[] = [];
  for (const slot of skeleton.drawOrder.appliedPose) {
    const a = slot.appliedPose.attachment;
    if (!a) continue;
    let v: number[] = [],
      tri: number[] = [];
    if (a instanceof S.RegionAttachment) {
      v = Array(8).fill(0);
      a.computeWorldVertices(slot, a.getOffsets(slot.appliedPose), v, 0, 2);
      tri = [0, 1, 2, 2, 3, 0];
    }
    if (a instanceof S.MeshAttachment) {
      v = Array(a.worldVerticesLength).fill(0);
      a.computeWorldVertices(skeleton, slot, 0, v.length, v, 0, 2);
      tri = Array.from(a.triangles);
    }
    vertices.push(...v);
    attachments.push({
      name: slot.data.name + "/" + a.name,
      vertices: v,
      triangles: tri,
    });
  }
  return { vertices, attachments };
}
export function pose(S: any, data: any, name: string, time: number) {
  const skeleton = new S.Skeleton(data),
    state = new S.AnimationState(new S.AnimationStateData(data));
  state.setAnimation(0, name, false);
  state.update(time);
  state.apply(skeleton);
  skeleton.updateWorldTransform(S.Physics.update);
  return skeleton;
}
function signedAreas(g: ReturnType<typeof geometry>) {
  const result = new Map<string, number[]>();
  for (const attachment of g.attachments) {
    const v = attachment.vertices,
      areas: number[] = [];
    for (let i = 0; i < attachment.triangles.length; i += 3) {
      const [a, b, c] = attachment.triangles.slice(i, i + 3).map((n) => n * 2);
      areas.push(
        (v[b] - v[a]) * (v[c + 1] - v[a + 1]) -
          (v[b + 1] - v[a + 1]) * (v[c] - v[a]),
      );
    }
    result.set(attachment.name, areas);
  }
  return result;
}
async function validateBundle(directory: string) {
  assertRuntime();
  const bundle = await readJson(path.join(directory, "bundle.json"));
  const s = await readJson(contained(directory, bundle.skeleton));
  const issues = structural(s);
  if (bundle.assets)
    issues.push(
      ...articulatedArtIssues(
        jobSchema.parse(bundle.job),
        manifestSchema.parse(bundle.assets),
        rigSchema.parse(bundle.rig),
        motionSchema.parse(bundle.motion),
      ),
    );
  const add = (
    code: string,
    stage: Issue["stage"],
    message: string,
    target?: string,
    severity: Issue["severity"] = "error",
  ) => {
    if (!issues.some((i) => i.code === code && i.target === target))
      issues.push({ code, stage, message, target, severity });
  };
  if (bundle.runtime?.commit !== LOCK.commit)
    add("RUNTIME", "compile", "Bundle runtime snapshot differs");
  for (const [file, expected] of Object.entries(bundle.hashes ?? {}))
    if (hash(await readFile(contained(directory, file))) !== expected)
      add("HASH", "compile", `Resource changed after compile: ${file}`, file);
  const S = await runtime();
  const atlas = new S.TextureAtlas(
    await readFile(contained(directory, bundle.atlas), "utf8"),
  );
  for (const page of atlas.pages) {
    const metadata = await sharp(contained(directory, page.name)).metadata();
    if (metadata.width !== page.width || metadata.height !== page.height)
      add("ATLAS_SIZE", "compile", "Atlas page dimensions mismatch", page.name);
    if (page.pma)
      add("ALPHA_MODE", "compile", "Expected straight alpha", page.name);
    page.setTexture(
      new S.FakeTexture({ width: metadata.width, height: metadata.height }),
    );
  }
  const summaries: any[] = [],
    rangeSweeps: any[] = [];
  let data: any;
  try {
    if (issues.some((i) => i.severity === "error"))
      throw new Error("Structural validation failed");
    data = new S.SkeletonJson(
      new S.AtlasAttachmentLoader(atlas),
    ).readSkeletonData(s);
  } catch (e) {
    add("READER", "compile", String(e));
  }
  if (data) {
    for (const bone of bundle.rig.bones) {
      if (!bone.range) continue;
      const setup = new S.Skeleton(data);
      setup.updateWorldTransform(S.Physics.update);
      const baseline = signedAreas(geometry(S, setup));
      let poses = 0,
        folds = 0;
      const [min, max] = bone.range;
      const steps = Math.max(1, Math.ceil((max - min) / 15));
      for (let i = 0; i <= steps; i++) {
        const sk = new S.Skeleton(data),
          b = sk.findBone(bone.name);
        b.pose.rotation += min + ((max - min) * i) / steps;
        sk.updateWorldTransform(S.Physics.update);
        const g = geometry(S, sk);
        poses++;
        if (g.vertices.some((v) => !Number.isFinite(v)))
          add(
            "RANGE_NONFINITE",
            "rig",
            "Non-finite geometry during range sweep",
            bone.name,
          );
        for (const [name, values] of signedAreas(g)) {
          const original = baseline.get(name);
          if (original)
            values.forEach((area, i) => {
              if (
                Math.abs(area) > 1 &&
                Math.abs(original[i]) > 1 &&
                area * original[i] < 0
              )
                folds++;
            });
        }
      }
      if (folds)
        add(
          "RANGE_FOLD",
          "rig",
          `${folds} triangle folds in declared joint range`,
          bone.name,
          "warning",
        );
      rangeSweeps.push({
        bone: bone.name,
        range: bone.range,
        poses,
        foldedTriangles: folds,
      });
    }
    for (const requested of bundle.animations)
      if (!data.animations.some((a: any) => a.name === requested.name))
        add(
          "MISSING_ACTION",
          "motion",
          "Requested animation absent",
          requested.name,
        );
    for (const animation of data.animations) {
      const spec = bundle.motion.clips.find(
          (c: any) => c.name === animation.name,
        ),
        action = bundle.animations.find((a: any) => a.name === animation.name);
      const duration = animation.duration;
      if (!spec || !action) {
        add(
          "UNKNOWN_ACTION",
          "motion",
          "Clip missing job metadata",
          animation.name,
        );
        continue;
      }
      if (Math.abs(duration - spec.duration) > 1e-4)
        add(
          "DURATION",
          "motion",
          "Export duration disagrees with specification",
          animation.name,
        );
      const start = pose(S, data, animation.name, 0),
        g0 = geometry(S, start),
        areas = signedAreas(g0);
      let frames = 0,
        changed = 0,
        maxContactError = 0,
        contactSamples = 0,
        minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        flips = 0;
      const sk = new S.Skeleton(data),
        state = new S.AnimationState(new S.AnimationStateData(data));
      const entry = state.setAnimation(0, animation.name, spec.loop);
      const cycles = spec.loop ? 3 : 1;
      for (
        let frame = 0;
        frame <= Math.ceil(duration * bundle.job.fps * cycles);
        frame++
      ) {
        if (frame) state.update(1 / bundle.job.fps);
        state.apply(sk);
        sk.updateWorldTransform(S.Physics.update);
        const g = geometry(S, sk);
        frames++;
        if (!g.vertices.length || g.vertices.some((v) => !Number.isFinite(v)))
          add(
            "NONFINITE_POSE",
            "rig",
            "Empty or non-finite runtime geometry",
            animation.name,
          );
        for (let i = 0; i < g.vertices.length; i += 2) {
          minX = Math.min(minX, g.vertices[i]);
          maxX = Math.max(maxX, g.vertices[i]);
          minY = Math.min(minY, g.vertices[i + 1]);
          maxY = Math.max(maxY, g.vertices[i + 1]);
          if (Math.abs(g.vertices[i] - (g0.vertices[i] ?? 0)) > 0.1) changed++;
        }
        const a = signedAreas(g);
        for (const [name, values] of a) {
          const original = areas.get(name);
          if (original)
            values.forEach((area, i) => {
              if (
                Math.abs(area) > 1 &&
                Math.abs(original[i]) > 1 &&
                area * original[i] < 0
              )
                flips++;
            });
        }
        // The runtime may be one floating-point epsilon before a loop boundary.
        // Contact checks must use the exact phase that produced this pose.
        const t = entry.getAnimationTime();
        for (const contact of spec.contacts) {
          if (t < contact.start || t > contact.end) continue;
          const b = sk.findBone(contact.bone)?.appliedPose;
          if (!b) {
            add("CONTACT_BONE", "rig", "Missing contact bone", contact.bone);
            continue;
          }
          contactSamples++;
          const error = Math.hypot(
            b.worldX -
              contact.point[0] -
              (contact.velocity?.[0] ?? 0) * (t - contact.start),
            b.worldY -
              contact.point[1] -
              (contact.velocity?.[1] ?? 0) * (t - contact.start),
          );
          maxContactError = Math.max(maxContactError, error);
          if (error > contact.tolerance)
            add(
              "CONTACT_SLIP",
              "motion",
              `Contact error ${error.toFixed(2)} exceeds ${contact.tolerance}px`,
              animation.name,
            );
        }
      }
      const end = pose(S, data, animation.name, duration),
        g1 = geometry(S, end);
      let seam = 0;
      const rootDelta =
        action.rootMotion === "translate"
          ? [
              end.bones[0].appliedPose.worldX -
                start.bones[0].appliedPose.worldX,
              end.bones[0].appliedPose.worldY -
                start.bones[0].appliedPose.worldY,
            ]
          : [0, 0];
      if (spec.loop) {
        if (
          g0.vertices.length !== g1.vertices.length ||
          g0.attachments.map((a) => a.name).join() !==
            g1.attachments.map((a) => a.name).join()
        )
          add(
            "LOOP_ATTACHMENT",
            "motion",
            "Loop endpoint attachments differ",
            animation.name,
          );
        else
          for (let i = 0; i < g0.vertices.length; i++)
            seam = Math.max(
              seam,
              Math.abs(g0.vertices[i] - g1.vertices[i] + rootDelta[i % 2]),
            );
        if (seam > 1)
          add(
            "LOOP_SEAM",
            "motion",
            `Loop seam ${seam.toFixed(2)}px`,
            animation.name,
          );
      }
      if (flips)
        add(
          "MESH_FOLD",
          "rig",
          `${flips} sampled triangles reverse orientation; inspect deformation`,
          animation.name,
          "warning",
        );
      if (!changed)
        add(
          "STATIC_ACTION",
          "motion",
          "No measured movement; inspect requested action",
          animation.name,
          "warning",
        );
      summaries.push({
        name: animation.name,
        duration,
        frames,
        cycles,
        bounds: { minX, minY, maxX, maxY },
        loopSeam: seam,
        contactSamples,
        maxContactError: contactSamples ? maxContactError : null,
        foldedTriangleSamples: flips,
      });
    }
  }
  let visual: any = null;
  try {
    visual = await readJson(path.join(directory, "visual-review.json"));
  } catch {}
  let visualCurrent = !!(
    visual &&
    sameHashes(visual.hashes, bundle.hashes) &&
    visual.status === "passed" &&
    visual.reviewer &&
    visual.observations?.length &&
    visual.evidence?.length &&
    bundle.animations.every((a: any) => visual.animations?.includes(a.name))
  );
  if (
    bundle.job.presentation?.usage === "side-scroller" ||
    !["unspecified", "humanoid", undefined].includes(
      bundle.job.character?.morphology,
    )
  ) {
    visualCurrent =
      visualCurrent &&
      visual.reviewContextHash === bundle.reviewContextHash &&
      visual.coverage?.morphology === bundle.job.character.morphology &&
      visual.coverage?.view === bundle.presentation.view &&
      visual.coverage?.facing === bundle.presentation.facing;
  }
  if (visualCurrent) {
    if (
      bundle.job.character?.morphology === "humanoid" &&
      bundle.job.presentation?.usage === "side-scroller"
    ) {
      visualCurrent =
        visual.checks?.laterality === true &&
        visual.checks?.occlusion === true &&
        visual.checks?.articulation === true &&
        bundle.animations.every((a: any) =>
          visual.evidence.includes(`frames/${a.name}-details.png`),
        );
    }
  }
  if (visualCurrent) {
    try {
      const browserReport = await readJson(
        path.join(directory, "browser-validation.json"),
      );
      visualCurrent =
        browserReport.passed && sameHashes(browserReport.hashes, bundle.hashes);
      if (bundle.masterComparison?.required)
        visualCurrent &&= sameHashes(
          browserReport.masterComparisonEvidenceHashes ?? {},
          bundle.masterComparison.evidenceHashes,
        );
      for (const file of visual.evidence) {
        const content = await readFile(contained(directory, file));
        if (hash(content) !== browserReport.evidenceHashes?.[file])
          visualCurrent = false;
      }
    } catch {
      visualCurrent = false;
    }
  }
  if (bundle.masterComparison?.required) {
    const comparison = bundle.masterComparison;
    let comparisonCurrent =
      comparison.status === "needs-visual-review" &&
      visual?.evidence?.includes("frames/master-runtime-comparison.png") &&
      visual?.checks?.masterComparison === true &&
      visual?.masterComparison?.observations?.length > 0 &&
      sameHashes(
        visual?.masterComparison?.evidenceHashes ?? {},
        comparison.evidenceHashes,
      );
    try {
      for (const [file, expected] of Object.entries(comparison.evidenceHashes))
        if (
          hash(await readFile(contained(directory, `comparison/${file}`))) !==
          expected
        )
          comparisonCurrent = false;
      if (
        hash(await readFile(path.join(directory, "reconstruction.png"))) !==
        comparison.poseHash
      )
        comparisonCurrent = false;
    } catch {
      comparisonCurrent = false;
    }
    visualCurrent &&= !!comparisonCurrent;
    if (!comparisonCurrent)
      add(
        "MASTER_COMPARISON_PENDING",
        "visual",
        "Compare the current assembled character with the original master; supply alignment and review current comparison evidence",
        undefined,
        "warning",
      );
  }
  if (!visualCurrent)
    add(
      "VISUAL_PENDING",
      "visual",
      "Needs visual review of current runtime frames; structural success is not artistic acceptance",
      undefined,
      "warning",
    );
  const technicalPassed = !issues.some((i) => i.severity === "error");
  const report = {
    schemaVersion: 1,
    runtime: LOCK,
    hashes: bundle.hashes,
    status: technicalPassed
      ? visualCurrent
        ? "complete"
        : "needs-visual-review"
      : "failed",
    technicalPassed,
    visualPassed: !!visualCurrent,
    issues,
    animations: summaries,
    rangeSweeps,
    checkedAt: new Date().toISOString(),
  };
  await writeJson(path.join(directory, "validation.json"), report);
  return report;
}

export async function validate(
  directory: string,
): Promise<Awaited<ReturnType<typeof validateBundle>>> {
  try {
    return await validateBundle(directory);
  } catch (error) {
    let hashes = {};
    try {
      hashes =
        (await readJson(path.join(directory, "bundle.json"))).hashes ?? {};
    } catch {}
    const report = {
      schemaVersion: 1,
      runtime: LOCK,
      hashes,
      status: "failed",
      technicalPassed: false,
      visualPassed: false,
      issues: [
        {
          code: "RESOURCE_LOAD",
          stage: "compile" as const,
          severity: "error" as const,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      animations: [],
      rangeSweeps: [],
      checkedAt: new Date().toISOString(),
    };
    await writeJson(path.join(directory, "validation.json"), report);
    return report;
  }
}
