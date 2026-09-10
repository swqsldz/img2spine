import path from "node:path";
import { ROOT, readJson, writeJson } from "../src/io.ts";
import {
  jobSchema,
  manifestSchema,
  rigSchema,
  motionSchema,
} from "../src/schema.ts";
import { ingest } from "../src/assets.ts";
import { compile } from "../src/compile.ts";
import { validate } from "../src/validate.ts";
import { makePresets } from "../src/motion.ts";
import { buildAll } from "./build.ts";

const example = path.join(ROOT, "examples/robot"),
  work = path.join(ROOT, "output/robot/work"),
  out = path.join(ROOT, "output/robot/export");
const job = jobSchema.parse({
  schemaVersion: 1,
  name: "ember-robot",
  prompt:
    "橙色探险机器人：呼吸眨眼、挥手、原地走跑、起跳落地、出拳收势和转身。",
  canvas: { width: 800, height: 900, origin: [400, 820] },
  actions: ["idle", "wave", "walk", "run", "jump", "attack", "turn"].map(
    (name) => ({
      name,
      description: {
        idle: "轻微呼吸并眨眼",
        wave: "抬右手挥手",
        walk: "原地行走",
        run: "原地跑动",
        jump: "预备、起跳、落地缓冲",
        attack: "蓄力出拳并收势",
        turn: "转向背面后转回正面",
      }[name],
      duration: 2,
      loop: !["jump", "attack"].includes(name),
      views: name === "turn" ? ["front", "back"] : ["front"],
    }),
  ),
});
const generation = await readJson(path.join(example, "generation.json"));
const asset = (
  id: string,
  file: string,
  x: number,
  y: number,
  width: number,
  height: number,
  view = "front",
  mirror = false,
) => ({
  id,
  file: "images/" + file + ".png",
  view,
  trimAlphaThreshold: 200,
  placement: { x, y, width, height, mirror },
  generation: {
    mode: "builtin-imagegen",
    prompt:
      generation.assets[id]?.prompt ??
      "Robot part derived from master; transparent extraction and original prompts saved in generation.json and repairs.json",
    reference: "images/master.png",
  },
});
const manifest = manifestSchema.parse({
  schemaVersion: 1,
  master: "images/master.png",
  masterAlignment: {
    scale: 0.6,
    x: 23,
    y: 75,
    basis:
      "Uniform full-character scale, centered on the face/body axis; the original wider stance and body proportions remain visible for review.",
  },
  assets: [
    asset("head", "head", 190, 170, 420, 280),
    asset("headClosed", "head-closed-v3", 190, 170, 420, 280),
    asset("headBack", "head-back-v2", 190, 170, 420, 280, "back"),
    asset("body", "torso", 285, 425, 230, 205),
    asset("bodyBack", "torso-back", 285, 425, 230, 205, "back"),
    asset("armL", "arm-v3", 252, 440, 76, 245, "front", true),
    asset("armR", "arm-v3", 472, 440, 76, 245),
    asset("legL", "leg-v3", 285, 604, 100, 226),
    asset("legR", "leg-v3", 415, 604, 100, 226),
    asset("antenna", "antenna", 385, 75, 80, 120),
    {
      ...asset("profile", "view-profile", 190, 75, 420, 755, "side"),
      sourceRect: { left: 570, top: 0, width: 370, height: 1024 },
    },
    {
      ...asset("profileLeft", "view-profile", 190, 75, 420, 755, "side", true),
      sourceRect: { left: 570, top: 0, width: 370, height: 1024 },
    },
    {
      ...asset("rear", "view-profile", 190, 75, 420, 755, "back"),
      sourceRect: { left: 940, top: 0, width: 596, height: 1024 },
    },
  ],
});
const bone = (
  name: string,
  parent: string | undefined,
  x: number,
  y: number,
  rotation = 0,
  length = 0,
) => ({ name, parent, x, y, rotation, length });
const rig = rigSchema.parse({
  schemaVersion: 1,
  bones: [
    bone("root", undefined, 0, 0),
    bone("hip", "root", 0, 210),
    bone("torso", "hip", 0, 0, 90, 190),
    bone("head", "torso", 190, 0, -90, 150),
    bone("antenna", "head", 5, 250, 90, 100),
    bone("upperArmL", "hip", -110, 150, -90, 88),
    bone("forearmL", "upperArmL", 88, 0, 0, 120),
    bone("handL", "forearmL", 100, 0),
    bone("upperArmR", "hip", 110, 150, -90, 88),
    bone("forearmR", "upperArmR", 88, 0, 0, 120),
    bone("handR", "forearmR", 100, 0),
    bone("thighL", "hip", -65, -15, -90, 80),
    bone("shinL", "thighL", 80, 0, 0, 90),
    bone("footL", "shinL", 90, 0),
    bone("thighR", "hip", 65, -15, -90, 80),
    bone("shinR", "thighR", 80, 0, 0, 90),
    bone("footR", "shinR", 90, 0),
    bone("footTargetL", "root", -65, 25),
    bone("footTargetR", "root", 65, 25),
  ],
  slots: [
    ...["L", "R"].map((side) => ({
      name: "leg" + side,
      bone: "thigh" + side,
      attachment: "default",
      attachments: [
        {
          name: "default",
          asset: "leg" + side,
          type: "mesh",
          influences: ["thigh" + side, "shin" + side],
          spacing: 18,
        },
      ],
    })),
    ...["L", "R"].map((side) => ({
      name: "arm" + side,
      bone: "upperArm" + side,
      attachment: "default",
      attachments: [
        {
          name: "default",
          asset: "arm" + side,
          type: "mesh",
          influences: ["upperArm" + side, "forearm" + side],
          spacing: 16,
        },
      ],
    })),
    {
      name: "body",
      bone: "torso",
      attachment: "front",
      attachments: [
        { name: "front", asset: "body", type: "region" },
        { name: "back", asset: "bodyBack", type: "region" },
      ],
    },
    {
      name: "antenna",
      bone: "antenna",
      attachment: "default",
      attachments: [
        {
          name: "default",
          asset: "antenna",
          type: "mesh",
          influences: ["antenna"],
          spacing: 12,
        },
      ],
    },
    {
      name: "head",
      bone: "head",
      attachment: "front",
      attachments: [
        { name: "front", asset: "head" },
        { name: "closed", asset: "headClosed" },
        { name: "back", asset: "headBack" },
      ],
    },
    {
      name: "view",
      bone: "root",
      attachment: null,
      attachments: [
        { name: "side", asset: "profile" },
        { name: "sideLeft", asset: "profileLeft" },
        { name: "rear", asset: "rear" },
      ],
    },
  ],
  ik: [
    {
      name: "legL",
      bones: ["thighL", "shinL"],
      target: "footTargetL",
      bendPositive: true,
    },
    {
      name: "legR",
      bones: ["thighR", "shinR"],
      target: "footTargetR",
      bendPositive: false,
    },
  ],
  roles: Object.fromEntries(
    [
      "root",
      "torso",
      "head",
      "antenna",
      "upperArmL",
      "forearmL",
      "upperArmR",
      "forearmR",
      "footL",
      "footR",
      "footTargetL",
      "footTargetR",
    ]
      .map((n) => [n, n])
      .concat([["headSlot", "head"]]),
  ),
});
const motion = makePresets(job, rig, {});
rig.bones.find((b) => b.name === "upperArmR")!.range = [0, 125];
rig.bones.find((b) => b.name === "forearmR")!.range = [-30, 30];
// Multi-view illustration keys supply actual side silhouettes, instead of pretending a flattened front image is a side view.
const turn = motion.clips.find((c) => c.name === "turn")!;
turn.bones = {};
turn.secondary = [];
turn.slots = {};
for (const slot of rig.slots.filter((s) => s.name !== "view"))
  turn.slots[slot.name] = [
    { time: 0, attachment: slot.attachment },
    { time: 0.35, attachment: null },
    { time: 1.8, attachment: slot.attachment },
  ];
turn.slots.view = [
  { time: 0, attachment: null },
  { time: 0.35, attachment: "side" },
  { time: 0.75, attachment: "rear" },
  { time: 1.3, attachment: "sideLeft" },
  { time: 1.8, attachment: null },
];
turn.drawOrder = [
  { time: 0, slots: rig.slots.map((s) => s.name) },
  {
    time: 0.35,
    slots: ["legR", "legL", "armR", "armL", "body", "antenna", "head", "view"],
  },
  { time: 1.8, slots: rig.slots.map((s) => s.name) },
];
turn.phases = [
  { name: "front to back", start: 0, end: 1 },
  { name: "back to front", start: 1, end: 2 },
];
await buildAll();
const ingested = await ingest(manifest, example, work);
for (const [file, data] of [
  ["job.json", job],
  ["rig.json", rig],
  ["motion.json", motion],
] as const)
  await writeJson(path.join(work, file), data);
await compile(job, ingested, rig, motion, work, out);
const report = await validate(out);
console.log(
  JSON.stringify(
    {
      out,
      status: report.status,
      issues: report.issues,
      animations: report.animations,
    },
    null,
    2,
  ),
);
if (!report.technicalPassed) process.exitCode = 1;
