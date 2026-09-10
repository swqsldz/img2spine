import { chromium } from "playwright";
import sharp, { type OverlayOptions } from "sharp";
import path from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { ROOT, readJson, writeJson, hash } from "../src/io.ts";
import { serve } from "../src/server.ts";
import { buildAll } from "./build.ts";
import { alphaBounds } from "../src/assets.ts";

const dir = path.resolve(
  process.argv[2] ?? path.join(ROOT, "output/robot/export"),
);
const out = path.join(dir, "frames");
await mkdir(out, { recursive: true });
await buildAll();
const server = await serve(dir, 0),
  port = (server.address() as any).port;
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
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(
    () => (window as any).img2spine?.ready || (window as any).img2spine?.error,
  );
  const state = await page.evaluate(() => (window as any).img2spine);
  if (state?.error) throw new Error(state.error);
  const bundle = await readJson(path.join(dir, "bundle.json"));
  const summaries = [];
  const evidenceHashes: Record<string, string> = {};
  if (bundle.masterComparison?.status === "needs-visual-review") {
    const setup = await page.evaluate(() =>
      (window as any).img2spine.captureSetup(),
    );
    const png = Buffer.from(setup.image.split(",")[1], "base64");
    const cw = bundle.job.canvas.width,
      ch = bundle.job.canvas.height;
    // Invert the preview camera's uniform scale, preserving the setup world's
    // position (do not independently fit the rendered character's alpha bounds).
    const expanded = await sharp(png)
      .resize(Math.round(setup.worldWidth), Math.round(setup.worldHeight))
      .png()
      .toBuffer();
    const originX = Math.round(
      setup.worldWidth / 2 - bundle.job.canvas.origin[0],
    );
    if (originX < 0 || originX + cw > Math.round(setup.worldWidth))
      throw new Error("QA viewport cannot contain setup canvas");
    const runtimeSetup = await sharp(expanded)
      .extract({
        left: originX,
        top: Math.round((setup.worldHeight - ch) / 2),
        width: cw,
        height: ch,
      })
      .png()
      .toBuffer();
    await writeFile(path.join(out, "setup.png"), runtimeSetup);
    const master = await readFile(
      path.join(dir, "comparison/master-aligned.png"),
    );
    const comparison = await sharp({
      create: {
        width: cw * 2,
        height: ch + 32,
        channels: 4,
        background: "#eee7dc",
      },
    })
      .composite([
        { input: master, left: 0, top: 32 },
        { input: runtimeSetup, left: cw, top: 32 },
        {
          input: Buffer.from(
            `<svg width="${cw * 2}" height="32"><g font-size="18"><text x="12" y="23">MASTER</text><text x="${cw + 12}" y="23">OFFICIAL RUNTIME / setup pose</text></g></svg>`,
          ),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
    await writeFile(
      path.join(out, "master-runtime-comparison.png"),
      comparison,
    );
    evidenceHashes["frames/setup.png"] = hash(runtimeSetup);
    evidenceHashes["frames/master-runtime-comparison.png"] = hash(comparison);
  }
  for (const action of bundle.animations) {
    const overlays: OverlayOptions[] = [];
    const details: OverlayOptions[] = [];
    const signatures: string[] = [];
    let nonempty = true;
    for (let frame = 0; frame < 12; frame++) {
      const time = (frame / 12) * action.duration;
      const data = await page.evaluate(
        ({ name, time }) => {
          (window as any).img2spine.seek(name, time);
          return (window as any).img2spine.capture();
        },
        { name: action.name, time },
      );
      const png = Buffer.from(data.split(",")[1], "base64");
      await writeFile(
        path.join(out, `${action.name}-${String(frame).padStart(2, "0")}.png`),
        png,
      );
      signatures.push(hash(png));
      const { data: raw, info } = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let alpha = 0;
      for (let i = 3; i < raw.length; i += 4) alpha += raw[i];
      nonempty &&= alpha > 255 * 50;
      const bounds = alphaBounds(raw, info.width, info.height, 4);
      const detail = await sharp(png)
        .extract({
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
        })
        .resize(240, 280, { fit: "contain", background: "#edf1e7" })
        .flatten({ background: "#edf1e7" })
        .png()
        .toBuffer();
      details.push({
        input: detail,
        left: (frame % 4) * 240,
        top: Math.floor(frame / 4) * 280,
      });
      const thumb = await sharp(png)
        .resize(240, 280, { fit: "contain", background: "#edf1e7" })
        .flatten({ background: "#edf1e7" })
        .png()
        .toBuffer();
      overlays.push({
        input: thumb,
        left: (frame % 4) * 240,
        top: Math.floor(frame / 4) * 280,
      });
    }
    const sheet = await sharp({
      create: { width: 960, height: 840, channels: 4, background: "#edf1e7" },
    })
      .composite(overlays)
      .png()
      .toBuffer();
    await writeFile(path.join(out, `${action.name}-sheet.png`), sheet);
    evidenceHashes[`frames/${action.name}-sheet.png`] = hash(sheet);
    const detailSheet = await sharp({
      create: { width: 960, height: 840, channels: 4, background: "#edf1e7" },
    })
      .composite(details)
      .png()
      .toBuffer();
    await writeFile(path.join(out, `${action.name}-details.png`), detailSheet);
    evidenceHashes[`frames/${action.name}-details.png`] = hash(detailSheet);
    summaries.push({
      name: action.name,
      frames: 12,
      nonempty,
      distinctFrames: new Set(signatures).size,
      sheet: `frames/${action.name}-sheet.png`,
      details: `frames/${action.name}-details.png`,
    });
  }
  await page.getByLabel("骨骼与网格").check();
  await page.screenshot({ path: path.join(out, "debug-workspace.png") });
  await page.getByLabel("骨骼与网格").uncheck();
  await page.evaluate(
    (name) => (window as any).img2spine.seek(name, 0),
    bundle.animations[0].name,
  );
  await page.screenshot({ path: path.join(out, "workspace.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "mobile.png") });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  const report = {
    schemaVersion: 1,
    hashes: bundle.hashes,
    masterComparisonEvidenceHashes: bundle.masterComparison?.evidenceHashes,
    evidenceHashes,
    engine: "Microsoft Edge / headless WebGL SwiftShader",
    errors,
    animations: summaries,
    mobileOverflow: overflow,
    passed:
      errors.length === 0 &&
      summaries.every((s) => s.nonempty && s.distinctFrames > 1) &&
      !overflow,
    visualApproval: false,
  };
  await writeJson(path.join(dir, "browser-validation.json"), report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
