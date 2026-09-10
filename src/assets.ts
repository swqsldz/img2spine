import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import {
  manifestSchema,
  type AssetManifest,
  type Asset,
  type JobSpec,
} from "./schema.ts";
import { hash, writeJson } from "./io.ts";

export function alphaBounds(
  data: Buffer,
  width: number,
  height: number,
  threshold = 1,
) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1,
    transparent = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a === 0) transparent++;
      if (a > threshold) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < left) throw new Error("Empty transparent image");
  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
    transparent,
  };
}
export async function ingest(
  manifest: AssetManifest,
  base: string,
  out: string,
) {
  const result = manifestSchema.parse(manifest);
  await mkdir(path.join(out, "assets"), { recursive: true });
  for (const asset of result.assets) {
    const original = await readFile(path.resolve(base, asset.file));
    const input = asset.sourceRect
      ? await sharp(original).extract(asset.sourceRect).png().toBuffer()
      : original;
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const box = alphaBounds(
      data,
      info.width,
      info.height,
      asset.trimAlphaThreshold,
    );
    if (box.transparent === 0)
      throw new Error(
        `Asset ${asset.id}: no actual transparency; regenerate with alpha`,
      );
    const width = Math.max(1, Math.round(asset.placement.width)),
      height = Math.max(1, Math.round(asset.placement.height));
    let pipeline = sharp(input).extract({
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
    });
    if (asset.placement.mirror) pipeline = pipeline.flop();
    const normalized = await pipeline
      .resize(width, height, { fit: "contain", background: "#00000000" })
      .ensureAlpha()
      .png()
      .toBuffer();
    const normalizedRaw = await sharp(normalized).raw().toBuffer();
    const trim = alphaBounds(normalizedRaw, width, height);
    asset.sha256 = hash(original);
    asset.normalizedFile = `assets/${asset.id}.png`;
    asset.trim = {
      x: trim.left,
      y: trim.top,
      width: trim.width,
      height: trim.height,
      originalWidth: width,
      originalHeight: height,
    };
    await writeFile(path.join(out, asset.normalizedFile), normalized);
    await writeFile(
      path.join(out, "assets", `${asset.id}.source.png`),
      await sharp(original).png().toBuffer(),
    );
    asset.file = `assets/${asset.id}.source.png`;
  }
  if (result.master) {
    await copyFile(
      path.resolve(base, result.master),
      path.join(out, "master.png"),
    );
    result.master = "master.png";
  }
  await writeJson(path.join(out, "assets.json"), result);
  return result;
}
export async function reconstruct(
  job: JobSpec,
  manifest: AssetManifest,
  base: string,
  order: string[],
  destination: string,
) {
  const overlays: OverlayOptions[] = [];
  for (const name of order) {
    const asset = manifest.assets.find((a) => a.id === name);
    if (!asset) throw new Error(`Missing reconstruction asset ${name}`);
    const image = await sharp(path.resolve(base, asset.normalizedFile!))
      .rotate(asset.placement.rotation, { background: "#00000000" })
      .png()
      .toBuffer({ resolveWithObject: true });
    const left = Math.round(
        asset.placement.x + (asset.placement.width - image.info.width) / 2,
      ),
      top = Math.round(
        asset.placement.y + (asset.placement.height - image.info.height) / 2,
      );
    if (
      left < 0 ||
      top < 0 ||
      left + image.info.width > job.canvas.width ||
      top + image.info.height > job.canvas.height
    )
      throw new Error(`Asset ${name} is outside reconstruction canvas`);
    overlays.push({ input: image.data, left, top });
  }
  await sharp({
    create: {
      width: job.canvas.width,
      height: job.canvas.height,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(overlays)
    .png()
    .toFile(destination);
}
export async function packAtlas(
  manifest: AssetManifest,
  base: string,
  out: string,
  stem: string,
  maxSize = 2048,
) {
  const padding = 2;
  const pages: { width: number; height: number; data: Buffer; items: any[] }[] =
    [];
  let x = padding,
    y = padding,
    row = 0;
  let page = {
    width: maxSize,
    height: maxSize,
    data: Buffer.alloc(maxSize * maxSize * 4),
    items: [] as any[],
  };
  pages.push(page);
  const sorted = [...manifest.assets].sort(
    (a, b) => b.trim!.height - a.trim!.height || a.id.localeCompare(b.id),
  );
  for (const a of sorted) {
    const t = a.trim;
    if (!t || !a.normalizedFile)
      throw new Error(`Asset ${a.id} must be ingested`);
    if (t.width + padding * 2 > maxSize || t.height + padding * 2 > maxSize)
      throw new Error(`Asset ${a.id} exceeds atlas page size`);
    if (x + t.width + padding > maxSize) {
      x = padding;
      y += row + padding * 2;
      row = 0;
    }
    if (y + t.height + padding > maxSize) {
      page = {
        width: maxSize,
        height: maxSize,
        data: Buffer.alloc(maxSize * maxSize * 4),
        items: [],
      };
      pages.push(page);
      x = padding;
      y = padding;
      row = 0;
    }
    const pixels = await sharp(path.resolve(base, a.normalizedFile))
      .extract({ left: t.x, top: t.y, width: t.width, height: t.height })
      .ensureAlpha()
      .raw()
      .toBuffer();
    for (let py = -padding; py < t.height + padding; py++)
      for (let px = -padding; px < t.width + padding; px++) {
        const sx = Math.max(0, Math.min(t.width - 1, px)),
          sy = Math.max(0, Math.min(t.height - 1, py));
        pixels.copy(
          page.data,
          ((y + py) * maxSize + x + px) * 4,
          (sy * t.width + sx) * 4,
          (sy * t.width + sx) * 4 + 4,
        );
      }
    page.items.push({ asset: a, x, y });
    x += t.width + padding * 2;
    row = Math.max(row, t.height);
  }
  const lines: string[] = [];
  const files: string[] = [];
  await mkdir(out, { recursive: true });
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const width = Math.min(
      maxSize,
      2 **
        Math.ceil(
          Math.log2(
            Math.max(...p.items.map((r) => r.x + r.asset.trim.width + padding)),
          ),
        ),
    );
    const height = Math.min(
      maxSize,
      2 **
        Math.ceil(
          Math.log2(
            Math.max(
              ...p.items.map((r) => r.y + r.asset.trim.height + padding),
            ),
          ),
        ),
    );
    const file = `${stem}-${i + 1}.png`;
    files.push(file);
    await sharp(p.data, {
      raw: { width: maxSize, height: maxSize, channels: 4 },
    })
      .extract({ left: 0, top: 0, width, height })
      .png()
      .toFile(path.join(out, file));
    if (i) lines.push("");
    lines.push(
      file,
      `size: ${width}, ${height}`,
      "filter: Linear, Linear",
      "pma: false",
    );
    for (const r of p.items) {
      const t = r.asset.trim;
      lines.push(
        r.asset.id,
        `  bounds: ${r.x}, ${r.y}, ${t.width}, ${t.height}`,
        `  offsets: ${t.x}, ${t.originalHeight - t.y - t.height}, ${t.originalWidth}, ${t.originalHeight}`,
      );
    }
  }
  const atlas = `${stem}.atlas`;
  await writeFile(path.join(out, atlas), lines.join("\n") + "\n");
  return { atlas, pages: files };
}
