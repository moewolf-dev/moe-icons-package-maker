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

  it("validates email and source formats inline", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const email = screen.getByLabelText("Email");
    await user.clear(email);
    await user.type(email, "not-an-email");
    expect(screen.getByTestId("issue-email")).toHaveTextContent("INVALID_EMAIL");

    const source = screen.getByLabelText("Source");
    await user.clear(source);
    await user.type(source, "http://insecure.example");
    expect(screen.getByTestId("issue-source")).toHaveTextContent("SOURCE_NOT_HTTPS");
  });

  it("renders license as a controlled select from the allowlist", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const select = screen.getByLabelText("License");
    await user.selectOptions(select, "CC0-1.0");
    expect(select).toHaveValue("CC0-1.0");
  });

  it("shows a required note input when license is Other", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const select = screen.getByLabelText("License");
    await user.selectOptions(select, "Other");
    const note = screen.getByLabelText("License note");
    expect(note).toBeTruthy();
    // empty note shows an issue
    expect(screen.getByTestId("issue-licenseOther")).toHaveTextContent("OTHER_REQUIRES_NOTE");
    await user.type(note, "custom terms");
    expect(screen.queryByTestId("issue-licenseOther")).toBeNull();
  });

  it("states which fields are published in the manifest", () => {
    render(<Harness />);
    const note = screen.getByTestId("manifest-fields-note");
    expect(note.textContent).toContain("author");
    expect(note.textContent).toContain("license");
    // private fields are not listed as published
    expect(note.textContent).not.toContain("groupId");
  });
});
