import sharp from "sharp";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { hash, writeJson } from "../src/io.ts";

// Mechanical extraction for the explicitly selected magenta-background route.
// Does not infer anatomy, generate missing material, or remove arbitrary colors.
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw new Error("Usage: chroma-key.ts <magenta.png> <rgba.png>");
if (path.resolve(input) === path.resolve(output))
  throw new Error("Preserve the source: select a different output path");
const bytes = await readFile(input);
const { data, info } = await sharp(bytes)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const border = new Map<string, number>();
for (let y = 0; y < info.height; y++)
  for (let x = 0; x < info.width; x++) {
    if (x > 2 && x < info.width - 3 && y > 2 && y < info.height - 3) continue;
    const i = (y * info.width + x) * 4,
      key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    border.set(key, (border.get(key) ?? 0) + 1);
  }
const key = [...border]
  .sort((a, b) => b[1] - a[1])[0][0]
  .split(",")
  .map(Number);
const strength = Math.min(key[0], key[2]) - key[1];
if (strength < 120)
  throw new Error("Border is not the expected saturated magenta key");
let transparent = 0,
  partial = 0,
  opaque = 0;
for (let i = 0; i < data.length; i += 4) {
  let alpha = Math.min(
    1,
    Math.max(0, 1 - (Math.min(data[i], data[i + 2]) - data[i + 1]) / strength),
  );
  alpha = alpha < 12 / 255 ? 0 : alpha > 220 / 255 ? 1 : alpha;
  if (alpha > 0 && alpha < 1)
    for (let c = 0; c < 3; c++)
      data[i + c] = Math.min(
        255,
        Math.max(0, Math.round((data[i + c] - (1 - alpha) * key[c]) / alpha)),
      );
  data[i + 3] = Math.round(data[i + 3] * alpha);
  if (!data[i + 3]) {
    transparent++;
    data[i] = data[i + 1] = data[i + 2] = 0;
  } else if (data[i + 3] < 255) partial++;
  else opaque++;
}
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toFile(output);
const report = {
  input,
  output,
  sourceHash: hash(bytes),
  resultHash: hash(await readFile(output)),
  width: info.width,
  height: info.height,
  key,
  transparent,
  partial,
  opaque,
  method:
    "magenta excess matte with linear foreground-color recovery; requires non-magenta subject palette",
  scope:
    "Mechanical alpha extraction only; inspect material retention and edges",
};
await writeJson(output.replace(/\.png$/i, "-key.json"), report);
console.log(JSON.stringify(report, null, 2));
