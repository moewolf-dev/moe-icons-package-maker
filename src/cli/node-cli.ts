#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildIconGroup } from "../build/orchestrate.js";

/**
 * Node/Linux CLI: accepts a JSON build request with explicit input/output
 * paths, runs the maker core, writes ZIP + report to disk. Machine-readable
 * JSON diagnostics on stdout; nonzero exit code on failure.
 *
 * Request JSON:
 * {
 *   "catalogPath": "data/icon-catalog.json",
 *   "selectedIds": ["arrow-chevron-right", "user-circle"],
 *   "svgDir": "/path/to/uploaded-svgs",       // svg files keyed by icon id
 *   "groupId": "my-custom",
 *   "displayName": "My Custom",
 *   "styleId": "outline",
 *   "author": { "name": "..." },
 *   "outputDir": "./out"
 * }
 */

interface CliRequest {
  readonly catalogPath: string;
  readonly selectedIds: readonly string[];
  readonly svgDir: string;
  readonly groupId: string;
  readonly displayName: string;
  readonly styleId: string;
  readonly author: { name: string; email?: string; source?: string; license?: string };
  readonly outputDir: string;
}

function fail(code: number, message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export async function runNodeCli(argv: string[]): Promise<number> {
  const requestPath = argv[0];
  if (!requestPath) {
    process.stdout.write(
      JSON.stringify({ ok: false, errors: ["usage: maker-build <request.json>"] }) + "\n",
    );
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(requestPath, "utf8"));
  } catch (error) {
    process.stdout.write(
      JSON.stringify({ ok: false, errors: [`cannot read request: ${String(error)}`] }) + "\n",
    );
    return 1;
  }

  const request = raw as CliRequest;
  if (
    typeof request.catalogPath !== "string" ||
    typeof request.svgDir !== "string" ||
    typeof request.groupId !== "string" ||
    typeof request.displayName !== "string" ||
    typeof request.styleId !== "string" ||
    !Array.isArray(request.selectedIds) ||
    typeof request.outputDir !== "string"
  ) {
    process.stdout.write(
      JSON.stringify({ ok: false, errors: ["request is missing required fields"] }) + "\n",
    );
    return 1;
  }

  const catalog: unknown = JSON.parse(readFileSync(resolve(request.catalogPath), "utf8"));

  const sourceMap = new Map<string, string>();
  for (const idRaw of request.selectedIds) {
    const id = String(idRaw);
    const svgPath = join(resolve(request.svgDir), `${id}.svg`);
    let content: string;
    try {
      content = readFileSync(svgPath, "utf8");
    } catch {
      // missing icon: leave unassigned (partial group allowed)
      continue;
    }
    sourceMap.set(id, content);
  }
  const sources: Record<string, string> = Object.fromEntries(sourceMap);

  const result = await buildIconGroup(
    {
      catalog,
      selectedIds: request.selectedIds,
      sources,
      groupId: request.groupId,
      displayName: request.displayName,
      styleId: request.styleId,
      author: request.author,
    },
    { onProgress: () => undefined },
  );

  if (!result.ok) {
    process.stdout.write(JSON.stringify({ ok: false, errors: result.errors }) + "\n");
    return 1;
  }

  const outRoot = resolve(request.outputDir);
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(join(outRoot, "icons.zip"), result.zip);
  for (const [rel, content] of Object.entries(result.files)) {
    const full = join(outRoot, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }

  process.stdout.write(
    JSON.stringify({
      ok: true,
      outputDir: outRoot,
      files: Object.keys(result.files),
      zipBytes: result.zip.byteLength,
    }) + "\n",
  );
  return 0;
}

const isDirect =
  (process.argv[1]?.split("/").pop() ?? "").startsWith("vite-node") ||
  process.argv[2]?.split("/").pop() === "node-cli.ts";

if (isDirect) {
  runNodeCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => fail(1, `unexpected error: ${String(error)}`),
  );
}
