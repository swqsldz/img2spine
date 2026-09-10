import { z } from "zod";

const number = z.number().finite();
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const point = z.tuple([number, number]);
const curve = z
  .union([z.literal("linear"), z.literal("stepped"), z.literal("smooth")])
  .default("smooth");
export const jobSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: id,
    prompt: z.string().min(1),
    character: z
      .object({
        morphology: z
          .enum([
            "unspecified",
            "humanoid",
            "quadruped",
            "multi-legged",
            "serpentine",
            "winged",
            "amorphous",
            "custom",
          ])
          .default("unspecified"),
        description: z.string().default(""),
      })
      .strict()
      .default({ morphology: "unspecified", description: "" }),
    presentation: z
      .object({
        usage: z.enum(["general", "side-scroller"]).default("general"),
        view: id.optional(),
        facing: z.enum(["left", "right"]).default("right"),
        mirrorPolicy: z
          .enum(["symmetric-only", "separate-art"])
          .default("symmetric-only"),
        groundY: number.optional(),
      })
      .strict()
      .default({
        usage: "general",
        facing: "right",
        mirrorPolicy: "symmetric-only",
      }),
    canvas: z.object({
      width: number.positive(),
      height: number.positive(),
      origin: point,
    }),
    fps: z.number().int().min(1).max(120).default(30),
    maxRepairAttempts: z.number().int().min(0).max(10).default(3),
    actions: z
      .array(
        z.object({
          name: id,
          description: z.string().min(1),
          duration: number.positive().default(2),
          loop: z.boolean().default(true),
          views: z.array(id).default([]),
          rootMotion: z.enum(["in-place", "translate"]).default("in-place"),
        }),
      )
      .min(1),
  })
  .strict();
export const assetSchema = z
  .object({
    id,
    file: z.string().min(1),
    view: id.default("front"),
    facing: z.enum(["left", "right", "neutral"]).default("neutral"),
    depth: z.enum(["near", "far", "center"]).default("center"),
    anatomy: z
      .object({
        side: z.enum(["left", "right", "center"]),
        pair: id,
        surface: z.enum(["outer", "inner", "palm", "back", "neutral"]),
        symmetryReason: z.string().min(15).optional(),
      })
      .strict()
      .optional(),
    trimAlphaThreshold: z.number().int().min(1).max(254).default(1),
    sourceRect: z
      .object({
        left: z.number().int().nonnegative(),
        top: z.number().int().nonnegative(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .optional(),
    placement: z.object({
      x: number,
      y: number,
      width: number.positive(),
      height: number.positive(),
      rotation: number.default(0),
      mirror: z.boolean().default(false),
    }),
    landmarks: z.record(z.string(), point).default({}),
    generation: z.object({
      mode: z.enum(["builtin-imagegen", "provided", "synthetic-test"]),
      prompt: z.string(),
      reference: z.string().optional(),
    }),
    sha256: z.string().optional(),
    normalizedFile: z.string().optional(),
    trim: z
      .object({
        x: number,
        y: number,
        width: number,
        height: number,
        originalWidth: number,
        originalHeight: number,
      })
      .optional(),
  })
  .strict();
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    master: z.string().optional(),
    masterAlignment: z
      .object({
        scale: number.positive(),
        x: number,
        y: number,
        basis: z.string().min(1),
      })
      .strict()
      .optional(),
    assets: z.array(assetSchema).min(1),
  })
  .strict();
export const boneSchema = z
  .object({
    name: id,
    parent: id.optional(),
    x: number.default(0),
    y: number.default(0),
    rotation: number.default(0),
    scaleX: number.refine((v) => Math.abs(v) > 1e-6).default(1),
    scaleY: number.refine((v) => Math.abs(v) > 1e-6).default(1),
    length: number.nonnegative().default(0),
    range: z.tuple([number, number]).optional(),
  })
  .strict();
export const rigSchema = z
  .object({
    schemaVersion: z.literal(1),
    bones: z.array(boneSchema).min(1),
    slots: z
      .array(
        z
          .object({
            name: id,
            bone: id,
            attachment: id.nullable(),
            attachments: z
              .array(
                z.object({
                  name: id,
                  asset: id,
                  type: z.enum(["region", "mesh"]).default("region"),
                  influences: z.array(id).default([]),
                  spacing: number.positive().default(24),
                  jointBlend: number.min(0.05).max(1.5).default(0.3),
                }),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
    ik: z
      .array(
        z.object({
          name: id,
          bones: z.array(id).min(1).max(2),
          target: id,
          bendPositive: z.boolean().default(true),
          mix: number.min(0).max(1).default(1),
        }),
      )
      .default([]),
    roles: z.record(z.string(), id).default({}),
    layerRules: z
      .array(
        z
          .object({
            behind: id,
            inFront: id,
            reason: z.string().min(1),
            animations: z.array(id).default([]),
          })
          .strict(),
      )
      .default([]),
    motionModel: z
      .object({
        body: id,
        root: id,
        limbs: z
          .array(
            z
              .object({
                id,
                kind: z.enum(["leg", "wing", "arm", "tentacle"]),
                bones: z.array(id).min(1),
                target: id.optional(),
                end: id.optional(),
                phase: number.min(0).max(1).default(0),
                direction: z.union([z.literal(-1), z.literal(1)]).default(1),
                amplitude: number.nonnegative().default(25),
              })
              .strict(),
          )
          .default([]),
        chains: z
          .array(
            z
              .object({
                id,
                kind: z.enum(["spine", "tail", "tentacle", "neck"]),
                bones: z.array(id).min(1),
                amplitude: number.nonnegative().default(8),
                phaseLag: number.default(0.15),
              })
              .strict(),
          )
          .default([]),
        gait: z
          .object({
            stride: number.positive().default(40),
            lift: number.nonnegative().default(20),
            stance: number.min(0.2).max(0.85).default(0.6),
          })
          .default({ stride: 40, lift: 20, stance: 0.6 }),
        breathAxis: z.enum(["scaleX", "scaleY"]).default("scaleY"),
      })
      .strict()
      .optional(),
  })
  .strict();
const poseKey = z
  .object({
    time: number.nonnegative(),
    x: number.optional(),
    y: number.optional(),
    rotation: number.optional(),
    scaleX: number.optional(),
    scaleY: number.optional(),
    curve,
  })
  .strict();
export const clipSchema = z
  .object({
    name: id,
    duration: number.positive(),
    loop: z.boolean(),
    phases: z
      .array(
        z.object({
          name: z.string(),
          start: number.nonnegative(),
          end: number.positive(),
        }),
      )
      .default([]),
    bones: z.record(z.string(), z.array(poseKey).min(1)).default({}),
    slots: z
      .record(
        z.string(),
        z.array(
          z.object({ time: number.nonnegative(), attachment: id.nullable() }),
        ),
      )
      .default({}),
    drawOrder: z
      .array(z.object({ time: number.nonnegative(), slots: z.array(id) }))
      .default([]),
    deforms: z
      .array(
        z.object({
          slot: id,
          attachment: id,
          keys: z
            .array(
              z.object({
                time: number.nonnegative(),
                vertices: z.array(number),
                curve,
              }),
            )
            .min(1),
        }),
      )
      .default([]),
    contacts: z
      .array(
        z.object({
          bone: id,
          start: number.nonnegative(),
          end: number.positive(),
          point,
          velocity: point.optional(),
          tolerance: number.positive().default(3),
        }),
      )
      .default([]),
    secondary: z
      .array(
        z.object({
          bone: id,
          amplitude: number,
          cycles: number.positive().default(1),
          phase: number.default(0),
          damping: number.nonnegative().default(0),
        }),
      )
      .default([]),
  })
  .strict();
export const motionSchema = z
  .object({ schemaVersion: z.literal(1), clips: z.array(clipSchema).min(1) })
  .strict();
export type JobSpec = z.infer<typeof jobSchema>;
export type AssetManifest = z.infer<typeof manifestSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type RigSpec = z.infer<typeof rigSchema>;
export type BoneSpec = z.infer<typeof boneSchema>;
export type MotionSpec = z.infer<typeof motionSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Point = z.infer<typeof point>;
export type Issue = {
  code: string;
  stage: "assets" | "rig" | "motion" | "compile" | "visual";
  message: string;
  target?: string;
  severity: "error" | "warning";
};

export function unique(names: string[], label: string) {
  if (new Set(names).size !== names.length)
    throw new Error(`Duplicate ${label}`);
}
export function checkRig(rig: RigSpec, assets: AssetManifest) {
  unique(
    rig.bones.map((b) => b.name),
    "bones",
  );
  unique(
    rig.slots.map((s) => s.name),
    "slots",
  );
  unique(
    assets.assets.map((a) => a.id),
    "assets",
  );
  unique(
    rig.ik.map((i) => i.name),
    "constraints",
  );
  const seen = new Set<string>();
  for (const [i, b] of rig.bones.entries()) {
    if ((i === 0 && b.parent) || (i > 0 && (!b.parent || !seen.has(b.parent))))
      throw new Error(
        `Bone ${b.name}: require one root and parent before child`,
      );
    seen.add(b.name);
  }
  const assetIds = new Set(assets.assets.map((a) => a.id));
  for (const slot of rig.slots) {
    if (!seen.has(slot.bone)) throw new Error(`Missing slot bone ${slot.bone}`);
    unique(
      slot.attachments.map((a) => a.name),
      `attachments in ${slot.name}`,
    );
    if (
      slot.attachment &&
      !slot.attachments.some((a) => a.name === slot.attachment)
    )
      throw new Error(`Missing setup attachment ${slot.attachment}`);
    for (const a of slot.attachments) {
      if (!assetIds.has(a.asset)) throw new Error(`Missing asset ${a.asset}`);
      for (const b of a.influences)
        if (!seen.has(b)) throw new Error(`Missing influence ${b}`);
    }
  }
  for (const ik of rig.ik) {
    if (!seen.has(ik.target) || ik.bones.some((b) => !seen.has(b)))
      throw new Error(`Missing IK bone: ${ik.name}`);
    if (
      ik.bones.length === 2 &&
      rig.bones.find((b) => b.name === ik.bones[1])!.parent !== ik.bones[0]
    )
      throw new Error(`IK chain must be contiguous: ${ik.name}`);
    let target = rig.bones.find((b) => b.name === ik.target);
    while (target) {
      if (ik.bones.includes(target.name))
        throw new Error(`IK target is inside constrained chain: ${ik.name}`);
      target = rig.bones.find((b) => b.name === target!.parent);
    }
  }
  if (rig.motionModel) {
    const model = rig.motionModel;
    if (model.root !== rig.bones[0].name || !seen.has(model.body))
      throw new Error(
        "Motion model requires the actual root and a valid body bone",
      );
    unique(
      [...model.limbs, ...model.chains].map((l) => l.id),
      "anatomical groups",
    );
    const driven = new Set<string>();
    for (const group of [...model.limbs, ...model.chains]) {
      for (const [i, name] of group.bones.entries()) {
        if (!seen.has(name)) throw new Error(`Unknown anatomical bone ${name}`);
        if (
          i &&
          rig.bones.find((b) => b.name === name)!.parent !== group.bones[i - 1]
        )
          throw new Error(`Anatomical chain ${group.id} is not contiguous`);
      }
    }
    for (const limb of model.limbs) {
      if (limb.kind === "leg") {
        if (!limb.target || !limb.end || !seen.has(limb.end))
          throw new Error(`Leg ${limb.id} requires target and endpoint`);
        const ik = rig.ik.find(
          (c) =>
            c.target === limb.target && c.bones.join() === limb.bones.join(),
        );
        if (!ik) throw new Error(`Leg ${limb.id} requires matching IK chain`);
        if (
          rig.bones.find((b) => b.name === limb.end)!.parent !==
          limb.bones.at(-1)
        )
          throw new Error(
            `Leg ${limb.id} endpoint must follow its final segment`,
          );
        if (
          rig.bones.find((b) => b.name === limb.target)!.parent !== model.root
        )
          throw new Error(
            `Leg ${limb.id} target must be a direct child of root`,
          );
        if (driven.has(limb.target))
          throw new Error(`Legs share driven target ${limb.target}`);
        driven.add(limb.target);
      }
    }
  }
}
