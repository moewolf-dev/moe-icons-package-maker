#!/usr/bin/env node
import { runCatalogMaintenance } from "./cli.js";

process.exitCode = runCatalogMaintenance(process.argv.slice(2));
