import type generateShopifyLocalesPlugin from "@solidifront/vite-plugin-generate-shopify-locales";
import type { ShopifyApiProjectOptions } from "@shopify/api-codegen-preset";
import type {
	SolidStartInlineConfig,
	ViteCustomizableConfig,
} from "@solidjs/start/config";

export type SolidifrontConfig = SolidStartInlineConfig & {
	solidifront?: {
		localization?: Omit<
			generateShopifyLocalesPlugin.Options,
			"debug" | "namespace"
		> & {};
		storefront?: {
			codegen?: Omit<
				ShopifyApiProjectOptions,
				"apiType" | "module" | "apiVersion" | "apiKey"
			>;
		};
		customer?: {};
	};
};

export type VitePlugin = NonNullable<ViteCustomizableConfig["plugins"]>[0];
