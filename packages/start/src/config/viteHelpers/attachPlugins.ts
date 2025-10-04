import type {
	SolidStartInlineConfig,
	ViteCustomizableConfig,
} from "@solidjs/start/config";

import defu from "defu";

export function attachPlugins(
	vite: SolidStartInlineConfig["vite"] = {},
	plugins: NonNullable<ViteCustomizableConfig["plugins"]>,
) {
	if (typeof vite === "function") {
		const defaultVite = vite;
		vite = (options) => {
			const viteConfig = defaultVite(options);
			return defu(viteConfig, {
				plugins,
			});
		};
	} else if (typeof vite === "object") {
		vite.plugins = (vite.plugins || []).concat(plugins);
	}

	return vite;
}
