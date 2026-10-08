import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command }) => {
  return {
    base: "/",
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      cors: true,
      allowedHosts: true,
      hmr: process.env.HMR_CLIENT_PORT ? { clientPort: parseInt(process.env.HMR_CLIENT_PORT, 10) } : undefined,
      proxy: {
        "/api": "http://127.0.0.1:8000",
      },
    },
    preview: {
      host: true,
      port: 4173,
      cors: true,
      allowedHosts: true,
      proxy: {
        "/api": "http://127.0.0.1:8000",
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.js",
      include: ["src/**/*.test.{js,jsx,ts,tsx}"],
      exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    },
  };
});
