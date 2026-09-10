import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import sharp, { type OverlayOptions } from "sharp";
import { readJson, writeJson, hash } from "./io.ts";
import { jobSchema, manifestSchema, rigSchema, checkRig } from "./schema.ts";
import { reconstruct } from "./assets.ts";
import { worlds } from "./math.ts";
import { assetPlanSchema, productionIssues } from "./production.ts";
import { compareMaster } from "./master-comparison.ts";

export async function assemble(source: string, out: string) {
  const job = jobSchema.parse(await readJson(path.join(source, "job.json")));
  const assets = manifestSchema.parse(
    await readJson(path.join(source, "assets.json")),
  );
  const rig = rigSchema.parse(await readJson(path.join(source, "rig.json")));
  checkRig(rig, assets);
  let plan;
  try {
    plan = assetPlanSchema.parse(
      await readJson(path.join(source, "asset-plan.json")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  if (plan) {
    const issues = productionIssues(job, plan, assets, rig);
    if (issues.length) throw new Error(issues.join("\n"));
  }
  const order = rig.slots.flatMap((s) =>
    s.attachments.filter((a) => a.name === s.attachment).map((a) => a.asset),
  );
  for (const id of order)
    if (!assets.assets.find((a) => a.id === id)?.normalizedFile)
      throw new Error(`Run ingest first: ${id}`);
  await mkdir(out, { recursive: true });
  const poseFile = path.join(out, "assembled.png");
  await reconstruct(job, assets, source, order, poseFile);
  const masterComparison = await compareMaster(
    job,
    assets,
    source,
    poseFile,
    out,
  );
  const backgrounds = { light: "#eee7dc", dark: "#172822" };
  const previews: Record<string, Buffer> = {};
  for (const [name, color] of Object.entries(backgrounds)) {
    previews[name] = await sharp(poseFile)
      .flatten({ background: color })
      .png()
      .toBuffer();
    await sharp(previews[name]).toFile(path.join(out, `assembled-${name}.png`));
  }
  const world = worlds(rig.bones);
  const joins = plan
    ? plan.joins
    : rig.bones
        .filter((b) => b.parent && b.length > 0)
        .map((b) => ({ id: b.name, bone: b.name }));
  const radius = Math.max(
    12,
    Math.round(Math.min(job.canvas.width, job.canvas.height) * 0.075),
  );
  const crops = joins.map((j) => {
    const m = world.get(j.bone)!;
    const x = m[4] + job.canvas.origin[0],
      y = job.canvas.origin[1] - m[5];
    const left = Math.max(0, Math.floor(x - radius)),
      top = Math.max(0, Math.floor(y - radius));
    const width = Math.min(job.canvas.width, Math.ceil(x + radius)) - left;
    const height = Math.min(job.canvas.height, Math.ceil(y + radius)) - top;
    return {
      id: j.id,
      bone: j.bone,
      center: [x, y],
      rect: { left, top, width, height },
    };
  });
  const overlays: OverlayOptions[] = [];
  for (let i = 0; i < crops.length; i++) {
    const crop = crops[i];
    if (crop.rect.width <= 0 || crop.rect.height <= 0) continue;
    const col = i % 2,
      row = Math.floor(i / 2);
    for (const [index, pixels] of Object.values(previews).entries())
      overlays.push({
        input: await sharp(pixels)
          .extract(crop.rect)
          .resize(192, 192, {
            fit: "contain",
            background: Object.values(backgrounds)[index],
          })
          .png()
          .toBuffer(),
        left: col * 384 + index * 192,
        top: row * 220 + 28,
      });
    overlays.push({
      input: Buffer.from(
        `<svg width="384" height="28"><text x="8" y="20" font-size="16" fill="white">${crop.id}</text></svg>`,
      ),
      left: col * 384,
      top: row * 220,
    });
  }
  if (crops.length)
    await sharp({
      create: {
        width: 768,
        height: Math.ceil(crops.length / 2) * 220,
        channels: 4,
        background: "#303030",
      },
    })
      .composite(overlays)
      .png()
      .toFile(path.join(out, "joint-details.png"));
  const assetHashes: Record<string, string> = {};
  for (const id of new Set(order))
    assetHashes[id] = hash(
      await readFile(
        path.resolve(
          source,
          assets.assets.find((a) => a.id === id)!.normalizedFile!,
        ),
      ),
    );
  const report = {
    schemaVersion: 1,
    status: "needs-visual-review",
    scope:
      "Asset placement reconstruction in setup slot order; does not evaluate IK, mesh bends, inactive views or animation quality.",
    specHash: hash(JSON.stringify({ job, assets, rig, plan })),
    assetHashes,
    masterComparison,
    drawOrder: order,
    joints: crops,
    checks: [
      "Compare assembled identity, proportion and silhouette against the master",
      "Check actual left/right surfaces and far/near occlusion",
      "Inspect neck, hip, elbow and knee continuity on both backgrounds",
      "Re-measure landmarks after any regeneration; do not reuse old coordinates",
      "After this inspection, compile and review actual runtime range and action frames",
    ],
  };
  await writeJson(path.join(out, "assembly-report.json"), report);
  return report;
}
