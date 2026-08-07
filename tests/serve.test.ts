import { describe, it, expect } from "vitest";
import { startMakerServer } from "../src/cli/serve.js";
import { createLocalApi } from "../src/cli/local-api.js";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function makeDist() {
  const dir = mkdtempSync(join(tmpdir(), "maker-serve-"));
  writeFileSync(join(dir, "index.html"), "<html><body>maker</body></html>");
  return dir;
}

const CATALOG = {
  schemaVersion: 1,
  icons: [
    { id: "arrow-chevron-right", subgroupId: "arrow", label: "Arrow", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
  ],
};

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

  it("exposes /api/config with the local token when a local api is attached", async () => {
    const dist = makeDist();
    const out = mkdtempSync(join(tmpdir(), "maker-serve-out-"));
    try {
      const localApi = createLocalApi({ outputDir: out, catalog: CATALOG });
      const server = await startMakerServer({ distDir: dist, port: 0, localApi });
      const res = await fetch(`${server.url}/api/config`);
      expect(res.status).toBe(200);
      const config = (await res.json()) as { token: string };
      expect(config.token.length).toBeGreaterThan(0);
      await server.shutdown();
    } finally {
      rmSync(dist, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("rejects an unauthenticated local build", async () => {
    const dist = makeDist();
    const out = mkdtempSync(join(tmpdir(), "maker-serve-out-"));
    try {
      const localApi = createLocalApi({ outputDir: out, catalog: CATALOG });
      const server = await startMakerServer({ distDir: dist, port: 0, localApi });
      const res = await fetch(`${server.url}/api/builds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(401);
      await server.shutdown();
    } finally {
      rmSync(dist, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });
});
