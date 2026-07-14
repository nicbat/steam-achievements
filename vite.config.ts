import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static, client-only app. No backend, deployable to any static host.
export default defineConfig({
  plugins: [react()],
});
