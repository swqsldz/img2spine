import { chromium } from "playwright";
import sharp from "sharp";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { readJson, writeJson, hash } from "../src/io.ts";
import { alphaBounds } from "../src/assets.ts";
import { serve } from "../src/server.ts";
import { buildAll } from "./build.ts";

// Render exported resources, then encode. Never recenter individual frames:
// the union crop preserves root movement and ground contact across the clip.
const [directory, animation, destination] = process.argv.slice(2);
if (!directory || !animation || !destination)
  throw new Error(
    "Usage: npm run animate -- <bundle-dir> <animation> <file.gif|webp>",
  );
const dir = path.resolve(directory),
  file = path.resolve(destination);
const format = path.extname(file).slice(1);
if (format !== "gif" && format !== "webp")
  throw new Error("Expected GIF or WebP output");
const bundle = await readJson(path.join(dir, "bundle.json"));
const action = bundle.animations.find((a: any) => a.name === animation);
if (!action || !(action.duration > 0))
  throw new Error("Unknown or empty animation");
await buildAll();
await mkdir(path.dirname(file), { recursive: true });
const server = await serve(dir, 0);
let browser;
try {
  browser = await chromium.launch({
    channel: "msedge",
    headless: true,
    args: ["--enable-webgl", "--use-angle=swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1050 },
    deviceScaleFactor: 1,
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${(server.address() as any).port}`);
  await page.waitForFunction(
    () => (window as any).img2spine?.ready || (window as any).img2spine?.error,
  );
  const error = await page.evaluate(() => (window as any).img2spine.error);
  if (error) throw new Error(error);
  const count = Math.max(2, Math.round(action.duration * 25));
  const frames: Buffer[] = [];
  let left = Infinity,
    top = Infinity,
    right = 0,
    bottom = 0;
  for (let i = 0; i < count; i++) {
    const data = await page.evaluate(
      ({ name, time }) => {
        (window as any).img2spine.seek(name, time);
        return (window as any).img2spine.capture();
      },
      {
        name: animation,
        time: (i * action.duration) / (action.loop ? count : count - 1),
      },
    );
    const png = Buffer.from(data.split(",")[1], "base64");
    const { data: raw, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const b = alphaBounds(raw, info.width, info.height, 4);
    if (
      b.width <= 1 ||
      b.height <= 1 ||
      b.left <= 0 ||
      b.top <= 0 ||
      b.left + b.width >= info.width ||
      b.top + b.height >= info.height
    )
      throw new Error(`Empty or clipped frame ${i}`);
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.left + b.width);
    bottom = Math.max(bottom, b.top + b.height);
    frames.push(png);
  }
  if (errors.length || new Set(frames.map(hash)).size < 2)
    throw new Error(
      `Renderer failed or animation is static: ${errors.join(", ")}`,
    );
  const width = 440,
    height = 480;
  const rawFrames: Buffer[] = [];
  for (const png of frames)
    rawFrames.push(
      await sharp(png)
        .extract({ left, top, width: right - left, height: bottom - top })
        .resize(width - 32, height - 32, {
          fit: "contain",
          background: "#eee7dc",
        })
        .extend({
          top: 16,
          bottom: 16,
          left: 16,
          right: 16,
          background: "#eee7dc",
        })
        .flatten({ background: "#eee7dc" })
        .ensureAlpha()
        .raw()
        .toBuffer(),
    );
  // GIF delays use 10ms units; cumulative rounding preserves total duration.
  const delay = frames.map(
    (_, i) =>
      (Math.round(((i + 1) * action.duration * 100) / count) -
        Math.round((i * action.duration * 100) / count)) *
      10,
  );
  const encoder = sharp(Buffer.concat(rawFrames), {
    raw: { width, height: height * count, channels: 4, pageHeight: height },
  });
  // Non-looping actions play once; looping clips omit the duplicated last pose.
  const options = { loop: action.loop ? 0 : 1, delay };
  const encoded = await (
    format === "gif"
      ? encoder.gif({ ...options, effort: 7, dither: 0.5 })
      : encoder.webp({ ...options, quality: 85, effort: 5 })
  ).toBuffer();
  const metadata = await sharp(encoded, { animated: true }).metadata();
  if (metadata.pages !== count || metadata.pageHeight !== height)
    throw new Error("Encoded animation frame count or dimensions differ");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(file, encoded);
  const report = {
    schemaVersion: 1,
    renderer: "Official Spine WebGL / Edge SwiftShader",
    animation,
    resourceHashes: bundle.hashes,
    runtime: bundle.runtime,
    frames: count,
    width,
    height,
    durationMs: delay.reduce((a, b) => a + b, 0),
    loop: action.loop,
    crop: { left, top, width: right - left, height: bottom - top },
    sha256: hash(encoded),
    bytes: encoded.length,
  };
  await writeJson(`${file}.json`, report);
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
