import path from "node:path";
import { ROOT, readJson, writeJson } from "../src/io.ts";
import {
  jobSchema,
  manifestSchema,
  rigSchema,
  type Point,
} from "../src/schema.ts";
import { ingest } from "../src/assets.ts";
import { bonesFromJoints } from "../src/registration.ts";
import { makePresets } from "../src/motion.ts";
import { compile } from "../src/compile.ts";
import { validate } from "../src/validate.ts";
import { prepare } from "../src/workflow.ts";
import { buildAll } from "./build.ts";

const source = path.join(ROOT, "examples/moss-boar"),
  work = path.join(ROOT, "output/moss-boar/work"),
  out = path.join(ROOT, "output/moss-boar/export");
const job = jobSchema.parse({
  schemaVersion: 1,
  name: "moss-boar",
  prompt:
    "2D 横版游戏的非人形四足苔藓小野猪，朝右半侧身，待机、行走、跑动、跳跃和向前冲撞。",
  character: {
    morphology: "quadruped",
    description:
      "Horizontal animal body; four independent cloven-hoof legs; leaf tail; no human arms.",
  },
  presentation: { usage: "side-scroller", facing: "right", groundY: 600 },
  canvas: { width: 1000, height: 700, origin: [440, 600] },
  actions: ["idle", "walk", "run", "hop", "lunge"].map((name) => ({
    name,
    description: {
      idle: "待机呼吸与尾巴轻摆",
      walk: "四足错相原地行走",
      run: "四足加速跑动",
      hop: "压缩、腾空与落地",
      lunge: "预备、向右冲撞并收势",
    }[name],
    duration: name === "run" ? 1.2 : 2,
    loop: ["idle", "walk", "run"].includes(name),
  })),
});
const generation = await readJson(path.join(source, "generation.json"));
const asset = (
  id: string,
  file: string,
  placement: object,
  depth = "center",
) => ({
  id,
  file: "images/" + file + ".png",
  view: "three-quarter-side",
  facing: "right",
  depth,
  trimAlphaThreshold: 200,
  placement,
  generation: {
    mode: "builtin-imagegen",
    prompt: generation[file]?.prompt ?? generation.leg.prompt,
    reference: "images/master.png",
  },
});
const manifest = manifestSchema.parse({
  schemaVersion: 1,
  master: "images/master.png",
  masterAlignment: {
    scale: 0.52,
    x: 75,
    y: 105,
    basis:
      "Uniform full-creature scale using dorsal silhouette and hoof baseline; source glow, body silhouette and leg pose differences remain visible.",
  },
  assets: [
    asset("body", "body-v3", { x: 250, y: 140, width: 600, height: 360 }),
    asset("hindFar", "leg", { x: 328, y: 370, width: 96, height: 206 }, "far"),
    asset("foreFar", "leg", { x: 642, y: 358, width: 96, height: 206 }, "far"),
    asset(
      "hindNear",
      "leg",
      { x: 288, y: 390, width: 110, height: 220 },
      "near",
    ),
    asset(
      "foreNear",
      "leg",
      { x: 592, y: 390, width: 110, height: 220 },
      "near",
    ),
    asset("tail", "tail", { x: 105, y: 245, width: 205, height: 140 }),
  ],
});
await buildAll();
const assets = await ingest(manifest, source, work);
const joints: any[] = [
  { name: "root", point: job.canvas.origin },
  { name: "body", parent: "root", point: [500, 420], tip: [600, 420] },
];
const limbs: any[] = [],
  ik: any[] = [];
for (const [id, phase] of [
  ["hindFar", 0.5],
  ["foreFar", 0],
  ["hindNear", 0],
  ["foreNear", 0.5],
] as const) {
  const a = assets.assets.find((a) => a.id === id)!,
    p = a.placement,
    t = a.trim!;
  const at = (x: number, y: number): Point => [
    p.x + t.x + t.width * x,
    p.y + t.y + t.height * y,
  ];
  const upper = at(0.43, 0.12),
    knee = at(0.25, 0.52),
    foot = at(0.73, 0.98);
  joints.push(
    { name: id, parent: "body", point: upper, tip: knee },
    { name: id + "Lower", parent: id, point: knee, tip: foot },
    { name: id + "Foot", parent: id + "Lower", point: foot },
    { name: id + "Target", parent: "root", point: foot },
  );
  limbs.push({
    id,
    kind: "leg",
    bones: [id, id + "Lower"],
    target: id + "Target",
    end: id + "Foot",
    phase,
  });
  // Determine the setup bend sign in world Y-up coordinates.
  const cross =
    (knee[0] - upper[0]) * (foot[1] - knee[1]) -
    (knee[1] - upper[1]) * (foot[0] - knee[0]);
  ik.push({
    name: id + "IK",
    bones: [id, id + "Lower"],
    target: id + "Target",
    bendPositive: cross < 0,
  });
}
joints.push(
  { name: "tail", parent: "body", point: [290, 354], tip: [210, 320] },
  { name: "tailTip", parent: "tail", point: [210, 320], tip: [120, 270] },
);
const legSlot = (id: string) => ({
  name: id,
  bone: id,
  attachment: "default",
  attachments: [
    {
      name: "default",
      asset: id,
      type: "mesh",
      influences: [id, id + "Lower"],
      spacing: 14,
      jointBlend: 0.7,
    },
  ],
});
const slots = [
  legSlot("hindFar"),
  legSlot("foreFar"),
  {
    name: "tail",
    bone: "tail",
    attachment: "default",
    attachments: [
      {
        name: "default",
        asset: "tail",
        type: "mesh",
        influences: ["tail", "tailTip"],
        spacing: 15,
      },
    ],
  },
  {
    name: "body",
    bone: "body",
    attachment: "default",
    attachments: [{ name: "default", asset: "body", type: "region" }],
  },
  legSlot("hindNear"),
  legSlot("foreNear"),
];
const rig = rigSchema.parse({
  schemaVersion: 1,
  bones: bonesFromJoints(job, joints),
  slots,
  ik,
  motionModel: {
    root: "root",
    body: "body",
    limbs,
    chains: [
      {
        id: "leafTail",
        kind: "tail",
        bones: ["tail", "tailTip"],
        amplitude: 5,
        phaseLag: 0.12,
      },
    ],
    gait: { stride: 20, lift: 10, stance: 0.62 },
    breathAxis: "scaleY",
  },
});
const motion = makePresets(job, rig, {});
for (const [file, data] of [
  ["job.json", job],
  ["rig.json", rig],
  ["motion.json", motion],
] as const)
  await writeJson(path.join(work, file), data);
await prepare(work);
await compile(job, assets, rig, motion, work, out);
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
