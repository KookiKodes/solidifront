import { defineConfig } from "@solidifront/start/config";

export default defineConfig({
  solidifront: {
    localization: {
      defaultLocale: "en-US",
    },
    storefront: {},
  },
  vite: {
    plugins: [{ name: "test", buildStart: () => console.log("buildStart") }],
  },
});
