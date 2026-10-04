import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? (process.env.VITE_BASE_PATH || "/Muhammad-Zaki-portfolio/") : "/",
  server: { port: 5173, strictPort: true },
  build: {
    target: "es2022",
    cssMinify: "lightningcss",
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: { output: { manualChunks: { react: ["react", "react-dom"] } } }
  }
}));
