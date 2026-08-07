import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const officialIconDir = resolve(__dirname, "../moe-icons-code-library/icons");

function localReferenceIcons(): Plugin {
  return {
    name: "local-reference-icons",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url?.match(/^\/reference-icons\/([a-z][a-z0-9-]*)\.svg$/);
        if (!match) return next();
        const file = resolve(officialIconDir, `${match[1]}.svg`);
        if (!file.startsWith(`${officialIconDir}/`) || !existsSync(file)) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localReferenceIcons()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    outDir: "dist-ui",
    emptyOutDir: true,
  },
});
