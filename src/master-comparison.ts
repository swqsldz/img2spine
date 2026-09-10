import path from "node:path";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import sharp from "sharp";
import { hash, writeJson } from "./io.ts";
import type { AssetManifest, JobSpec } from "./schema.ts";

// One uniform transform for the whole reference: never warp individual anatomy
// to conceal proportion errors. Pose differences remain visible for review.
export async function compareMaster(
  job: JobSpec,
  assets: AssetManifest,
  base: string,
  pose: string,
  out: string,
) {
  await mkdir(out, { recursive: true });
  const alignment = assets.masterAlignment;
  if (!assets.master || !alignment) {
    const report = {
      status: !assets.master ? "missing-master" : "missing-alignment",
      evidenceHashes: {} as Record<string, string>,
    };
    await writeJson(path.join(out, "master-comparison.json"), report);
    return report;
  }
  const original = await readFile(path.resolve(base, assets.master));
  const { width, height } = job.canvas;
  const meta = await sharp(original).metadata();
  const scaled = await sharp(original)
    .resize(
      Math.max(1, Math.round(meta.width! * alignment.scale)),
      Math.max(1, Math.round(meta.height! * alignment.scale)),
    )
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  const x = Math.round(alignment.x),
    y = Math.round(alignment.y);
  const left = Math.max(0, -x),
    top = Math.max(0, -y);
  const w = Math.min(scaled.info.width - left, width - Math.max(0, x));
  const h = Math.min(scaled.info.height - top, height - Math.max(0, y));
  if (w <= 0 || h <= 0)
    throw new Error("Master alignment lies outside the assembly canvas");
  const aligned = await sharp({
    create: { width, height, channels: 4, background: "#00000000" },
  })
    .composite([
      {
        input: await sharp(scaled.data)
          .extract({ left, top, width: w, height: h })
          .png()
          .toBuffer(),
        left: Math.max(0, x),
        top: Math.max(0, y),
      },
    ])
    .png()
    .toBuffer();
  await sharp(aligned).toFile(path.join(out, "master-aligned.png"));
  await sharp(original).png().toFile(path.join(out, "master-original.png"));
  await copyFile(pose, path.join(out, "assembly-reference.png"));
  const background = "#eee7dc";
  const ref = await sharp(aligned).flatten({ background }).png().toBuffer();
  const assembled = await sharp(pose).flatten({ background }).png().toBuffer();
  await sharp({
    create: { width: width * 2, height: height + 32, channels: 4, background },
  })
    .composite([
      { input: ref, left: 0, top: 32 },
      { input: assembled, left: width, top: 32 },
      {
        input: Buffer.from(
          `<svg width="${width * 2}" height="32"><g font-size="18"><text x="12" y="23">MASTER / uniform alignment</text><text x="${width + 12}" y="23">ASSEMBLED / setup order</text></g></svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile(path.join(out, "master-comparison.png"));
  const translucent = await sharp(assembled).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < translucent.length; i += 4) translucent[i] = 128;
  await sharp(ref)
    .composite([{ input: translucent, raw: { width, height, channels: 4 } }])
    .png()
    .toFile(path.join(out, "master-overlay.png"));
  const evidenceHashes: Record<string, string> = {};
  for (const file of [
    "master-original.png",
    "master-aligned.png",
    "assembly-reference.png",
    "master-comparison.png",
    "master-overlay.png",
  ])
    evidenceHashes[file] = hash(await readFile(path.join(out, file)));
  const report = {
    status: "needs-visual-review",
    alignment,
    masterHash: hash(original),
    poseHash: hash(await readFile(pose)),
    evidenceHashes,
    scope:
      "Static placement comparison, not runtime animation acceptance. Inspect identity, proportion, landmarks and occlusion; explicitly explain pose changes. Pixel similarity is not an artistic pass score.",
  };
  await writeJson(path.join(out, "master-comparison.json"), report);
  return report;
}
