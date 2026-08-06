import { describe, it, expect } from "vitest";
import { parseIconGroupManifest } from "../src/contracts/manifest";
import type { IconGroupManifest } from "../src/contracts/manifest";

const validManifest: IconGroupManifest = {
  schemaVersion: 1,
  groupId: "my-custom",
  displayName: "My Custom Icons",
  styleId: "outline",
  author: { name: "Ada Lovelace", email: "ada@example.com", license: "MIT" },
  createdWith: "moe-icons-package-maker@0.1.0",
  createdAt: "2026-08-06T00:00:00.000Z",
  entries: [
    {
      iconId: "arrow-chevron-right",
      subgroupId: "arrow",
      outputPath: "arrow/arrow-chevron-right.svg",
      checksum: "a".repeat(64),
    },
  ],
  validation: { selected: 1, filled: 1, valid: 1, warnings: 0, errors: 0, missing: 0 },
};

describe("parseIconGroupManifest", () => {
  it("accepts a valid manifest", () => {
    const result = parseIconGroupManifest(validManifest);
    expect(result.ok).toBe(true);
  });

  it("accepts a valid partial group", () => {
    const partial: IconGroupManifest = {
      ...validManifest,
      validation: { selected: 5, filled: 2, valid: 2, warnings: 0, errors: 0, missing: 3 },
    };
    const result = parseIconGroupManifest(partial);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object", () => {
    const result = parseIconGroupManifest("x");
    expect(result.ok).toBe(false);
  });

  it("rejects unsupported schema version", () => {
    const result = parseIconGroupManifest({ ...validManifest, schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "UNSUPPORTED_SCHEMA_VERSION")).toBe(true);
    }
  });

  it("rejects missing author name", () => {
    const bad = { ...validManifest, author: { name: "   " } };
    const result = parseIconGroupManifest(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "MISSING_AUTHOR_NAME")).toBe(true);
    }
  });

  it("rejects traversal in outputPath", () => {
    const bad = {
      ...validManifest,
      entries: [
        {
          ...validManifest.entries[0],
          outputPath: "../escape/arrow.svg",
        },
      ],
    };
    const result = parseIconGroupManifest(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "INVALID_OUTPUT_PATH")).toBe(true);
    }
  });

  it("rejects duplicate entries", () => {
    const bad = {
      ...validManifest,
      entries: [validManifest.entries[0], validManifest.entries[0]],
    };
    const result = parseIconGroupManifest(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "DUPLICATE_ENTRY")).toBe(true);
    }
  });

  it("rejects bad checksum", () => {
    const bad = {
      ...validManifest,
      entries: [{ ...validManifest.entries[0], checksum: "not-hex" }],
    };
    const result = parseIconGroupManifest(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "INVALID_CHECKSUM")).toBe(true);
    }
  });
});
