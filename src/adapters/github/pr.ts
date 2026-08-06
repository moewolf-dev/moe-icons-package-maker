import type { IconGroupManifest } from "../../contracts/manifest";

/**
 * GitHub PR submission adapter. Creates a unique branch, writes only the
 * approved code-library input directory, and opens a PR with a source/author/
 * checksum summary. Never pushes to the target default branch.
 */

export interface PrAdapterConfig {
  readonly token: string;
  readonly repository: string; // owner/repo
  readonly baseBranch: string; // e.g. main
  readonly inputDir: string; // e.g. icons/my-style
}

export interface PrRequest {
  readonly manifest: IconGroupManifest;
  /** Files to write into inputDir, keyed by relative path. */
  readonly files: Readonly<Record<string, string>>;
}

export interface PrResult {
  readonly ok: true;
  readonly branch: string;
  readonly prUrl: string;
  readonly prNumber: number;
}

export interface PrError {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

export type PrOutcome = PrResult | PrError;

const DEFAULT_BRANCH = "main";

/** Build a unique, safe branch name from the group id and a timestamp. */
export function buildBranchName(groupId: string): string {
  const safeId = groupId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const ts = Date.now().toString(36);
  return `maker/${safeId}-${ts}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Ensure every file path stays inside inputDir (no traversal). */
export function validateInputPaths(
  files: Readonly<Record<string, string>>,
  inputDir: string,
): string[] {
  const errors: string[] = [];
  for (const rel of Object.keys(files)) {
    const cleaned = rel.replace(/\\/g, "/");
    if (cleaned.startsWith("/") || cleaned.split("/").includes("..")) {
      errors.push(`unsafe path "${rel}"`);
    }
    if (!cleaned.startsWith(inputDir)) {
      errors.push(`path "${rel}" is outside inputDir "${inputDir}"`);
    }
  }
  return errors;
}

/** Determine the target base branch, never the default branch unless allowed. */
export function resolveBaseBranch(
  config: PrAdapterConfig,
  payload: { defaultBranch?: string },
): string {
  const base = config.baseBranch || payload.defaultBranch || DEFAULT_BRANCH;
  return base;
}

/**
 * Open a PR via the GitHub REST API. Pure orchestration; the network call is
 * injected via `requestJson` for testability. Writes nothing to the default
 * branch: creates a unique branch first.
 */
export async function createPullRequest(
  config: PrAdapterConfig,
  request: PrRequest,
  deps: {
    requestJson: (
      method: string,
      path: string,
      body: unknown,
    ) => Promise<{ status: number; json: () => Promise<unknown> }>;
  },
): Promise<PrOutcome> {
  const pathErrors = validateInputPaths(request.files, config.inputDir);
  if (pathErrors.length > 0) {
    return { ok: false, code: "UNSAFE_PATH", message: pathErrors.join("; ") };
  }

  const branch = buildBranchName(request.manifest.groupId);

  // 1. get default branch ref
  const repo = await deps.requestJson("GET", `/repos/${config.repository}`, null);
  const repoJson = await repo.json();
  if (!isRecord(repoJson)) {
    return { ok: false, code: "INVALID_REPO_RESPONSE", message: "invalid repo response" };
  }
  const defaultBranch =
    typeof repoJson.default_branch === "string"
      ? repoJson.default_branch
      : DEFAULT_BRANCH;
  const base = resolveBaseBranch(config, { defaultBranch });
  if (base === defaultBranch && config.baseBranch === "") {
    return {
      ok: false,
      code: "DEFAULT_BRANCH_NOT_ALLOWED",
      message: "refusing to branch from the default branch without explicit config",
    };
  }

  // 2. create branch from base
  const headRef = await deps.requestJson(
    "GET",
    `/repos/${config.repository}/git/ref/heads/${base}`,
    null,
  );
  const headJson = await headRef.json();
  const headObject =
    isRecord(headJson) && isRecord(headJson.object) ? headJson.object : undefined;
  const headSha = typeof headObject?.sha === "string" ? headObject.sha : undefined;
  if (!headSha) {
    return { ok: false, code: "BASE_REF_NOT_FOUND", message: `base ref ${base} not found` };
  }
  const createRef = await deps.requestJson(
    "POST",
    `/repos/${config.repository}/git/refs`,
    { ref: `refs/heads/${branch}`, sha: headSha },
  );
  if (createRef.status !== 201) {
    return { ok: false, code: "BRANCH_CREATE_FAILED", message: `could not create branch ${branch}` };
  }

  // 3. write files via contents API (one commit per file)
  for (const [rel, content] of Object.entries(request.files)) {
    const write = await deps.requestJson(
      "PUT",
      `/repos/${config.repository}/contents/${rel}`,
      {
        message: `feat: add icon group ${request.manifest.groupId} (${rel})`,
        content: Buffer.from(content, "utf8").toString("base64"),
        branch,
      },
    );
    if (write.status !== 201 && write.status !== 200) {
      return { ok: false, code: "CONTENT_WRITE_FAILED", message: `failed to write ${rel}` };
    }
  }

  // 4. open PR
  const pr = await deps.requestJson(
    "POST",
    `/repos/${config.repository}/pulls`,
    {
      title: `Add icon group: ${request.manifest.displayName} (${request.manifest.groupId})`,
      head: branch,
      base,
      body:
        `Author: ${request.manifest.author.name}\n` +
        `Group: ${request.manifest.groupId}\n` +
        `Style: ${request.manifest.styleId}\n` +
        `Valid: ${request.manifest.validation.valid}/${request.manifest.validation.selected}\n` +
        `Created with: ${request.manifest.createdWith}`,
    },
  );
  const prJson = await pr.json();
  if (!isRecord(prJson) || typeof prJson.html_url !== "string") {
    return { ok: false, code: "PR_CREATE_FAILED", message: "PR creation failed" };
  }

  return {
    ok: true,
    branch,
    prUrl: prJson.html_url,
    prNumber: typeof prJson.number === "number" ? prJson.number : 0,
  };
}
