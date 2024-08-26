import { defineConfig } from "@solidifront/start/config";

export default defineConfig({
  solidifront: {
    localization: {},
  },
  vite: {
    plugins: [{ name: "test", buildStart: () => console.log("buildStart") }],
  },
});
