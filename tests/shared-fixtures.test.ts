import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  sharedFixtureChecksums,
  fixturePath,
  SHARED_FIXTURE_NAMES,
} from "../src/contracts/fixtures";

describe("shared contract fixtures", () => {
  it("provides stable checksums over identical bytes", () => {
    const a = sharedFixtureChecksums();
    const b = sharedFixtureChecksums();
    expect(a).toEqual(b);
  });

  it("covers exactly the shared fixture set", () => {
    expect(SHARED_FIXTURE_NAMES.sort()).toEqual([
      "invalid-manifest.json",
      "valid-catalog.json",
      "valid-partial-manifest.json",
    ]);
  });

  it("each fixture path exists and checksum matches the file", () => {
    const checksums = sharedFixtureChecksums();
    for (const name of SHARED_FIXTURE_NAMES) {
      const bytes = readFileSync(fixturePath(name as never));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(checksums[name]);
    }
  });
});
