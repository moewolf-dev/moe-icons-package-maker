export type { ImportCandidate, ImportMatch, ImportConflict, ImportLimits, ImportPlanEntry, ImportConflictCode } from "./types";
export { normalizeImportFileName, matchCandidatesExactly } from "./match";
export { discoverCandidates, toSafePosixPath } from "./discover";
export {
  detectImportConflicts,
  applyManualResolution,
  createImportPlan,
} from "./conflicts";
