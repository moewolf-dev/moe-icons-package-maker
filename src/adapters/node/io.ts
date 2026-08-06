import { mkdirSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { realpathSync } from "node:fs";
import type { BuildWriter } from "../../build/materialize";

/**
 * Node adapters: filesystem output only. Resolve real paths under an explicit
 * root, reject symlink/path escape, stage then rename.
 */

export interface NodeFileResolver {
  resolve(relativePath: string): string | undefined;
}

/** Resolve real paths under an explicit root, rejecting traversal/escape. */
export function createNodeFileResolver(root: string): NodeFileResolver {
  const resolvedRoot = realpathSync(resolve(root));
  return {
    resolve(relativePath: string): string | undefined {
      const cleaned = relativePath.replace(/\\/g, "/");
      if (cleaned.startsWith("/") || cleaned.split("/").includes("..")) {
        return undefined;
      }
      const full = resolve(resolvedRoot, cleaned);
      if (!full.startsWith(resolvedRoot)) return undefined;
      return full;
    },
  };
}

/**
 * Write build output to a directory: stage sibling, then atomic rename.
 * On failure the original tree is preserved.
 */
export async function writeBuildToDirectory(
  root: string,
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<void> {
  const resolvedRoot = resolve(root);
  const staging = `${resolvedRoot}.staging`;
  if (existsSync(staging)) {
    // remove stale staging from a previous failed run
    const { rmSync } = await import("node:fs");
    rmSync(staging, { recursive: true, force: true });
  }
  mkdirSync(staging, { recursive: true });

  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b, "en"));
  try {
    for (const [rel, content] of entries) {
      const resolver = createNodeFileResolver(staging);
      const full = resolver.resolve(rel);
      if (!full) {
        throw new Error(`unsafe output path "${rel}"`);
      }
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content);
    }
    // atomic swap: remove existing output then rename staging into place
    if (existsSync(resolvedRoot)) {
      const { rmSync } = await import("node:fs");
      const backup = `${resolvedRoot}.old`;
      if (existsSync(backup)) rmSync(backup, { recursive: true, force: true });
      renameSync(resolvedRoot, backup);
      renameSync(staging, resolvedRoot);
      rmSync(backup, { recursive: true, force: true });
    } else {
      renameSync(staging, resolvedRoot);
    }
  } catch (error) {
    const { rmSync } = await import("node:fs");
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}
