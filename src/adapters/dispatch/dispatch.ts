import type { IconGroupManifest } from "../../contracts/manifest";

/**
 * Official release dispatch adapter. A merged/reviewed official group may
 * dispatch the code-library workflow, pinned to an immutable commit/artifact
 * checksum. User channels can never select official/npm publication.
 */

export interface DispatchChannel {
  readonly kind: "official" | "user";
  readonly workflowRef: string;
  readonly repository: string;
}

export interface DispatchRequest {
  readonly manifest: IconGroupManifest;
  readonly artifactChecksum: string;
  readonly channel: "official" | "user";
}

export type DispatchOutcome =
  | { readonly ok: true; readonly dispatchId: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Only official channel may request official/npm publication. */
export function authorizeChannel(
  request: DispatchRequest,
  allowed: readonly DispatchChannel[],
): boolean {
  const channel = allowed.find((c) => c.kind === request.channel);
  return Boolean(channel);
}

export function officialChannelAllowed(request: DispatchRequest): boolean {
  return request.channel === "official";
}

/**
 * Validate that a user channel request cannot reach official/npm publication.
 * Returns an error when a user request is mislabeled as official.
 */
export function validateUserChannel(
  request: DispatchRequest,
): DispatchOutcome {
  if (request.channel === "official") {
    return {
      ok: false,
      code: "USER_CANNOT_SELECT_OFFICIAL",
      message: "user submissions may never select the official/npm publication channel",
    };
  }
  if (!/^[0-9a-f]{64}$/.test(request.artifactChecksum)) {
    return {
      ok: false,
      code: "INVALID_CHECKSUM",
      message: "artifact checksum must be sha256 hex",
    };
  }
  return { ok: true, dispatchId: request.artifactChecksum.slice(0, 12) };
}

/**
 * Build the workflow dispatch payload. Clients cannot supply arbitrary
 * repo/workflow/ref; only the pinned server-held values are used.
 */
export function buildDispatchPayload(
  request: DispatchRequest,
  channel: DispatchChannel,
  inputs: { commitSha: string },
): Record<string, string> {
  return {
    artifact_checksum: request.artifactChecksum,
    group_id: request.manifest.groupId,
    style_id: request.manifest.styleId,
    commit_sha: inputs.commitSha,
    channel: channel.kind,
  };
}
