/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #30.
 *
 * Same shape as run-hydration.mjs (#22): host the Vite dev server in-process so
 * `[SSR]` lines land on this stdout, then drive chrome-headless-shell.
 *
 * One thing added. #30 needs to know what a server-side effect phase COSTS, and
 * `serverEffect` pays for a pending compute with `ctx.block()` — it holds the
 * flush. So every probe is first fetched RAW, with the arrival time of each
 * chunk recorded, before the browser ever sees it. E3 (pending read) against
 * E3C (identical, nothing pending) turns "it holds the stream" from a claim
 * read off the source into a measured delta.
 *
 *   node run-30.mjs
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const PORT = 5198;
const BASE = `http://localhost:${PORT}`;

function findHeadlessShell() {
	const root = join(homedir(), ".cache", "ms-playwright");
	for (const build of ["1228", "1217", "1208"]) {
		const p = join(
			root,
			`chromium_headless_shell-${build}`,
			"chrome-headless-shell-linux64",
			"chrome-headless-shell",
		);
		if (existsSync(p)) return p;
	}
	throw new Error(`no chrome-headless-shell under ${root}`);
}

// -------------------------------------------------------------- SSR capture
let ssrBucket = [];
const realLog = console.log.bind(console);
console.log = (...args) => {
	const line = args.map(String).join(" ");
	if (line.startsWith("[SSR]"))
		ssrBucket.push({ at: Date.now(), line: line.slice(6) });
	else realLog(...args);
};

const out = [];
const say = (s = "") => out.push(s);
const banner = (s) => {
	say("");
	say(`=== ${s} ===`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch a probe with no browser involved and record the stream's shape:
 * when the response headers came back, when each body chunk arrived, and when
 * the marker element (rendered at the very end of the probe's JSX) appeared.
 */
async function timeStream(name) {
	const t0 = Date.now();
	// `Accept: text/html` is NOT optional: the plugin's dev middleware only
	// SSR-renders navigations. A bare fetch gets a 404 "Cannot GET /", which
	// looks exactly like "the probe rendered nothing".
	const res = await fetch(`${BASE}/?probe=${name}`, {
		headers: { accept: "text/html,application/xhtml+xml" },
	});
	const headersAt = Date.now() - t0;
	const chunks = [];
	let body = "";
	let markerAt = null;
	let fallbackAt = null;
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		const text = dec.decode(value, { stream: true });
		body += text;
		chunks.push({ at: Date.now() - t0, bytes: value.byteLength });
		if (markerAt === null && body.includes('id="marker"')) markerAt = chunks.at(-1).at;
		if (fallbackAt === null && body.includes('id="fallback"'))
			fallbackAt = chunks.at(-1).at;
	}
	return {
		headersAt,
		chunks,
		markerAt,
		fallbackAt,
		doneAt: chunks.length ? chunks.at(-1).at : headersAt,
		body,
	};
}

function reportStream(label, s) {
	say(`  --- stream timing (${label}) ---`);
	say(`    headers at        ${s.headersAt}ms`);
	say(
		`    chunks            ${s.chunks.length} — ${s.chunks
			.map((c) => `${c.at}ms/${c.bytes}B`)
			.join(", ")}`,
	);
	if (s.fallbackAt !== null) say(`    id="fallback" at  ${s.fallbackAt}ms`);
	say(`    id="marker" at    ${s.markerAt === null ? "NEVER" : `${s.markerAt}ms`}`);
	say(`    body complete at  ${s.doneAt}ms (${s.body.length}B)`);
}

function renderClientLog(p) {
	if (!p) {
		say("    (no __PROBE — the client bundle never ran)");
		return;
	}
	const rows = [
		...p.log.map((e) => ({ ...e, kind: "log" })),
		...Object.entries(p.marks ?? {}).map(([name, seq]) => ({
			seq,
			name,
			kind: "mark",
		})),
	].sort((a, b) => a.seq - b.seq);
	for (const r of rows) {
		if (r.kind === "mark") say(`    ---------- ${r.name} ----------`);
		else say(`    [${r.channel}] ${r.message}`);
	}
	if (!rows.length) say("    (client log empty)");
}

async function runProbe(browser, name, { drive, settle = 400, ssrWait = 0 } = {}) {
	banner(name);

	// 1. raw stream, no browser
	ssrBucket = [];
	const stream = await timeStream(name);
	// Work started during the render may log AFTER the response completes — that
	// is the whole of E5's question, so give it a window before reading.
	if (ssrWait) await sleep(ssrWait);
	const rawSsr = ssrBucket;
	say("  --- SSR (raw fetch, no browser) ---");
	if (rawSsr.length) {
		const base = rawSsr[0].at;
		for (const e of rawSsr) say(`    +${e.at - base}ms ${e.line}`);
	} else say("    (nothing logged server-side)");
	reportStream(name, stream);

	// 2. the same probe in a real browser, so the client half is real hydration
	ssrBucket = [];
	const context = await browser.newContext();
	const page = await context.newPage();
	const consoleLines = [];
	page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
	page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
	await page.goto(`${BASE}/?probe=${name}`, { waitUntil: "load" });
	await sleep(settle);

	if (ssrBucket.length) {
		const base = ssrBucket[0].at;
		say("  --- SSR (browser pass — same render, second request) ---");
		for (const e of ssrBucket) say(`    +${e.at - base}ms ${e.line}`);
	}

	const p = await page.evaluate(() => window.__PROBE ?? null);
	say(`  --- CLIENT (hydration) — dev build: ${p?.devBuild} ---`);
	renderClientLog(p);

	if (p?.diagnostics?.length) {
		say("  --- Solid diagnostics ---");
		for (const d of p.diagnostics)
			say(`    [${d.code}] ${d.message.replace(/^\[[A-Z_]+\]\s*/, "").slice(0, 150)}`);
	} else say("  --- Solid diagnostics: none ---");

	if (consoleLines.length) {
		say("  --- browser console / page errors ---");
		for (const l of consoleLines) say(`    ${l.slice(0, 190)}`);
	}

	await drive?.({ page, say, sleep, stream });
	await context.close();
	return { stream, p };
}

// ---------------------------------------------------------------------- main
const server = await createServer({
	root: new URL(".", import.meta.url).pathname,
	logLevel: "warn",
});
await server.listen(PORT);
const browser = await chromium.launch({ executablePath: findHeadlessShell() });

try {
	await runProbe(browser, "E1");

	await runProbe(browser, "E2", {
		drive: async ({ page, say, sleep }) => {
			say("  --- E2: clicking #bump twice (client-only re-runs) ---");
			await page.click("#bump");
			await sleep(100);
			await page.click("#bump");
			await sleep(150);
			const after = await page.evaluate(() => window.__PROBE);
			renderClientLog(after);
		},
	});

	// Identical but for `transparent: true` — attributes the unclaimed-node
	// warning to the flag rather than to anything else in E1/E2.
	await runProbe(browser, "E2P");
	await runProbe(browser, "E2T");

	const c = await runProbe(browser, "E3C", { settle: 500 });
	const d = await runProbe(browser, "E3D", { settle: 500 });
	const b = await runProbe(browser, "E3B", { settle: 500 });
	const e3 = await runProbe(browser, "E3", { settle: 700 });
	banner("E3 vs E3C — the price of a pending read in a render-effect compute");
	say(`  E3C nothing pending      headers ${c.stream.headersAt}ms  marker ${c.stream.markerAt}ms  done ${c.stream.doneAt}ms`);
	say(`  E3D memo, unread         headers ${d.stream.headersAt}ms  marker ${d.stream.markerAt}ms  done ${d.stream.doneAt}ms`);
	say(`  E3B read by createEffect headers ${b.stream.headersAt}ms  marker ${b.stream.markerAt}ms  done ${b.stream.doneAt}ms`);
	say(`  E3  read by renderEffect headers ${e3.stream.headersAt}ms  marker ${e3.stream.markerAt}ms  done ${e3.stream.doneAt}ms`);
	say(
		`  delta    headers +${e3.stream.headersAt - c.stream.headersAt}ms  marker +${
			e3.stream.markerAt - c.stream.markerAt
		}ms  done +${e3.stream.doneAt - c.stream.doneAt}ms   (the pending source sleeps 150ms)`,
	);

	await runProbe(browser, "E4", {
		settle: 700,
		drive: async ({ page, say, stream }) => {
			say(
				`  [stream] fallback shipped: ${stream.fallbackAt !== null} — child in first body: ${stream.body.includes(
					"child-data",
				)}`,
			);
			const child = await page.textContent("#child").catch(() => null);
			say(`  [dom] #child after settle = ${JSON.stringify(child)}`);
		},
	});

	await runProbe(browser, "E5", {
		settle: 600,
		ssrWait: 500, // outlast the 200ms async body — does it log at all?
		drive: async ({ say, sleep, page }) => {
			say("  --- E5: waiting past the 200ms async body, re-reading ---");
			await sleep(400);
			renderClientLog(await page.evaluate(() => window.__PROBE));
		},
	});
} finally {
	await browser.close();
	await server.close();
	realLog(out.join("\n"));
}
