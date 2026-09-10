import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { ROOT, writeJson, readJson } from "../src/io.ts";
import { jobSchema, manifestSchema, rigSchema } from "../src/schema.ts";
import {
  assetPlanSchema,
  productionIssues,
  productionPrompts,
} from "../src/production.ts";
import { assemble } from "../src/assembly.ts";
import { prepare } from "../src/workflow.ts";

const job = jobSchema.parse({
  schemaVersion: 1,
  name: "snake",
  prompt: "A green snake coils then strikes",
  character: { morphology: "serpentine" },
  canvas: { width: 100, height: 100, origin: [50, 50] },
  presentation: { usage: "side-scroller", facing: "left", view: "profile" },
  actions: [
    {
      name: "strike",
      description: "Coil then strike",
      duration: 1.2,
      loop: false,
      views: ["profile"],
    },
  ],
});
const planInput = () => ({
  schemaVersion: 1,
  background: {
    mode: "chroma",
    color: "#FF00FF",
    reason: "Character palette has no magenta; project uses chroma extraction",
  },
  parts: [
    {
      id: "body",
      view: "profile",
      description: "One continuous coiled body",
      material: "green scales",
      depth: "center",
      anatomy: "axial body, no legs",
      attachment: "mesh",
      influences: ["root", "bend"],
    },
  ],
  joins: [
    {
      id: "coil",
      bone: "bend",
      parts: ["body"],
      strategy: "continuous-mesh",
      owner: "body",
      description: "Continuous scales through the bend, no cut face",
    },
  ],
  drawOrder: { profile: ["body"] },
});

await mkdir(path.join(ROOT, ".cache"), { recursive: true });

test("production plan rejects duplicate IDs, impossible seam owners and missing view inventory", () => {
  const input = planInput();
  assert.ok(assetPlanSchema.safeParse(input).success);
  input.joins[0].owner = "ghost";
  assert.equal(assetPlanSchema.safeParse(input).success, false);
  input.joins[0].owner = "body";
  input.parts[0].attachment = "region";
  assert.equal(assetPlanSchema.safeParse(input).success, false);
  input.parts[0].attachment = "mesh";
  input.parts.push({ ...input.parts[0] });
  assert.equal(assetPlanSchema.safeParse(input).success, false);
  const missing = planInput();
  missing.drawOrder.profile = [];
  assert.equal(assetPlanSchema.safeParse(missing).success, false);
});

test("production prompts preserve arbitrary actions, morphology, explicit view and selected background", () => {
  const plan = assetPlanSchema.parse(planInput());
  const prompts = productionPrompts(job, plan);
  assert.match(prompts.parts, /serpentine/);
  assert.match(prompts.parts, /facing left/);
  assert.match(prompts.parts, /strike.*1.2s; loop=false/);
  assert.match(prompts.parts, /#FF00FF/);
  assert.doesNotMatch(prompts.parts, /15–30 degrees/);
  const transparent = assetPlanSchema.parse({
    ...planInput(),
    background: { mode: "transparent" },
  });
  assert.match(
    productionPrompts(job, transparent).parts,
    /true transparent alpha/,
  );
  assert.doesNotMatch(productionPrompts(job, transparent).parts, /#FF00FF/);
  const alternate = structuredClone(job);
  alternate.actions[0].views.push("rear");
  assert.deepEqual(productionIssues(alternate, plan), [
    "Missing planned view: rear",
  ]);
});

test("assembly records actual transformed joints and evidence without approving visual quality", async () => {
  const dir = await mkdtemp(path.join(ROOT, ".cache/production-test-"));
  const image = path.join(dir, "body.png");
  await sharp({
    create: { width: 20, height: 20, channels: 4, background: "#22bb55" },
  })
    .png()
    .toFile(image);
  const assets = manifestSchema.parse({
    schemaVersion: 1,
    assets: [
      {
        id: "body",
        file: "body.png",
        normalizedFile: "body.png",
        view: "profile",
        placement: { x: 40, y: 30, width: 20, height: 20 },
        generation: { mode: "synthetic-test", prompt: "test" },
      },
    ],
  });
  const rig = rigSchema.parse({
    schemaVersion: 1,
    bones: [
      { name: "root", rotation: 90, scaleX: 2 },
      { name: "bend", parent: "root", x: 10, length: 10 },
    ],
    slots: [
      {
        name: "body",
        bone: "root",
        attachment: "body",
        attachments: [
          {
            name: "body",
            asset: "body",
            type: "mesh",
            influences: ["root", "bend"],
          },
        ],
      },
    ],
  });
  const plan = assetPlanSchema.parse(planInput());
  assert.deepEqual(productionIssues(job, plan, assets, rig), []);
  const wrong = structuredClone(rig);
  wrong.slots[0].attachments[0].influences = ["root"];
  assert.match(
    productionIssues(job, plan, assets, wrong).join(),
    /binding differs/,
  );
  await writeJson(path.join(dir, "job.json"), job);
  await writeJson(path.join(dir, "assets.json"), assets);
  await writeJson(path.join(dir, "rig.json"), rig);
  await writeJson(path.join(dir, "asset-plan.json"), plan);
  const prepared = await prepare(dir);
  assert.equal(prepared.production.status, "planned");
  assert.match(
    await readFile(path.join(dir, "imagegen-parts-prompt.txt"), "utf8"),
    /continuous-mesh/,
  );
  const out = path.join(dir, "assembly");
  const report = await assemble(dir, out);
  assert.equal(report.status, "needs-visual-review");
  assert.deepEqual(report.joints[0].center, [50, 30]);
  assert.equal(
    (await sharp(path.join(out, "joint-details.png")).metadata()).width,
    768,
  );
  const pixel = await sharp(path.join(out, "assembled-dark.png"))
    .extract({ left: 45, top: 35, width: 1, height: 1 })
    .raw()
    .toBuffer();
  assert.deepEqual([...pixel].slice(0, 3), [34, 187, 85]);
  assert.equal(
    (await readJson(path.join(out, "assembly-report.json"))).assetHashes.body
      .length,
    64,
  );
});

test("planned setup layer order catches the far limb inserted between legs", () => {
  const input = planInput();
  input.parts = ["farArm", "farLeg", "nearLeg"].map((id) => ({
    ...input.parts[0],
    id,
  }));
  input.joins = [];
  input.drawOrder.profile = ["farArm", "farLeg", "nearLeg"];
  const plan = assetPlanSchema.parse(input);
  const rig = rigSchema.parse({
    schemaVersion: 1,
    bones: [{ name: "root" }, { name: "bend", parent: "root" }],
    slots: ["farLeg", "farArm", "nearLeg"].map((id) => ({
      name: id,
      bone: "root",
      attachment: id,
      attachments: [
        { name: id, asset: id, type: "mesh", influences: ["root", "bend"] },
      ],
    })),
  });
  assert.match(
    productionIssues(job, plan, undefined, rig).join(),
    /Setup draw order differs/,
  );
});
