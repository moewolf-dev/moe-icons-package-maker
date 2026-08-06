import { describe, it, expect } from "vitest";
import {
  buildBranchName,
  validateInputPaths,
  resolveBaseBranch,
  createPullRequest,
} from "../src/adapters/github/pr";
import type { IconGroupManifest } from "../src/contracts/manifest";

const manifest: IconGroupManifest = {
  schemaVersion: 1,
  groupId: "my-custom",
  displayName: "My Custom",
  styleId: "outline",
  author: { name: "Ada" },
  createdWith: "maker@0.1.0",
  createdAt: "2026-08-06T00:00:00.000Z",
  entries: [],
  validation: { selected: 1, filled: 1, valid: 1, warnings: 0, errors: 0, missing: 0 },
};

function successMock(calls: string[], fn: (method: string, path: string, body: unknown) => unknown) {
  return async (method: string, path: string, body: unknown) => {
    calls.push(`${method} ${path}`);
    const status = path.includes("/git/refs") ? 201 : 200;
    return { status, json: async () => fn(method, path, body) };
  };
}

describe("buildBranchName", () => {
  it("produces a safe unique branch name", () => {
    const name = buildBranchName("my-custom");
    expect(name.startsWith("maker/my-custom-")).toBe(true);
  });

  it("sanitizes unsafe characters", () => {
    const name = buildBranchName("Bad Name/group");
    const segment = name.slice("maker/".length);
    expect(segment).toMatch(/^[a-z0-9-]+$/);
    expect(name.startsWith("maker/bad-name-group-")).toBe(true);
  });
});

describe("validateInputPaths", () => {
  it("accepts paths inside inputDir", () => {
    const errors = validateInputPaths(
      { "icons/my-style/arrow/a.svg": "<svg/>" },
      "icons/my-style",
    );
    expect(errors).toEqual([]);
  });

  it("rejects traversal", () => {
    const errors = validateInputPaths(
      { "../escape.svg": "<svg/>" },
      "icons/my-style",
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects paths outside inputDir", () => {
    const errors = validateInputPaths(
      { "src/index.ts": "evil" },
      "icons/my-style",
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("resolveBaseBranch", () => {
  it("uses configured base branch", () => {
    expect(
      resolveBaseBranch({ token: "t", repository: "r", baseBranch: "dev", inputDir: "i" }, { defaultBranch: "main" }),
    ).toBe("dev");
  });
});

describe("createPullRequest", () => {
  it("creates a branch, writes files, and opens a PR", async () => {
    const calls: string[] = [];
    const config = {
      token: "token",
      repository: "org/repo",
      baseBranch: "main",
      inputDir: "icons/my-style",
    };
    const deps = {
      requestJson: successMock(calls, (method, path) => {
        if (path.endsWith("/repo")) return { default_branch: "main" };
        if (path.includes("/git/ref/heads/main"))
          return { object: { sha: "abc123" } };
        if (path.includes("/git/refs")) return {};
        if (path.includes("/contents/")) return {};
        if (path.includes("/pulls"))
          return { html_url: "https://github.com/org/repo/pull/7", number: 7 };
        return {};
      }),
    };
    const result = await createPullRequest(
      config,
      {
        manifest,
        files: { "icons/my-style/arrow/a.svg": "<svg/>" },
      },
      deps,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prUrl).toBe("https://github.com/org/repo/pull/7");
      expect(calls.some((c) => c.startsWith("POST /repos/org/repo/git/refs"))).toBe(true);
      expect(calls.some((c) => c.startsWith("PUT /repos/org/repo/contents/"))).toBe(true);
    }
  });

  it("rejects unsafe paths before any network call", async () => {
    let called = false;
    const result = await createPullRequest(
      { token: "t", repository: "r", baseBranch: "main", inputDir: "icons/x" },
      { manifest, files: { "../escape.svg": "x" } },
      {
        requestJson: async () => {
          called = true;
          return { status: 200, json: async () => ({}) };
        },
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("UNSAFE_PATH");
    expect(called).toBe(false);
  });

  it("fails when PR creation fails", async () => {
    const config = {
      token: "t",
      repository: "org/repo",
      baseBranch: "main",
      inputDir: "icons/x",
    };
    const deps = {
      requestJson: successMock([], (method, path) => {
        if (path.endsWith("/repo")) return { default_branch: "main" };
        if (path.includes("/git/ref/heads/main")) return { object: { sha: "abc" } };
        if (path.includes("/git/refs")) return {};
        if (path.includes("/contents/")) return {};
        if (path.includes("/pulls")) return { message: "validation failed" };
        return {};
      }),
    };
    const result = await createPullRequest(
      config,
      { manifest, files: { "icons/x/a.svg": "<svg/>" } },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("PR_CREATE_FAILED");
  });
});
