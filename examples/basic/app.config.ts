import { defineConfig } from "@solidifront/start/config";

export default defineConfig({
  solidifront: {
    // localization: {
    //   defaultLocale: "en-US",
    // },
  },
  vite: {
    plugins: [{ name: "test", buildStart: () => console.log("buildStart") }],
  },
});
