import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Builds the whole Studio into ONE self-contained HTML file (inline JS+CSS),
// then finish.mjs installs it as the integration's studio/studio.html.
export default defineConfig({
  plugins: [svelte(), tailwindcss(), viteSingleFile()],
  base: "./",
  build: { outDir: "build", emptyOutDir: true },
});
