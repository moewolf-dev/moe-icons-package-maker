import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * PMUI-05: developer local-server mode. One command serves the built maker UI
 * and (optionally) opens the default browser. Safe localhost default; explicit
 * configurable host/port. Health endpoint for tests. No native-app claim.
 */

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export interface ServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly distDir: string;
  readonly openBrowser?: (url: string) => Promise<void>;
}

export interface RunningServer {
  readonly port: number;
  readonly url: string;
  readonly shutdown: () => Promise<void>;
}

function resolvePath(distDir: string, urlPath: string): string {
  const cleaned = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (cleaned.includes("..") || cleaned.startsWith("/")) {
    const safe = cleaned.replace(/^\/+/, "");
    return join(distDir, safe === "" ? "index.html" : safe);
  }
  return join(distDir, cleaned === "" ? "index.html" : cleaned);
}

export function startMakerServer(options: ServerOptions): Promise<RunningServer> {
  const host = options.host ?? "127.0.0.1";
  const distDir = options.distDir;

  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "moe-icons-package-maker" }));
      return;
    }

    let file = resolvePath(distDir, req.url ?? "/");
    if (!existsSync(file) || file.endsWith("/")) {
      file = join(distDir, "index.html");
    }
    if (!existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    const isSpaFallback = file.endsWith("index.html");
    const requestedHasExtension = /\.[a-z0-9]+$/i.test(req.url ?? "");
    if (isSpaFallback && requestedHasExtension && req.url !== "/") {
      // an explicit file request that doesn't exist must 404, not SPA-fallback
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    const contentType = MIME[extname(file)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(readFileSync(file));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4173, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      const url = `http://${host}:${port}`;
      const running: RunningServer = {
        port,
        url,
        shutdown: () =>
          new Promise((resolveShutdown) => server.close(() => resolveShutdown())),
      };
      if (options.openBrowser) {
        options.openBrowser(url).catch(() => undefined);
      }
      resolve(running);
    });
  });
}
