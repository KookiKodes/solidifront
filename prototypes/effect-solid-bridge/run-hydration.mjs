/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * Drives the probes in a REAL browser against a REAL streaming-SSR + hydrating
 * app. Hosts the Vite dev server in-process (so `[SSR]` log lines land on this
 * process's stdout and can be attributed to the request that produced them),
 * then drives chrome-headless-shell over CDP via playwright-core.
 *
 * One page load per probe: `haltReactivity()` is a module-level latch with no
 * public reset, so a halt in one probe would decide the next probe's result.
 *
 *   node run-hydration.mjs
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { createServer } from "vite";

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;

// ---------------------------------------------------------------- browser
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
// The dev server renders in this process, so probe-log.ts's `[SSR]` lines come
// out of this console. Tee them into a bucket keyed by the probe in flight.
let ssrBucket = [];
const realLog = console.log.bind(console);
console.log = (...args) => {
	const line = args.map(String).join(" ");
	if (line.startsWith("[SSR]")) ssrBucket.push(line.slice(6));
	else realLog(...args);
};

// -------------------------------------------------------------------- output
const out = [];
const say = (s = "") => out.push(s);
const banner = (s) => {
	say("");
	say(`=== ${s} ===`);
};
const bullet = (channel, msg) => say(`  [${channel}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Render the client-side log with the hydrate() window drawn in. */
function renderClientLog(p) {
	if (!p) {
		say("    (no __PROBE — the client bundle never ran)");
		return;
	}
	const marks = Object.entries(p.marks ?? {}).map(([name, seq]) => ({
		seq,
		name,
	}));
	const rows = [
		...p.log.map((e) => ({ ...e, kind: "log" })),
		...marks.map((m) => ({ ...m, kind: "mark" })),
	].sort((a, b) => a.seq - b.seq);
	for (const r of rows) {
		if (r.kind === "mark") say(`    ---------- ${r.name} ----------`);
		else bullet(r.channel, r.message);
	}
	if (!rows.length) say("    (client log empty)");
}

async function runProbe(browser, name, drive) {
	banner(name);
	ssrBucket = [];
	const context = await browser.newContext();
	const page = await context.newPage();
	const consoleLines = [];
	page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
	page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));

	await page.goto(`${BASE}/?probe=${name}`, { waitUntil: "load" });
	await sleep(250);

	say("  --- SSR (server render) ---");
	if (ssrBucket.length) for (const l of ssrBucket) say(`  ${l}`);
	else say("    (nothing logged server-side)");

	const p = await page.evaluate(() => window.__PROBE ?? null);
	say(`  --- CLIENT (hydration) — dev build: ${p?.devBuild} ---`);
	if (p) renderClientLog(p);
	else say("    (no __PROBE — the client bundle never ran)");

	if (p?.diagnostics?.length) {
		say("  --- Solid diagnostics ---");
		for (const d of p.diagnostics)
			bullet(d.code, d.message.replace(/^\[[A-Z_]+\]\s*/, "").slice(0, 130));
	} else say("  --- Solid diagnostics: none ---");

	if (consoleLines.length) {
		say("  --- browser console / page errors ---");
		for (const l of consoleLines) say(`    ${l.slice(0, 190)}`);
	}

	await drive?.({ page, say, bullet, sleep });

	await context.close();
}

/** Is the page still reactive? Click #bump and see whether the DOM moves. */
async function interactivityCheck(page, say, label) {
	const before = await page.textContent("#clicks").catch(() => null);
	await page.click("#bump").catch(() => {});
	await sleep(120);
	const after = await page.textContent("#clicks").catch(() => null);
	const ticks = await page.textContent("#ticks").catch(() => null);
	say(
		`  [interactivity] ${label}: clicks ${before} -> ${after}, ticks=${ticks} — ` +
			(before !== after ? "STILL REACTIVE" : "FROZEN (reactivity dead)"),
	);
	return before !== after;
}

// ---------------------------------------------------------------------- main
const server = await createServer({
	root: new URL(".", import.meta.url).pathname,
	logLevel: "warn",
});
await server.listen(PORT);

const browser = await chromium.launch({ executablePath: findHeadlessShell() });

try {
	await runProbe(browser, "S1", async ({ page, say }) => {
		const marker = await page.textContent("#marker").catch(() => null);
		say(`  [dom] #marker = ${JSON.stringify(marker)}`);
	});

	await runProbe(browser, "H0", async ({ page, say }) => {
		await interactivityCheck(page, say, "after a component-body write");
	});

	await runProbe(browser, "H0B", async ({ page, say }) => {
		await interactivityCheck(page, say, "after a compute-phase write");
	});

	await runProbe(browser, "H1", async ({ page, say }) => {
		await interactivityCheck(page, say, "after the mid-hydration violation");
	});

	await runProbe(browser, "H1B", async ({ page, say }) => {
		say("  [driver] clicking #bump — this is the run that writes");
		const alive1 = await interactivityCheck(page, say, "the violating click");
		const alive2 = await interactivityCheck(page, say, "the click after it");
		say(
			`  [verdict] post-hydration violation left the app ${
				alive2 ? "reactive" : "frozen"
			} (first click registered: ${alive1})`,
		);
	});

	await runProbe(browser, "H2", async ({ page, say }) => {
		const ticks = await page.textContent("#ticks").catch(() => null);
		const asyncv = await page.textContent("#async").catch(() => null);
		say(`  [dom] ticks=${ticks} async=${JSON.stringify(asyncv)}`);
		await interactivityCheck(page, say, "after the sanctioned writes");
	});

	await runProbe(browser, "H4", async ({ page, say }) => {
		const ticks = await page.textContent("#ticks").catch(() => null);
		const asyncv = await page.textContent("#async").catch(() => null);
		say(`  [dom] ticks=${ticks} async=${JSON.stringify(asyncv)}`);
		await interactivityCheck(page, say, "after unowned writes");
	});

	await runProbe(browser, "H3", async ({ page, say }) => {
		const child = await page.$("#child");
		say(`  [dom] #child present after disposal: ${child !== null}`);
		await sleep(500); // outlast the fiber's 400ms sleep
		const p = await page.evaluate(() => window.__PROBE);
		say("  --- log after the fiber's sleep would have elapsed ---");
		renderClientLog(p);
	});
} finally {
	await browser.close();
	await server.close();
	realLog(out.join("\n"));
}
