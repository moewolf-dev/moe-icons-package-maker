import { useMemo } from "react";
import type { PreflightReport } from "../../build/preflight";

/**
 * PreflightPanel: "Validate only" produces a typed PreflightReport (no ZIP, no
 * dirty change) and offers a JSON download. Warning confirmation is bound to the
 * report checksum so it invalidates automatically when inputs change.
 */
export function PreflightPanel({
  report,
  warningConfirmed,
  onWarningConfirmedChange,
  onDownloadJson,
  onValidateOnly,
  onBuild,
}: {
  report: PreflightReport | undefined;
  warningConfirmed: boolean;
  onWarningConfirmedChange: (value: boolean) => void;
  onDownloadJson: (report: PreflightReport) => void;
  onValidateOnly: () => void;
  onBuild: () => void;
}) {
  const hasWarnings = (report?.warnings.length ?? 0) > 0;
  const confirmed = hasWarnings ? warningConfirmed : true;
  const canBuild = Boolean(report?.buildAllowed) && confirmed;

  const downloadDisabled = useMemo(() => !report, [report]);

  return (
    <section className="preflight-panel" data-testid="preflight-panel">
      <div className="preflight-actions">
        <button type="button" onClick={onValidateOnly} data-testid="validate-only-button">
          Validate only
        </button>
        <button
          type="button"
          disabled={downloadDisabled}
          onClick={() => report && onDownloadJson(report)}
          data-testid="download-report-button"
        >
          Download JSON report
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!canBuild}
          onClick={onBuild}
          data-testid="build-from-preflight"
        >
          Build group
        </button>
      </div>

      {!report && <p className="preflight-empty">Run Validate only to see a report.</p>}

      {report && (
        <div className="preflight-report" data-testid="preflight-report">
          <dl>
            <div>
              <dt>Selected</dt>
              <dd>{report.counts.selected}</dd>
            </div>
            <div>
              <dt>Filled</dt>
              <dd>{report.counts.filled}</dd>
            </div>
            <div>
              <dt>Missing</dt>
              <dd>{report.counts.missing}</dd>
            </div>
            <div>
              <dt>Errors</dt>
              <dd>{report.counts.errors}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{report.counts.warnings}</dd>
            </div>
            <div>
              <dt>Output files</dt>
              <dd>{report.outputPaths.length}</dd>
            </div>
          </dl>

          {report.errors.length > 0 && (
            <ul className="preflight-errors">
              {report.errors.slice(0, 10).map((e, i) => (
                <li key={i} data-severity="error">
                  {e.code}: {e.message} {e.outputPath ? `(${e.outputPath})` : ""}
                </li>
              ))}
            </ul>
          )}

          {hasWarnings && !warningConfirmed && (
            <label className="warning-confirmation" data-testid="preflight-warning-confirm">
              <input
                type="checkbox"
                checked={warningConfirmed}
                onChange={(e) => onWarningConfirmedChange(e.target.checked)}
              />
              I understand the warnings and want to build anyway.
            </label>
          )}

          <p className="preflight-manifest-preview" data-testid="preflight-manifest-preview">
            <strong>Manifest preview ({report.utf8Bytes} bytes):</strong>
            <pre>{report.manifestPreview}</pre>
          </p>
        </div>
      )}
    </section>
  );
}
