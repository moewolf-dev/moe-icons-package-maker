import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runNodeCli } from "../src/cli/node-cli";

const CATALOG = {
  schemaVersion: 1,
  icons: [
    {
      id: "arrow-chevron-right",
      subgroupId: "arrow",
      label: "Arrow chevron right",
      aliases: [],
      addedAt: "2026-08-06T00:00:00.000Z",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
  ],
};

const GOOD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1 L23 23"/></svg>';

let dirs: string[] = [];

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "node-cli-"));
  dirs.push(dir);
  const catalogPath = join(dir, "catalog.json");
  writeFileSync(catalogPath, JSON.stringify(CATALOG));
  const svgDir = join(dir, "svg");
  mkdirSync(svgDir, { recursive: true });
  writeFileSync(join(svgDir, "arrow-chevron-right.svg"), GOOD_SVG);
  const outDir = join(dir, "out");
  return { dir, catalogPath, svgDir, outDir };
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("runNodeCli", () => {
  it("builds a group and writes zip + files", async () => {
    const { catalogPath, svgDir, outDir } = makeFixture();
    const requestPath = join(outDir, "..", "request.json");
    writeFileSync(
      requestPath,
      JSON.stringify({
        catalogPath,
        selectedIds: ["arrow-chevron-right"],
        svgDir,
        groupId: "my-custom",
        displayName: "My Custom",
        styleId: "outline",
        author: { name: "Ada" },
        outputDir: outDir,
      }),
    );
    const code = await runNodeCli([requestPath]);
    expect(code).toBe(0);
    expect(readFileSync(join(outDir, "icons.zip")).length).toBeGreaterThan(10);
    expect(readFileSync(join(outDir, "manifest.json"), "utf8")).toContain("my-custom");
  });

  it("returns nonzero with JSON diagnostics on invalid request", async () => {
    const requestPath = join(tmpdir(), "bad-request.json");
    writeFileSync(requestPath, JSON.stringify({ not: "a request" }));
    const code = await runNodeCli([requestPath]);
    expect(code).toBe(1);
  });

  it("returns usage code without args", async () => {
    const code = await runNodeCli([]);
    expect(code).toBe(2);
  });

  it("handles a missing request file", async () => {
    const code = await runNodeCli(["/nonexistent/request.json"]);
    expect(code).toBe(1);
  });

  it("fails on validation errors with JSON output", async () => {
    const { catalogPath, svgDir, outDir } = makeFixture();
    writeFileSync(join(svgDir, "arrow-chevron-right.svg"), "<svg></svg>");
    const requestPath = join(outDir, "..", "request.json");
    writeFileSync(
      requestPath,
      JSON.stringify({
        catalogPath,
        selectedIds: ["arrow-chevron-right"],
        svgDir,
        groupId: "g",
        displayName: "G",
        styleId: "outline",
        author: { name: "Ada" },
        outputDir: outDir,
      }),
    );
    const code = await runNodeCli([requestPath]);
    expect(code).toBe(1);
  });
});
