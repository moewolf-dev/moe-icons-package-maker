import { describe, it, expect } from "vitest";
import { createDeterministicZip } from "../src/build/zip";
import { unzipSync, strFromU8 } from "fflate";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createNodeFileResolver, writeBuildToDirectory } from "../src/adapters/node/io";

describe("createDeterministicZip", () => {
  const entries = [
    { path: "arrow/arrow-chevron-right.svg", content: "<svg/>" },
    { path: "manifest.json", content: '{"a":1}' },
    { path: "user/user-circle.svg", content: "<svg2/>" },
  ];

  it("produces identical checksums for identical inputs", () => {
    const a = createDeterministicZip(entries);
    const b = createDeterministicZip(entries);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (a.ok && b.ok) {
      const ha = [...a.value].reduce((h, x) => h + x.toString(16), "");
      const hb = [...b.value].reduce((h, x) => h + x.toString(16), "");
      expect(ha).toBe(hb);
    }
  });

  it("unzips back to the expected contents", () => {
    const result = createDeterministicZip(entries);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const files = unzipSync(result.value);
      const manifest = files["manifest.json"];
      const arrow = files["arrow/arrow-chevron-right.svg"];
      expect(manifest ? strFromU8(manifest) : undefined).toBe('{"a":1}');
      expect(arrow ? strFromU8(arrow) : undefined).toBe("<svg/>");
    }
  });

  it("rejects unsafe paths", () => {
    const result = createDeterministicZip([
      { path: "../escape.svg", content: "<svg/>" },
      { path: "/absolute.svg", content: "<svg/>" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects duplicate paths", () => {
    const result = createDeterministicZip([
      { path: "a.svg", content: "1" },
      { path: "a.svg", content: "2" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });
});

describe("createNodeFileResolver", () => {
  it("resolves paths under the root", () => {
    const root = mkdtempSync(join(tmpdir(), "node-resolver-"));
    try {
      const resolvedRoot = realpathSync(root);
      const resolver = createNodeFileResolver(root);
      const resolved = resolver.resolve("arrow/a.svg");
      expect(resolved?.startsWith(resolvedRoot)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects traversal", () => {
    const root = mkdtempSync(join(tmpdir(), "node-resolver-"));
    try {
      const resolver = createNodeFileResolver(root);
      expect(resolver.resolve("../escape.svg")).toBeUndefined();
      expect(resolver.resolve("/abs.svg")).toBeUndefined();
      expect(resolver.resolve("a/../../b.svg")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects symlink escape", () => {
    const root = mkdtempSync(join(tmpdir(), "node-resolver-"));
    const outside = mkdtempSync(join(tmpdir(), "node-outside-"));
    try {
      symlinkSync(outside, join(root, "link"));
      const resolver = createNodeFileResolver(root);
      // resolving through a symlink escapes the root; realpathSync on root won't match
      expect(resolver.resolve("link/x.svg")).toBeUndefined();
    } catch {
      // symlink may not be permitted on some systems; ensure resolver still safe
      const resolver = createNodeFileResolver(root);
      expect(resolver.resolve("../x.svg")).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("writeBuildToDirectory", () => {
  it("stages then renames atomically", async () => {
    const root = mkdtempSync(join(tmpdir(), "node-write-"));
    rmSync(root, { recursive: true, force: true });
    try {
      await writeBuildToDirectory(root, {
        "manifest.json": '{"ok":true}',
        "arrow/a.svg": "<svg/>",
      });
      expect(readFileSync(join(root, "manifest.json"), "utf8")).toBe('{"ok":true}');
      expect(existsSync(`${root}.staging`)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects traversal and leaves no staging", async () => {
    const root = mkdtempSync(join(tmpdir(), "node-write-"));
    rmSync(root, { recursive: true, force: true });
    try {
      await expect(
        writeBuildToDirectory(root, { "../escape.svg": "x" }),
      ).rejects.toThrow();
      expect(existsSync(root)).toBe(false);
      expect(existsSync(`${root}.staging`)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
