import { z } from "zod";
import path from "node:path";
import {
  jobSchema,
  manifestSchema,
  rigSchema,
  motionSchema,
} from "../src/schema.ts";
import { ROOT, writeJson } from "../src/io.ts";
import { assetPlanSchema } from "../src/production.ts";
for (const [name, schema] of [
  ["job", jobSchema],
  ["assets", manifestSchema],
  ["rig", rigSchema],
  ["motion", motionSchema],
  ["asset-plan", assetPlanSchema],
] as const)
  await writeJson(
    path.join(ROOT, "schemas", `${name}.schema.json`),
    z.toJSONSchema(schema),
  );
