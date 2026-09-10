import type { JobSpec, AssetManifest, RigSpec, MotionSpec } from "./schema.ts";

export function presentation(job: JobSpec) {
  return {
    ...job.presentation,
    view:
      job.presentation.view ??
      (job.presentation.usage === "side-scroller"
        ? "three-quarter-side"
        : "front"),
    groundY: job.presentation.groundY ?? job.canvas.origin[1],
  };
}
export function actionViews(job: JobSpec, action: JobSpec["actions"][number]) {
  return action.views.length ? action.views : [presentation(job).view];
}
export function assetRequirements(job: JobSpec, assets?: AssetManifest) {
  const view = presentation(job);
  const required = [
    ...new Set(job.actions.flatMap((a) => actionViews(job, a))),
  ];
  const missingViews = required.filter(
    (v) => !assets?.assets.some((a) => a.view === v),
  );
  const facingConflicts =
    assets?.assets
      .filter(
        (a) =>
          required.includes(a.view) &&
          a.facing !== "neutral" &&
          a.facing !== view.facing,
      )
      .map((a) => a.id) ?? [];
  return { requiredViews: required, missingViews, facingConflicts };
}
export function checkPresentation(
  job: JobSpec,
  assets: AssetManifest,
  rig: RigSpec,
  motion: MotionSpec,
) {
  const requirements = assetRequirements(job, assets);
  if (requirements.missingViews.length)
    throw new Error(
      `Missing required artwork views: ${requirements.missingViews.join(", ")}. Generate matching artwork; changing a view label is not a perspective transform.`,
    );
  if (requirements.facingConflicts.length)
    throw new Error(
      `Artwork facing disagrees with job: ${requirements.facingConflicts.join(", ")}`,
    );
  if (presentation(job).usage !== "side-scroller") return;
  // Verify attachments actually used by each action; an unused side-view asset cannot satisfy the requirement.
  for (const action of job.actions) {
    const clip = motion.clips.find((c) => c.name === action.name)!;
    for (const slot of rig.slots) {
      const used = new Set<string>();
      const switches = clip.slots[slot.name] ?? [];
      if (!switches.length || switches[0].time > 0) {
        if (slot.attachment) used.add(slot.attachment);
      }
      for (const key of switches) if (key.attachment) used.add(key.attachment);
      for (const name of used) {
        const a = assets.assets.find(
          (a) => a.id === slot.attachments.find((t) => t.name === name)!.asset,
        )!;
        if (!actionViews(job, action).includes(a.view))
          throw new Error(
            `Side-scroller action ${action.name} uses ${a.id} (${a.view}) outside its declared views`,
          );
        if (
          job.presentation.mirrorPolicy === "separate-art" &&
          a.placement.mirror
        )
          throw new Error(
            `Separate-art facing policy forbids mirrored attachment ${a.id}`,
          );
      }
    }
  }
}
export function artBrief(job: JobSpec, rig?: RigSpec) {
  const p = presentation(job);
  return {
    morphology: job.character.morphology,
    presentation: p,
    generationGuidance:
      p.usage === "side-scroller"
        ? `2D side-scrolling game, ${p.view}, facing ${p.facing}. For three-quarter-side, use predominantly side-on silhouette, about 15–30 degrees toward viewer from strict profile, ground-level orthographic camera; no frontal or isometric composition. This describes artwork, not a runtime camera rotation.`
        : `Use ${p.view} artwork; respect the requested character anatomy.`,
    anatomy: rig?.motionModel
      ? {
          limbs: rig.motionModel.limbs.map((l) => ({
            id: l.id,
            kind: l.kind,
            phase: l.phase,
          })),
          chains: rig.motionModel.chains.map((c) => ({
            id: c.id,
            kind: c.kind,
          })),
        }
      : null,
    checks: [
      "Plan actual limb count and locomotion before generation; no default human arms/legs.",
      "Generate near/far limbs separately where proportions, shading or occlusion differ.",
      "Declare anatomical side and visible surface per paired part; camera depth and facing do not identify a left or right hand.",
      "For humanoids, plan independent hands, feet and per-part occlusion; inspect thumb/palm, inner/outer boot and asymmetric markings before reuse.",
      "Author layerRules from actual garment overlaps; do not sort whole limbs by near/far or swap them simply because a foot moves forward.",
      "Keep one facing, perspective, root anchor and ground line across clips.",
      "Do not change labels or stretch front artwork to claim a side view.",
      "Mirror only symmetric designs; asymmetric equipment and markings require separately authored facing art.",
    ],
  };
}
