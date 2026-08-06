#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { cmdAdd, cmdUpdate, cmdDeprecate, cmdRemove } from "./maintenance.js";

/**
 * Catalog maintenance CLI.
 *
 * Usage:
 *   catalog <catalog.json> add --id <id> --subgroup <subgroup> --label <label>
 *   catalog <catalog.json> update --id <id> --label <new-label>
 *   catalog <catalog.json> deprecate --id <id>
 *   catalog <catalog.json> remove --id <id> [--replacement <id>]
 *
 * All commands accept --dry-run. Exit codes: 0 ok, 1 validation/usage error.
 */

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i += 1;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

export function runCatalogMaintenance(argv: string[]): number {
  const [catalogPath, command, ...rest] = argv;
  if (!catalogPath || !command) {
    console.error("usage: catalog <catalog.json> <add|update|deprecate|remove> [opts]");
    return 2;
  }
  if (!existsSync(catalogPath)) {
    console.error(`catalog not found: ${catalogPath}`);
    return 1;
  }
  const opts = parseArgs(rest);
  const dryRun = opts["dry-run"] === "true";
  const id = opts.id;

  let result;
  switch (command) {
    case "add": {
      if (!id || !opts.subgroup || !opts.label) {
        console.error("add requires --id --subgroup --label");
        return 2;
      }
      const now = new Date().toISOString();
      result = cmdAdd(
        catalogPath,
        {
          id,
          subgroupId: opts.subgroup,
          label: opts.label,
          aliases: opts.aliases ? opts.aliases.split(",") : [],
          addedAt: now,
          updatedAt: now,
        },
        { dryRun },
      );
      break;
    }
    case "update": {
      if (!id) {
        console.error("update requires --id");
        return 2;
      }
      const patch: Partial<{ label: string }> = {};
      if (opts.label) patch.label = opts.label;
      result = cmdUpdate(catalogPath, id, patch, { dryRun });
      break;
    }
    case "deprecate": {
      if (!id) {
        console.error("deprecate requires --id");
        return 2;
      }
      result = cmdDeprecate(catalogPath, id, { dryRun });
      break;
    }
    case "remove": {
      if (!id) {
        console.error("remove requires --id");
        return 2;
      }
      result = cmdRemove(catalogPath, id, opts.replacement, { dryRun });
      break;
    }
    default:
      console.error(`unknown command: ${command}`);
      return 2;
  }

  if (result.ok) {
    console.log(result.message);
    return 0;
  }
  for (const e of result.errors) console.error(`error: ${e}`);
  return 1;
}
