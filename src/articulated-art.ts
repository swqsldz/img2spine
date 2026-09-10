import type {
  AssetManifest,
  JobSpec,
  RigSpec,
  MotionSpec,
  Issue,
} from "./schema.ts";

/** Anatomical side, camera depth and screen facing are independent properties. */
export function articulatedArtIssues(
  job: JobSpec,
  assets: AssetManifest,
  rig: RigSpec,
  motion?: MotionSpec,
): Issue[] {
  const issues: Issue[] = [];
  const add = (
    code: string,
    stage: Issue["stage"],
    message: string,
    target?: string,
  ) => issues.push({ code, stage, message, target, severity: "error" });
  const used = new Set(
    rig.slots.flatMap((s) => s.attachments.map((a) => a.asset)),
  );
  const parts = assets.assets.filter((a) => used.has(a.id));
  const strict =
    job.character.morphology === "humanoid" &&
    job.presentation.usage === "side-scroller";
  for (const a of parts) {
    if (
      strict &&
      a.depth !== "center" &&
      (!a.anatomy || a.anatomy.side === "center")
    )
      add(
        "ANATOMICAL_SIDE_MISSING",
        "assets",
        `${a.id}: declare actual left/right anatomy and visible surface; near/far or facing is not anatomical side.`,
        a.id,
      );
    if (
      strict &&
      a.anatomy &&
      a.anatomy.side !== "center" &&
      a.placement.mirror &&
      !a.anatomy.symmetryReason
    )
      add(
        "ANATOMICAL_MIRROR",
        "assets",
        `${a.id}: mirrored paired anatomy requires a documented symmetry decision; regenerate asymmetric hands/boots.`,
        a.id,
      );
  }
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i],
        b = parts[j];
      if (
        !a.anatomy ||
        !b.anatomy ||
        a.anatomy.side === b.anatomy.side ||
        [a.anatomy.side, b.anatomy.side].includes("center") ||
        a.anatomy.pair !== b.anatomy.pair ||
        a.view !== b.view
      )
        continue;
      const sameSource =
        a.sha256 && b.sha256 ? a.sha256 === b.sha256 : a.file === b.file;
      const sameCrop =
        JSON.stringify(a.sourceRect ?? null) ===
        JSON.stringify(b.sourceRect ?? null);
      if (
        sameSource &&
        sameCrop &&
        !(a.anatomy.symmetryReason && b.anatomy.symmetryReason)
      )
        add(
          "DUPLICATED_PAIRED_ART",
          "assets",
          `${a.id} and ${b.id} use the same source pixels for opposite anatomical sides. Renaming, moving or resizing does not produce the opposite hand/leg.`,
          `${a.id}/${b.id}`,
        );
    }
  const names = rig.slots.map((s) => s.name);
  if (strict && !rig.layerRules.length)
    add(
      "LAYER_PLAN_MISSING",
      "rig",
      "Declare part-specific layerRules for the side-game humanoid; a whole-limb near/far label is insufficient.",
    );
  for (const rule of rig.layerRules) {
    if (
      rule.behind === rule.inFront ||
      !names.includes(rule.behind) ||
      !names.includes(rule.inFront)
    ) {
      add(
        "LAYER_REFERENCE",
        "rig",
        `Invalid layer relation ${rule.behind} < ${rule.inFront}`,
      );
      continue;
    }
    if (rule.animations.some((n) => !job.actions.some((a) => a.name === n)))
      add(
        "LAYER_ANIMATION",
        "rig",
        `Unknown action in layer rule ${rule.behind} < ${rule.inFront}`,
      );
    const check = (order: string[], target: string) => {
      if (order.indexOf(rule.behind) >= order.indexOf(rule.inFront))
        add(
          "LAYER_ORDER",
          "rig",
          `${target}: ${rule.behind} must be behind ${rule.inFront}: ${rule.reason}`,
          target,
        );
    };
    if (!rule.animations.length) check(names, "setup");
    for (const clip of motion?.clips ?? []) {
      if (rule.animations.length && !rule.animations.includes(clip.name))
        continue;
      if (!clip.drawOrder.length || clip.drawOrder[0].time > 0)
        check(names, `${clip.name}@0`);
      for (const key of clip.drawOrder)
        check(key.slots, `${clip.name}@${key.time}`);
    }
  }
  return issues;
}
