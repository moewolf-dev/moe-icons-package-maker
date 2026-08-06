import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializeCatalog } from "../src/catalog/serialize.js";

const ICON_DIR = process.argv[2];
const OUT_FILE = process.argv[3];

if (!ICON_DIR || !OUT_FILE) {
  console.error("usage: generate-catalog <icons-dir> <output.json>");
  process.exit(2);
}

const files = readdirSync(ICON_DIR)
  .filter((f) => f.endsWith(".svg"))
  .sort((a, b) => a.localeCompare(b, "en"));

const now = new Date().toISOString();
const icons = files.map((file) => {
  const id = file.replace(/\.svg$/i, "");
  const subgroupId = id.split("-")[0] ?? id;
  const label = id
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return {
    id,
    subgroupId,
    label,
    aliases: [],
    addedAt: now,
    updatedAt: now,
  };
});

const catalog = { schemaVersion: 1, icons };
writeFileSync(OUT_FILE, serializeCatalog(catalog));
console.log(`generated ${icons.length} icons -> ${OUT_FILE}`);
