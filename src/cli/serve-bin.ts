#!/usr/bin/env node
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { startMakerServer } from "./serve.js";
import { createLocalApi } from "./local-api.js";

/**
 * PMUI-05/PMUI-18 local server command. Usage: node dist/cli/serve-bin.js [--port N]
 * MAKER_OUTPUT_DIR (default ./out) controls where local builds are written.
 */

const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : 4173;
const host = "127.0.0.1";
const distDir = resolve(process.cwd(), "dist-ui");
const outputDir = resolve(process.cwd(), process.env.MAKER_OUTPUT_DIR ?? "out");

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
}

async function openOutputDir(path: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [path], { stdio: "ignore", detached: true }).unref();
}

function loadCatalog(): unknown {
  const catalogPath = resolve(process.cwd(), "data/icon-catalog.json");
  return JSON.parse(readFileSync(catalogPath, "utf8"));
}

const localApi = createLocalApi({
  outputDir,
  catalog: loadCatalog(),
  onOpen: (path) => openOutputDir(path),
});

startMakerServer({ host, port, distDir, openBrowser, localApi }).then(
  (server) => {
    // eslint-disable-next-line no-console
    console.log(`Moeicons maker UI at ${server.url} (Ctrl+C to stop)`);
    // eslint-disable-next-line no-console
    console.log(`Local build output: ${outputDir}`);
  },
  (error) => {
    process.stderr.write(`failed to start server: ${String(error)}\n`);
    process.exit(1);
  },
);
