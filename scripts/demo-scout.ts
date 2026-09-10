import path from "node:path";
import { cp, mkdir } from "node:fs/promises";
import { ROOT, readJson } from "../src/io.ts";
import {
  jobSchema,
  manifestSchema,
  rigSchema,
  motionSchema,
} from "../src/schema.ts";
import { assemble } from "../src/assembly.ts";
import { compile } from "../src/compile.ts";
import { validate } from "../src/validate.ts";
import { buildAll } from "./build.ts";

// This is the selected final registered artwork, not a dependency on an old
// output directory. Rebuilding never writes to the published source example.
const source = path.join(ROOT, "examples/mountain-scout");
const work = path.join(ROOT, "output/mountain-scout/work");
const out = path.join(ROOT, "output/mountain-scout/export");
await buildAll();
await mkdir(work, { recursive: true });
await cp(source, work, { recursive: true });
const job = jobSchema.parse(await readJson(path.join(work, "job.json")));
const assets = manifestSchema.parse(
  await readJson(path.join(work, "assets.json")),
);
const rig = rigSchema.parse(await readJson(path.join(work, "rig.json")));
const motion = motionSchema.parse(
  await readJson(path.join(work, "motion.json")),
);
await assemble(work, path.join(out, "assembly"));
await compile(job, assets, rig, motion, work, out);
const report = await validate(out);
console.log(
  JSON.stringify(
    { out, status: report.status, issues: report.issues },
    null,
    2,
  ),
);
if (!report.technicalPassed) process.exitCode = 1;
