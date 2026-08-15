import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
export default defineConfig({
  plugins: [solid({ ssr: true })],
  build: { minify: false, lib: { entry: "src/entry-client.tsx", formats: ["es"], fileName: "out" } },
});
