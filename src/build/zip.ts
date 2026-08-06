import { zipSync, strToU8 } from "fflate";

/**
 * Deterministic ZIP creation. Fixed entry order, timestamps, permissions,
 * compression settings, and UTF-8 names make identical inputs produce
 * byte-identical output. Rejects duplicate/absolute/parent paths.
 */

export interface ZipEntry {
  /** Relative POSIX path inside the archive. */
  readonly path: string;
  readonly content: string | Uint8Array;
}

export type ZipResult =
  | { readonly ok: true; readonly value: Uint8Array }
  | { readonly ok: false; readonly errors: string[] };

const FIXED_DATE = new Date("2020-01-01T00:00:00.000Z");

export function createDeterministicZip(entries: readonly ZipEntry[]): ZipResult {
  const errors: string[] = [];
  const seen = new Set<string>();

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path, "en"));

  const files: Record<string, Uint8Array> = {};
  for (const entry of sorted) {
    const path = entry.path.replace(/\\/g, "/");
    if (path.startsWith("/") || path.includes("..")) {
      errors.push(`unsafe path "${path}"`);
      continue;
    }
    if (seen.has(path)) {
      errors.push(`duplicate path "${path}"`);
      continue;
    }
    seen.add(path);
    files[path] =
      typeof entry.content === "string" ? strToU8(entry.content) : entry.content;
  }

  if (errors.length > 0) return { ok: false, errors };

  const data = zipSync(files, {
    level: 9,
    mtime: FIXED_DATE,
    // deterministic: fix mtime on every entry
  });

  return { ok: true, value: data };
}
