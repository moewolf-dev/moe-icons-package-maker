import { useRef, useState } from "react";

/**
 * BuildReviewPanel derives filters/counters from getMappingProgress-style
 * counts, blocks on errors, requires explicit confirmation for warnings, and
 * calls build exactly once per confirmed build.
 */
export function BuildReviewPanel({
  counts,
  issues,
  buildStatus,
  buildError,
  onBuild,
}: {
  counts: { selected: number; filled: number; missing: number; warnings: number; errors: number };
  issues: readonly { code: string; severity: string; message: string }[];
  buildStatus: "idle" | "building" | "success" | "error";
  buildError: string | undefined;
  onBuild: () => Promise<void>;
}) {
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const buildingRef = useRef(false);
  const hasErrors = counts.errors > 0;
  const hasWarnings = counts.warnings > 0;
  const blocked = hasErrors || (hasWarnings && !warningsConfirmed);

  const buildRequested = async () => {
    if (blocked || buildStatus === "building" || buildingRef.current) return;
    buildingRef.current = true;
    try {
      await onBuild();
    } finally {
      buildingRef.current = false;
    }
  };

  return (
    <section className="build-review-panel" data-testid="build-review-panel">
      <dl>
        <div>
          <dt>Selected</dt>
          <dd data-testid="count-selected">{counts.selected}</dd>
        </div>
        <div>
          <dt>Filled</dt>
          <dd data-testid="count-filled">{counts.filled}</dd>
        </div>
        <div>
          <dt>Missing</dt>
          <dd data-testid="count-missing">{counts.missing}</dd>
        </div>
        <div>
          <dt>Errors</dt>
          <dd data-testid="count-errors">{counts.errors}</dd>
        </div>
        <div>
          <dt>Warnings</dt>
          <dd data-testid="count-warnings">{counts.warnings}</dd>
        </div>
      </dl>

      {issues.length > 0 && (
        <ul className="review-issues">
          {issues.slice(0, 20).map((issue, i) => (
            <li key={`${issue.code}-${i}`} data-severity={issue.severity}>
              {issue.severity} {issue.code}: {issue.message}
            </li>
          ))}
        </ul>
      )}

      {hasErrors && <p className="review-block">Export blocked: validation errors present.</p>}
      {hasWarnings && !warningsConfirmed && (
        <label className="warning-confirmation">
          <input
            type="checkbox"
            checked={warningsConfirmed}
            onChange={(e) => setWarningsConfirmed(e.target.checked)}
          />
          I understand the warnings and want to export anyway.
        </label>
      )}

      {buildStatus === "success" && <p role="status">Build succeeded.</p>}
      {buildStatus === "error" && buildError && <p role="alert">{buildError}</p>}

      <button
        type="button"
        disabled={blocked || buildStatus === "building"}
        onClick={() => void buildRequested()}
        data-testid="build-button"
      >
        {buildStatus === "building" ? "Building..." : "Build group"}
      </button>
    </section>
  );
}
