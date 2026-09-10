import { clipSchema, type Clip, type JobSpec, type RigSpec } from "./schema.ts";
import { worlds, inverse } from "./math.ts";
import { presentation } from "./presentation.ts";

export const anatomicalPresets = [
  "idle",
  "walk",
  "run",
  "jump",
  "hop",
  "fly",
  "slither",
  "swim",
  "wave",
  "lunge",
];
export function anatomicalCapability(
  kind: string,
  rig: RigSpec,
): string | undefined {
  const m = rig.motionModel;
  if (!m)
    return "Provide an explicit motionModel for this anatomy or author custom MotionSpec tracks.";
  if (!anatomicalPresets.includes(kind))
    return `${kind} needs custom MotionSpec phases and tracks for this character; no humanoid fallback.`;
  if (["walk", "run"].includes(kind) && !m.limbs.some((l) => l.kind === "leg"))
    return `${kind} needs actual leg chains with IK targets/endpoints; a legless character may need slither, hop, or custom motion.`;
  if (kind === "fly" && !m.limbs.some((l) => l.kind === "wing"))
    return "fly needs explicitly bound wings.";
  if (
    ["slither", "swim"].includes(kind) &&
    !m.chains.some((c) => ["spine", "tentacle"].includes(c.kind))
  )
    return `${kind} needs an axial spine/tentacle chain.`;
  if (
    kind === "wave" &&
    !m.limbs.some((l) => l.kind === "arm" || l.kind === "tentacle")
  )
    return "wave needs a declared arm/tentacle; do not invent human hands.";
}

export function anatomicalPreset(
  kind: string,
  name: string,
  job: JobSpec,
  rig: RigSpec,
): Clip {
  const failure = anatomicalCapability(kind, rig);
  if (failure) throw new Error(failure);
  const model = rig.motionModel!,
    action = job.actions.find((a) => a.name === name)!;
  if (!action) throw new Error(`No requested action ${name}`);
  const clip = clipSchema.parse({
    name,
    duration: action.duration,
    loop: action.loop,
  });
  const d = clip.duration,
    sign = presentation(job).facing === "left" ? -1 : 1;
  const oscillate = (
    bone: string,
    prop: "rotation" | "y",
    amplitude: number,
    phase: number,
    cycles = 1,
  ) => {
    const n = Math.max(30, Math.ceil(d * job.fps));
    clip.bones[bone] = Array.from({ length: n + 1 }, (_, i) => ({
      time: (i / n) * d,
      [prop]: amplitude * Math.sin(2 * Math.PI * ((i / n) * cycles + phase)),
      curve: "linear",
    }));
  };
  const track = (
    bone: string,
    values: { time: number; [key: string]: number | string }[],
  ) => {
    clip.bones[bone] = values.map((k) => ({
      ...k,
      time: k.time * d,
      curve: "smooth",
    })) as Clip["bones"][string];
  };
  if (kind === "idle")
    track(model.body, [
      { time: 0, [model.breathAxis]: 1 },
      { time: 0.5, [model.breathAxis]: 1.025 },
      { time: 1, [model.breathAxis]: 1 },
    ]);
  if (kind === "walk" || kind === "run") {
    const stride = model.gait.stride * (kind === "run" ? 1.4 : 1),
      lift = model.gait.lift * (kind === "run" ? 1.5 : 1);
    const duty =
      kind === "run" ? Math.min(0.5, model.gait.stance) : model.gait.stance;
    const distance = stride / duty,
      speed = (sign * distance) / d;
    const wm = worlds(rig.bones),
      inv = inverse(wm.get(model.root)!);
    if (action.rootMotion === "translate")
      clip.bones[model.root] = [
        { time: 0, x: 0, curve: "linear" },
        { time: d, x: sign * distance, curve: "linear" },
      ];
    for (const leg of model.limbs.filter((l) => l.kind === "leg")) {
      if (!leg.target || !leg.end)
        throw new Error(`Leg ${leg.id} requires target and endpoint`);
      const phase = leg.phase % 1,
        base = wm.get(leg.target)!;
      const times = new Set<number>([0, 1]);
      const count = Math.max(60, Math.ceil(job.fps * d));
      for (let i = 0; i <= count; i++) times.add(i / count);
      for (let n = 0; n <= 2; n++)
        for (const p of [n - phase, n + duty - phase])
          if (p > 0 && p < 1) times.add(p);
      clip.bones[leg.target] = [...times]
        .sort((a, b) => a - b)
        .map((t) => {
          const p = (t + phase) % 1,
            stance = p < duty,
            q = (p - duty) / (1 - duty);
          const x =
            sign * (stance ? stride * (0.5 - p / duty) : stride * (-0.5 + q));
          const y = stance ? 0 : lift * Math.sin(Math.PI * q);
          return {
            time: t * d,
            x: inv[0] * x + inv[2] * y,
            y: inv[1] * x + inv[3] * y,
            curve: "linear",
          };
        });
      for (let n = 0; n <= 2; n++) {
        const begin = n - phase,
          start = Math.max(0, begin),
          end = Math.min(1, begin + duty);
        if (end - start < 1e-6) continue;
        const rootX =
          action.rootMotion === "translate" ? sign * distance * start : 0;
        clip.contacts.push({
          bone: leg.end,
          start: start * d,
          end: end * d,
          point: [
            base[4] + sign * (stride / 2 - (start - begin) * distance) + rootX,
            base[5],
          ],
          velocity: action.rootMotion === "translate" ? [0, 0] : [-speed, 0],
          tolerance: 3,
        });
      }
    }
    oscillate(model.body, "y", kind === "run" ? 4 : 2, 0, 2);
  }
  if (kind === "jump" || kind === "hop") {
    const height = kind === "hop" ? 35 : 80;
    track(model.root, [
      { time: 0, y: 0 },
      { time: 0.2, y: 0 },
      { time: 0.48, y: height },
      { time: 0.76, y: 0 },
      { time: 1, y: 0 },
    ]);
    track(model.body, [
      { time: 0, scaleY: 1, scaleX: 1 },
      { time: 0.18, scaleY: 0.88, scaleX: 1.07 },
      { time: 0.45, scaleY: 1.05, scaleX: 0.96 },
      { time: 0.8, scaleY: 0.9, scaleX: 1.06 },
      { time: 1, scaleY: 1, scaleX: 1 },
    ]);
    clip.phases = [
      { name: "compress", start: 0, end: 0.2 * d },
      { name: "airborne", start: 0.2 * d, end: 0.76 * d },
      { name: "land and recover", start: 0.76 * d, end: d },
    ];
  }
  if (kind === "fly") {
    for (const wing of model.limbs.filter((l) => l.kind === "wing"))
      for (const [i, bone] of wing.bones.entries())
        oscillate(
          bone,
          "rotation",
          (wing.direction * wing.amplitude) / (i + 1),
          wing.phase - i * 0.08,
          2,
        );
    oscillate(model.body, "y", 4, 0, 2);
  }
  if (kind === "wave") {
    const limb = model.limbs.find(
      (l) => l.kind === "arm" || l.kind === "tentacle",
    )!;
    for (const [i, bone] of limb.bones.entries())
      oscillate(
        bone,
        "rotation",
        (limb.direction * limb.amplitude) / (i + 1),
        limb.phase - i * 0.1,
        2,
      );
  }
  if (kind === "lunge") {
    track(model.root, [
      { time: 0, x: 0 },
      { time: 0.3, x: -sign * 12 },
      { time: 0.48, x: sign * 45 },
      { time: 0.6, x: sign * 40 },
      { time: 1, x: 0 },
    ]);
    clip.phases = [
      { name: "anticipation", start: 0, end: 0.3 * d },
      { name: "lunge", start: 0.3 * d, end: 0.6 * d },
      { name: "recover", start: 0.6 * d, end: d },
    ];
  }
  for (const chain of model.chains) {
    const primary =
      ["slither", "swim"].includes(kind) &&
      ["spine", "tentacle"].includes(chain.kind);
    if (!primary && chain.kind !== "tail" && chain.kind !== "tentacle")
      continue;
    for (const [i, bone] of chain.bones.entries()) {
      if (clip.bones[bone])
        throw new Error(
          `Motion generators overlap on ${bone}; separate axial and limb groups or author custom tracks`,
        );
      oscillate(
        bone,
        "rotation",
        chain.amplitude * (primary ? 1 : kind === "idle" ? 0.25 : 0.5),
        -i * chain.phaseLag,
        primary ? 1 : 2,
      );
    }
  }
  if (
    action.rootMotion === "translate" &&
    ["fly", "slither", "swim", "jump", "hop"].includes(kind)
  ) {
    clip.bones[model.root] ??= [
      { time: 0, curve: "linear" },
      { time: d, curve: "linear" },
    ];
    for (const key of clip.bones[model.root])
      key.x = (sign * model.gait.stride * 2 * key.time) / d;
  }
  return clip;
}
