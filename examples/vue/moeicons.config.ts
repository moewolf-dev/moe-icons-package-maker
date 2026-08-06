import type { MoeiconsConfig } from "moe-icons-package-maker/contracts";

const config: MoeiconsConfig = {
  schemaVersion: 1,
  framework: "vue",
  outputDir: "src/moeicons",
  defaultTheme: "outline",
  themes: {
    outline: {
      styles: ["outline"],
      defaultSize: 20,
      strokeWidth: 2,
      className: "text-zinc-700",
    },
    solid: {
      styles: ["fill"],
      defaultSize: 20,
    },
  },
  icons: ["arrow-chevron-right", "user-circle", "symbol-check"],
  missingIconPolicy: "error",
};

export default config;
