import { useMemo, useState } from "react";
import {
  validateGroupMetadata,
  LICENSE_ALLOWLIST,
  PUBLIC_MANIFEST_FIELDS,
  type LicenseChoice,
} from "../../contracts/group-metadata";

/**
 * GroupMetadataForm delegates to validateGroupMetadata and displays issue codes
 * next to fields. License is a controlled select with a free-text note for
 * "Other". Fields that enter the public manifest are marked in the UI; private
 * values are never uploaded implicitly.
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
    licenseOther?: string;
  };
  onChange: (patch: Partial<typeof metadata>) => void;
  fallbackPolicy: "fallback" | "error";
  onFallbackPolicyChange: (value: "fallback" | "error") => void;
}) {
  const [licenseOther, setLicenseOther] = useState(metadata.licenseOther ?? "");

  const result = useMemo(
    () => validateGroupMetadata({ ...metadata, ...(licenseOther ? { licenseOther } : {}) }),
    [metadata, licenseOther],
  );
  const issues = result.ok ? [] : result.errors;

  const fieldError = (field: string) => issues.find((i) => i.field === field);

  const licenseValue: LicenseChoice = LICENSE_ALLOWLIST.includes(
    metadata.license as LicenseChoice,
  )
    ? (metadata.license as LicenseChoice)
    : "Other";

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
          aria-invalid={Boolean(fieldError("styleId"))}
          onChange={(e) => onChange({ styleId: e.target.value })}
        />
        {fieldError("styleId") && (
          <span data-testid="issue-styleId" className="field-issue">
            {fieldError("styleId")?.code}: {fieldError("styleId")?.message}
          </span>
        )}
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
          aria-invalid={Boolean(fieldError("email"))}
          onChange={(e) => onChange({ email: e.target.value })}
        />
        {fieldError("email") && (
          <span data-testid="issue-email" className="field-issue">
            {fieldError("email")?.code}: {fieldError("email")?.message}
          </span>
        )}
      </label>
      <label>
        <span>Source</span>
        <input
          value={metadata.source}
          aria-label="Source"
          aria-invalid={Boolean(fieldError("source"))}
          onChange={(e) => onChange({ source: e.target.value })}
        />
        {fieldError("source") && (
          <span data-testid="issue-source" className="field-issue">
            {fieldError("source")?.code}: {fieldError("source")?.message}
          </span>
        )}
      </label>
      <label>
        <span>License</span>
        <select
          aria-label="License"
          value={licenseValue}
          onChange={(e) => onChange({ license: e.target.value })}
        >
          {LICENSE_ALLOWLIST.map((license) => (
            <option key={license} value={license}>
              {license}
            </option>
          ))}
        </select>
        {fieldError("license") && (
          <span data-testid="issue-license" className="field-issue">
            {fieldError("license")?.code}: {fieldError("license")?.message}
          </span>
        )}
      </label>
      {licenseValue === "Other" && (
        <label>
          <span>License note (required for Other)</span>
          <input
            value={licenseOther}
            aria-label="License note"
            aria-invalid={Boolean(fieldError("licenseOther"))}
            onChange={(e) => {
              setLicenseOther(e.target.value);
              onChange({ licenseOther: e.target.value });
            }}
          />
          {fieldError("licenseOther") && (
            <span data-testid="issue-licenseOther" className="field-issue">
              {fieldError("licenseOther")?.code}: {fieldError("licenseOther")?.message}
            </span>
          )}
        </label>
      )}
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
      <p className="manifest-note" data-testid="manifest-fields-note">
        The following fields are published in the public manifest:{" "}
        {PUBLIC_MANIFEST_FIELDS.join(", ")}.
      </p>
    </form>
  );
}
