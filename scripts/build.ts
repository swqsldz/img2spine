import { build } from "esbuild";
import path from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
import { ROOT, RUNTIME, assertRuntime } from "../src/io.ts";
export async function buildAll() {
  assertRuntime();
  await mkdir(path.join(ROOT, "dist"), { recursive: true });
  const core = path.join(RUNTIME, "spine-ts/spine-core/src/index.ts");
  await build({
    entryPoints: [core],
    outfile: path.join(ROOT, "dist/core.mjs"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
  });
  await build({
    entryPoints: [path.join(ROOT, "web/app.js")],
    outfile: path.join(ROOT, "dist/app.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    alias: {
      "@esotericsoftware/spine-core": core,
      "@esotericsoftware/spine-webgl": path.join(
        RUNTIME,
        "spine-ts/spine-webgl/src/index.ts",
      ),
    },
  });
  await copyFile(
    path.join(RUNTIME, "LICENSE"),
    path.join(ROOT, "dist/SPINE-LICENSE.txt"),
  );
}
if (process.argv[1]?.endsWith("build.ts")) {
  await buildAll();
  console.log("Built pinned Spine core and browser renderer.");
}
