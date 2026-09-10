import path from "node:path";
import { writeFile } from "node:fs/promises";
import {
  assetPlanSchema,
  productionIssues,
  productionPrompts,
} from "./production.ts";
import { articulatedArtIssues } from "./articulated-art.ts";
import { readJson, writeJson, LOCK } from "./io.ts";
import {
  jobSchema,
  manifestSchema,
  rigSchema,
  motionSchema,
  checkRig,
  type JobSpec,
  type Issue,
} from "./schema.ts";
import { checkMotion } from "./motion.ts";
import { actionViews, assetRequirements, artBrief } from "./presentation.ts";
import { anatomicalCapability } from "./anatomical-motion.ts";
export async function prepare(directory: string) {
  const job = jobSchema.parse(await readJson(path.join(directory, "job.json")));
  const missing: string[] = [];
  let assets: any, rig: any, motion: any;
  for (const [file, parse] of [
    ["assets.json", manifestSchema],
    ["rig.json", rigSchema],
    ["motion.json", motionSchema],
  ] as const) {
    try {
      const data = parse.parse(await readJson(path.join(directory, file)));
      if (file === "assets.json") assets = data;
      if (file === "rig.json") rig = data;
      if (file === "motion.json") motion = data;
    } catch (e) {
      if ((e as any).code === "ENOENT") missing.push(file);
      else throw e;
    }
  }
  if (assets && rig) checkRig(rig, assets);
  if (rig && motion) checkMotion(motion, job, rig);
  const requirements = assetRequirements(job, assets);
  const { missingViews, facingConflicts } = requirements;
  const brief = artBrief(job, rig);
  let plan;
  try {
    plan = assetPlanSchema.parse(
      await readJson(path.join(directory, "asset-plan.json")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const planIssues = plan ? productionIssues(job, plan, assets, rig) : [];
  const prompts = productionPrompts(job, plan);
  const artIssues =
    assets && rig ? articulatedArtIssues(job, assets, rig, motion) : [];
  const capabilityGaps = job.actions.flatMap((a) => {
    if (motion?.clips.some((c: any) => c.name === a.name)) return [];
    if (!rig)
      return [
        {
          action: a.name,
          reason: "Bind the actual anatomy before choosing motion primitives.",
        },
      ];
    if (rig.motionModel) {
      const reason = anatomicalCapability(a.name, rig);
      return reason ? [{ action: a.name, reason }] : [];
    }
    return job.presentation.usage === "side-scroller" ||
      !["unspecified", "humanoid"].includes(job.character.morphology)
      ? [
          {
            action: a.name,
            reason:
              "Provide anatomical motionModel or explicit custom tracks; legacy humanoid preset is not applicable.",
          },
        ]
      : [];
  });
  const result = {
    schemaVersion: 1,
    name: job.name,
    runtime: LOCK,
    status:
      missing.length ||
      missingViews.length ||
      facingConflicts.length ||
      capabilityGaps.length ||
      artIssues.length ||
      planIssues.length
        ? "needs-inputs"
        : "ready",
    missing,
    missingViews,
    facingConflicts,
    capabilityGaps,
    artIssues,
    production: {
      status: plan ? "planned" : "unplanned-legacy",
      issues: planIssues,
      plan,
    },
    artBrief: brief,
    actions: job.actions.map((a) => ({
      name: a.name,
      description: a.description,
      views: actionViews(job, a),
      hasMotion: !!motion?.clips.some((c: any) => c.name === a.name),
    })),
    next: missing.includes("assets.json")
      ? plan
        ? "Codex: inspect generated prompts, generate master and planned parts using built-in imagegen, then author AssetManifest"
        : "Codex: author asset-plan.json from anatomy, materials and actions, then run prepare again before imagegen"
      : missing.includes("rig.json")
        ? "Codex: annotate landmarks, author RigSpec with local bind transforms"
        : missing.includes("motion.json")
          ? "Codex: author MotionSpec from requested phases and poses"
          : "ingest → assemble and inspect joins → compile → validate → preview and visual review",
  };
  await writeJson(path.join(directory, "preparation.json"), result);
  await writeJson(path.join(directory, "art-brief.json"), brief);
  await writeJson(path.join(directory, "production-brief.json"), {
    job,
    plan: plan ?? null,
    issues: planIssues,
    reviewRequired: true,
  });
  await writeFile(
    path.join(directory, "imagegen-master-prompt.txt"),
    prompts.master,
    "utf8",
  );
  await writeFile(
    path.join(directory, "imagegen-parts-prompt.txt"),
    prompts.parts,
    "utf8",
  );
  return result;
}
const instructions: Record<Issue["stage"], string> = {
  assets:
    "Inspect the generated part and master; fix landmark placement or regenerate only the affected image with imagegen. Preserve source versions.",
  rig: "Inspect pose frames and affected attachment; repair local pivots, IK target placement, mesh topology or allowed weights. Recompile.",
  motion:
    "Compare requested phases and sampled poses; repair keys, contacts or endpoint continuity without deleting the requested action.",
  compile:
    "Repair schema, resource references, atlas or snapshot mismatch. Do not edit official runtime to accept invalid data.",
  visual:
    "Inspect the actual runtime frame sheet and prompt coverage. Record evidence tied to current resource hashes; regenerate or recompile when defects remain.",
};
export async function repairPlan(directory: string, job: JobSpec) {
  const report = await readJson(path.join(directory, "validation.json"));
  let history: any = { attempts: {} };
  try {
    history = await readJson(path.join(directory, "repair-history.json"));
  } catch (e) {
    if ((e as any).code !== "ENOENT") throw e;
  }
  const tasks = (report.issues as Issue[]).map((issue) => {
    const key = issue.code + ":" + (issue.target ?? "project");
    const previous = history.attempts[key] ?? { count: 0, lastHashes: null };
    const identity = JSON.stringify(report.hashes);
    // Re-reading a report is idempotent; only a newly compiled candidate consumes another attempt.
    const count = previous.count + (previous.lastHashes === identity ? 0 : 1);
    history.attempts[key] = { count, lastHashes: identity };
    return {
      ...issue,
      attempt: count,
      status: count > job.maxRepairAttempts ? "exhausted" : "actionable",
      instruction: instructions[issue.stage],
    };
  });
  const result = {
    schemaVersion: 1,
    status: tasks.some((t) => t.status === "exhausted")
      ? "incomplete"
      : "repair-required",
    tasks,
  };
  await writeJson(path.join(directory, "repair-history.json"), history);
  await writeJson(path.join(directory, "repair-plan.json"), result);
  return result;
}
