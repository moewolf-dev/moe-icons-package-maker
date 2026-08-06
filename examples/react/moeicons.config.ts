import type { MoeiconsConfig } from "moe-icons-package-maker/contracts";

const config: MoeiconsConfig = {
  schemaVersion: 1,
  framework: "react",
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
      className: "text-zinc-800",
    },
    playful: {
      styles: ["duotone", "colored"],
      defaultSize: 22,
      className: "text-blue-500",
    },
  },
  icons: ["search", "user", "settings", "home"],
  missingIconPolicy: "fallback",
};

export default config;
