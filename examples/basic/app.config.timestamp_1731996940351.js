// app.config.ts
import { defineConfig } from "@solidifront/start/config";
var app_config_default = defineConfig({
  solidifront: {
    localization: {
      defaultLocale: "en-US"
    },
    storefront: {}
  }
});
export {
  app_config_default as default
};
