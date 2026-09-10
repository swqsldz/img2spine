import path from "node:path";
import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
import { ROOT, readJson } from "../src/io.ts";
import { buildAll } from "./build.ts";

const directory = path.resolve(
  process.argv[2] ?? path.join(ROOT, "output/robot/export"),
);
await readJson(path.join(directory, "bundle.json"));
await buildAll();
const destination = path.join(directory, "preview");
await mkdir(destination, { recursive: true });
const html = (await readFile(path.join(ROOT, "web/index.html"), "utf8"))
  .replace("<head>", '<head><meta name="spine-resource-base" content="../">')
  .replace('href="/style.css"', 'href="./style.css"')
  .replace('src="/app.js"', 'src="./app.js"')
  .replace('href="/"', 'href="./index.html"')
  .replace('src="/bundle/reconstruction.png"', 'src="../reconstruction.png"');
await writeFile(path.join(destination, "index.html"), html, "utf8");
await copyFile(
  path.join(ROOT, "dist/app.js"),
  path.join(destination, "app.js"),
);
await copyFile(
  path.join(ROOT, "web/style.css"),
  path.join(destination, "style.css"),
);
await writeFile(
  path.join(directory, "PREVIEW.txt"),
  "Serve this directory over HTTP, then open preview/index.html.\nExample: python -m http.server 4173 --bind 127.0.0.1\nRuntime files are beside this file. SPINE-LICENSE.txt applies to the bundled official runtime.\n",
  "utf8",
);
console.log(destination);
