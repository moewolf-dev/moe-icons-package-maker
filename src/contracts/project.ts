/**
 * Local project draft contract. Mapping stores blob keys (not object URLs) and
 * raw SVG stays in the blob store; this file defines the types shared by the
 * memory and IndexedDB repositories.
 */

export const MAKER_PROJECT_SCHEMA_VERSION = 1;

/** Stable project identity; `id` is safe for storage keys. */
export interface MakerProjectMetadata {
  readonly id: string;
  readonly name: string;
  readonly schemaVersion: number;
  readonly catalogSchemaVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Group-level metadata captured in the draft. */
export interface MakerProjectGroupMetadata {
  readonly groupId: string;
  readonly displayName: string;
  readonly styleId: string;
  readonly author: string;
  readonly email: string;
  readonly source: string;
  readonly license: string;
}

/** Immutable SVG blob metadata; the Blob itself lives in the store. */
export interface ProjectBlob {
  readonly projectId: string;
  readonly blobId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly sha256: string;
  readonly blob: Blob;
}

/**
 * A project draft. `mapping` maps icon id -> blob key; `blobRefs` is the set of
 * referenced blobs so the store can GC orphans. Never contains object URLs or
 * SVG text.
 */
export interface MakerProjectDraft {
  readonly metadata: MakerProjectMetadata;
  readonly selectedIds: readonly string[];
  readonly groupMetadata: MakerProjectGroupMetadata;
  readonly fallbackPolicy: "fallback" | "error";
  readonly mapping: Readonly<Record<string, string>>;
  readonly blobRefs: readonly { blobId: string; fileName: string; mimeType: string; size: number; sha256: string }[];
}

export type ProjectListEntry = {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
};

export type ProjectErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "SCHEMA_UNSUPPORTED"
  | "QUOTA_EXCEEDED"
  | "STORAGE_UNAVAILABLE"
  | "CORRUPT_RECORD"
  | "BLOCKED_UPGRADE";

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  constructor(code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
    this.code = code;
  }
}

export type ProjectValidationResult =
  | { readonly ok: true; readonly value: MakerProjectDraft }
  | { readonly ok: false; readonly errors: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runtime-validate an untrusted project draft. Rejects unknown schema versions
 * and structurally invalid payloads; returns issues rather than throwing.
 */
export function validateMakerProjectDraft(input: unknown): ProjectValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["project draft must be an object"] };
  }
  const metadata = input.metadata;
  if (!isRecord(metadata)) {
    errors.push("metadata is required");
  } else {
    if (typeof metadata.schemaVersion !== "number") errors.push("metadata.schemaVersion is required");
    else if (metadata.schemaVersion !== MAKER_PROJECT_SCHEMA_VERSION) {
      errors.push(`unsupported schema version ${metadata.schemaVersion}`);
    }
    if (typeof metadata.id !== "string" || metadata.id.length === 0) errors.push("metadata.id is required");
    if (typeof metadata.name !== "string" || metadata.name.length === 0) errors.push("metadata.name is required");
    if (typeof metadata.catalogSchemaVersion !== "number") errors.push("metadata.catalogSchemaVersion is required");
    if (typeof metadata.createdAt !== "string") errors.push("metadata.createdAt is required");
    if (typeof metadata.updatedAt !== "string") errors.push("metadata.updatedAt is required");
  }
  if (!Array.isArray(input.selectedIds)) errors.push("selectedIds must be an array");
  if (!isRecord(input.groupMetadata)) errors.push("groupMetadata is required");
  if (input.fallbackPolicy !== "fallback" && input.fallbackPolicy !== "error") {
    errors.push("fallbackPolicy must be fallback or error");
  }
  if (!isRecord(input.mapping)) errors.push("mapping must be an object");
  if (!Array.isArray(input.blobRefs)) errors.push("blobRefs must be an array");

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: input as unknown as MakerProjectDraft };
}

/** Repository abstraction shared by the memory and IndexedDB implementations. */
export interface ProjectRepository {
  list(): Promise<readonly ProjectListEntry[]>;
  get(id: string): Promise<MakerProjectDraft>;
  create(draft: MakerProjectDraft): Promise<void>;
  save(draft: MakerProjectDraft): Promise<void>;
  delete(id: string): Promise<void>;
  duplicate(id: string, newName: string): Promise<MakerProjectDraft>;
  getBlob(projectId: string, blobId: string): Promise<ProjectBlob>;
  putBlob(blob: ProjectBlob): Promise<void>;
  deleteBlob(projectId: string, blobId: string): Promise<void>;
  /** Total bytes used by blob store across projects. */
  getUsage(): Promise<{ blobBytes: number; projectCount: number }>;
}
