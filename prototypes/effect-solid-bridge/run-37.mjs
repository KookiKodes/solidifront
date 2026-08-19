/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #37.
 *
 * Same driver shape as run-30.mjs (host the Vite dev server in-process so
 * `[SSR]` lines land on this stdout, then drive chrome-headless-shell), with
 * two additions #37 needs:
 *
 *   1. The raw HTML is scanned for `_$HY.r` writes, so "did the marker reach
 *      the wire" is answerable without a browser, and independently of whether
 *      the client half read it correctly.
 *   2. Every probe is clicked twice after settling. The whole point of
 *      suppress-ONCE over suppress-always is that runs #2 and #3 still fire, so
 *      a probe that only reports run #1 has not been measured.
 *
 *   node run-37.mjs
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const PORT = 5197;
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

async function timeStream(name) {
	const t0 = Date.now();
	const res = await fetch(`${BASE}/?probe=${name}`, {
		headers: { accept: "text/html,application/xhtml+xml" },
	});
	const headersAt = Date.now() - t0;
	let body = "";
	let markerAt = null;
	const chunks = [];
	const reader = res.body.getReader();
	const dec = new TextDecoder();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		body += dec.decode(value, { stream: true });
		chunks.push({ at: Date.now() - t0, bytes: value.byteLength });
		if (markerAt === null && body.includes('id="marker"')) markerAt = chunks.at(-1).at;
	}
	return { headersAt, chunks, markerAt, doneAt: chunks.length ? chunks.at(-1).at : headersAt, body };
}

/**
 * Everything the server pushed into the hydration payload. seroval emits
 * `_$HY.r["<id>"]=<value>` (and `$R[...]` forms); this is deliberately a dumb
 * scrape — it reports what is on the wire, not what Solid meant by it.
 */
function scrapeHydrationWrites(html) {
	const hits = [];
	const re = /_\$HY\.r\[([^\]]{1,80})\]\s*=\s*([^;<]{0,60})/g;
	for (const m of html.matchAll(re)) hits.push(`${m[1]} = ${m[2].trim()}`);
	const re2 = /\$R\[([^\]]{1,40})\]\s*=\s*([^;<]{0,60})/g;
	for (const m of html.matchAll(re2)) hits.push(`$R[${m[1]}] = ${m[2].trim()}`);
	return hits;
}

function renderClientLog(p, indent = "    ") {
	if (!p) {
		say(`${indent}(no __PROBE — the client bundle never ran)`);
		return;
	}
	const rows = [
		...p.log.map((e) => ({ ...e, kind: "log" })),
		...Object.entries(p.marks ?? {}).map(([name, seq]) => ({ seq, name, kind: "mark" })),
	].sort((a, b) => a.seq - b.seq);
	for (const r of rows) {
		if (r.kind === "mark") say(`${indent}---------- ${r.name} ----------`);
		else say(`${indent}[${r.channel}] ${r.message}`);
	}
	if (!rows.length) say(`${indent}(client log empty)`);
}

async function runProbe(browser, name, { drive, settle = 400, ssrWait = 0 } = {}) {
	banner(name);

	ssrBucket = [];
	const stream = await timeStream(name);
	if (ssrWait) await sleep(ssrWait);
	const rawSsr = ssrBucket;
	say("  --- SSR (raw fetch, no browser) ---");
	if (rawSsr.length) {
		const base = rawSsr[0].at;
		for (const e of rawSsr) say(`    +${e.at - base}ms ${e.line}`);
	} else say("    (nothing logged server-side)");

	say("  --- hydration payload on the wire ---");
	const writes = scrapeHydrationWrites(stream.body);
	if (writes.length) for (const w of writes) say(`    ${w}`);
	else say("    (no _$HY.r writes in the document)");
	say(
		`  --- stream: headers ${stream.headersAt}ms  marker ${
			stream.markerAt === null ? "NEVER" : `${stream.markerAt}ms`
		}  done ${stream.doneAt}ms (${stream.body.length}B) ---`,
	);

	ssrBucket = [];
	const context = await browser.newContext();
	const page = await context.newPage();
	const consoleLines = [];
	page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
	page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
	await page.goto(`${BASE}/?probe=${name}`, { waitUntil: "load" });
	await sleep(settle);

	const p = await page.evaluate(() => window.__PROBE ?? null);
	say(`  --- CLIENT (hydration) — dev build: ${p?.devBuild} ---`);
	renderClientLog(p);

	if (p?.diagnostics?.length) {
		say("  --- Solid diagnostics ---");
		for (const d of p.diagnostics)
			say(`    [${d.code}] ${d.message.replace(/^\[[A-Z_]+\]\s*/, "").slice(0, 160)}`);
	} else say("  --- Solid diagnostics: none ---");

	const unclaimed = consoleLines.filter((l) => l.includes("unclaimed"));
	say(
		`  --- unclaimed-node warnings: ${unclaimed.length ? unclaimed.join(" | ") : "none"} ---`,
	);
	if (consoleLines.length) {
		say("  --- browser console / page errors ---");
		for (const l of consoleLines) say(`    ${l.slice(0, 190)}`);
	}

	await drive?.({ page, say, sleep, stream });
	await context.close();
	return { stream, p };
}

/** The suppress-ONCE assertion: after two clicks, runs #2 and #3 must fire. */
const clickTwice = async ({ page, say, sleep }) => {
	say("  --- after two clicks (does the boundary still fire?) ---");
	await page.click("#bump");
	await sleep(120);
	await page.click("#bump");
	await sleep(180);
	renderClientLog(await page.evaluate(() => window.__PROBE), "    ");
};

// ---------------------------------------------------------------------- main
const server = await createServer({
	root: new URL(".", import.meta.url).pathname,
	logLevel: "warn",
});
await server.listen(PORT);
const browser = await chromium.launch({ executablePath: findHeadlessShell() });

try {
	await runProbe(browser, "D0", { drive: clickTwice });
	await runProbe(browser, "D1");
	await runProbe(browser, "D2", { drive: clickTwice });
	await runProbe(browser, "D3", { drive: clickTwice });

	await runProbe(browser, "D3B");

	await runProbe(browser, "D4", {
		drive: async ({ page, say, sleep }) => {
			say("  --- D4: mounting the late boundary (no server counterpart) ---");
			await page.click("#mount");
			await sleep(200);
			renderClientLog(await page.evaluate(() => window.__PROBE), "    ");
			const late = await page.textContent("#late").catch(() => null);
			say(`  [dom] #late = ${JSON.stringify(late)}`);
		},
	});

	await runProbe(browser, "D5", { drive: clickTwice });
	await runProbe(browser, "D6S", { settle: 500, drive: clickTwice });
	await runProbe(browser, "D6", { settle: 600, drive: clickTwice });
	await runProbe(browser, "D7", { settle: 700, drive: clickTwice });
} finally {
	await browser.close();
	await server.close();
	realLog(out.join("\n"));
}
