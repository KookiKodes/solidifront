/** THROWAWAY PROTOTYPE — wayfinder ticket #22. Minimal hydratable shell. */
import { HydrationScript } from "@solidjs/web";
import type { JSX } from "solid-js";

export default function Document(props: { children?: JSX.Element }) {
	return (
		<html lang="en">
			<head>
				<meta charset="utf-8" />
				<title>effect-solid-bridge hydration probes</title>
				<HydrationScript />
				{/*
				 * With AUTHORED entries the handler does not inject the client
				 * entry — it only rewrites this dev path to the resolved URL.
				 * Generated entries get it injected; authored ones must render
				 * it. `async` so hydration starts as early as possible.
				 */}
				<script type="module" src="/src/entry-client.tsx" async />
			</head>
			<body>{props.children}</body>
		</html>
	);
}
