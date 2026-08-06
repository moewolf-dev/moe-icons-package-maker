import { describe, it, expect } from "vitest";
import { startMakerServer } from "../src/cli/serve.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), "maker-serve-"));
  writeFileSync(join(dir, "index.html"), "<html><body>maker</body></html>");
  return dir;
}

describe("startMakerServer (PMUI-05)", () => {
  it("serves the UI and responds on /health, then shuts down cleanly", async () => {
    const dist = makeDist();
    try {
      const server = await startMakerServer({ distDir: dist, port: 0 });
      const health = await fetch(`${server.url}/health`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      const index = await fetch(server.url);
      expect(index.status).toBe(200);
      const html = await index.text();
      expect(html).toContain("maker");

      await server.shutdown();
      await expect(fetch(server.url)).rejects.toThrow();
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("returns 404 for a missing path", async () => {
    const dist = makeDist();
    try {
      const server = await startMakerServer({ distDir: dist, port: 0 });
      const res = await fetch(`${server.url}/nope.svg`);
      expect(res.status).toBe(404);
      await server.shutdown();
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("binds a specific port when provided", async () => {
    const dist = makeDist();
    try {
      const server = await startMakerServer({ distDir: dist, port: 4199 });
      expect(server.port).toBe(4199);
      await server.shutdown();
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
