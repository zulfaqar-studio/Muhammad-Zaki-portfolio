import { defineConfig } from "astro/config";
import react from "@astrojs/react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/Muhammad-Zaki-portfolio/",
  site: process.env.VITE_PUBLIC_SITE_URL || "https://zulfaqar-studio.github.io/Muhammad-Zaki-portfolio/",
  integrations: [react()],
  compressHTML: true,
  vite: {
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: process.env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:8787",
          changeOrigin: true
        }
      }
    }
  }
});
