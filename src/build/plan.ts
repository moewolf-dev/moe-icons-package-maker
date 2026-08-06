import type { MappingState } from "../mapping/mapping";
import type { ValidationIssue } from "../svg/parse";
import type { IconGroupManifest, ValidationSummary } from "../contracts/manifest";

/**
 * Deterministic normalized output planning and materialization.
 * Fixed ordering and timestamps make identical inputs byte-identical.
 */

export interface BuildPlanEntry {
  /** Canonical output path within the group, e.g. `arrow/arrow-chevron-right.svg`. */
  readonly outputPath: string;
  /** Opaque source reference (file name / browser id) resolved by the writer. */
  readonly source: string;
  /** SHA-256 of the source bytes, hex (must be provided by the caller after reading). */
  readonly checksum: string;
  /** Normalized SVG content (the caller normalizes before planning). */
  readonly svgContent: string;
}

export interface BuildPlan {
  readonly groupId: string;
  readonly displayName: string;
  readonly styleId: string;
  readonly entries: readonly BuildPlanEntry[];
  readonly validation: ValidationSummary;
  readonly createdAt: string;
}

export interface BuildIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly outputPath?: string;
}

export type PlanResult =
  | { readonly ok: true; readonly value: BuildPlan }
  | { readonly ok: false; readonly errors: BuildIssue[] };

export interface BuildPolicy {
  /** Treat validation errors as fatal. */
  readonly requireZeroErrors: boolean;
  /** Allow warnings to proceed; false requires zero warnings too. */
  readonly allowWarnings: boolean;
}

const DEFAULT_POLICY: BuildPolicy = {
  requireZeroErrors: true,
  allowWarnings: true,
};

export function planBuild(
  input: {
    groupId: string;
    displayName: string;
    styleId: string;
    state: MappingState;
    svgBySource: ReadonlyMap<string, { content: string; checksum: string }>;
    validationIssues: readonly ValidationIssue[];
    createdAt?: string;
  },
  policy: BuildPolicy = DEFAULT_POLICY,
): PlanResult {
  const errors: BuildIssue[] = [];
  const warnings: BuildIssue[] = [];
  const entries: BuildPlanEntry[] = [];
  const seenPaths = new Set<string>();

  for (const slot of input.state) {
    const source = slot.assignedSource;
    if (source === undefined) continue;
    const svg = input.svgBySource.get(source);
    if (!svg) {
      errors.push({
        code: "MISSING_SOURCE_CONTENT",
        severity: "error",
        message: `source "${source}" for "${slot.icon.id}" has no content`,
      });
      continue;
    }

    const outputPath = `${slot.icon.subgroupId}/${slot.icon.id}.svg`;
    if (seenPaths.has(outputPath)) {
      errors.push({
        code: "DUPLICATE_OUTPUT_PATH",
        severity: "error",
        message: `duplicate output path "${outputPath}"`,
        outputPath,
      });
      continue;
    }
    seenPaths.add(outputPath);

    if (outputPath.includes("..") || outputPath.startsWith("/")) {
      errors.push({
        code: "UNSAFE_OUTPUT_PATH",
        severity: "error",
        message: `unsafe output path "${outputPath}"`,
        outputPath,
      });
      continue;
    }

    entries.push({
      outputPath,
      source,
      checksum: svg.checksum,
      svgContent: svg.content,
    });
  }

  entries.sort((a, b) => a.outputPath.localeCompare(b.outputPath, "en"));

  for (const issue of input.validationIssues) {
    if (issue.severity === "error") {
      errors.push({ code: issue.code, severity: "error", message: issue.message });
    } else if (issue.severity === "warning") {
      warnings.push({ code: issue.code, severity: "warning", message: issue.message });
    }
  }

  const state = input.state;
  const filled = entries.length;
  const validation: ValidationSummary = {
    selected: state.length,
    filled,
    valid: filled - errors.length,
    warnings: warnings.length,
    errors: errors.length,
    missing: state.length - filled,
  };

  const fatalErrors =
    errors.length > 0 ||
    (input.validationIssues.some((i) => i.severity === "error") &&
      policy.requireZeroErrors);
  const fatalWarnings =
    !policy.allowWarnings &&
    input.validationIssues.some((i) => i.severity === "warning");

  if (fatalErrors || fatalWarnings) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      groupId: input.groupId,
      displayName: input.displayName,
      styleId: input.styleId,
      entries,
      validation,
      createdAt: input.createdAt ?? new Date(0).toISOString(),
    },
  };
}
