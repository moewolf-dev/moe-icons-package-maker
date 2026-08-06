import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuildReviewPanel } from "../../src/ui/components/build-review-panel";

describe("BuildReviewPanel", () => {
  it("blocks on errors and shows counters", () => {
    render(
      <BuildReviewPanel
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
    // first build is still in flight; second click must be ignored
    expect(onBuild).toHaveBeenCalledTimes(1);
    resolveBuild?.();
  });

  it("disables while building", () => {
    render(
      <BuildReviewPanel
        counts={{ selected: 1, filled: 1, missing: 0, warnings: 0, errors: 0 }}
        issues={[]}
        buildStatus="building"
        buildError={undefined}
        onBuild={async () => undefined}
      />,
    );
    expect(screen.getByTestId("build-button")).toBeDisabled();
  });

  it("shows success and error status", () => {
    const { rerender } = render(
      <BuildReviewPanel
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
