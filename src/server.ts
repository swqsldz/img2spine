import { createServer } from "node:http";
import path from "node:path";
import { ROOT, safeRead } from "./io.ts";
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".atlas": "text/plain",
  ".txt": "text/plain",
};
export async function serve(bundleDir: string, port = 4173) {
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405);
        res.end();
        return;
      }
      const pathname = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname,
      );
      let root: string, file: string;
      if (pathname === "/") {
        root = path.join(ROOT, "web");
        file = "index.html";
      } else if (pathname === "/app.js") {
        root = path.join(ROOT, "dist");
        file = "app.js";
      } else if (pathname === "/style.css") {
        root = path.join(ROOT, "web");
        file = "style.css";
      } else if (pathname.startsWith("/bundle/")) {
        root = bundleDir;
        file = pathname.slice(8);
      } else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const body = await safeRead(root, file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (e) {
      res.writeHead((e as any).code === "ENOENT" ? 404 : 400);
      res.end("Resource unavailable");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}
