/**
 * Group metadata product-level validation. The form calls this pure validator;
 * rules here are the single source of truth. Only explicitly listed fields go
 * into the public manifest — author/email/source/license are marked as public.
 */

export interface GroupMetadataInput {
  readonly groupId: string;
  readonly displayName: string;
  readonly styleId: string;
  readonly author: string;
  readonly email: string;
  readonly source: string;
  readonly license: string;
  /** Required when license is "Other". */
  readonly licenseOther?: string;
}

export interface GroupMetadataIssue {
  readonly field: keyof GroupMetadataInput | "licenseOther";
  readonly code: string;
  readonly message: string;
}

export type GroupMetadataValidationResult =
  | { readonly ok: true; readonly value: GroupMetadataInput }
  | { readonly ok: false; readonly errors: readonly GroupMetadataIssue[] };

export const CANONICAL_KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LICENSE_ALLOWLIST = [
  "Apache-2.0",
  "MIT",
  "CC0-1.0",
  "CC-BY-4.0",
  "Proprietary",
  "Other",
] as const;

export type LicenseChoice = (typeof LICENSE_ALLOWLIST)[number];

/** Fields that are published into the manifest. */
export const PUBLIC_MANIFEST_FIELDS: readonly (keyof GroupMetadataInput)[] = [
  "author",
  "email",
  "source",
  "license",
];

const MAX_SHORT = 64;
const MAX_LONG = 120;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Validate group metadata. Trims display text but never rewrites canonical
 * ids. Email/source are optional; when present they must be well-formed.
 * License must be in the allowlist, or "Other" with an explanation.
 */
export function validateGroupMetadata(input: unknown): GroupMetadataValidationResult {
  const errors: GroupMetadataIssue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ field: "groupId", code: "NOT_OBJECT", message: "metadata must be an object" }] };
  }
  const meta = input as Record<string, unknown>;

  const str = (key: keyof GroupMetadataInput): string =>
    typeof meta[key] === "string" ? meta[key] : "";

  const groupId = str("groupId");
  if (!nonEmpty(groupId)) {
    errors.push({ field: "groupId", code: "REQUIRED", message: "groupId is required" });
  } else if (!CANONICAL_KEBAB_RE.test(groupId)) {
    errors.push({ field: "groupId", code: "INVALID_GROUP_ID", message: "groupId must be lowercase kebab-case" });
  } else if (groupId.length > MAX_SHORT) {
    errors.push({ field: "groupId", code: "TOO_LONG", message: `groupId must be at most ${MAX_SHORT} characters` });
  }

  const displayName = str("displayName");
  if (!nonEmpty(displayName)) {
    errors.push({ field: "displayName", code: "REQUIRED", message: "displayName is required" });
  } else if (displayName.trim().length > MAX_LONG) {
    errors.push({ field: "displayName", code: "TOO_LONG", message: `displayName must be at most ${MAX_LONG} characters` });
  }

  const styleId = str("styleId");
  if (nonEmpty(styleId) && !CANONICAL_KEBAB_RE.test(styleId)) {
    errors.push({ field: "styleId", code: "INVALID_STYLE_ID", message: "styleId must be lowercase kebab-case" });
  }

  const author = str("author");
  if (!nonEmpty(author)) {
    errors.push({ field: "author", code: "REQUIRED", message: "author is required" });
  } else if (author.trim().length > MAX_LONG) {
    errors.push({ field: "author", code: "TOO_LONG", message: `author must be at most ${MAX_LONG} characters` });
  }

  const email = str("email");
  if (nonEmpty(email)) {
    if (!EMAIL_RE.test(email)) {
      errors.push({ field: "email", code: "INVALID_EMAIL", message: "email must be a valid address" });
    } else if (email.length > 254) {
      errors.push({ field: "email", code: "TOO_LONG", message: "email is too long" });
    }
  }

  const source = str("source");
  if (nonEmpty(source)) {
    try {
      const url = new URL(source);
      if (url.protocol !== "https:") {
        errors.push({ field: "source", code: "SOURCE_NOT_HTTPS", message: "source must be an https: URL" });
      }
    } catch {
      errors.push({ field: "source", code: "INVALID_SOURCE", message: "source must be a valid https: URL" });
    }
  }

  const license = str("license");
  const licenseOther = str("licenseOther");
  if (!LICENSE_ALLOWLIST.includes(license as LicenseChoice)) {
    errors.push({ field: "license", code: "LICENSE_NOT_ALLOWED", message: `license must be one of: ${LICENSE_ALLOWLIST.join(", ")}` });
  }
  if (license === "Other" && !nonEmpty(licenseOther)) {
    errors.push({ field: "licenseOther", code: "OTHER_REQUIRES_NOTE", message: "a license note is required when license is Other" });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      groupId,
      displayName: displayName.trim(),
      styleId,
      author: author.trim(),
      email: email.trim(),
      source: source.trim(),
      license,
      ...(license === "Other" ? { licenseOther: licenseOther.trim() } : {}),
    },
  };
}
