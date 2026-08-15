/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * Authored client entry, so instrumentation is installed BEFORE hydrate() and
 * so the hydrate call itself sits between two stamped marks. Everything the
 * driver reads back lives on `window.__PROBE`.
 */

import { hydrate } from "@solidjs/web";
import { DEV } from "solid-js";
import App from "./App.tsx";
import Document from "./Document.tsx";
import { log, mark, probe } from "./probe-log.ts";
import { pickProbe } from "./registry.ts";

const p = probe();

// The whole ticket is about a DEV-BUILD check, so prove we are in one before
// reading anything into a clean run.
p.devBuild = DEV !== undefined;

// Solid's structured diagnostic channel — more precise than scraping console,
// and it fires for events that never reach console at all.
DEV?.diagnostics.subscribe((e) =>
	p.diagnostics.push({
		code: e.code,
		severity: e.severity,
		message: e.message,
	}),
);

for (const level of ["log", "warn", "error"] as const) {
	const original = console[level].bind(console);
	console[level] = (...args: unknown[]) => {
		p.console.push(`${level}: ${args.map((a) => String(a)).join(" ")}`);
		original(...args);
	};
}
window.addEventListener("error", (e) =>
	p.errors.push(String(e.error?.stack ?? e.message)),
);
window.addEventListener("unhandledrejection", (e) =>
	p.errors.push(`unhandledrejection: ${String(e.reason)}`),
);

const Probe = pickProbe(location.href) ?? App;
const name = new URL(location.href).searchParams.get("probe") ?? "index";
p.name = name;

mark("hydrateStart");
try {
	hydrate(
		() => (
			<Document>
				<Probe />
			</Document>
		),
		document,
	);
	mark("hydrateReturned");
} catch (e) {
	p.hydrateThrew = String(e);
	mark("hydrateThrew");
}

// The earliest externally reachable moment after the hydrate pass, and before
// the effect queue's microtask flush has necessarily finished. H3 disposes its
// subtree here — the closest thing to "mid-hydration" a driver can reach.
queueMicrotask(() => {
	mark("firstMicrotask");
	if (name === "H3") {
		log("driver", "queueMicrotask after hydrate() — disposing now");
		p.hide?.();
	}
});

setTimeout(() => mark("macrotask"), 0);
