#!/usr/bin/env node
import path from "node:path";
import { readJson, writeJson } from "./io.ts";
import {
  jobSchema,
  manifestSchema,
  rigSchema,
  motionSchema,
} from "./schema.ts";
import { prepare, repairPlan } from "./workflow.ts";
import { ingest } from "./assets.ts";
import { compile } from "./compile.ts";
import { validate } from "./validate.ts";
import { makePresets } from "./motion.ts";
import { serve } from "./server.ts";
import { buildAll } from "../scripts/build.ts";
import { registerAssets, bonesFromJoints } from "./registration.ts";
import { assemble } from "./assembly.ts";

const [command, sourceArg, ...args] = process.argv.slice(2);
const source = path.resolve(sourceArg ?? ".");
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : (args[i + 1] ?? fallback);
};
try {
  if (command === "prepare")
    console.log(JSON.stringify(await prepare(source), null, 2));
  else if (command === "register") {
    const matches = await readJson(path.join(source, "registration.json"));
    const result = registerAssets(
      manifestSchema.parse(await readJson(path.join(source, "assets.json"))),
      matches,
    );
    await writeJson(
      path.join(source, "assets.registered.json"),
      result.manifest,
    );
    await writeJson(
      path.join(source, "registration-report.json"),
      result.errors,
    );
    console.log(
      "Wrote assets.registered.json; use --manifest assets.registered.json with ingest.",
    );
  } else if (command === "rig") {
    const job = jobSchema.parse(await readJson(path.join(source, "job.json"))),
      input = await readJson(path.join(source, "joints.json"));
    const rig = rigSchema.parse({
      schemaVersion: 1,
      bones: bonesFromJoints(job, input.joints),
      slots: input.slots,
      ik: input.ik,
      roles: input.roles,
      motionModel: input.motionModel,
      layerRules: input.layerRules,
    });
    await writeJson(path.join(source, "rig.json"), rig);
    console.log("Wrote rig from joint landmarks.");
  } else if (command === "ingest") {
    const out = path.resolve(option("--out", path.join(source, "work")));
    const manifest = manifestSchema.parse(
      await readJson(path.join(source, option("--manifest", "assets.json"))),
    );
    await ingest(manifest, source, out);
    for (const file of [
      "job.json",
      "rig.json",
      "motion.json",
      "asset-plan.json",
    ]) {
      try {
        await writeJson(
          path.join(out, file),
          await readJson(path.join(source, file)),
        );
      } catch (e) {
        if ((e as any).code !== "ENOENT") throw e;
      }
    }
    console.log(out);
  } else if (command === "assemble") {
    console.log(
      JSON.stringify(
        await assemble(
          source,
          path.resolve(option("--out", path.join(source, "assembly"))),
        ),
        null,
        2,
      ),
    );
  } else if (command === "compile") {
    const job = jobSchema.parse(await readJson(path.join(source, "job.json"))),
      assets = manifestSchema.parse(
        await readJson(path.join(source, "assets.json")),
      ),
      rig = rigSchema.parse(await readJson(path.join(source, "rig.json"))),
      motion = motionSchema.parse(
        await readJson(path.join(source, "motion.json")),
      );
    const out = path.resolve(option("--out", path.join(source, "export")));
    await compile(job, assets, rig, motion, source, out);
    console.log(out);
  } else if (command === "validate") {
    const report = await validate(source);
    console.log(JSON.stringify(report, null, 2));
    if (!report.technicalPassed) process.exitCode = 1;
  } else if (command === "repair") {
    const bundle = await readJson(path.join(source, "bundle.json"));
    console.log(
      JSON.stringify(
        await repairPlan(source, jobSchema.parse(bundle.job)),
        null,
        2,
      ),
    );
  } else if (command === "motion") {
    const job = jobSchema.parse(await readJson(path.join(source, "job.json"))),
      rig = rigSchema.parse(await readJson(path.join(source, "rig.json")));
    const mapping = JSON.parse(option("--presets", "{}"));
    await writeJson(
      path.join(source, "motion.json"),
      makePresets(job, rig, mapping),
    );
    console.log("Wrote explicit preset MotionSpec.");
  } else if (command === "preview") {
    await buildAll();
    const port = Number(option("--port", "4173"));
    await serve(source, port);
    console.log(`Preview: http://127.0.0.1:${port}`);
  } else {
    console.log(
      "img2spine\n  prepare <project>\n  register <project>\n  rig <project>\n  ingest <project> --out <work>\n  assemble <work> --out <assembly>\n  motion <project> --presets <JSON mapping>\n  compile <work> --out <bundle>\n  validate <bundle>\n  repair <bundle>\n  preview <bundle> --port 4173",
    );
    if (command) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        command,
        message: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
