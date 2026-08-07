/**
 * Reference-preview availability. Pure helpers used by the UI: they generate a
 * safe same-origin URL for a canonical icon id and probe whether the local
 * server can serve official reference SVGs. A missing reference source must
 * never block uploads, validation, or builds.
 */

export type ReferencePreviewState = "loading" | "available" | "missing" | "error" | "cancelled";

/** Canonical kebab-case icon id: lowercase letters/digits separated by hyphens. */
const ICON_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Build a same-origin relative URL. Rejects traversal, slashes, and encoded escape. */
export function createReferencePreviewUrl(iconId: string): string {
  if (!ICON_ID_PATTERN.test(iconId)) {
    throw new Error(`invalid icon id for reference preview: "${iconId}"`);
  }
  return `/reference-icons/${iconId}.svg`;
}

function isSameOriginRelative(url: string): boolean {
  if (url.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  try {
    const parsed = new URL(url, "https://moeicons.local");
    return parsed.origin === "https://moeicons.local" && url.startsWith("/");
  } catch {
    return false;
  }
}

export interface FetchLike {
  (input: string, init?: { signal?: AbortSignal }): Promise<Response>;
}

/**
 * Probe whether the server can serve a reference SVG. Returns the availability
 * state; never throws for fetch/network failures (returns "error") so the UI
 * can degrade gracefully. An abort is reported distinctly as "cancelled".
 */
export async function probeReferencePreview(
  url: string,
  fetchImpl: FetchLike,
  signal: AbortSignal | undefined,
): Promise<ReferencePreviewState> {
  if (!isSameOriginRelative(url)) {
    throw new Error(`reference preview URL must be same-origin relative: "${url}"`);
  }
  try {
    const response = await fetchImpl(url, { ...(signal ? { signal } : {}) });
    if (response.ok) return "available";
    if (response.status === 404) return "missing";
    return "error";
  } catch (error) {
    if (signal?.aborted || error instanceof DOMException || (error as { name?: string }).name === "AbortError") {
      return "cancelled";
    }
    return "error";
  }
}
