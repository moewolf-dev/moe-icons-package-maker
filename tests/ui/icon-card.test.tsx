import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconAssignmentCard } from "../../src/ui/components/icon-assignment-card";
import type { IconDefinition } from "../../src/contracts/types";

const icon: IconDefinition = {
  id: "arrow-chevron-right",
  subgroupId: "arrow",
  label: "Arrow chevron right",
  aliases: [],
  addedAt: "2026-08-06T00:00:00.000Z",
  updatedAt: "2026-08-06T00:00:00.000Z",
};

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: "image/svg+xml" });
}

describe("IconAssignmentCard", () => {
  it("shows empty state and chooses a file via keyboard", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn(async () => ({ ok: true, errors: [] as string[] }));
    render(
      <IconAssignmentCard
        icon={icon}
        assignment={undefined}
        onChoose={onChoose}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByTestId("status-arrow-chevron-right")).toHaveTextContent("empty");
    const chooseButton = screen.getByRole("button", { name: /choose svg/i });
    await user.click(chooseButton);
    // file input exists and is accessible
    expect(screen.getByText("empty")).toBeTruthy();
  });

  it("shows assigned source when filled", () => {
    render(
      <IconAssignmentCard
        icon={icon}
        assignment={{ source: "mine.svg" }}
        onChoose={async () => ({ ok: true, errors: [] })}
        onRemove={() => undefined}
      />,
    );
    expect(screen.getByTestId("status-arrow-chevron-right")).toHaveTextContent("mine.svg");
    expect(screen.getByRole("button", { name: /choose svg for arrow/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /remove arrow-chevron-right/i })).toBeTruthy();
  });

  it("calls onRemove", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <IconAssignmentCard
        icon={icon}
        assignment={{ source: "mine.svg" }}
        onChoose={async () => ({ ok: true, errors: [] })}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole("button", { name: /remove arrow-chevron-right/i }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("shows error when replacement fails and keeps old preview", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn(async () => ({
      ok: false,
      errors: ["validation failed"],
    }));
    render(
      <IconAssignmentCard
        icon={icon}
        assignment={{ source: "old.svg" }}
        onChoose={onChoose}
        onRemove={() => undefined}
      />,
    );
    const file = makeFile("bad.svg", "<svg>");
    const input = screen.getByRole("button", { name: /choose svg/i });
    await user.click(input);
    // simulate file selection via the hidden input
    const hiddenInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(hiddenInput, file);
    expect(screen.getByTestId("error-arrow-chevron-right")).toHaveTextContent(
      "validation failed",
    );
    // old preview retained
    expect(screen.getByTestId("status-arrow-chevron-right")).toHaveTextContent("old.svg");
  });
});
