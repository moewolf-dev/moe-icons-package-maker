import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreflightPanel } from "../../src/ui/components/preflight-panel";
import type { PreflightReport } from "../../src/build/preflight";

const REPORT: PreflightReport = {
  counts: { selected: 2, filled: 1, missing: 1, warnings: 1, errors: 0 },
  errors: [],
  warnings: [{ code: "MISSING_ICON", severity: "warning", message: "missing b" }],
  outputPaths: ["arrow/arrow-chevron-right.svg"],
  manifestPreview: '{\n  "groupId": "my-group"\n}\n',
  utf8Bytes: 42,
  buildAllowed: true,
  reportChecksum: "c:1",
};

describe("PreflightPanel", () => {
  it("shows an empty state before validating", () => {
    render(
      <PreflightPanel
        report={undefined}
        warningConfirmed={false}
        onWarningConfirmedChange={vi.fn()}
        onDownloadJson={vi.fn()}
        onValidateOnly={vi.fn()}
        onBuild={vi.fn()}
      />,
    );
    expect(screen.getByText("Run Validate only to see a report.")).toBeTruthy();
    expect((screen.getByTestId("download-report-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Validate only triggers the callback", () => {
    const onValidateOnly = vi.fn();
    render(
      <PreflightPanel
        report={undefined}
        warningConfirmed={false}
        onWarningConfirmedChange={vi.fn()}
        onDownloadJson={vi.fn()}
        onValidateOnly={onValidateOnly}
        onBuild={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("validate-only-button"));
    expect(onValidateOnly).toHaveBeenCalled();
  });

  it("download is enabled once a report exists", () => {
    const onDownloadJson = vi.fn();
    render(
      <PreflightPanel
        report={REPORT}
        warningConfirmed={true}
        onWarningConfirmedChange={vi.fn()}
        onDownloadJson={onDownloadJson}
        onValidateOnly={vi.fn()}
        onBuild={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("download-report-button"));
    expect(onDownloadJson).toHaveBeenCalledWith(REPORT);
  });

  it("warnings gate the build button until confirmed", () => {
    const { rerender } = render(
      <PreflightPanel
        report={REPORT}
        warningConfirmed={false}
        onWarningConfirmedChange={vi.fn()}
        onDownloadJson={vi.fn()}
        onValidateOnly={vi.fn()}
        onBuild={vi.fn()}
      />,
    );
    // warning present and unconfirmed -> build disabled
    expect((screen.getByTestId("build-from-preflight") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("preflight-warning-confirm")).toBeTruthy();

    rerender(
      <PreflightPanel
        report={REPORT}
        warningConfirmed={true}
        onWarningConfirmedChange={vi.fn()}
        onDownloadJson={vi.fn()}
        onValidateOnly={vi.fn()}
        onBuild={vi.fn()}
      />,
    );
    expect((screen.getByTestId("build-from-preflight") as HTMLButtonElement).disabled).toBe(false);
  });

  it("build button calls onBuild when allowed", () => {
    const onBuild = vi.fn();
    render(
      <PreflightPanel
        report={REPORT}
        warningConfirmed={true}
        onWarningConfirmedChange={vi.fn()}
        onDownloadJson={vi.fn()}
        onValidateOnly={vi.fn()}
        onBuild={onBuild}
      />,
    );
    fireEvent.click(screen.getByTestId("build-from-preflight"));
    expect(onBuild).toHaveBeenCalled();
  });

  it("shows the manifest preview and byte size", () => {
    render(
      <PreflightPanel
        report={REPORT}
        warningConfirmed={true}
        onWarningConfirmedChange={vi.fn()}
        onDownloadJson={vi.fn()}
        onValidateOnly={vi.fn()}
        onBuild={vi.fn()}
      />,
    );
    expect(screen.getByText(/Manifest preview \(42 bytes\)/)).toBeTruthy();
    expect(screen.getByTestId("preflight-manifest-preview").textContent).toContain("my-group");
  });
});
