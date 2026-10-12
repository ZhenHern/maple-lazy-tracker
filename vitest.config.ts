import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // The same "@/..." shortcut that tsconfig.json gives the app.
      "@": path.resolve(__dirname),
      // "server-only" throws when imported outside Next.js. Tests run in plain
      // Node, so it is swapped for an empty module.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
});
