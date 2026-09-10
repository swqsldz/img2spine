import { z } from "zod";
import type { JobSpec, AssetManifest, RigSpec } from "./schema.ts";
import { actionViews, presentation } from "./presentation.ts";

const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().min(1);
export const assetPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    background: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("transparent") }).strict(),
      z
        .object({
          mode: z.literal("chroma"),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          reason: text,
        })
        .strict(),
    ]),
    parts: z
      .array(
        z
          .object({
            id,
            view: id,
            description: text,
            material: text,
            depth: z.enum(["near", "far", "center"]),
            anatomy: text,
            attachment: z.enum(["region", "mesh"]),
            influences: z.array(id).default([]),
          })
          .strict(),
      )
      .min(1),
    joins: z.array(
      z
        .object({
          id,
          bone: id,
          parts: z.array(id).min(1),
          strategy: z.enum(["continuous-mesh", "covered-overlap"]),
          owner: id,
          description: text,
        })
        .strict(),
    ),
    // Back-to-front asset IDs for each view's reference assembly, not a universal animation order.
    drawOrder: z.record(id, z.array(id).min(1)),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const parts = new Map(plan.parts.map((p) => [p.id, p]));
    if (parts.size !== plan.parts.length) fail("Duplicate part ID");
    if (new Set(plan.joins.map((j) => j.id)).size !== plan.joins.length)
      fail("Duplicate join ID");
    for (const p of plan.parts) {
      if (new Set(p.influences).size !== p.influences.length)
        fail(`${p.id}: duplicate influences`);
      if (p.attachment === "region" && p.influences.length)
        fail(`${p.id}: region cannot have mesh influences`);
    }
    for (const j of plan.joins) {
      if (j.parts.some((p) => !parts.has(p)) || !j.parts.includes(j.owner))
        fail(`${j.id}: unknown part or owner`);
      if (new Set(j.parts.map((p) => parts.get(p)?.view)).size > 1)
        fail(`${j.id}: join crosses views`);
      if (
        j.strategy === "continuous-mesh" &&
        (j.parts.length !== 1 ||
          parts.get(j.owner)?.attachment !== "mesh" ||
          (parts.get(j.owner)?.influences.length ?? 0) < 2)
      )
        fail(
          `${j.id}: continuous joint requires one mesh with at least two bones`,
        );
      if (j.strategy === "covered-overlap" && j.parts.length < 2)
        fail(`${j.id}: overlap requires at least two parts`);
    }
    for (const view of new Set([
      ...plan.parts.map((p) => p.view),
      ...Object.keys(plan.drawOrder),
    ])) {
      const expected = plan.parts
        .filter((p) => p.view === view)
        .map((p) => p.id);
      const order = plan.drawOrder[view] ?? [];
      if (
        !expected.length ||
        order.length !== expected.length ||
        new Set(order).size !== order.length ||
        expected.some((p) => !order.includes(p))
      )
        fail(`${view}: drawOrder must contain every view part exactly once`);
    }
  });
export type AssetPlan = z.infer<typeof assetPlanSchema>;

export function productionIssues(
  job: JobSpec,
  plan: AssetPlan,
  assets?: AssetManifest,
  rig?: RigSpec,
) {
  const issues: string[] = [];
  for (const view of new Set(job.actions.flatMap((a) => actionViews(job, a))))
    if (!plan.parts.some((p) => p.view === view))
      issues.push(`Missing planned view: ${view}`);
  for (const p of plan.parts) {
    if (assets) {
      const asset = assets.assets.find((a) => a.id === p.id);
      if (!asset) issues.push(`Missing planned asset: ${p.id}`);
      else if (asset.view !== p.view || asset.depth !== p.depth)
        issues.push(`Asset view/depth differs from plan: ${p.id}`);
    }
    if (rig) {
      const attached = rig.slots
        .flatMap((s) => s.attachments)
        .filter((a) => a.asset === p.id);
      if (
        !attached.length ||
        attached.some(
          (a) =>
            a.type !== p.attachment ||
            p.influences.length !== a.influences.length ||
            p.influences.some((b) => !a.influences.includes(b)),
        )
      )
        issues.push(`Attachment binding differs from plan: ${p.id}`);
      for (const b of p.influences)
        if (!rig.bones.some((x) => x.name === b))
          issues.push(`Unknown planned bone: ${b}`);
    }
  }
  if (rig) {
    for (const j of plan.joins)
      if (!rig.bones.some((b) => b.name === j.bone))
        issues.push(`Unknown join bone: ${j.bone}`);
    const setup = rig.slots.flatMap((s) =>
      s.attachments.filter((a) => a.name === s.attachment).map((a) => a.asset),
    );
    for (const [view, order] of Object.entries(plan.drawOrder)) {
      const actual = setup.filter((id) => order.includes(id));
      // Other views may be inactive until an attachment switch.
      if (
        actual.some(
          (id, i) => i > 0 && order.indexOf(id) <= order.indexOf(actual[i - 1]),
        )
      )
        issues.push(`Setup draw order differs from plan: ${view}`);
    }
  }
  return issues;
}

export function productionPrompts(job: JobSpec, plan?: AssetPlan) {
  const p = presentation(job);
  const common = `Character brief: ${job.prompt}\nIdentity and morphology: ${job.character.morphology}; ${job.character.description}\nPresentation: ${p.usage}, ${p.view}, facing ${p.facing}. ${p.view === "three-quarter-side" ? "Predominantly profile, 15–30 degrees toward viewer; stable orthographic game proportions." : "Keep the explicitly requested view."}\nActions:\n${job.actions.map((a) => `- ${a.name}: ${a.description}; ${a.duration}s; loop=${a.loop}; ${a.rootMotion}; views=${actionViews(job, a).join(", ")}`).join("\n")}\n`;
  const master =
    common +
    "Create one complete assembled character reference in a relaxed bind pose, with readable appendage silhouettes and consistent scale. Preserve asymmetry, costume and anatomical side. No labels, pivots, guide dots, skeletons or cast floor shadow. This image establishes identity; it is not an animation or a layered Spine file.\n";
  const parts =
    common +
    (plan
      ? `Use the attached inspected master as identity reference. Generate only the requested parts for each view, keeping scale, lighting and material consistent.\nBackground: ${plan.background.mode === "transparent" ? "true transparent alpha, no painted checkerboard" : `flat uniform ${plan.background.color}, no gradients, shadows, spill or use of this key color in the character; preserve edge color for chroma removal`}.\nPART INVENTORY (IDs are metadata: do not paint labels):\n${plan.parts.map((a) => `- ${a.id} [${a.view}, ${a.depth}, ${a.anatomy}]: ${a.description}; material=${a.material}; binding=${a.attachment}${a.influences.length ? ` (${a.influences.join(" + ")})` : ""}.`).join("\n")}\nJOINT DESIGN:\n${plan.joins.map((j) => `- ${j.id}: ${j.strategy}, parts=${j.parts.join(" + ")}, seam owner=${j.owner}. ${j.description}`).join("\n")}\nREFERENCE OCCLUSION (back to front):\n${Object.entries(
          plan.drawOrder,
        )
          .map(([v, order]) => `${v}: ${order.join(" → ")}`)
          .join(
            "\n",
          )}\nGive each part complete hidden material and enough opaque overlap for its planned bend range. Continuous meshes must have a single continuous silhouette and natural folds across the joint: no duplicate joint caps or artificial hinge disks. Split only where specified, conceal cut edges beneath their seam owner. Keep far/near and anatomical left/right distinct; do not copy an asymmetric paired appendage. Separate parts with generous empty margins, never overlap sheet cells. If the inventory is too crowded, generate smaller semantic groups with the same master. Do not paint pivots, guides, labels, bounding boxes or anatomy markers. Preserve real armor hardware when specified.\n`
      : "PRODUCTION PLAN REQUIRED FOR NEW GENERATION: author asset-plan.json from the actual anatomy, materials and actions; run prepare again. Do not infer a universal humanoid part count.\n");
  return { master, parts };
}
