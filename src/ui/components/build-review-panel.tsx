import { useRef, useState } from "react";

/**
 * BuildReviewPanel derives filters/counters from getMappingProgress-style
 * counts, blocks on errors, requires explicit confirmation for warnings, and
 * calls build exactly once per confirmed build. Supports partial-group
 * acknowledgment, AbortSignal cancellation, and shows the final checksum.
 */
export function BuildReviewPanel({
  counts,
  issues,
  buildStatus,
  buildError,
  buildResult,
  partialAcknowledged,
  onPartialAcknowledgedChange,
  onBuild,
  onCancel,
}: {
  counts: { selected: number; filled: number; missing: number; warnings: number; errors: number };
  issues: readonly { code: string; severity: string; message: string }[];
  buildStatus: "idle" | "building" | "success" | "error" | "cancelled";
  buildError: string | undefined;
  buildResult: { checksum: string; createdAt: string; files: string[] } | undefined;
  partialAcknowledged: boolean;
  onPartialAcknowledgedChange: (value: boolean) => void;
  onBuild: (signal?: AbortSignal) => Promise<void>;
  onCancel: () => void;
}) {
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const buildingRef = useRef(false);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const hasErrors = counts.errors > 0;
  const hasWarnings = counts.warnings > 0;
  const isPartial = counts.missing > 0;
  const blocked =
    hasErrors ||
    (hasWarnings && !warningsConfirmed) ||
    (isPartial && !partialAcknowledged);

  const buildRequested = async () => {
    if (blocked || buildStatus === "building" || buildingRef.current) return;
    buildingRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await onBuild(controller.signal);
    } finally {
      buildingRef.current = false;
      abortRef.current = undefined;
    }
  };

  const cancelRequested = () => {
    abortRef.current?.abort();
    onCancel();
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
      {isPartial && !partialAcknowledged && (
        <label className="partial-confirmation" data-testid="partial-confirmation">
          <input
            type="checkbox"
            checked={partialAcknowledged}
            onChange={(e) => onPartialAcknowledgedChange(e.target.checked)}
          />
          This group is partial ({counts.missing} missing). I acknowledge it exports only the
          filled icons.
        </label>
      )}

      {buildStatus === "success" && buildResult && (
        <div className="build-result" data-testid="build-result">
          <p role="status">Build succeeded.</p>
          <p>
            Checksum: <code data-testid="build-checksum">{buildResult.checksum}</code>
          </p>
          <p>Files: {buildResult.files.length}</p>
        </div>
      )}
      {buildStatus === "error" && buildError && <p role="alert">{buildError}</p>}
      {buildStatus === "cancelled" && <p role="status">Build cancelled.</p>}

      {buildStatus === "building" ? (
        <button type="button" onClick={cancelRequested} data-testid="cancel-button">
          Cancel build
        </button>
      ) : (
        <button
          type="button"
          disabled={blocked}
          onClick={() => void buildRequested()}
          data-testid="build-button"
        >
          Build group
        </button>
      )}
    </section>
  );
}
