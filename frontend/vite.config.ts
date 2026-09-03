import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset paths: the same build works at a repo subpath on GitHub
  // Pages, under nginx in Docker, and on any static host.
  base: "./",
  server: {
    host: true,
    port: 5173,
    // Local development: forward API calls to the FastAPI backend.
    // Docker uses nginx for the same job (see nginx.conf).
    proxy: {
      "/api": "http://localhost:8000",
      "/health": "http://localhost:8000",
    },
  },
});
