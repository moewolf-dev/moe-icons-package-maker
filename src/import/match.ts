import type { ImportCandidate, ImportMatch } from "./types";
import type { CatalogIndex } from "../contracts/types";

/**
 * Exact file-name matching. Only the last `.svg`/`.xml` extension is removed;
 * inner hyphens and case are preserved. Fuzzy/case-fold matching is disabled
 * until D-30 approves it.
 */

/** Remove only the last `.svg`/`.xml` extension; never alter the stem. */
export function normalizeImportFileName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".svg")) return name.slice(0, -4);
  if (lower.endsWith(".xml")) return name.slice(0, -4);
  return name;
}

/**
 * Match candidates whose normalized file name exactly equals a canonical icon
 * id. Results are sorted by input order (stable), then by candidate id.
 */
export function matchCandidatesExactly(
  candidates: readonly ImportCandidate[],
  index: CatalogIndex,
): ImportMatch[] {
  const matches: ImportMatch[] = [];
  for (const candidate of candidates) {
    const id = normalizeImportFileName(candidate.fileName);
    if (index.byId.has(id)) {
      matches.push({ candidateId: candidate.opaqueId, iconId: id, reason: "exact-file-name" });
    }
  }
  return matches.sort(
    (a, b) =>
      a.candidateId.localeCompare(b.candidateId) || a.iconId.localeCompare(b.iconId),
  );
}
