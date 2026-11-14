import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-vercel";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  optimizeDeps: { include: ["layerchart"] },
  plugins: [
    tailwindcss(),
    sveltekit({ adapter: adapter({ runtime: "nodejs24.x" }), files: { assets: "public" } }),
  ],
});
