// app.config.ts
import { defineConfig } from "@solidjs/start/config";
import generateShopifyLocalesPlugin from "@solidifront/vite-generate-shopify-locales";
var app_config_default = defineConfig({
  vite: {
    plugins: [generateShopifyLocalesPlugin()]
  }
});
export {
  app_config_default as default
};
