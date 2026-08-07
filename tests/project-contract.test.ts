import { describe, it, expect } from "vitest";
import { validateMakerProjectDraft, MAKER_PROJECT_SCHEMA_VERSION } from "../src/contracts/project";
import type { MakerProjectDraft } from "../src/contracts/project";

const VALID: MakerProjectDraft = {
  metadata: {
    id: "proj-1",
    name: "Test",
    schemaVersion: MAKER_PROJECT_SCHEMA_VERSION,
    catalogSchemaVersion: 1,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
  },
  selectedIds: ["arrow-chevron-right"],
  groupMetadata: { groupId: "g", displayName: "G", styleId: "outline", author: "", email: "", source: "", license: "MIT" },
  fallbackPolicy: "fallback",
  mapping: { "arrow-chevron-right": "blob-1" },
  blobRefs: [{ blobId: "blob-1", fileName: "a.svg", mimeType: "image/svg+xml", size: 10, sha256: "a".repeat(64) }],
};

describe("validateMakerProjectDraft", () => {
  it("accepts a valid draft", () => {
    const result = validateMakerProjectDraft(VALID);
    expect(result.ok).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(validateMakerProjectDraft(null).ok).toBe(false);
    expect(validateMakerProjectDraft([]).ok).toBe(false);
    expect(validateMakerProjectDraft("x").ok).toBe(false);
  });

  it("rejects unsupported schema version", () => {
    const bad = {
      ...VALID,
      metadata: { ...VALID.metadata, schemaVersion: 99 },
    };
    const result = validateMakerProjectDraft(bad);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.some((e) => e.includes("schema version"))).toBe(true);
  });

  it("rejects missing required metadata fields", () => {
    const { id: _ignored, ...metadataWithoutId } = VALID.metadata;
    void _ignored;
    const bad = { ...VALID, metadata: metadataWithoutId };
    const result = validateMakerProjectDraft(bad);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.some((e) => e.includes("metadata.id"))).toBe(true);
  });

  it("rejects an invalid fallback policy", () => {
    const bad = { ...VALID, fallbackPolicy: "explode" as never };
    const result = validateMakerProjectDraft(bad);
    expect(result.ok).toBe(false);
  });

  it("rejects non-array selectedIds and blobRefs", () => {
    const bad = { ...VALID, selectedIds: "not-an-array" as never };
    expect(validateMakerProjectDraft(bad).ok).toBe(false);
    const bad2 = { ...VALID, blobRefs: "nope" as never };
    expect(validateMakerProjectDraft(bad2).ok).toBe(false);
  });
});
