import path from "node:path";
import os from "node:os";
import { cp, access } from "node:fs/promises";
import { ROOT, writeJson, readJson } from "../src/io.ts";
const destination = path.join(
  process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
  "skills",
  "img2spine",
);
try {
  await access(destination);
  if (!process.argv.includes("--update"))
    throw new Error(
      `Skill already exists: ${destination}. Use --update for this workspace's managed skill.`,
    );
  const installed = await readJson(path.join(destination, "workspace.json"));
  if (path.resolve(installed.workspaceRoot) !== ROOT)
    throw new Error(
      "Installed skill belongs to another workspace; refusing to replace it.",
    );
  await cp(
    destination,
    path.join(ROOT, ".cache/skill-backups", String(Date.now())),
    { recursive: true },
  );
} catch (e) {
  if ((e as any).code !== "ENOENT") throw e;
}
await cp(path.join(ROOT, "skills/img2spine"), destination, {
  recursive: true,
  errorOnExist: !process.argv.includes("--update"),
  force: process.argv.includes("--update"),
});
await writeJson(path.join(destination, "workspace.json"), {
  workspaceRoot: ROOT,
});
console.log(destination);
