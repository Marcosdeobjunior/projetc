import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// O modo "preview" gera um único HTML autocontido para abrir no navegador
// (sem o Tauri). O build normal é o que o Tauri empacota no app desktop.
export default defineConfig(({ mode }) => {
  const preview = mode === "preview";
  return {
    plugins: [react(), ...(preview ? [viteSingleFile()] : [])],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: process.env.TAURI_DEV_HOST || false,
      watch: { ignored: ["**/src-tauri/**"] },
    },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: {
      outDir: preview ? "dist-preview" : "dist",
      target: preview
        ? "es2020"
        : process.env.TAURI_ENV_PLATFORM === "windows"
          ? "chrome105"
          : "safari13",
      minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
    },
  };
});
