import { type IconCatalog } from "../contracts/types";

const ID_KEY = (a: string, b: string) => a.localeCompare(b, "en");

/**
 * Serialize a catalog deterministically: subgroups, icons, and aliases are
 * sorted by stable keys; output ends with a newline. Repeated calls on the same
 * catalog are byte-identical.
 */
export function serializeCatalog(catalog: IconCatalog): string {
  const lines: string[] = [];
  lines.push("{");
  lines.push(`  "schemaVersion": ${catalog.schemaVersion},`);
  lines.push("  \"icons\": [");

  const sortedIcons = [...catalog.icons].sort((a, b) => ID_KEY(a.id, b.id));
  sortedIcons.forEach((icon, i) => {
    const comma = i < sortedIcons.length - 1 ? "," : "";
    lines.push("    {");
    lines.push(`      "id": ${JSON.stringify(icon.id)},`);
    lines.push(`      "subgroupId": ${JSON.stringify(icon.subgroupId)},`);
    lines.push(`      "label": ${JSON.stringify(icon.label)},`);
    lines.push(`      "aliases": ${JSON.stringify([...icon.aliases].sort(ID_KEY))},`);
    if (icon.referenceIcon !== undefined) {
      lines.push(`      "referenceIcon": ${JSON.stringify(icon.referenceIcon)},`);
    }
    lines.push(`      "addedAt": ${JSON.stringify(icon.addedAt)},`);
    lines.push(`      "updatedAt": ${JSON.stringify(icon.updatedAt)}`);
    lines.push(`    }${comma}`);
  });

  lines.push("  ]");
  lines.push("}");
  return `${lines.join("\n")}\n`;
}
