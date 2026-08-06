import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { GroupMetadataForm } from "../../src/ui/components/group-metadata-form";

const initial = {
  groupId: "",
  displayName: "",
  styleId: "outline",
  author: "",
  email: "",
  source: "",
  license: "",
};

function Harness() {
  const [metadata, setMetadata] = useState(initial);
  const [fallbackPolicy, setFallbackPolicy] = useState<"fallback" | "error">("fallback");
  return (
    <GroupMetadataForm
      metadata={metadata}
      onChange={(patch) => setMetadata((prev) => ({ ...prev, ...patch }))}
      fallbackPolicy={fallbackPolicy}
      onFallbackPolicyChange={setFallbackPolicy}
    />
  );
}

describe("GroupMetadataForm", () => {
  it("shows inline issue codes for missing fields", () => {
    render(<Harness />);
    expect(screen.getByTestId("issue-groupId")).toHaveTextContent("REQUIRED");
    expect(screen.getByTestId("issue-displayName")).toHaveTextContent("REQUIRED");
    expect(screen.getByTestId("issue-author")).toHaveTextContent("REQUIRED");
  });

  it("rejects an invalid group id without rewriting it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Group ID");
    await user.clear(input);
    await user.type(input, "Bad_ID");
    expect(screen.getByTestId("issue-groupId")).toHaveTextContent("INVALID_GROUP_ID");
    // input retains what the user typed (no silent rewrite)
    expect(input).toHaveValue("Bad_ID");
  });

  it("clears the group id issue for a valid id", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText("Group ID");
    await user.clear(input);
    await user.type(input, "valid-group");
    expect(screen.queryByTestId("issue-groupId")).toBeNull();
  });
});
