import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],

  // Не очищать терминал, чтобы были видны ошибки компиляции Rust
  clearScreen: false,

  server: {
    // Tauri ждёт фронтенд именно на этом порту (см. devUrl в tauri.conf.json)
    port: 1420,
    strictPort: true,
    // Rust-код пересобирает сам Tauri, Vite за ним следить не должен
    watch: { ignored: ["**/src-tauri/**"] },
  },

  // Переменные окружения с этими префиксами доступны через import.meta.env
  envPrefix: ["VITE_", "TAURI_ENV_"],
});
