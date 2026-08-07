import type {
  ImportCandidate,
  ImportConflict,
  ImportMatch,
  ImportPlanEntry,
  ImportPlanResult,
} from "./types";
import type { CatalogIndex } from "../contracts/types";

/**
 * Conflict detection and manual resolution. Never selects "last one wins";
 * duplicate targets and duplicate content are surfaced for a human decision.
 */

const SUPPORTED_EXTENSIONS = [".svg", ".xml"];

export function detectImportConflicts(
  candidates: readonly ImportCandidate[],
  matches: readonly ImportMatch[],
  contentHash?: (candidateId: string) => string | undefined,
  limits?: { maxFileBytes?: number; maxTotalBytes?: number; maxEntries?: number },
): ImportConflict[] {
  const conflicts: ImportConflict[] = [];
  const matchByCandidate = new Map(matches.map((m) => [m.candidateId, m.iconId]));

  // 1. unsupported file type / size
  let totalBytes = 0;
  for (const candidate of candidates) {
    const ext = candidate.fileName.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.some((s) => ext.endsWith(s))) {
      conflicts.push({
        code: "UNSUPPORTED_FILE",
        candidateId: candidate.opaqueId,
        message: `"${candidate.fileName}" is not an .svg/.xml file`,
      });
    }
    if (limits?.maxFileBytes !== undefined && candidate.size > limits.maxFileBytes) {
      conflicts.push({
        code: "FILE_TOO_LARGE",
        candidateId: candidate.opaqueId,
        message: `"${candidate.fileName}" exceeds the ${limits.maxFileBytes}-byte per-file limit`,
      });
    }
    totalBytes += candidate.size;
  }
  if (limits?.maxTotalBytes !== undefined && totalBytes > limits.maxTotalBytes) {
    conflicts.push({
      code: "FILE_TOO_LARGE",
      candidateId: "",
      message: `total import size ${totalBytes} exceeds the ${limits.maxTotalBytes}-byte limit`,
    });
  }
  if (limits?.maxEntries !== undefined && candidates.length > limits.maxEntries) {
    conflicts.push({
      code: "FILE_TOO_LARGE",
      candidateId: "",
      message: `import contains ${candidates.length} entries, exceeding the ${limits.maxEntries} limit`,
    });
  }

  // 2. unsafe relative paths
  for (const candidate of candidates) {
    const rel = (candidate.relativePath ?? candidate.fileName).replace(/\\/g, "/");
    if (
      rel.startsWith("/") ||
      rel.split("/").includes("..") ||
      rel.includes("\0") ||
      /^[a-z]:/i.test(rel)
    ) {
      conflicts.push({
        code: "UNSAFE_PATH",
        candidateId: candidate.opaqueId,
        message: `unsafe path "${rel}"`,
      });
    }
  }

  // 3. unmatched files
  for (const candidate of candidates) {
    if (!matchByCandidate.has(candidate.opaqueId)) {
      conflicts.push({
        code: "UNMATCHED_FILE",
        candidateId: candidate.opaqueId,
        message: `"${candidate.fileName}" does not exactly match any canonical icon id`,
      });
    }
  }

  // 4. duplicate targets
  const targetCount = new Map<string, number>();
  for (const m of matches) {
    targetCount.set(m.iconId, (targetCount.get(m.iconId) ?? 0) + 1);
  }
  for (const m of matches) {
    if ((targetCount.get(m.iconId) ?? 0) > 1) {
      conflicts.push({
        code: "DUPLICATE_TARGET",
        candidateId: m.candidateId,
        iconId: m.iconId,
        message: `multiple sources target "${m.iconId}"`,
      });
    }
  }

  // 5. duplicate content (same hash under different names)
  if (contentHash) {
    const hashCount = new Map<string, number>();
    for (const candidate of candidates) {
      const hash = contentHash(candidate.opaqueId);
      if (hash) hashCount.set(hash, (hashCount.get(hash) ?? 0) + 1);
    }
    for (const candidate of candidates) {
      const hash = contentHash(candidate.opaqueId);
      if (hash && (hashCount.get(hash) ?? 0) > 1) {
        conflicts.push({
          code: "DUPLICATE_CONTENT",
          candidateId: candidate.opaqueId,
          message: `"${candidate.fileName}" has the same content as another imported file`,
        });
      }
    }
  }

  return conflicts;
}

export interface ResolutionResult {
  readonly conflicts: readonly ImportConflict[];
  readonly matches: readonly ImportMatch[];
}

/**
 * Apply manual decisions ({candidateId -> iconId}). A decision to an unknown
 * icon id is rejected; conflicts without a decision stay unresolved (marked
 * `resolved: false`).
 */
export function applyManualResolution(
  conflicts: readonly ImportConflict[],
  decisions: Readonly<Record<string, string>>,
  index?: CatalogIndex,
): ResolutionResult {
  const next = conflicts.map((conflict) => {
    const decision = decisions[conflict.candidateId];
    if (decision !== undefined && index?.byId.has(decision)) {
      return { ...conflict, resolved: true };
    }
    // a candidate-level decision that is missing or invalid keeps the conflict
    if (decision !== undefined || conflict.candidateId.length > 0) {
      return { ...conflict, resolved: false };
    }
    return conflict;
  });

  const manualMatches: ImportMatch[] = [];
  for (const [candidateId, iconId] of Object.entries(decisions)) {
    if (index?.byId.has(iconId)) {
      manualMatches.push({ candidateId, iconId, reason: "manual" });
    }
  }

  return { conflicts: next, matches: manualMatches };
}

/**
 * Build a runnable import plan from candidates, exact matches, and manual
 * matches, gated on the supplied conflicts. Returns errors when any error
 * conflict remains unresolved; otherwise returns a stable, ordered list of
 * (candidate -> icon) assignments.
 */
export function createImportPlan(
  candidates: readonly ImportCandidate[],
  matches: readonly ImportMatch[],
  conflicts: readonly ImportConflict[],
  index: CatalogIndex,
): ImportPlanResult {
  const errorConflicts = conflicts.filter(
    (c) => c.resolved !== true && c.code !== "UNMATCHED_FILE",
  );
  if (errorConflicts.length > 0) {
    return { ok: false, errors: errorConflicts };
  }

  const byCandidate = new Map<string, string>();
  for (const m of [...matches].sort((a, b) => a.candidateId.localeCompare(b.candidateId))) {
    const prior = byCandidate.get(m.candidateId);
    if (prior === undefined) byCandidate.set(m.candidateId, m.iconId);
    // keep the first; duplicates already surfaced as conflicts
  }

  const entries: ImportPlanEntry[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.opaqueId.localeCompare(b.opaqueId))) {
    const iconId = byCandidate.get(candidate.opaqueId);
    if (iconId !== undefined && index.byId.has(iconId)) {
      entries.push({ candidateId: candidate.opaqueId, iconId, reason: "exact-file-name" });
    }
  }
  return { ok: true, value: entries };
}
