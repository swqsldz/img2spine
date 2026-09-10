import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const RUNTIME = path.join(ROOT, "reference/spine-runtimes");
export const LOCK = {
  commit: "4309c05c287d3f15da778e68f5d2a483fe10a6a3",
  packageVersion: "4.3.13",
  dataVersion: "4.3.75-beta",
};
export async function readJson(file: string): Promise<any> {
  return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
}
export async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}
export const hash = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
export const sameHashes = (
  a: Record<string, string>,
  b: Record<string, string>,
) =>
  !!a &&
  !!b &&
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every((k) => a[k] === b[k]);
export function assertRuntime() {
  const head = execFileSync("git", ["-C", RUNTIME, "rev-parse", "HEAD"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
  const dirty = execFileSync(
    "git",
    [
      "-C",
      RUNTIME,
      "status",
      "--porcelain",
      "--untracked-files=no",
      "--",
      "spine-ts/spine-core",
      "spine-ts/spine-webgl",
    ],
    { encoding: "utf8", windowsHide: true },
  ).trim();
  if (head !== LOCK.commit || dirty)
    throw new Error(
      `Runtime snapshot mismatch or modified runtime source: ${head}`,
    );
}
export function contained(root: string, request: string) {
  const result = path.resolve(root, request);
  const relative = path.relative(path.resolve(root), result);
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    throw new Error("Path escapes resource directory");
  return result;
}
export async function safeRead(root: string, request: string) {
  const target = await realpath(contained(root, request));
  contained(await realpath(root), target);
  return readFile(target);
}
