import type { ImportCandidate } from "./types";

/**
 * Discover import candidates from browser files or a decoded ZIP. Paths are
 * normalized to POSIX; absolute paths, `..`, NUL, and backslash escapes are
 * rejected. Size and entry-count limits are enforced by the caller via limits.
 */

export interface DiscoverResult {
  readonly candidates: readonly ImportCandidate[];
  readonly errors: readonly string[];
}

function isUnsafePath(rel: string): boolean {
  const posix = rel.replace(/\\/g, "/");
  return (
    posix.startsWith("/") ||
    posix.split("/").includes("..") ||
    posix.includes("\0") ||
    /^[a-z]:/i.test(posix)
  );
}

export function toSafePosixPath(rel: string): string {
  const posix = rel.replace(/\\/g, "/");
  if (isUnsafePath(posix)) throw new Error(`unsafe import path: "${rel}"`);
  return posix.replace(/^\.\//, "");
}

/**
 * Build candidates from an ordered list of (fileName, relativePath, size,
 * mimeType) descriptors, assigning opaque ids. Enforces entry/size limits.
 */
export function discoverCandidates(
  files: readonly {
    fileName: string;
    relativePath?: string;
    size: number;
    mimeType: string;
  }[],
  limits: { maxEntries: number; maxTotalBytes: number },
): DiscoverResult {
  const candidates: ImportCandidate[] = [];
  const errors: string[] = [];
  let total = 0;

  for (let i = 0; i < files.length; i += 1) {
    if (candidates.length + errors.length >= limits.maxEntries) {
      errors.push(`too many entries (limit ${limits.maxEntries})`);
      break;
    }
    const file = files[i];
    if (!file) {
      errors.push(`entry ${i}: missing file descriptor`);
      continue;
    }
    if (!file.fileName || file.fileName.length === 0) {
      errors.push(`entry ${i}: empty file name`);
      continue;
    }
    const rel = file.relativePath ?? file.fileName;
    if (isUnsafePath(rel)) {
      errors.push(`entry ${i}: unsafe path "${rel}"`);
      continue;
    }
    total += file.size;
    if (total > limits.maxTotalBytes) {
      errors.push(`total import size exceeds ${limits.maxTotalBytes} bytes`);
      break;
    }
    candidates.push({
      opaqueId: `candidate-${i}`,
      fileName: file.fileName,
      relativePath: toSafePosixPath(rel),
      size: file.size,
      mimeType: file.mimeType,
    });
  }

  return { candidates, errors };
}
