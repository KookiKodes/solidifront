/** THROWAWAY PROTOTYPE — wayfinder ticket #22. SSR start mode: real streaming SSR + real hydration. */
import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		solid({
			ssr: true,
			start: {
				app: "src/App.tsx",
				document: "src/Document.tsx",
				entryClient: "src/entry-client.tsx",
				entryServer: "src/entry-server.tsx",
			},
		}),
	],
	server: { port: 5199 },
});
