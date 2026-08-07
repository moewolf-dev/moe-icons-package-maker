import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildIconGroup } from "../build/orchestrate";

/**
 * Local server write API (only enabled in `npm run serve` mode, never in the
 * static website build). Loopback-only by default; a random startup token is
 * generated per process and must be presented by the page. Output is written
 * only under the configured output dir, staged then renamed atomically.
 */

export interface LocalApiOptions {
  readonly outputDir: string;
  readonly catalog: unknown;
  readonly maxBodyBytes?: number;
  readonly onOpen?: (path: string) => Promise<void>;
}

export interface LocalApi {
  readonly token: string;
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

export interface BuildRecord {
  readonly id: string;
  readonly dir: string;
  readonly checksum: string;
  readonly fileCount: number;
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

export function createLocalApi(options: LocalApiOptions): LocalApi {
  const token = randomBytes(24).toString("hex");
  const outputRoot = resolve(options.outputDir);
  mkdirSync(outputRoot, { recursive: true });
  const records = new Map<string, BuildRecord>();

  const isAuthorized = (req: IncomingMessage): boolean => {
    const header = req.headers["x-moeicons-token"];
    return typeof header === "string" && header === token;
  };

  const safeJoin = (base: string, rel: string): string => {
    const resolved = resolve(base, rel);
    const prefix = `${resolve(base)}${sep}`;
    if (resolved !== resolve(base) && !resolved.startsWith(prefix)) {
      throw new Error("path escapes output dir");
    }
    return resolved;
  };

  const handleBuild = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = await readBody(req, options.maxBodyBytes ?? 20 * 1024 * 1024);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      json(res, 400, { ok: false, error: "invalid JSON" });
      return;
    }
    const request = parsed as {
      groupId?: string;
      displayName?: string;
      styleId?: string;
      author?: { name?: string };
      selectedIds?: string[];
      svgs?: Record<string, string>;
    };
    if (
      typeof request.groupId !== "string" ||
      !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(request.groupId) ||
      !Array.isArray(request.selectedIds)
    ) {
      json(res, 400, { ok: false, error: "invalid groupId or selectedIds" });
      return;
    }

    // decode base64 SVGs and re-run the shared parser/validator server-side
    const sources: Record<string, string> = {};
    const svgs = request.svgs ?? {};
    for (const [id, b64] of Object.entries(svgs)) {
      if (!request.selectedIds.includes(id)) continue;
      let text: string;
      try {
        text = Buffer.from(b64, "base64").toString("utf8");
      } catch {
        json(res, 400, { ok: false, error: `invalid base64 for ${id}` });
        return;
      }
      sources[`${id}.svg`] = text;
    }

    const result = await buildIconGroup(
      {
        catalog: options.catalog,
        selectedIds: request.selectedIds,
        sources,
        groupId: request.groupId,
        displayName: request.displayName ?? request.groupId,
        styleId: request.styleId ?? "outline",
        author: { name: request.author?.name ?? "local" },
      },
      { onProgress: () => undefined },
    );

    if (!result.ok) {
      json(res, 422, { ok: false, errors: result.errors });
      return;
    }

    // stage then rename under <groupId>
    const groupDir = safeJoin(outputRoot, request.groupId);
    const stagingDir = `${groupDir}.staging-${Date.now()}`;
    if (existsSync(groupDir)) {
      json(res, 409, { ok: false, error: "group directory already exists" });
      return;
    }
    try {
      mkdirSync(stagingDir, { recursive: true });
      writeFileSync(join(stagingDir, "icons.zip"), Buffer.from(result.zip));
      for (const [rel, content] of Object.entries(result.files)) {
        const full = join(stagingDir, rel);
        mkdirSync(join(full, ".."), { recursive: true });
        writeFileSync(full, content);
      }
      renameSync(stagingDir, groupDir);
    } catch (error) {
      if (existsSync(stagingDir)) rmSync(stagingDir, { recursive: true, force: true });
      json(res, 500, { ok: false, error: `write failed: ${String(error)}` });
      return;
    }

    const checksum = [...result.zip]
      .reduce((acc, b) => acc + b.toString(16).padStart(2, "0"), "")
      .slice(0, 16);
    const record: BuildRecord = {
      id: request.groupId,
      dir: groupDir,
      checksum,
      fileCount: Object.keys(result.files).length + 1,
    };
    records.set(record.id, record);
    json(res, 201, { ok: true, build: record });
  };

  const handleOpen = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const parts = (req.url ?? "").split("/").filter(Boolean);
    const id = parts[parts.length - 2] ?? "";
    const record = records.get(id);
    if (!record) {
      json(res, 404, { ok: false, error: "unknown build id" });
      return;
    }
    if (!options.onOpen) {
      json(res, 501, { ok: false, error: "open not supported in this context" });
      return;
    }
    await options.onOpen(record.dir);
    json(res, 200, { ok: true, dir: record.dir });
  };

  return {
    token,
    handle: async (req, res) => {
      if (req.url === undefined) {
        json(res, 404, { ok: false, error: "not found" });
        return;
      }
      if (!isAuthorized(req)) {
        json(res, 401, { ok: false, error: "unauthorized" });
        return;
      }
      try {
        if (req.method === "POST" && req.url.startsWith("/api/builds") && !req.url.includes("/open")) {
          await handleBuild(req, res);
        } else if (req.method === "POST" && req.url.startsWith("/api/builds/") && req.url.endsWith("/open")) {
          await handleOpen(req, res);
        } else {
          json(res, 404, { ok: false, error: "not found" });
        }
      } catch (error) {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
