import type { MappingState, MappingIssue } from "../mapping/mapping";
import type { ValidationIssue } from "../svg/parse";
import { listMappingIssues } from "../mapping/mapping";

/**
 * Build preflight: a pure, typed report computed from session state BEFORE any
 * materialization. Reuses planBuild's path logic (via the same subgroup/id
 * rules here) so the UI never invents output paths. A `Validate only` action
 * runs this without building or touching dirty state.
 */

export interface PreflightCounts {
  readonly selected: number;
  readonly filled: number;
  readonly missing: number;
  readonly warnings: number;
  readonly errors: number;
}

export interface PreflightIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly iconId?: string;
  readonly outputPath?: string;
}

export interface PreflightReport {
  readonly counts: PreflightCounts;
  readonly errors: readonly PreflightIssue[];
  readonly warnings: readonly PreflightIssue[];
  readonly outputPaths: readonly string[];
  readonly manifestPreview: string;
  readonly utf8Bytes: number;
  readonly buildAllowed: boolean;
  /** Checksum of the inputs used to derive this report (for warning re-confirmation). */
  readonly reportChecksum: string;
}

export type PreflightResult =
  | { readonly ok: true; readonly value: PreflightReport }
  | { readonly ok: false; readonly errors: readonly PreflightIssue[] };

export function runBuildPreflight(input: {
  state: MappingState;
  metadata: {
    groupId: string;
    displayName: string;
    styleId: string;
    author: string;
    email: string;
    source: string;
    license: string;
  };
  validationByIcon: ReadonlyMap<string, readonly ValidationIssue[]>;
  svgBySource: ReadonlyMap<string, { content: string; checksum: string }>;
  fallbackPolicy: "fallback" | "error";
}): PreflightResult {
  const errors: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];
  const outputPaths: string[] = [];

  for (const slot of input.state) {
    const id = slot.icon.id;
    const subgroup = slot.icon.subgroupId;
    const outputPath = `${subgroup}/${id}.svg`;

    if (outputPath.includes("..") || outputPath.startsWith("/")) {
      errors.push({
        code: "UNSAFE_OUTPUT_PATH",
        severity: "error",
        message: `unsafe output path "${outputPath}"`,
        iconId: id,
        outputPath,
      });
      continue;
    }
    outputPaths.push(outputPath);

    const issues = input.validationByIcon.get(id) ?? [];
    for (const issue of issues) {
      if (issue.severity === "error") {
        errors.push({
          code: issue.code,
          severity: "error",
          message: issue.message,
          iconId: id,
          outputPath,
        });
      } else {
        warnings.push({
          code: issue.code,
          severity: "warning",
          message: issue.message,
          iconId: id,
          outputPath,
        });
      }
    }
  }

  // missing icons
  const missing: MappingIssue[] = listMappingIssues(input.state).filter(
    (m) => m.code === "MISSING_ICON",
  );
  for (const m of missing) {
    warnings.push({
      code: m.code,
      severity: "warning",
      message: m.message,
      ...(m.iconId ? { iconId: m.iconId } : {}),
    });
  }

  const counts: PreflightCounts = {
    selected: input.state.length,
    filled: outputPaths.length,
    missing: missing.length,
    warnings: warnings.length,
    errors: errors.length,
  };

  const buildAllowed = errors.length === 0 && (input.fallbackPolicy === "fallback" || warnings.length === 0);

  if (!buildAllowed) {
    return { ok: false, errors };
  }

  // deterministic manifest preview (single trailing newline)
  const entries = [...outputPaths].sort((a, b) => a.localeCompare(b, "en"));
  const manifestPreview =
    JSON.stringify(
      {
        schemaVersion: 1,
        groupId: input.metadata.groupId,
        displayName: input.metadata.displayName,
        styleId: input.metadata.styleId,
        author: input.metadata.author,
        ...(input.metadata.email ? { email: input.metadata.email } : {}),
        ...(input.metadata.source ? { source: input.metadata.source } : {}),
        license: input.metadata.license,
        files: entries.map((p) => ({ path: p })),
      },
      null,
      2,
    ) + "\n";

  const utf8Bytes = new TextEncoder().encode(manifestPreview).byteLength;
  const reportChecksum = [
    counts.selected,
    counts.filled,
    counts.errors,
    counts.warnings,
    entries.join("|"),
    input.metadata.groupId,
  ].join(":");

  return {
    ok: true,
    value: {
      counts,
      errors,
      warnings,
      outputPaths: entries,
      manifestPreview,
      utf8Bytes,
      buildAllowed,
      reportChecksum,
    },
  };
}
