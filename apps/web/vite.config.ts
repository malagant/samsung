import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Resolve workspace packages (theme-kit) straight from their TypeScript sources.
  resolve: { conditions: ["source", "module", "browser", "development|production"] },
  server: { port: 5173 },
  test: { environment: "jsdom" },
});
