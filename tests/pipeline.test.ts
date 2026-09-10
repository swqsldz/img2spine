import { test, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import sharp from "sharp";
import { ROOT, readJson, writeJson, hash, contained } from "../src/io.ts";
import { buildAll } from "../scripts/build.ts";
import { matrix, transform, inverse, fitSimilarity } from "../src/math.ts";
import {
  jobSchema,
  rigSchema,
  manifestSchema,
  motionSchema,
  checkRig,
} from "../src/schema.ts";
import { ingest, packAtlas } from "../src/assets.ts";
import { compile } from "../src/compile.ts";
import { validate, runtime, pose, geometry } from "../src/validate.ts";
import { bonesFromJoints } from "../src/registration.ts";
import { repairPlan } from "../src/workflow.ts";
import { checkMotion, preset } from "../src/motion.ts";
import { worlds } from "../src/math.ts";
import {
  presentation,
  actionViews,
  checkPresentation,
} from "../src/presentation.ts";
import { prepare } from "../src/workflow.ts";

test("side-scroller defaults to half-side artwork, with explicit view overrides preserved", () => {
  const j = jobSchema.parse({
    schemaVersion: 1,
    name: "side",
    prompt: "side game",
    canvas: { width: 256, height: 256, origin: [128, 220] },
    presentation: { usage: "side-scroller" },
    actions: [{ name: "idle", description: "idle" }],
  });
  assert.equal(presentation(j).view, "three-quarter-side");
  assert.deepEqual(actionViews(j, j.actions[0]), ["three-quarter-side"]);
  j.actions[0].views = ["profile"];
  assert.deepEqual(actionViews(j, j.actions[0]), ["profile"]);
  j.presentation.view = "profile";
  assert.equal(presentation(j).view, "profile");
});

test("nonhuman and side-game tasks never silently select legacy humanoid presets", async () => {
  const f = await fixture();
  f.job.character.morphology = "quadruped";
  assert.throws(
    () => preset("walk", "move", f.job, f.rig),
    /explicit motionModel/,
  );
  f.job.character.morphology = "humanoid";
  f.job.presentation.usage = "side-scroller";
  assert.throws(
    () => preset("walk", "move", f.job, f.rig),
    /explicit motionModel/,
  );
  assert.throws(
    () => checkPresentation(f.job, f.assets, f.rig, f.motion),
    /Missing required artwork/,
  );
  f.assets.assets.push({
    ...f.assets.assets[0],
    id: "unusedSide",
    view: "three-quarter-side",
  });
  assert.throws(
    () => checkPresentation(f.job, f.assets, f.rig, f.motion),
    /outside its declared views/,
  );
  await writeJson(path.join(f.dir, "job.json"), f.job);
  const preparation = await prepare(f.dir);
  assert.equal(preparation.status, "needs-inputs");
  assert.equal(preparation.artBrief.presentation.view, "three-quarter-side");
});

test("four and six-legged gaits solve contact trajectories in both facings and motion modes", async () => {
  const f = await fixture();
  f.assets.assets[0].view = "three-quarter-side";
  for (const count of [4, 6])
    for (const facing of ["right", "left"] as const)
      for (const rootMotion of ["in-place", "translate"] as const) {
        const bones: any[] = [
          { name: "root", rotation: 13 },
          { name: "mass", parent: "root" },
        ];
        const limbs: any[] = [],
          ik: any[] = [];
        for (let i = 0; i < count; i++) {
          const id = "limb" + i;
          bones.push(
            {
              name: id,
              parent: "mass",
              x: i * 24 - 60,
              y: 90,
              rotation: -120,
              length: 50,
            },
            { name: id + "b", parent: id, x: 50, rotation: 60, length: 50 },
            { name: id + "end", parent: id + "b", x: 50 },
          );
          limbs.push({
            id,
            kind: "leg",
            bones: [id, id + "b"],
            target: id + "target",
            end: id + "end",
            phase: (i % 2) * 0.5,
          });
          ik.push({
            name: id + "ik",
            bones: [id, id + "b"],
            target: id + "target",
            bendPositive: true,
          });
        }
        const parsed = rigSchema.shape.bones.parse(bones);
        const world = worlds(parsed),
          inv = inverse(world.get("root")!);
        for (const l of limbs) {
          const end = world.get(l.end)!;
          const p = transform(inv, [end[4], end[5]]);
          bones.push({ name: l.target, parent: "root", x: p[0], y: p[1] });
        }
        const rig = rigSchema.parse({
          schemaVersion: 1,
          bones,
          slots: [
            {
              ...f.rig.slots[0],
              bone: "mass",
              attachments: [{ name: "part", asset: "part" }],
            },
          ],
          ik,
          motionModel: {
            body: "mass",
            root: "root",
            limbs,
            gait: { stride: 10, lift: 4, stance: 0.6 },
          },
        });
        const job = jobSchema.parse({
          ...f.job,
          character: { morphology: count === 4 ? "quadruped" : "multi-legged" },
          presentation: { usage: "side-scroller", facing },
          actions: [{ ...f.job.actions[0], rootMotion }],
        });
        const clip = preset("walk", "move", job, rig);
        assert.equal(
          Object.keys(clip.bones).filter((n) => n.endsWith("target")).length,
          count,
        );
        await compile(
          job,
          f.assets,
          rig,
          motionSchema.parse({ schemaVersion: 1, clips: [clip] }),
          f.work,
          f.out,
        );
        const result = await validate(f.out);
        assert.equal(
          result.technicalPassed,
          true,
          `${count}/${facing}/${rootMotion}: ${JSON.stringify(result.issues)}`,
        );
        assert.ok(result.animations[0].contactSamples > 100);
        assert.ok(result.animations[0].maxContactError < 3);
      }
});

test("legless, axial and winged rigs compile without head or human arm roles", async () => {
  const f = await fixture();
  for (const [morphology, kind] of [
    ["amorphous", "hop"],
    ["serpentine", "slither"],
    ["winged", "fly"],
  ] as const) {
    const rig = rigSchema.parse({
      schemaVersion: 1,
      bones: [
        { name: "root" },
        { name: "mass", parent: "root" },
        { name: "a", parent: "mass", length: 30 },
        { name: "b", parent: "a", x: 30, length: 30 },
        { name: "c", parent: "b", x: 30, length: 30 },
      ],
      slots: [
        {
          ...f.rig.slots[0],
          bone: "c",
          attachments: [{ name: "part", asset: "part" }],
        },
      ],
      motionModel: {
        body: "mass",
        root: "root",
        limbs:
          morphology === "winged"
            ? [{ id: "wing", kind: "wing", bones: ["a", "b", "c"] }]
            : [],
        chains:
          morphology === "serpentine"
            ? [{ id: "axis", kind: "spine", bones: ["a", "b", "c"] }]
            : [],
      },
    });
    const job = jobSchema.parse({ ...f.job, character: { morphology } });
    const clip = preset(kind, "move", job, rig);
    assert.throws(() => preset("walk", "move", job, rig), /actual leg chains/);
    await compile(
      job,
      f.assets,
      rig,
      motionSchema.parse({ schemaVersion: 1, clips: [clip] }),
      f.work,
      f.out,
    );
    assert.equal((await validate(f.out)).technicalPassed, true);
  }
});
before(async () => {
  await buildAll();
  await mkdir(path.join(ROOT, ".cache"), { recursive: true });
});
async function fixture(type: "region" | "mesh" = "region") {
  const dir = await mkdtemp(path.join(ROOT, ".cache/test-"));
  const pixels = Buffer.alloc(64 * 64 * 4);
  for (let y = 8; y < 56; y++)
    for (let x = 12; x < 52; x++) {
      const i = (y * 64 + x) * 4;
      pixels[i] = x < 32 ? 245 : 55;
      pixels[i + 1] = 100;
      pixels[i + 2] = 40;
      pixels[i + 3] = 255;
    }
  await sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } })
    .png()
    .toFile(path.join(dir, "part.png"));
  const job = jobSchema.parse({
    schemaVersion: 1,
    name: "fixture",
    prompt: "Move one part and loop",
    canvas: { width: 256, height: 256, origin: [128, 220] },
    actions: [{ name: "move", description: "Move", duration: 1, loop: true }],
  });
  const assets = manifestSchema.parse({
    schemaVersion: 1,
    assets: [
      {
        id: "part",
        file: "part.png",
        placement: { x: 100, y: 80, width: 64, height: 64 },
        generation: { mode: "synthetic-test", prompt: "test fixture" },
      },
    ],
  });
  const rig = rigSchema.parse({
    schemaVersion: 1,
    bones: [
      { name: "root" },
      {
        name: "parent",
        parent: "root",
        x: 20,
        y: 10,
        rotation: 32,
        scaleX: 1.3,
        scaleY: 1.3,
      },
      {
        name: "part",
        parent: "parent",
        x: 12,
        y: 40,
        rotation: -16,
        length: 60,
      },
    ],
    slots: [
      {
        name: "part",
        bone: "part",
        attachment: "part",
        attachments: [
          { name: "part", asset: "part", type, influences: ["part"] },
        ],
      },
    ],
  });
  const motion = motionSchema.parse({
    schemaVersion: 1,
    clips: [
      {
        name: "move",
        duration: 1,
        loop: true,
        bones: {
          part: [
            { time: 0, rotation: 0 },
            { time: 0.5, rotation: 20 },
            { time: 1, rotation: 0 },
          ],
        },
      },
    ],
  });
  const work = path.join(dir, "work"),
    out = path.join(dir, "export");
  const ingested = await ingest(assets, dir, work);
  await compile(job, ingested, rig, motion, work, out);
  return { dir, work, out, job, assets: ingested, rig, motion };
}
test("inverse bind transform handles rotation, nonuniform scale and reflection", () => {
  const m = matrix(31, -19, 47, -2, 0.7);
  const p: [number, number] = [18, -4];
  const q = transform(inverse(m), transform(m, p));
  assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-10);
});

test("direct compiler enforces and preserves the production plan", async () => {
  const f = await fixture("mesh");
  const plan = {
    schemaVersion: 1,
    background: { mode: "transparent" },
    parts: [
      {
        id: "part",
        view: "front",
        description: "Flexible part",
        material: "cloth",
        depth: "center",
        anatomy: "central",
        attachment: "mesh",
        influences: ["part"],
      },
    ],
    joins: [],
    drawOrder: { front: ["part"] },
  };
  await writeJson(path.join(f.work, "asset-plan.json"), plan);
  await compile(f.job, f.assets, f.rig, f.motion, f.work, f.out);
  assert.deepEqual(await readJson(path.join(f.out, "asset-plan.json")), plan);
  plan.parts[0].influences = ["root"];
  await writeJson(path.join(f.work, "asset-plan.json"), plan);
  await assert.rejects(
    () => compile(f.job, f.assets, f.rig, f.motion, f.work, f.out),
    /Attachment binding differs/,
  );
});
test("landmark fit and bone generation reconstruct target joints", () => {
  const m = matrix(19, 22, 27, 1.8, 1.8),
    source: [number, number][] = [
      [0, 0],
      [0, 10],
      [10, 10],
    ],
    target = source.map((p) => transform(m, p));
  const fit = fitSimilarity(source, target);
  assert.ok(fit.error < 1e-8);
  const job = jobSchema.parse({
    schemaVersion: 1,
    name: "j",
    prompt: "j",
    canvas: { width: 100, height: 100, origin: [50, 90] },
    actions: [{ name: "a", description: "a" }],
  });
  const bones = bonesFromJoints(job, [
    { name: "root", point: [50, 90] },
    { name: "arm", parent: "root", point: [50, 60], tip: [70, 40] },
    { name: "hand", parent: "arm", point: [70, 40] },
  ]);
  assert.ok(Math.abs(bones[2].x - Math.sqrt(800)) < 1e-8);
  assert.ok(Math.abs(bones[2].y) < 1e-8);
});
test("real 4.3 reader preserves region world placement under rotated parent", async () => {
  const f = await fixture();
  const report = await validate(f.out);
  assert.equal(report.technicalPassed, true, JSON.stringify(report.issues));
  assert.equal(report.visualPassed, false);
  const S = await runtime();
  const atlas = new S.TextureAtlas(
    await readFile(path.join(f.out, "fixture.atlas"), "utf8"),
  );
  atlas.pages.forEach((p: any) =>
    p.setTexture(new S.FakeTexture({ width: p.width, height: p.height })),
  );
  const data = new S.SkeletonJson(
    new S.AtlasAttachmentLoader(atlas),
  ).readSkeletonData(await readJson(path.join(f.out, "fixture.json")));
  const g = geometry(S, pose(S, data, "move", 0));
  const xs = g.vertices.filter((_, i) => i % 2 === 0),
    ys = g.vertices.filter((_, i) => i % 2 === 1);
  const trim = f.assets.assets[0].trim!;
  const expectedX = 100 + trim.x + trim.width / 2 - 128;
  assert.ok(
    Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - expectedX) < 0.1,
  );
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 108) < 0.1);
  assert.equal(report.animations[0].cycles, 3);
});
test("weighted mesh round-trips through official reader and moves", async () => {
  const f = await fixture("mesh");
  const result = await validate(f.out);
  assert.equal(result.technicalPassed, true, JSON.stringify(result.issues));
  assert.equal(result.animations[0].loopSeam < 1, true);
  const s = await readJson(path.join(f.out, "fixture.json"));
  assert.ok(s.skins[0].attachments.part.part.triangles.length > 6);
});
test("opaque fake transparency is rejected before compiling", async () => {
  const f = await fixture();
  await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#fff" },
  })
    .png()
    .toFile(path.join(f.dir, "opaque.png"));
  const manifest = manifestSchema.parse({
    schemaVersion: 1,
    assets: [{ ...f.assets.assets[0], file: "opaque.png" }],
  });
  await assert.rejects(
    ingest(manifest, f.dir, path.join(f.dir, "bad")),
    /no actual transparency/,
  );
});
test("multi-page atlas preserves trim and extrudes border pixels", async () => {
  const f = await fixture();
  const m = structuredClone(f.assets);
  m.assets.push({ ...m.assets[0], id: "second" });
  const result = await packAtlas(
    m,
    f.work,
    path.join(f.dir, "atlas"),
    "packed",
    68,
  );
  assert.equal(result.pages.length, 2);
  const text = await readFile(path.join(f.dir, "atlas", result.atlas), "utf8");
  assert.match(text, /offsets:/);
  assert.match(text, /pma: false/);
  const { data, info } = await sharp(path.join(f.dir, "atlas", result.pages[0]))
    .raw()
    .toBuffer({ resolveWithObject: true });
  const i = (2 * info.width + 2) * 4;
  assert.deepEqual(data.subarray(i, i + 4), data.subarray(i - 4, i));
});
test("missing actions and cyclic IK targets are rejected", async () => {
  const f = await fixture();
  assert.throws(
    () => checkMotion({ ...f.motion, clips: [] }, f.job, f.rig),
    /Missing requested action/,
  );
  const rig = structuredClone(f.rig);
  rig.ik = [
    {
      name: "bad",
      bones: ["parent"],
      target: "part",
      bendPositive: true,
      mix: 1,
    },
  ];
  assert.throws(() => checkRig(rig, f.assets), /inside constrained chain/);
  assert.throws(
    () => preset("unimplemented", "move", f.job, f.rig),
    /provide a custom MotionSpec/,
  );
});
test("validation rejects modified resource hashes", async () => {
  const f = await fixture();
  await writeFile(
    path.join(f.out, "fixture.json"),
    JSON.stringify({
      ...(await readJson(path.join(f.out, "fixture.json"))),
      events: { extra: {} },
    }),
  );
  const result = await validate(f.out);
  assert.equal(result.technicalPassed, false);
  assert.ok(result.issues.some((i) => i.code === "HASH"));
});
test("non-closing animation is reported as a loop seam", async () => {
  const f = await fixture();
  f.motion.clips[0].bones.part.at(-1)!.rotation = 40;
  await compile(f.job, f.assets, f.rig, f.motion, f.work, f.out);
  const result = await validate(f.out);
  assert.ok(result.issues.some((i) => i.code === "LOOP_SEAM"));
});
test("repair retries are bounded and reading same candidate is idempotent", async () => {
  const f = await fixture();
  await validate(f.out);
  const first = await repairPlan(f.out, f.job),
    again = await repairPlan(f.out, f.job);
  assert.equal(first.tasks[0].attempt, again.tasks[0].attempt);
  for (let i = 0; i < 4; i++) {
    const report = await readJson(path.join(f.out, "validation.json"));
    report.hashes.candidate = String(i);
    await writeJson(path.join(f.out, "validation.json"), report);
    await repairPlan(f.out, f.job);
  }
  assert.equal((await repairPlan(f.out, f.job)).status, "incomplete");
});
test("preview resource containment rejects traversal", () => {
  assert.throws(() => contained(ROOT, "../secrets"), /escapes/);
  assert.equal(
    contained(ROOT, "web/index.html"),
    path.join(ROOT, "web/index.html"),
  );
});

test("missing resources produce a persisted failure report for repair", async () => {
  const f = await fixture();
  await unlink(path.join(f.out, "fixture.atlas"));
  const report = await validate(f.out);
  assert.equal(report.status, "failed");
  assert.equal(report.issues[0].code, "RESOURCE_LOAD");
  assert.equal(
    (await readJson(path.join(f.out, "validation.json"))).technicalPassed,
    false,
  );
});
test("real IK solves a planted endpoint, and validator detects a broken target", async () => {
  const f = await fixture();
  const rig = rigSchema.parse({
    schemaVersion: 1,
    bones: [
      { name: "root" },
      { name: "upper", parent: "root", length: 50 },
      { name: "lower", parent: "upper", x: 50, length: 50 },
      { name: "foot", parent: "lower", x: 50 },
      { name: "target", parent: "root", x: 80, y: 40 },
    ],
    slots: [
      {
        name: "part",
        bone: "lower",
        attachment: "part",
        attachments: [{ name: "part", asset: "part" }],
      },
    ],
    ik: [{ name: "plant", bones: ["upper", "lower"], target: "target" }],
  });
  const motion = motionSchema.parse({
    schemaVersion: 1,
    clips: [
      {
        name: "move",
        duration: 1,
        loop: true,
        bones: {
          root: [
            { time: 0, rotation: 0 },
            { time: 1, rotation: 0 },
          ],
        },
        contacts: [
          { bone: "foot", start: 0, end: 1, point: [80, 40], tolerance: 0.01 },
        ],
      },
    ],
  });
  await compile(f.job, f.assets, rig, motion, f.work, f.out);
  let report = await validate(f.out);
  assert.equal(report.technicalPassed, true, JSON.stringify(report.issues));
  assert.ok(report.animations[0].contactSamples > 0);
  assert.ok(report.animations[0].maxContactError < 0.01);
  rig.bones.find((b) => b.name === "target")!.x = 140;
  await compile(f.job, f.assets, rig, motion, f.work, f.out);
  report = await validate(f.out);
  assert.ok(report.issues.some((i) => i.code === "CONTACT_SLIP"));
});
test("weighted deform easing loads through the pinned attachment timeline format", async () => {
  const f = await fixture("mesh");
  const s = await readJson(path.join(f.out, "fixture.json"));
  const attachment = s.skins[0].attachments.part.part;
  let n = 0;
  for (let i = 0; i < attachment.vertices.length; ) {
    const count = attachment.vertices[i];
    n += count * 2;
    i += 1 + count * 4;
  }
  f.motion.clips[0].deforms = [
    {
      slot: "part",
      attachment: "part",
      keys: [
        { time: 0, vertices: Array(n).fill(0), curve: "smooth" },
        {
          time: 0.5,
          vertices: Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 4 : 0)),
          curve: "smooth",
        },
        { time: 1, vertices: Array(n).fill(0), curve: "linear" },
      ],
    },
  ];
  await compile(f.job, f.assets, f.rig, f.motion, f.work, f.out);
  const report = await validate(f.out);
  assert.equal(report.technicalPassed, true, JSON.stringify(report.issues));
  assert.ok(
    (await readJson(path.join(f.out, "fixture.json"))).animations.move
      .attachments.default.part.part.deform[0].curve,
  );
});
test("attachment swaps and draw-order permutations round-trip without changing duration", async () => {
  const f = await fixture();
  const second = {
    ...f.rig.slots[0],
    name: "second",
    attachments: [{ ...f.rig.slots[0].attachments[0] }],
  };
  f.rig.slots.push(second);
  f.rig.slots[0].attachments.push({
    ...f.rig.slots[0].attachments[0],
    name: "alternate",
  });
  const clip = f.motion.clips[0];
  clip.slots = {
    part: [
      { time: 0, attachment: "part" },
      { time: 0.3, attachment: "alternate" },
      { time: 0.7, attachment: "part" },
    ],
  };
  clip.drawOrder = [
    { time: 0, slots: ["part", "second"] },
    { time: 0.3, slots: ["second", "part"] },
    { time: 0.7, slots: ["part", "second"] },
  ];
  await compile(f.job, f.assets, f.rig, f.motion, f.work, f.out);
  const report = await validate(f.out);
  assert.equal(report.technicalPassed, true, JSON.stringify(report.issues));
  assert.equal(report.animations[0].duration, 1);
});
test("visual approval is bound to exact resources and all requested animation names", async () => {
  const f = await fixture();
  const bundle = await readJson(path.join(f.out, "bundle.json"));
  await mkdir(path.join(f.out, "frames"));
  const evidence = await readFile(path.join(f.dir, "part.png"));
  await writeFile(path.join(f.out, "frames/move-sheet.png"), evidence);
  await writeJson(path.join(f.out, "browser-validation.json"), {
    passed: true,
    hashes: bundle.hashes,
    evidenceHashes: { "frames/move-sheet.png": hash(evidence) },
  });
  await writeJson(path.join(f.out, "visual-review.json"), {
    status: "passed",
    hashes: bundle.hashes,
    animations: ["move"],
    evidence: ["frames/move-sheet.png"],
    reviewer: "test",
    observations: ["fixture approval"],
  });
  assert.equal((await validate(f.out)).visualPassed, true);
  // A prior animation review must not silently satisfy the new master gate.
  bundle.masterComparison = {
    required: true,
    status: "missing-alignment",
    evidenceHashes: {},
  };
  await writeJson(path.join(f.out, "bundle.json"), bundle);
  assert.ok(
    (await validate(f.out)).issues.some(
      (i) => i.code === "MASTER_COMPARISON_PENDING",
    ),
  );
  delete bundle.masterComparison;
  await writeJson(path.join(f.out, "bundle.json"), bundle);
  f.assets.master = f.assets.assets[0].normalizedFile;
  f.assets.masterAlignment = {
    scale: 1,
    x: 0,
    y: 0,
    basis: "Synthetic review integrity fixture",
  };
  await compile(f.job, f.assets, f.rig, f.motion, f.work, f.out);
  const compared = await readJson(path.join(f.out, "bundle.json"));
  await writeFile(
    path.join(f.out, "frames/master-runtime-comparison.png"),
    evidence,
  );
  await writeJson(path.join(f.out, "browser-validation.json"), {
    passed: true,
    hashes: compared.hashes,
    masterComparisonEvidenceHashes: compared.masterComparison.evidenceHashes,
    evidenceHashes: {
      "frames/move-sheet.png": hash(evidence),
      "frames/master-runtime-comparison.png": hash(evidence),
    },
  });
  await writeJson(path.join(f.out, "visual-review.json"), {
    status: "passed",
    hashes: compared.hashes,
    animations: ["move"],
    evidence: ["frames/move-sheet.png", "frames/master-runtime-comparison.png"],
    reviewer: "test",
    observations: ["Synthetic integrity fixture, not actual visual QA"],
    checks: { masterComparison: true },
    masterComparison: {
      evidenceHashes: compared.masterComparison.evidenceHashes,
      observations: ["Synthetic comparison reviewed"],
    },
  });
  assert.equal((await validate(f.out)).visualPassed, true);
  await writeFile(path.join(f.out, "comparison/master-overlay.png"), evidence);
  assert.equal(
    (await validate(f.out)).visualPassed,
    false,
    "Edited comparison evidence invalidates approval",
  );
  await writeJson(path.join(f.out, "visual-review.json"), {
    status: "passed",
    hashes: { outdated: "hash" },
    animations: ["move"],
  });
  assert.equal((await validate(f.out)).visualPassed, false);
});
