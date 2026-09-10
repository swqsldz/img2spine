import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp } from "node:fs/promises";
import sharp from "sharp";
import { ROOT } from "../src/io.ts";
import { assetSchema, jobSchema, boneSchema } from "../src/schema.ts";
import { partitionAsset } from "../src/partition.ts";
import { createMesh } from "../src/mesh.ts";
import { ingest, reconstruct } from "../src/assets.ts";
import { manifestSchema } from "../src/schema.ts";

await mkdir(path.join(ROOT, ".cache"), { recursive: true });

test("asymmetric partitions reconstruct identical pixels after ingest without recentering", async () => {
  const dir = await mkdtemp(path.join(ROOT, ".cache/partition-offset-"));
  const file = path.join(dir, "part.png"),
    width = 100,
    height = 100,
    pixels = Buffer.alloc(40000);
  // Slanted limb: the upper and lower halves have different horizontal alpha bounds.
  for (let y = 10; y < 90; y++)
    for (let x = 10 + Math.floor(y / 2); x < 25 + Math.floor(y / 2); x++)
      pixels.set([170, 90, 50, 255], (y * width + x) * 4);
  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(file);
  const a = assetSchema.parse({
    id: "limb",
    file,
    placement: { x: 15, y: 20, width: 54, height: 80 },
    generation: { mode: "synthetic-test", prompt: "test" },
  });
  const whole = await ingest(
    manifestSchema.parse({ schemaVersion: 1, assets: [a] }),
    dir,
    path.join(dir, "whole"),
  );
  const pieces = await partitionAsset(a, file, [
    { id: "upper", from: 0, to: 0.6, pair: "leg" },
    { id: "lower", from: 0.5, to: 1, pair: "foot" },
  ]);
  const parts = await ingest(
    manifestSchema.parse({ schemaVersion: 1, assets: pieces }),
    dir,
    path.join(dir, "pieces"),
  );
  const job = jobSchema.parse({
    schemaVersion: 1,
    name: "test",
    prompt: "test",
    canvas: { width: 150, height: 150, origin: [0, 0] },
    actions: [{ name: "idle", description: "idle" }],
  });
  await reconstruct(
    job,
    whole,
    path.join(dir, "whole"),
    ["limb"],
    path.join(dir, "before.png"),
  );
  await reconstruct(
    job,
    parts,
    path.join(dir, "pieces"),
    ["upper", "lower"],
    path.join(dir, "after.png"),
  );
  const before = await sharp(path.join(dir, "before.png")).raw().toBuffer();
  const after = await sharp(path.join(dir, "after.png")).raw().toBuffer();
  assert.deepEqual(
    after,
    before,
    "Piece trimming changed the registered silhouette",
  );
});

test("mechanical partitions preserve registration despite original transparent padding", async () => {
  const dir = await mkdtemp(path.join(ROOT, ".cache/partition-test-"));
  const file = path.join(dir, "part.png");
  await sharp({
    create: { width: 100, height: 100, channels: 4, background: "#00000000" },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 40, height: 80, channels: 4, background: "#884422" },
        })
          .png()
          .toBuffer(),
        left: 20,
        top: 10,
      },
    ])
    .png()
    .toFile(file);
  const a = assetSchema.parse({
    id: "leg",
    file,
    placement: { x: 10, y: 30, width: 80, height: 100 },
    generation: { mode: "synthetic-test", prompt: "test" },
  });
  const [upper, lower] = await partitionAsset(a, file, [
    { id: "upper", from: 0, to: 0.6, pair: "leg" },
    { id: "lower", from: 0.5, to: 1, pair: "foot" },
  ]);
  assert.equal(upper.placement.x, 25);
  assert.equal(upper.placement.y, 30);
  assert.equal(lower.placement.x, 25);
  assert.equal(lower.placement.y, 80);
  assert.equal(lower.placement.y + lower.placement.height, 130);
  assert.equal(
    upper.sourceRect!.top + upper.sourceRect!.height - lower.sourceRect!.top,
    8,
  );
  await assert.rejects(
    partitionAsset(
      { ...a, placement: { ...a.placement, rotation: 30 } },
      file,
      [{ id: "u", from: 0, to: 1, pair: "x" }],
    ),
    /before rotation/,
  );
});

test("sparse mesh contour does not discard opaque pixels along curved limb edges", async () => {
  const dir = await mkdtemp(path.join(ROOT, ".cache/mesh-coverage-"));
  const file = path.join(dir, "limb.png"),
    width = 120,
    height = 180,
    pixels = Buffer.alloc(width * height * 4);
  for (let y = 4; y < 176; y++) {
    const center = 60 + 25 * Math.sin(y * 0.06),
      radius = 16 + 9 * Math.cos(y * 0.09);
    for (let x = 0; x < width; x++)
      if (Math.abs(x - center) < radius)
        pixels.set([180, 100, 60, 255], (y * width + x) * 4);
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(file);
  const a = assetSchema.parse({
    id: "limb",
    file,
    placement: { x: 0, y: 0, width, height },
    generation: { mode: "synthetic-test", prompt: "test" },
  });
  const job = jobSchema.parse({
    schemaVersion: 1,
    name: "test",
    prompt: "test",
    canvas: { width, height, origin: [0, 0] },
    actions: [{ name: "idle", description: "idle" }],
  });
  const mesh = await createMesh(
    file,
    a,
    job,
    [boneSchema.parse({ name: "root" })],
    ["root"],
    24,
  );
  const points = Array.from({ length: mesh.uvs.length / 2 }, (_, i) => [
    mesh.uvs[i * 2] * width,
    mesh.uvs[i * 2 + 1] * height,
  ]);
  const cross = (a: number[], b: number[], p: number[]) =>
    (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  let covered = 0,
    total = 0;
  for (let y = 10; y < 170; y++)
    for (let x = 1; x < 119; x++) {
      if (
        !pixels[(y * width + x) * 4 + 3] ||
        !pixels[(y * width + x - 1) * 4 + 3] ||
        !pixels[(y * width + x + 1) * 4 + 3]
      )
        continue;
      total++;
      for (let i = 0; i < mesh.triangles.length; i += 3) {
        const a = points[mesh.triangles[i]],
          b = points[mesh.triangles[i + 1]],
          c = points[mesh.triangles[i + 2]],
          p = [x, y];
        const signs = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
        if (signs.every((v) => v >= -1e-6) || signs.every((v) => v <= 1e-6)) {
          covered++;
          break;
        }
      }
    }
  assert.ok(
    covered / total > 0.99,
    `Only ${covered}/${total} opaque interior pixels have mesh support`,
  );
});
