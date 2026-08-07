import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MakerApp } from "./maker-app";
import { parseIconCatalog } from "../catalog/catalog";
import { createReferencePreviewUrl, probeReferencePreview } from "./reference-preview";
import type { ReferencePreviewState } from "./reference-preview";
import { fetchLocalConfig, submitLocalBuild, openLocalBuildDir } from "./local-server-client";
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
  const [localToken, setLocalToken] = useState<string | undefined>(undefined);
  const catalog = loadCatalog();

  useEffect(() => {
    const controller = new AbortController();
    const url = createReferencePreviewUrl("arrow-chevron-right");
    void probeReferencePreview(url, fetch, controller.signal).then(setReferenceAvailability);
    return () => controller.abort();
  }, []);

  // Only the local `npm run serve` mode exposes /api/config; the static build
  // never enables the write API.
  useEffect(() => {
    void fetchLocalConfig().then((config) => {
      if (config) setLocalToken(config.token);
    });
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
      {...(localToken
        ? {
            localServer: {
              token: localToken,
              submit: submitLocalBuild,
              onOpenDir: (id: string) => openLocalBuildDir(localToken, id),
            },
          }
        : {})}
    />
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <LocalMaker />
  </StrictMode>,
);
