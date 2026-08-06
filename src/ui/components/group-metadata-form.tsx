import { useMemo } from "react";

const RE_GROUP_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * GroupMetadataForm uses validateGroupMetadata-equivalent rules and displays
 * issue codes next to fields. Canonical IDs are never silently rewritten.
 */
export function GroupMetadataForm({
  metadata,
  onChange,
  fallbackPolicy,
  onFallbackPolicyChange,
}: {
  metadata: {
    groupId: string;
    displayName: string;
    styleId: string;
    author: string;
    email: string;
    source: string;
    license: string;
  };
  onChange: (patch: Partial<typeof metadata>) => void;
  fallbackPolicy: "fallback" | "error";
  onFallbackPolicyChange: (value: "fallback" | "error") => void;
}) {
  const issues = useMemo(() => {
    const list: { field: string; code: string; message: string }[] = [];
    if (!metadata.groupId) {
      list.push({ field: "groupId", code: "REQUIRED", message: "groupId is required" });
    } else if (!RE_GROUP_ID.test(metadata.groupId)) {
      list.push({
        field: "groupId",
        code: "INVALID_GROUP_ID",
        message: "must be lowercase kebab-case",
      });
    }
    if (!metadata.displayName.trim()) {
      list.push({ field: "displayName", code: "REQUIRED", message: "displayName is required" });
    }
    if (!metadata.author.trim()) {
      list.push({ field: "author", code: "REQUIRED", message: "author is required" });
    }
    return list;
  }, [metadata]);

  const fieldError = (field: string) => issues.find((i) => i.field === field);

  return (
    <form className="group-metadata-form" data-testid="group-metadata-form">
      <label>
        <span>Group ID</span>
        <input
          value={metadata.groupId}
          aria-label="Group ID"
          aria-invalid={Boolean(fieldError("groupId"))}
          onChange={(e) => onChange({ groupId: e.target.value })}
        />
        {fieldError("groupId") && (
          <span data-testid="issue-groupId" className="field-issue">
            {fieldError("groupId")?.code}: {fieldError("groupId")?.message}
          </span>
        )}
      </label>
      <label>
        <span>Display name</span>
        <input
          value={metadata.displayName}
          aria-label="Display name"
          aria-invalid={Boolean(fieldError("displayName"))}
          onChange={(e) => onChange({ displayName: e.target.value })}
        />
        {fieldError("displayName") && (
          <span data-testid="issue-displayName" className="field-issue">
            {fieldError("displayName")?.code}: {fieldError("displayName")?.message}
          </span>
        )}
      </label>
      <label>
        <span>Style ID</span>
        <input
          value={metadata.styleId}
          aria-label="Style ID"
          onChange={(e) => onChange({ styleId: e.target.value })}
        />
      </label>
      <label>
        <span>Author</span>
        <input
          value={metadata.author}
          aria-label="Author"
          aria-invalid={Boolean(fieldError("author"))}
          onChange={(e) => onChange({ author: e.target.value })}
        />
        {fieldError("author") && (
          <span data-testid="issue-author" className="field-issue">
            {fieldError("author")?.code}: {fieldError("author")?.message}
          </span>
        )}
      </label>
      <label>
        <span>Email</span>
        <input
          value={metadata.email}
          aria-label="Email"
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </label>
      <label>
        <span>Source</span>
        <input
          value={metadata.source}
          aria-label="Source"
          onChange={(e) => onChange({ source: e.target.value })}
        />
      </label>
      <label>
        <span>License</span>
        <input
          value={metadata.license}
          aria-label="License"
          onChange={(e) => onChange({ license: e.target.value })}
        />
      </label>
      <label>
        <span>Missing-icon fallback policy</span>
        <select
          aria-label="Missing-icon fallback policy"
          value={fallbackPolicy}
          onChange={(e) => onFallbackPolicyChange(e.target.value as "fallback" | "error")}
        >
          <option value="fallback">fallback (deterministic)</option>
          <option value="error">error (block export)</option>
        </select>
      </label>
    </form>
  );
}
