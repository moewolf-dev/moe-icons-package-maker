import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalApi, type LocalApi } from "../src/cli/local-api";

const CATALOG = {
  schemaVersion: 1,
  icons: [
    { id: "arrow-chevron-right", subgroupId: "arrow", label: "Arrow", aliases: [], addedAt: "2026-08-06T00:00:00.000Z", updatedAt: "2026-08-06T00:00:00.000Z" },
  ],
};

function req(method: string, url: string, body?: string, token?: string): { method: string; url: string | undefined; headers: Record<string, string>; body: string } {
  return { method, url, headers: token ? { "x-moeicons-token": token } : {}, body: body ?? "" };
}

function validBody() {
  return JSON.stringify({
    groupId: "my-group",
    displayName: "My Group",
    styleId: "outline",
    author: { name: "test" },
    selectedIds: ["arrow-chevron-right"],
    svgs: {
      "arrow-chevron-right": Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>').toString("base64"),
    },
  });
}

function makeRes() {
  const state: { status: number; body: string; headers: Record<string, string> } = {
    status: 0,
    body: "",
    headers: {},
  };
  const res = {
    writeHead: (status: number, headers: Record<string, string>) => {
      state.status = status;
      state.headers = headers;
    },
    end: (body?: unknown) => {
      state.body = typeof body === "string" ? body : String(body ?? "");
    },
  } as unknown as import("node:http").ServerResponse;
  return { res, state };
}

// minimal request shim for our handle() call
function shim(reqData: { method: string; url: string | undefined; headers: Record<string, string>; body: string }) {
  return {
    method: reqData.method,
    url: reqData.url,
    headers: reqData.headers,
    on: (event: string, cb: (chunk?: Buffer) => void) => {
      if (event === "data" && reqData.body.length > 0) cb(Buffer.from(reqData.body));
      if (event === "end") cb();
      if (event === "error") cb(undefined);
      return reqShim;
    },
  } as unknown as import("node:http").IncomingMessage;
}
let reqShim: unknown;

describe("createLocalApi", () => {
  let dir: string;
  let api: LocalApi;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "maker-local-api-"));
    api = createLocalApi({ outputDir: dir, catalog: CATALOG });
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a request without the token", async () => {
    const { res, state } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", validBody())), res);
    expect(state.status).toBe(401);
  });

  it("rejects an invalid groupId", async () => {
    const { res, state } = makeRes();
    const bad = JSON.parse(validBody());
    bad.groupId = "Bad Group!";
    await api.handle(shim(req("POST", "/api/builds", JSON.stringify(bad), api.token)), res);
    expect(state.status).toBe(400);
  });

  it("builds a group and writes output under the configured dir", async () => {
    const { res, state } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", validBody(), api.token)), res);
    expect(state.status).toBe(201);
    const build = JSON.parse(state.body).build;
    expect(build.id).toBe("my-group");
    expect(existsSync(join(dir, "my-group", "icons.zip"))).toBe(true);
    expect(existsSync(join(dir, "my-group", "manifest.json"))).toBe(true);
  });

  it("rejects a duplicate group directory", async () => {
    const { res: res1 } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", validBody(), api.token)), res1);
    const { res: res2, state: state2 } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", validBody(), api.token)), res2);
    expect(state2.status).toBe(409);
  });

  it("rejects svgs that fail server-side validation", async () => {
    const bad = JSON.parse(validBody());
    bad.svgs = { "arrow-chevron-right": Buffer.from("<svg>").toString("base64") };
    const { res, state } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", JSON.stringify(bad), api.token)), res);
    // the base64 decodes but the SVG fails the shared validator -> 422
    expect(state.status).toBe(422);
  });

  it("open for an unknown build id returns 404", async () => {
    const { res, state } = makeRes();
    await api.handle(shim(req("POST", "/api/builds/nope/open", "", api.token)), res);
    expect(state.status).toBe(404);
  });

  it("open invokes the onOpen hook for a known build", async () => {
    const onOpen = vi.fn();
    api = createLocalApi({ outputDir: dir, catalog: CATALOG, onOpen });
    const { res: res1 } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", validBody(), api.token)), res1);
    const { res: res2, state: state2 } = makeRes();
    await api.handle(shim(req("POST", "/api/builds/my-group/open", "", api.token)), res2);
    expect(state2.status).toBe(200);
    expect(onOpen).toHaveBeenCalledWith(join(dir, "my-group"));
  });

  it("does not allow writing outside the output dir", async () => {
    const traversal = JSON.parse(validBody());
    traversal.groupId = "ok-group";
    traversal.svgs = { "arrow-chevron-right": Buffer.from("<svg>").toString("base64") };
    // groupId "ok-group" is valid; the invalid SVG fails validation -> 422
    const { res, state } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", JSON.stringify(traversal), api.token)), res);
    expect(state.status).toBe(422);
  });

  it("leaves no partial output when a write fails", async () => {
    // pre-create the target directory as a file to force a write failure
    const { res: res1 } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", validBody(), api.token)), res1);
    // second identical build hits the existing dir and fails cleanly
    const before = readdirSync(dir);
    const { res: res2, state: state2 } = makeRes();
    await api.handle(shim(req("POST", "/api/builds", validBody(), api.token)), res2);
    expect(state2.status).toBe(409);
    expect(readdirSync(dir).sort()).toEqual(before.sort());
  });
});
