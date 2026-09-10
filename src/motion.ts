import {
  motionSchema,
  clipSchema,
  type Clip,
  type RigSpec,
  type JobSpec,
  type MotionSpec,
} from "./schema.ts";
import { worlds } from "./math.ts";
import { anatomicalPreset } from "./anatomical-motion.ts";

export function checkMotion(motion: MotionSpec, job: JobSpec, rig: RigSpec) {
  if (new Set(motion.clips.map((c) => c.name)).size !== motion.clips.length)
    throw new Error("Duplicate animation name");
  const names = new Set(rig.bones.map((b) => b.name));
  for (const action of job.actions) {
    const clip = motion.clips.find((c) => c.name === action.name);
    if (!clip) throw new Error(`Missing requested action ${action.name}`);
    if (clip.duration !== action.duration || clip.loop !== action.loop)
      throw new Error(
        `Action ${action.name}: duration/loop disagrees with JobSpec`,
      );
  }
  for (const clip of motion.clips) {
    const times = (keys: { time: number }[]) => {
      let last = -1;
      for (const k of keys) {
        if (k.time <= last || k.time > clip.duration)
          throw new Error(
            `Animation ${clip.name}: keys must be increasing and within duration`,
          );
        last = k.time;
      }
    };
    for (const [name, keys] of Object.entries(clip.bones)) {
      if (!names.has(name)) throw new Error(`Unknown animation bone ${name}`);
      times(keys);
    }
    for (const [name, keys] of Object.entries(clip.slots)) {
      const slot = rig.slots.find((s) => s.name === name);
      if (!slot) throw new Error(`Unknown animation slot ${name}`);
      times(keys);
      for (const k of keys)
        if (
          k.attachment &&
          !slot.attachments.some((a) => a.name === k.attachment)
        )
          throw new Error(`Unknown switched attachment ${k.attachment}`);
    }
    times(clip.drawOrder);
    for (const k of clip.drawOrder)
      if (
        k.slots.length !== rig.slots.length ||
        new Set(k.slots).size !== rig.slots.length ||
        k.slots.some((s) => !rig.slots.some((t) => t.name === s))
      )
        throw new Error("Draw order must contain every slot exactly once");
    for (const d of clip.deforms) {
      if (
        !rig.slots.some(
          (s) =>
            s.name === d.slot &&
            s.attachments.some(
              (a) => a.name === d.attachment && a.type === "mesh",
            ),
        )
      )
        throw new Error(`Deform requires mesh ${d.slot}/${d.attachment}`);
      times(d.keys);
    }
    for (const c of [...clip.contacts, ...clip.phases])
      if (c.start >= c.end || c.end > clip.duration)
        throw new Error(`Invalid phase/contact interval in ${clip.name}`);
    for (const c of clip.contacts)
      if (!names.has(c.bone)) throw new Error(`Unknown contact bone ${c.bone}`);
    for (const s of clip.secondary)
      if (!names.has(s.bone))
        throw new Error(`Unknown secondary bone ${s.bone}`);
  }
}
type ScalarKey = { time: number; value: number; curve?: string };
export function sample(keys: ScalarKey[], time: number, defaultValue = 0) {
  if (!keys.length) return defaultValue;
  if (time <= keys[0].time) return keys[0].value;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i],
      b = keys[i + 1];
    if (time < b.time) {
      let t = (time - a.time) / (b.time - a.time);
      if (a.curve === "stepped") t = 0;
      else if (a.curve === "smooth") t = t * t * (3 - 2 * t);
      return a.value + (b.value - a.value) * t;
    }
  }
  return keys.at(-1)!.value;
}
export function compileClip(clip: Clip, rig: RigSpec, fps: number) {
  const result: any = { bones: {} };
  const mapping = {
    x: "translatex",
    y: "translatey",
    rotation: "rotate",
    scaleX: "scalex",
    scaleY: "scaley",
  } as const;
  const times = new Set<number>([0, clip.duration]);
  for (let i = 0; i <= Math.ceil(clip.duration * fps); i++)
    times.add(Math.min(clip.duration, i / fps));
  for (const keys of Object.values(clip.bones))
    for (const k of keys) times.add(k.time);
  const ts = [...times].sort((a, b) => a - b);
  for (const bone of new Set([
    ...Object.keys(clip.bones),
    ...clip.secondary.map((s) => s.bone),
  ])) {
    const timelines: any = {};
    const keys = clip.bones[bone] ?? [];
    for (const [prop, timeline] of Object.entries(mapping)) {
      const pk = keys
        .filter((k) => (k as any)[prop] !== undefined)
        .map((k) => ({
          time: k.time,
          value: (k as any)[prop],
          curve: k.curve,
        }));
      const secondary =
        prop === "rotation"
          ? clip.secondary.filter((s) => s.bone === bone)
          : [];
      if (!pk.length && !secondary.length) continue;
      timelines[timeline] = ts.map((time) => {
        let value = sample(pk, time, prop.startsWith("scale") ? 1 : 0);
        for (const s of secondary) {
          const envelope = clip.loop
            ? 1
            : Math.sin((Math.PI * time) / clip.duration) *
              Math.exp(-s.damping * time);
          value +=
            s.amplitude *
            Math.sin(
              (time / clip.duration) * Math.PI * 2 * s.cycles + s.phase,
            ) *
            envelope;
        }
        // Keep discontinuities stepped, rather than blending across a held interval.
        const previous = pk.findLast((k) => k.time <= time);
        return {
          time,
          value,
          ...(previous?.curve === "stepped" ? { curve: "stepped" } : {}),
        };
      });
    }
    result.bones[bone] = timelines;
  }
  const root = rig.bones[0].name;
  if (!result.bones[root]) result.bones[root] = {};
  if (!Object.keys(result.bones[root]).length)
    result.bones[root].rotate = [
      { time: 0, value: 0 },
      { time: clip.duration, value: 0 },
    ];
  if (Object.keys(clip.slots).length)
    result.slots = Object.fromEntries(
      Object.entries(clip.slots).map(([name, keys]) => [
        name,
        { attachment: keys.map((k) => ({ time: k.time, name: k.attachment })) },
      ]),
    );
  if (clip.drawOrder.length)
    result.drawOrder = clip.drawOrder.map((k) => ({
      time: k.time,
      offsets: rig.slots.map((s, i) => ({
        slot: s.name,
        offset: k.slots.indexOf(s.name) - i,
      })),
    }));
  for (const deform of clip.deforms) {
    result.attachments ??= { default: {} };
    result.attachments.default[deform.slot] ??= {};
    result.attachments.default[deform.slot][deform.attachment] = {
      deform: deform.keys.map((k, i) => {
        const next = deform.keys[i + 1],
          dt = next ? next.time - k.time : 0;
        return {
          time: k.time,
          vertices: k.vertices,
          ...(k.curve === "stepped"
            ? { curve: "stepped" }
            : k.curve === "smooth" && next
              ? { curve: [k.time + dt / 3, 0, next.time - dt / 3, 1] }
              : {}),
        };
      }),
    };
  }
  return result;
}
export const presets = [
  "idle",
  "wave",
  "walk",
  "run",
  "jump",
  "attack",
  "turn",
] as const;
export function preset(
  kind: string,
  name: string,
  job: JobSpec,
  rig: RigSpec,
): Clip {
  const action = job.actions.find((a) => a.name === name);
  if (!action) throw new Error(`No action ${name}`);
  if (rig.motionModel) return anatomicalPreset(kind, name, job, rig);
  if (
    !["unspecified", "humanoid"].includes(job.character.morphology) ||
    job.presentation.usage === "side-scroller"
  )
    throw new Error(
      "This anatomy/game view requires an explicit motionModel or custom MotionSpec; legacy humanoid presets are not applicable.",
    );
  if (!presets.includes(kind as any))
    throw new Error(
      `Unsupported preset ${kind}; provide a custom MotionSpec, do not substitute another action`,
    );
  const clip = clipSchema.parse({
    name,
    duration: action.duration,
    loop: action.loop,
  });
  const d = clip.duration,
    r = rig.roles;
  const role = (name: string) => {
    if (!r[name]) throw new Error(`Preset ${kind} requires role ${name}`);
    return r[name];
  };
  const track = (
    bone: string,
    prop: string,
    values: number[],
    fractions?: number[],
  ) => {
    clip.bones[bone] ??= [];
    values.forEach((value, i) => {
      const time = (fractions?.[i] ?? i / (values.length - 1)) * d;
      let key = clip.bones[bone].find((k) => k.time === time);
      if (!key) {
        key = { time, curve: "smooth" };
        clip.bones[bone].push(key);
      }
      Object.assign(key, { [prop]: value });
    });
    clip.bones[bone].sort((a, b) => a.time - b.time);
  };
  if (kind === "idle") {
    track(role("torso"), "scaleY", [1, 1.025, 1]);
    track(role("head"), "rotation", [0, 2, 0]);
  }
  if (kind === "wave") {
    track(
      role("upperArmR"),
      "rotation",
      [0, 125, 120, 125, 0],
      [0, 0.25, 0.5, 0.75, 1],
    );
    track(
      role("forearmR"),
      "rotation",
      [0, 25, -25, 25, 0],
      [0, 0.25, 0.5, 0.75, 1],
    );
    track(role("head"), "rotation", [0, -4, 0]);
  }
  if (kind === "walk" || kind === "run") {
    const run = kind === "run",
      stride = run ? 70 : 40,
      lift = run ? 40 : 20,
      wm = worlds(rig.bones);
    for (const [side, phase] of [
      ["L", 0],
      ["R", 0.5],
    ] as const) {
      const target = role(`footTarget${side}`),
        foot = role(`foot${side}`),
        base = wm.get(target)!;
      const count = 60;
      clip.bones[target] = Array.from({ length: count + 1 }, (_, i) => {
        const t = i / count,
          p = (t + phase) % 1,
          stance = p < 0.5;
        return {
          time: t * d,
          x: stance ? stride * (0.5 - 2 * p) : stride * (-0.5 + 2 * (p - 0.5)),
          y: stance ? 0 : lift * Math.sin((p - 0.5) * 2 * Math.PI),
          curve: "linear",
        };
      });
      // In-place locomotion has moving stance coordinates; actual planted contacts apply to translated locomotion.
      if (action.rootMotion === "translate") {
        track(role("root"), "x", [0, stride * 2]);
        clip.bones[role("root")].forEach((k) => (k.curve = "linear"));
        const ranges = phase === 0 ? [[0, 0.5]] : [[0.5, 1]];
        for (const [start, end] of ranges)
          clip.contacts.push({
            bone: foot,
            start: start * d,
            end: end * d,
            point: [base[4] + stride / 2 + start * stride * 2, base[5]],
            tolerance: 4,
          });
      }
      track(
        role(`upperArm${side}`),
        "rotation",
        side === "L"
          ? [0, run ? -35 : -18, 0, run ? 35 : 18, 0]
          : [0, run ? 35 : 18, 0, run ? -35 : -18, 0],
      );
    }
    track(role("torso"), "y", [0, run ? 8 : 3, 0, run ? 8 : 3, 0]);
  }
  if (kind === "jump") {
    clip.phases = [
      { name: "anticipation", start: 0, end: d * 0.2 },
      { name: "airborne", start: d * 0.2, end: d * 0.75 },
      { name: "landing", start: d * 0.75, end: d },
    ];
    track(
      role("root"),
      "y",
      [0, -12, 90, 0, -8, 0],
      [0, 0.15, 0.45, 0.75, 0.83, 1],
    );
    track(
      role("torso"),
      "scaleY",
      [1, 0.92, 1.04, 0.94, 1],
      [0, 0.15, 0.45, 0.83, 1],
    );
    track(role("upperArmL"), "rotation", [0, -55, 0]);
    track(role("upperArmR"), "rotation", [0, 55, 0]);
  }
  if (kind === "attack") {
    clip.phases = [
      { name: "windup", start: 0, end: d * 0.35 },
      { name: "strike", start: d * 0.35, end: d * 0.52 },
      { name: "recovery", start: d * 0.52, end: d },
    ];
    track(
      role("upperArmR"),
      "rotation",
      [0, -35, 95, 65, 0],
      [0, 0.35, 0.52, 0.7, 1],
    );
    track(role("forearmR"), "rotation", [0, 30, -15, 0], [0, 0.35, 0.52, 1]);
    track(role("torso"), "rotation", [0, -8, 12, 0], [0, 0.35, 0.52, 1]);
  }
  if (kind === "turn") {
    const slot = rig.slots.find((s) => s.name === r.headSlot);
    if (!slot || !slot.attachments.some((a) => a.name === "back"))
      throw new Error("Turn requires headSlot role and real back attachment");
    clip.slots[slot.name] = [
      { time: 0, attachment: slot.attachment },
      { time: d * 0.25, attachment: "back" },
      { time: d * 0.75, attachment: slot.attachment },
    ];
    track(
      role("head"),
      "scaleX",
      [1, 0.18, 1, 0.18, 1],
      [0, 0.25, 0.5, 0.75, 1],
    );
    // This preset is a head turn. Full-body turn is authored as explicit view-group tracks.
  }
  if (r.antenna)
    clip.secondary.push({
      bone: r.antenna,
      amplitude: kind === "run" ? 9 : 4,
      cycles: 2,
      phase: 0,
      damping: 1,
    });
  if (kind === "idle" && r.headSlot) {
    const slot = rig.slots.find((s) => s.name === r.headSlot);
    if (slot?.attachments.some((a) => a.name === "closed"))
      clip.slots[slot.name] = [
        { time: 0, attachment: slot.attachment },
        { time: d * 0.65, attachment: "closed" },
        { time: d * 0.71, attachment: slot.attachment },
      ];
  }
  return clip;
}
export function makePresets(
  job: JobSpec,
  rig: RigSpec,
  kinds: Record<string, string>,
): MotionSpec {
  return motionSchema.parse({
    schemaVersion: 1,
    clips: job.actions.map((a) =>
      preset(kinds[a.name] ?? a.name, a.name, job, rig),
    ),
  });
}
