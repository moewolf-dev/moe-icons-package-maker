import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC_DIR, "..", "..");

const FIXTURES = {
  "valid-catalog.json": join(ROOT, "tests", "fixtures", "schemas", "valid-catalog.json"),
  "valid-partial-manifest.json": join(ROOT, "tests", "fixtures", "schemas", "valid-partial-manifest.json"),
  "invalid-manifest.json": join(ROOT, "tests", "fixtures", "schemas", "invalid-manifest.json"),
};

/**
 * The shared contract fixture manifest. Every consumer (package-maker, CLI,
 * code-library, website, worker) must validate the SAME fixture bytes; the
 * checksum pins that bytes are identical across repositories.
 */
export function sharedFixtureChecksums(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, path] of Object.entries(FIXTURES)) {
    out[name] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return out;
}

export function fixturePath(name: keyof typeof FIXTURES): string {
  return FIXTURES[name];
}

export const SHARED_FIXTURE_NAMES = Object.keys(FIXTURES);
