// app.config.ts
import { defineConfig } from "@solidifront/start/config";
var app_config_default = defineConfig({
  solidifront: {
    localization: {
      defaultLocale: "en-US"
    },
    storefront: {}
  },
  vite: {
    plugins: [
      {
        name: "test",
        config(config) {
        }
      }
    ]
  }
});
export {
  app_config_default as default
};
