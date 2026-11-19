#!/usr/bin/env node
/**
 * Serves the browser verifier locally: http://localhost:8787/web/
 * Browsers block ES modules on file:// URLs, so the page needs any static
 * server. This one serves only verifier/ and only on localhost.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json" };
const ALLOWED = [`${sep}web${sep}`, `${sep}src${sep}`];

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const rel = normalize(path === "/" || path === "/web" ? "/web/index.html" : path.endsWith("/") ? `${path}index.html` : path);
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT) || !ALLOWED.some((d) => rel.startsWith(d))) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`TUGMA verifier: http://localhost:${PORT}/web/`));
