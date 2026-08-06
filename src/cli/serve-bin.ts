#!/usr/bin/env node
import { resolve } from "node:path";
import { startMakerServer } from "./serve.js";

/**
 * PMUI-05 local server command. Usage: node dist/cli/serve-bin.js [--port N]
 */

const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : 4173;
const host = "127.0.0.1";
const distDir = resolve(process.cwd(), "dist-ui");

async function openBrowser(url: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
}

startMakerServer({ host, port, distDir, openBrowser }).then(
  (server) => {
    // eslint-disable-next-line no-console
    console.log(`Moeicons maker UI at ${server.url} (Ctrl+C to stop)`);
  },
  (error) => {
    process.stderr.write(`failed to start server: ${String(error)}\n`);
    process.exit(1);
  },
);
