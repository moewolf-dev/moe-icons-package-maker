import { parseIconCatalog } from "../catalog/catalog";
import { readSvgInput, parseSvg } from "../svg/parse";
import { validateSvgStructure, validateSvgGeometry } from "../svg/validate";
import { createMappingState, assignSvg } from "../mapping/mapping";
import { planBuild, type BuildPolicy } from "./plan";
import { materializeBuild, type BuildWriter, type MaterializeOptions } from "./materialize";
import { createDeterministicZip } from "./zip";
import type { IconCatalog } from "../contracts/types";
import type { ValidationIssue } from "../svg/parse";

/**
 * End-to-end build orchestration. Pure: no UI or filesystem globals; accepts
 * injectable deps for progress and abort.
 */

export interface BuildRequest {
  readonly catalog: unknown;
  readonly selectedIds: readonly string[];
  /** source name -> bytes */
  readonly sources: Readonly<Record<string, Uint8Array | ArrayBuffer | string>>;
  readonly groupId: string;
  readonly displayName: string;
  readonly styleId: string;
  readonly author: MaterializeOptions["author"];
  readonly policy?: BuildPolicy;
  readonly limits?: { maxBytes: number };
}

export interface BuildDiagnostics {
  readonly stage: string;
  readonly issues: readonly ValidationIssue[];
  readonly progress: { selected: number; filled: number; missing: number };
}

export type BuildOutcome =
  | { readonly ok: true; readonly zip: Uint8Array; readonly files: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface BuildDeps {
  readonly onProgress?: (stage: string, percent: number) => void;
  readonly signal?: AbortSignal;
}

function abortIf(deps: BuildDeps, stage: string): void {
  if (deps.signal?.aborted) {
    const error = new Error(`build aborted during ${stage}`);
    error.name = "AbortError";
    throw error;
  }
}

/**
 * Orchestrate parse → metadata → mapping → validation → plan → materialize →
 * deterministic ZIP. Never contains UI/filesystem globals.
 */
export async function buildIconGroup(
  request: BuildRequest,
  deps: BuildDeps = {},
): Promise<BuildOutcome> {
  const progress = deps.onProgress ?? (() => undefined);
  try {
    abortIf(deps, "catalog");
    progress("catalog", 0);

    const parsedCatalog = parseIconCatalog(request.catalog);
    if (!parsedCatalog.ok) {
      return { ok: false, errors: parsedCatalog.errors.map((e) => e.message) };
    }
    const catalog: IconCatalog = parsedCatalog.value;

    abortIf(deps, "metadata");
    progress("metadata", 0.1);
    const mapping = createMappingState(catalog, request.selectedIds);
    if (!mapping.ok) {
      return { ok: false, errors: mapping.errors.map((e) => e.message) };
    }
    let state = mapping.value;

    abortIf(deps, "ingestion");
    progress("ingestion", 0.25);
    const svgBySource = new Map<string, { content: string; checksum: string }>();
    const validationIssues: ValidationIssue[] = [];
    const limitBytes = request.limits?.maxBytes ?? 2 * 1024 * 1024;

    for (const [name, bytes] of Object.entries(request.sources)) {
      abortIf(deps, `ingestion:${name}`);
      const read = await readSvgInput(bytes, {
        maxBytes: limitBytes,
        allowedMimeTypes: [],
        allowedExtensions: [],
      }, { name });
      if (!read.ok) {
        validationIssues.push(...read.errors);
        continue;
      }
      const parsed = parseSvg(read.value);
      if (!parsed.ok) {
        validationIssues.push(...parsed.errors);
        continue;
      }
      const structureIssues = validateSvgStructure(parsed.value);
      const geometryIssues = validateSvgGeometry(parsed.value);
      validationIssues.push(...structureIssues, ...geometryIssues);
      if (structureIssues.some((i) => i.severity === "error")) {
        continue;
      }
      const assign = assignSvg(state, name, read.value);
      // map by icon id: request.sources keyed by canonical id
      const slot = state.find((s) => s.icon.id === name);
      if (slot) {
        state = assign.ok ? assign.value : state;
      }
      const checksum = await sha256(read.value.text);
      svgBySource.set(name, { content: read.value.text, checksum });
    }

    abortIf(deps, "validation");
    progress("validation", 0.6);

    const plan = planBuild(
      {
        groupId: request.groupId,
        displayName: request.displayName,
        styleId: request.styleId,
        state,
        svgBySource,
        validationIssues,
        createdAt: "2026-08-06T00:00:00.000Z",
      },
      request.policy,
    );
    if (!plan.ok) {
      return { ok: false, errors: plan.errors.map((e) => e.message) };
    }

    abortIf(deps, "materialize");
    progress("materialize", 0.8);

    const staging: Record<string, string> = {};
    const writer: BuildWriter = {
      writeFile: (rel, content) => {
        staging[rel] = typeof content === "string" ? content : new TextDecoder().decode(content);
        return Promise.resolve();
      },
      commit: () => Promise.resolve(),
      rollback: () => Promise.resolve(),
    };
    const materialized = await materializeBuild(plan.value, writer, {
      createdWith: "moe-icons-package-maker@0.1.0",
      author: request.author,
    });

    abortIf(deps, "zip");
    progress("zip", 0.95);
    const zip = createDeterministicZip(
      Object.entries(materialized.files).map(([path, content]) => ({ path, content })),
    );
    if (!zip.ok) {
      return { ok: false, errors: zip.errors };
    }

    progress("done", 1);
    return { ok: true, zip: zip.value, files: materialized.files };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, errors: [error.message] };
    }
    throw error;
  }
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
