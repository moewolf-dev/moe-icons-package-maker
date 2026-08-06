import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIconCatalog } from "../src/catalog/catalog";
import { parseIconGroupManifest } from "../src/contracts/manifest";

const FIX = join(__dirname, "fixtures", "schemas");

describe("schema fixtures", () => {
  it("valid-catalog.json parses and passes reconcile expectations", () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(FIX, "valid-catalog.json"), "utf8"),
    );
    const result = parseIconCatalog(raw);
    expect(result.ok).toBe(true);
  });

  it("valid-partial-manifest.json parses (partial groups allowed)", () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(FIX, "valid-partial-manifest.json"), "utf8"),
    );
    const result = parseIconGroupManifest(raw);
    expect(result.ok).toBe(true);
  });

  it("invalid-manifest.json is rejected (traversal + bad checksum)", () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(FIX, "invalid-manifest.json"), "utf8"),
    );
    const result = parseIconGroupManifest(raw);
    expect(result.ok).toBe(false);
  });
});
