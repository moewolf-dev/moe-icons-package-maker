import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { BuildReviewPanel } from "../../src/ui/components/build-review-panel";

const baseProps = {
  buildResult: undefined as
    | { checksum: string; createdAt: string; files: string[] }
    | undefined,
  partialAcknowledged: false,
  onPartialAcknowledgedChange: vi.fn(),
  onCancel: vi.fn(),
};

describe("BuildReviewPanel", () => {
  it("blocks on errors and shows counters", () => {
    render(
      <BuildReviewPanel
        {...baseProps}
        counts={{ selected: 2, filled: 1, missing: 1, warnings: 0, errors: 1 }}
        issues={[{ code: "EMPTY", severity: "error", message: "empty svg" }]}
        buildStatus="idle"
        buildError={undefined}
        onBuild={async () => undefined}
      />,
    );
    expect(screen.getByTestId("count-selected")).toHaveTextContent("2");
    expect(screen.getByTestId("count-errors")).toHaveTextContent("1");
    const button = screen.getByTestId("build-button");
    expect(button).toBeDisabled();
    expect(screen.getByText(/export blocked/i)).toBeTruthy();
  });

  it("requires explicit warning confirmation", async () => {
    const user = userEvent.setup();
    const onBuild = vi.fn(async () => undefined);
    render(
      <BuildReviewPanel
        {...baseProps}
        counts={{ selected: 1, filled: 1, missing: 0, warnings: 1, errors: 0 }}
        issues={[{ code: "ASPECT", severity: "warning", message: "aspect mismatch" }]}
        buildStatus="idle"
        buildError={undefined}
        onBuild={onBuild}
      />,
    );
    const button = screen.getByTestId("build-button");
    expect(button).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onBuild).toHaveBeenCalledTimes(1);
  });

  it("requires partial-group acknowledgment before export", () => {
    render(
      <BuildReviewPanel
        {...baseProps}
        counts={{ selected: 3, filled: 2, missing: 1, warnings: 0, errors: 0 }}
        issues={[]}
        buildStatus="idle"
        buildError={undefined}
        onBuild={async () => undefined}
      />,
    );
    expect(screen.getByTestId("partial-confirmation")).toBeTruthy();
    expect(screen.getByTestId("build-button")).toBeDisabled();
  });

  it("enables export after partial acknowledgment", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [ack, setAck] = React.useState(false);
      return (
        <BuildReviewPanel
          {...baseProps}
          partialAcknowledged={ack}
          onPartialAcknowledgedChange={setAck}
          counts={{ selected: 3, filled: 2, missing: 1, warnings: 0, errors: 0 }}
          issues={[]}
          buildStatus="idle"
          buildError={undefined}
          onBuild={async () => undefined}
        />
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByTestId("build-button")).toBeEnabled();
  });

  it("calls build exactly once per confirmed build", async () => {
    const user = userEvent.setup();
    let resolveBuild: (() => void) | undefined;
    const onBuild = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBuild = resolve;
        }),
    );
    render(
      <BuildReviewPanel
        {...baseProps}
        counts={{ selected: 1, filled: 1, missing: 0, warnings: 0, errors: 0 }}
        issues={[]}
        buildStatus="idle"
        buildError={undefined}
        onBuild={onBuild}
      />,
    );
    const button = screen.getByTestId("build-button");
    await user.click(button);
    await user.click(button);
    expect(onBuild).toHaveBeenCalledTimes(1);
    resolveBuild?.();
  });

  it("shows a cancel button while building and aborts", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <BuildReviewPanel
        {...baseProps}
        onCancel={onCancel}
        counts={{ selected: 1, filled: 1, missing: 0, warnings: 0, errors: 0 }}
        issues={[]}
        buildStatus="building"
        buildError={undefined}
        onBuild={async () => undefined}
      />,
    );
    const cancel = screen.getByTestId("cancel-button");
    expect(cancel).toBeTruthy();
    await user.click(cancel);
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows the final checksum on success", () => {
    render(
      <BuildReviewPanel
        {...baseProps}
        buildResult={{ checksum: "abc123".repeat(11), createdAt: "2026-08-06", files: ["a.ts"] }}
        counts={{ selected: 1, filled: 1, missing: 0, warnings: 0, errors: 0 }}
        issues={[]}
        buildStatus="success"
        buildError={undefined}
        onBuild={async () => undefined}
      />,
    );
    expect(screen.getByTestId("build-result")).toBeTruthy();
    expect(screen.getByTestId("build-checksum")).toHaveTextContent("abc123");
  });

  it("shows success and error status", () => {
    const { rerender } = render(
      <BuildReviewPanel
        {...baseProps}
        buildResult={{ checksum: "c".repeat(64), createdAt: "2026-08-06", files: ["a.ts"] }}
        counts={{ selected: 1, filled: 1, missing: 0, warnings: 0, errors: 0 }}
        issues={[]}
        buildStatus="success"
        buildError={undefined}
        onBuild={async () => undefined}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Build succeeded.");
    rerender(
      <BuildReviewPanel
        {...baseProps}
        counts={{ selected: 1, filled: 1, missing: 0, warnings: 0, errors: 0 }}
        issues={[]}
        buildStatus="error"
        buildError="boom"
        onBuild={async () => undefined}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
