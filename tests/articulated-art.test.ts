import { test } from "node:test";
import assert from "node:assert/strict";
import {
  jobSchema,
  manifestSchema,
  rigSchema,
  motionSchema,
} from "../src/schema.ts";
import { articulatedArtIssues } from "../src/articulated-art.ts";
const fixture = () => {
  const job = jobSchema.parse({
    schemaVersion: 1,
    name: "paired",
    prompt: "humanoid side game",
    character: { morphology: "humanoid" },
    presentation: { usage: "side-scroller" },
    canvas: { width: 256, height: 256, origin: [128, 240] },
    actions: [{ name: "walk", description: "walk" }],
  });
  const assets = manifestSchema.parse({
    schemaVersion: 1,
    assets: ["left", "right"].map((side, i) => ({
      id: side,
      file: side + ".png",
      sha256: "same-pixels",
      depth: i ? "near" : "far",
      anatomy: { pair: "hand", side, surface: i ? "back" : "palm" },
      placement: { x: 0, y: 0, width: 64, height: 64 },
      generation: { mode: "synthetic-test", prompt: "test" },
    })),
  });
  const rig = rigSchema.parse({
    schemaVersion: 1,
    bones: [{ name: "root" }],
    slots: ["left", "right"].map((name) => ({
      name,
      bone: "root",
      attachment: "a",
      attachments: [{ name: "a", asset: name }],
    })),
    layerRules: [
      { behind: "left", inFront: "right", reason: "far behind near" },
    ],
  });
  const motion = motionSchema.parse({
    schemaVersion: 1,
    clips: [{ name: "walk", duration: 2, loop: true }],
  });
  return { job, assets, rig, motion };
};
test("opposite sides cannot pass by renaming identical image files", () => {
  const f = fixture();
  assert.ok(
    articulatedArtIssues(f.job, f.assets, f.rig, f.motion).some(
      (i) => i.code === "DUPLICATED_PAIRED_ART",
    ),
  );
  f.assets.assets[1].placement.width = 32;
  assert.ok(
    articulatedArtIssues(f.job, f.assets, f.rig, f.motion).some(
      (i) => i.code === "DUPLICATED_PAIRED_ART",
    ),
  );
  f.assets.assets[1].sha256 = "different-pixels";
  assert.deepEqual(articulatedArtIssues(f.job, f.assets, f.rig, f.motion), []);
});
test("distinct left/right crops in one sheet are allowed; same crop is rejected", () => {
  const f = fixture();
  f.assets.assets.forEach(
    (a, i) => (a.sourceRect = { left: i * 64, top: 0, width: 64, height: 64 }),
  );
  assert.deepEqual(articulatedArtIssues(f.job, f.assets, f.rig), []);
  f.assets.assets[1].sourceRect = { ...f.assets.assets[0].sourceRect! };
  assert.ok(
    articulatedArtIssues(f.job, f.assets, f.rig).some(
      (i) => i.code === "DUPLICATED_PAIRED_ART",
    ),
  );
});
test("screen facing and near/far labels do not substitute for anatomical side", () => {
  const f = fixture();
  delete f.assets.assets[0].anatomy;
  f.assets.assets[0].facing = "left";
  assert.ok(
    articulatedArtIssues(f.job, f.assets, f.rig).some(
      (i) => i.code === "ANATOMICAL_SIDE_MISSING",
    ),
  );
});
test("layer relations check every draw-order key, including action-specific rules", () => {
  const f = fixture();
  f.assets.assets[1].sha256 = "other";
  f.motion.clips[0].drawOrder = [{ time: 1, slots: ["right", "left"] }];
  assert.ok(
    articulatedArtIssues(f.job, f.assets, f.rig, f.motion).some(
      (i) => i.code === "LAYER_ORDER" && i.target === "walk@1",
    ),
  );
  f.motion.clips[0].drawOrder = [{ time: 0, slots: ["left", "right"] }];
  f.rig.slots.reverse();
  f.rig.layerRules[0].animations = ["walk"];
  assert.deepEqual(articulatedArtIssues(f.job, f.assets, f.rig, f.motion), []);
});
