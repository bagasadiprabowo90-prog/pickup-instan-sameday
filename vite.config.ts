import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Standalone build for static hosting (Vercel, Netlify, Cloudflare Pages, etc).
// The app is a pure SPA: it talks to the Google Apps Script Web App backend set
// via VITE_APPS_SCRIPT_URL. No server-side code ships here.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
