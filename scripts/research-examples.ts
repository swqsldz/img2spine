import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { ROOT, readJson, writeJson } from "../src/io.ts";
import { mkdir } from "node:fs/promises";

const out = path.join(ROOT, "output/research-official");
await mkdir(out, { recursive: true });
const results = [];
for (const name of ["spineboy", "hero", "raptor"]) {
  const file = `reference/spine-runtimes/examples/${name}/export/${name}-pro.json`;
  const j = await readJson(path.join(ROOT, file));
  const attachments = j.skins.flatMap((s: any) =>
    Object.entries(s.attachments ?? {}).flatMap(([slot, entries]: any) =>
      Object.entries(entries).map(([attachment, a]: any) => ({
        skin: s.name,
        slot,
        attachment,
        path: a.path ?? attachment,
        type: a.type ?? "region",
        weighted: !!a.vertices && a.vertices.length !== a.uvs?.length,
        vertexCount: (a.uvs?.length ?? 0) / 2,
        triangleCount: (a.triangles?.length ?? 0) / 3,
      })),
    ),
  );
  results.push({
    name,
    file,
    version: j.skeleton.spine,
    bones: j.bones,
    slots: j.slots,
    constraints: j.constraints,
    attachments,
    animations: Object.entries(j.animations).map(([name, a]: any) => ({
      name,
      bones: Object.keys(a.bones ?? {}),
      slotKeys: a.slots ?? {},
      drawOrder: a.drawOrder ?? [],
      constraintKeys: a.constraints ?? {},
      deformSkins: Object.keys(a.attachments ?? {}),
    })),
  });
}
await writeJson(path.join(out, "examples-analysis.json"), results);
for (const name of ["spineboy", "hero"]) {
  const parts =
    name === "spineboy"
      ? [
          "front-upper-arm",
          "rear-upper-arm",
          "front-bracer",
          "rear-bracer",
          "front-thigh",
          "rear-thigh",
          "front-shin",
          "rear-shin",
          "front-foot",
          "rear-foot",
        ]
      : [
          "upper-arm1",
          "upper-arm2",
          "forearm1",
          "forearm2",
          "hand1",
          "hand2",
          "thigh1",
          "thigh2",
          "foot1",
          "foot2",
        ];
  const overlays: OverlayOptions[] = [];
  for (const [i, part] of parts.entries()) {
    const img = await sharp(
      path.join(
        ROOT,
        `reference/spine-runtimes/examples/${name}/images/${part}.png`,
      ),
    )
      .resize(170, 165, { fit: "contain", background: "#f2efe800" })
      .png()
      .toBuffer();
    overlays.push({
      input: img,
      left: (i % 2) * 220 + 25,
      top: Math.floor(i / 2) * 200 + 25,
    });
    const label = Buffer.from(
      `<svg width="210" height="24"><text x="6" y="18" font-size="14" fill="#202020">${part}</text></svg>`,
    );
    overlays.push({
      input: label,
      left: (i % 2) * 220,
      top: Math.floor(i / 2) * 200,
    });
  }
  await sharp({
    create: { width: 440, height: 1000, channels: 4, background: "#f2efe8" },
  })
    .composite(overlays)
    .png()
    .toFile(path.join(out, `${name}-parts.png`));
}
console.log(
  JSON.stringify(
    results.map((r) => ({
      name: r.name,
      bones: r.bones.length,
      slots: r.slots.map((s: any) => s.name),
      constraints: r.constraints,
      attachments: r.attachments.length,
      animations: r.animations.map((a: any) => ({
        name: a.name,
        boneTracks: a.bones.length,
        slotTracks: Object.keys(a.slotKeys),
        drawOrder: a.drawOrder,
      })),
    })),
    null,
    2,
  ),
);
