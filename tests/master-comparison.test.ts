import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT } from "../src/io.ts";
import { jobSchema, manifestSchema } from "../src/schema.ts";
import { compareMaster } from "../src/master-comparison.ts";

await mkdir(path.join(ROOT, ".cache"), { recursive: true });

test("master comparison preserves one global transform, reports absent registration and clips negative offsets", async () => {
  const dir = await mkdtemp(path.join(ROOT, ".cache/master-test-"));
  const job = jobSchema.parse({
    schemaVersion: 1,
    name: "test",
    prompt: "test",
    canvas: { width: 100, height: 100, origin: [50, 50] },
    actions: [{ name: "idle", description: "Hold pose" }],
  });
  const assets = manifestSchema.parse({
    schemaVersion: 1,
    assets: [
      {
        id: "body",
        file: "master.png",
        placement: { x: 0, y: 0, width: 20, height: 20 },
        generation: { mode: "synthetic-test", prompt: "test" },
      },
    ],
  });
  await sharp({
    create: { width: 20, height: 20, channels: 4, background: "#ff0000" },
  })
    .png()
    .toFile(path.join(dir, "master.png"));
  await sharp({
    create: { width: 100, height: 100, channels: 4, background: "#00000000" },
  })
    .png()
    .toFile(path.join(dir, "pose.png"));
  const run = () =>
    compareMaster(
      job,
      assets,
      dir,
      path.join(dir, "pose.png"),
      path.join(dir, "out"),
    );
  assert.equal((await run()).status, "missing-master");
  assets.master = "master.png";
  assert.equal((await run()).status, "missing-alignment");
  assets.masterAlignment = {
    scale: 2,
    x: -10,
    y: 15,
    basis: "Measured origin; synthetic clipping test",
  };
  const report = await run();
  assert.equal(report.status, "needs-visual-review");
  assert.equal(Object.keys(report.evidenceHashes).length, 5);
  const pixel = async (x: number, y: number) => [
    ...(await sharp(path.join(dir, "out/master-aligned.png"))
      .extract({ left: x, top: y, width: 1, height: 1 })
      .raw()
      .toBuffer()),
  ];
  assert.deepEqual(await pixel(0, 15), [255, 0, 0, 255]);
  assert.deepEqual(await pixel(29, 54), [255, 0, 0, 255]);
  assert.equal((await pixel(30, 54))[3], 0);
  assert.equal((await pixel(0, 14))[3], 0);
  assets.masterAlignment.x = 101;
  await assert.rejects(run(), /outside/);
  assert.equal(
    manifestSchema.safeParse({
      ...assets,
      masterAlignment: { ...assets.masterAlignment, scale: 0 },
    }).success,
    false,
  );
});
