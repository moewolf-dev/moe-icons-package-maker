import type { BuildResult } from "../../build/materialize";

/**
 * Browser adapters: File/Blob/download only. No filesystem access.
 */

export interface BrowserFileResolver {
  resolve(id: string): File | undefined;
}

/** Resolve opaque browser file IDs to File objects. */
export function createBrowserFileResolver(files: readonly File[]): BrowserFileResolver {
  const map = new Map<string, File>();
  for (const file of files) map.set(file.name, file);
  return {
    resolve(id: string): File | undefined {
      return map.get(id);
    },
  };
}

/** Initiate a download only after a successful build result. */
export function downloadBuildResult(
  result: BuildResult,
  zipBytes: Uint8Array,
  options: { revokeAfter?: number } = {},
): void {
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${result.plan.groupId}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  const revokeAfter = options.revokeAfter ?? 0;
  if (revokeAfter > 0) {
    setTimeout(() => URL.revokeObjectURL(url), revokeAfter);
  } else {
    URL.revokeObjectURL(url);
  }
}

/** Revoke all object URLs for a set of Files (cleanup helper). */
export function revokeFileUrls(files: readonly File[]): void {
  for (const file of files) {
    const url = URL.createObjectURL(file);
    URL.revokeObjectURL(url);
  }
}
