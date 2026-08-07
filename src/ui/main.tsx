import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MakerApp } from "./maker-app";
import { parseIconCatalog } from "../catalog/catalog";
import { createReferencePreviewUrl, probeReferencePreview } from "./reference-preview";
import type { ReferencePreviewState } from "./reference-preview";
import type { IconCatalog } from "../contracts/types";
import catalogJson from "../../data/icon-catalog.json";
import "./styles.css";

function loadCatalog(): IconCatalog {
  const parsed = parseIconCatalog(catalogJson);
  if (!parsed.ok) {
    throw new Error(`catalog failed to load: ${parsed.errors.map((e) => e.message).join("; ")}`);
  }
  return parsed.value;
}

function LocalMaker() {
  const [referenceAvailability, setReferenceAvailability] = useState<ReferencePreviewState>("loading");
  const catalog = loadCatalog();

  useEffect(() => {
    const controller = new AbortController();
    const url = createReferencePreviewUrl("arrow-chevron-right");
    void probeReferencePreview(url, fetch, controller.signal).then(setReferenceAvailability);
    return () => controller.abort();
  }, []);

  return (
    <MakerApp
      catalog={catalog}
      referenceAvailability={referenceAvailability}
      referencePreview={(iconId) => {
        try {
          return createReferencePreviewUrl(iconId);
        } catch {
          return undefined;
        }
      }}
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LocalMaker />
  </StrictMode>,
);
