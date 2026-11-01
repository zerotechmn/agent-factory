import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // In dev, forward API calls to a locally running factory.
  server: { proxy: { "/api": "http://localhost:4000" } },
});
