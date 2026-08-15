/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * Isomorphic log sink. On the client it accumulates into `window.__PROBE`
 * so the Playwright driver can read it back; on the server it prints with an
 * `[SSR]` prefix, which the driver (which hosts the Vite dev server in-process)
 * scrapes off its own stdout.
 *
 * Every entry carries a sequence number, and the entry-client stamps named
 * marks into the same sequence — so "did this happen inside the hydrate() call"
 * is answerable by comparing integers rather than by vibes.
 */

export type Entry = { seq: number; channel: string; message: string };

export type Probe = {
	log: Entry[];
	marks: Record<string, number>;
	diagnostics: { code: string; severity: string; message: string }[];
	console: string[];
	errors: string[];
	seq: number;
	hide?: () => void;
	[k: string]: unknown;
};

const isBrowser = typeof window !== "undefined";

function store(): Probe {
	const g = globalThis as unknown as { __PROBE?: Probe };
	if (!g.__PROBE) {
		g.__PROBE = {
			log: [],
			marks: {},
			diagnostics: [],
			console: [],
			errors: [],
			seq: 0,
		};
	}
	return g.__PROBE;
}

export function log(channel: string, message: string): void {
	if (isBrowser) {
		const p = store();
		p.log.push({ seq: ++p.seq, channel, message });
	} else {
		console.log(`[SSR] [${channel}] ${message}`);
	}
}

/** Stamp a named point into the same sequence the log entries use. */
export function mark(name: string): void {
	if (!isBrowser) return;
	const p = store();
	p.marks[name] = ++p.seq;
}

export function probe(): Probe {
	return store();
}
