/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * One probe per page load (a halt is process-wide and permanent), so the probe
 * is selected from `?probe=`. The server picks it in `setup.ts`, the client in
 * `entry-client.tsx` — this map is the single source both read, so the two
 * sides cannot disagree and manufacture a hydration mismatch of their own.
 */
import type { Component } from "solid-js";
import {
	ProbeH0,
	ProbeH0Compute,
	ProbeH1,
	ProbeH1Late,
	ProbeH2,
	ProbeH3,
	ProbeH4,
	ProbeS1,
} from "./probes.tsx";

export const PROBES: Record<string, Component> = {
	H0: ProbeH0,
	H0B: ProbeH0Compute,
	H1: ProbeH1,
	H1B: ProbeH1Late,
	H2: ProbeH2,
	H3: ProbeH3,
	H4: ProbeH4,
	S1: ProbeS1,
};

export function pickProbe(url: string): Component | undefined {
	const name = new URL(url, "http://x").searchParams.get("probe");
	return name ? PROBES[name] : undefined;
}
