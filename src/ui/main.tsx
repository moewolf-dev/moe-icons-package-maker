import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MakerApp } from "./maker-app";
import { parseIconCatalog } from "../catalog/catalog";
import catalogJson from "../../data/icon-catalog.json";

const parsed = parseIconCatalog(catalogJson);
if (!parsed.ok) {
  throw new Error(`catalog failed to load: ${parsed.errors.map((e) => e.message).join("; ")}`);
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <MakerApp catalog={parsed.value} />
  </StrictMode>,
);
