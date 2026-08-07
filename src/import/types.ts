/**
 * Bulk-import shared types. Import planning is pure: it never writes files,
 * never reads local absolute paths, and never touches the DOM. D-30: fuzzy
 * matching is NOT enabled until approved; only exact file-name matches map.
 */

export interface ImportCandidate {
  /** Opaque browser File id or node temp id. */
  readonly opaqueId: string;
  readonly fileName: string;
  readonly relativePath?: string;
  readonly size: number;
  readonly mimeType: string;
  /** Optional content hash used for duplicate-content detection. */
  readonly contentHash?: string;
}

export interface ImportMatch {
  readonly candidateId: string;
  readonly iconId: string;
  readonly reason: "exact-file-name" | "manual";
}

export type ImportConflictCode =
  | "UNSUPPORTED_FILE"
  | "UNMATCHED_FILE"
  | "DUPLICATE_TARGET"
  | "DUPLICATE_CONTENT"
  | "UNSAFE_PATH"
  | "FILE_TOO_LARGE";

export interface ImportConflict {
  readonly code: ImportConflictCode;
  readonly candidateId: string;
  readonly iconId?: string;
  readonly message: string;
  readonly resolved?: boolean;
}

export interface ImportLimits {
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
  readonly maxEntries: number;
}

export interface ImportPlanEntry {
  readonly candidateId: string;
  readonly iconId: string;
  readonly reason: "exact-file-name" | "manual";
}

export type ImportPlanResult =
  | { readonly ok: true; readonly value: readonly ImportPlanEntry[] }
  | { readonly ok: false; readonly errors: readonly ImportConflict[] };
