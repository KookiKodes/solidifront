/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * Authored server entry. It exists only because the plugin requires entries in
 * pairs — the client half is what actually needed authoring (instrumentation
 * has to be installed before hydrate()). Since an authored entry-server rules
 * out `start.setup`, the probe selection lives here; `entry-client.tsx` makes
 * the identical choice from `location.href` so the two sides agree.
 */
import { renderToStream } from "@solidjs/web";
// biome-ignore lint/correctness/noUnresolvedImports: virtual module from @solidjs/vite-plugin
import manifest from "virtual:solid-manifest";
import App from "./App.tsx";
import Document from "./Document.tsx";
import { pickProbe } from "./registry.ts";

export function render(request: Request) {
	const Probe = pickProbe(request.url) ?? App;
	return renderToStream(
		() => (
			<Document>
				<Probe />
			</Document>
		),
		{ manifest },
	);
}
