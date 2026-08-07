import { describe, it, expect } from "vitest";
import { discoverCandidates, toSafePosixPath } from "../src/import/discover";

describe("toSafePosixPath", () => {
  it("normalizes backslashes to POSIX", () => {
    expect(toSafePosixPath("a\\b\\c.svg")).toBe("a/b/c.svg");
  });

  it("rejects absolute paths", () => {
    expect(() => toSafePosixPath("/etc/passwd")).toThrow();
  });

  it("rejects parent traversal", () => {
    expect(() => toSafePosixPath("../escape.svg")).toThrow();
    expect(() => toSafePosixPath("a/../../b.svg")).toThrow();
  });

  it("rejects NUL and windows drive letters", () => {
    expect(() => toSafePosixPath("a\u0000b.svg")).toThrow();
    expect(() => toSafePosixPath("C:\\x.svg")).toThrow();
  });
});

describe("discoverCandidates", () => {
  const limits = { maxEntries: 10, maxTotalBytes: 1000 };

  it("builds candidates with stable opaque ids", () => {
    const { candidates, errors } = discoverCandidates(
      [
        { fileName: "a.svg", size: 10, mimeType: "image/svg+xml" },
        { fileName: "b.svg", size: 20, mimeType: "image/svg+xml" },
      ],
      limits,
    );
    expect(errors).toHaveLength(0);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.opaqueId).toBe("candidate-0");
    expect(candidates[1]?.opaqueId).toBe("candidate-1");
  });

  it("rejects unsafe paths and empty names", () => {
    const { candidates, errors } = discoverCandidates(
      [
        { fileName: "ok.svg", size: 1, mimeType: "image/svg+xml" },
        { fileName: "../bad.svg", size: 1, mimeType: "image/svg+xml" },
        { fileName: "", size: 1, mimeType: "image/svg+xml" },
      ],
      limits,
    );
    expect(candidates).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });

  it("enforces total byte limit", () => {
    const { candidates, errors } = discoverCandidates(
      [
        { fileName: "a.svg", size: 600, mimeType: "image/svg+xml" },
        { fileName: "b.svg", size: 600, mimeType: "image/svg+xml" },
      ],
      { maxEntries: 10, maxTotalBytes: 1000 },
    );
    expect(candidates).toHaveLength(1);
    expect(errors).toContainEqual(expect.stringContaining("total import size"));
  });

  it("enforces entry count limit", () => {
    const files = Array.from({ length: 5 }, (_, i) => ({
      fileName: `${i}.svg`,
      size: 1,
      mimeType: "image/svg+xml",
    }));
    const { errors } = discoverCandidates(files, { maxEntries: 3, maxTotalBytes: 1000 });
    expect(errors.some((e) => e.includes("too many entries"))).toBe(true);
  });
});
