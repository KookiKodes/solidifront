/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * Authored server entry. It exists only because the plugin requires entries in
 * pairs — the client half is what actually needed authoring (instrumentation
 * has to be installed before hydrate()). Since an authored entry-server rules
 * out `start.setup`, the probe selection lives here; `entry-client.tsx` makes
 * the identical choice from `location.href` so the two sides agree.
 */

// Virtual module supplied by @solidjs/vite-plugin at build time.
import manifest from "virtual:solid-manifest";
import { renderToStream } from "@solidjs/web";
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
