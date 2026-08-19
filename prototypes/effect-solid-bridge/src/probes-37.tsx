/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #37.
 *
 * QUESTION: can the imperative boundary dedupe its server-side effect run
 * against its client-side one, and what keys the two together?
 *
 * #30 forced the direction (server wins, client suppresses its first run) and
 * left the mechanism unverified. Reading `solid-js/dist/{server,dev}.js` before
 * writing these probes turned up four things #37 did not know:
 *
 *   1. `createUniqueId()` IS `getNextChildId(getOwner())` in BOTH builds — the
 *      same allocator hydration ids come from. So a boundary can mint its own
 *      key from the id scheme without reading any effect's id, and the
 *      allocation is symmetric by construction as long as it is unconditional.
 *   2. The serialization channel Solid uses for memos/signals/stores is
 *      `sharedConfig.context.serialize(id, value)` (server) →
 *      `sharedConfig.has(id)` / `.load(id)` (client), landing in `_$HY.r`.
 *      Both halves are reachable from library code, and `id` is just a string.
 *   3. `serverEffect` only calls `processResult` — the thing that serializes —
 *      when `ssrSource` is set; and `processResult` serializes only THENABLE
 *      or async-iterable results. A sync compute value is never serialized.
 *   4. On the client, `hydratedEffect` special-cases `ssrSource: "client"`
 *      only; every other mode routes the COMPUTE through
 *      `readSerializedOrCompute`, which skips it entirely when a value was
 *      serialized under the effect's own id. So "did the server run this?" may
 *      be answerable from whether the client's own compute ran — no marker of
 *      our own, no key of our own.
 *
 * Probes D0-D6 price those. Every probe is its own page load, per the #22
 * convention (a halt is process-wide and permanent).
 */

import {
	createMemo,
	createRenderEffect,
	createSignal,
	createUniqueId,
	getOwner,
	Show,
	sharedConfig,
} from "solid-js";
import { log } from "./probe-log.ts";

/* ------------------------------------------------------------------ util --
 * The two halves of the candidate channel. Deliberately NOT wrapped in an
 * `isServer` branch: `sharedConfig.context` exists only server-side and
 * `sharedConfig.has` only while hydrating, so a feature check does the work
 * an environment branch would — which is the shape #13/#30 want anyway.
 * ------------------------------------------------------------------------ */

type ServerCtx = { serialize?: (id: string, value: unknown) => void };

/** Server half: record "this boundary already fired" under `key`. */
function writeMarker(key: string, value: unknown = 1): string {
	const ctx = (sharedConfig as { context?: ServerCtx }).context;
	if (!ctx?.serialize) return "no-serialize-fn";
	try {
		ctx.serialize(key, value);
		return "written";
	} catch (e) {
		return `THREW: ${String(e)}`;
	}
}

/** Client half: did the server record a run under `key`? */
function readMarker(key: string): { has: boolean; value: unknown } {
	const has = typeof sharedConfig.has === "function" && sharedConfig.has(key);
	return { has, value: has ? sharedConfig.load?.(key) : undefined };
}

const ownerId = () => (getOwner() as { id?: string } | null)?.id ?? "(none)";

/* -------------------------------------------------------------------- D0 --
 * CONTROL. The #30 double-fire, with ids logged. Nothing dedupes. Everything
 * below is read against this: same JSX, same effect, same click sequence.
 * ------------------------------------------------------------------------ */
export function ProbeD0() {
	const [clicks, setClicks] = createSignal(0);
	log("D0", `body: owner.id=${ownerId()}`);
	let n = 0;
	createRenderEffect(
		() => {
			log("D0", `COMPUTE (owner.id=${ownerId()})`);
			return clicks();
		},
		((v: number) => {
			log("D0", `FIRED run #${++n} (clicks=${v}) owner.id=${ownerId()}`);
		}) as never,
	);
	return shell("D0", setClicks, clicks);
}

/* -------------------------------------------------------------------- D1 --
 * IS THERE A STABLE KEY, AND WHERE CAN IT BE READ? Three questions in one
 * component:
 *   (a) does `createUniqueId()` return the same string in both environments,
 *   (b) does an effect's OWN id line up across environments,
 *   (c) can it be read from inside the phases at all — #22 found the effect
 *       phase establishes no owner, so `getOwner()` there is the flusher's.
 * Two ids are minted before the effect and one after, so a shift shows up as
 * a mismatch on the LATER one rather than silently.
 * ------------------------------------------------------------------------ */
export function ProbeD1() {
	const [clicks, setClicks] = createSignal(0);
	log("D1", `body: owner.id=${ownerId()}`);
	log("D1", `createUniqueId #1 = ${createUniqueId()}`);
	log("D1", `createUniqueId #2 = ${createUniqueId()}`);

	createRenderEffect(
		() => {
			log("D1", `COMPUTE  owner.id=${ownerId()}`);
			return clicks();
		},
		((v: number) => {
			log("D1", `EFFECT   owner.id=${ownerId()} (clicks=${v})`);
		}) as never,
	);

	log("D1", `createUniqueId #3 (after the effect) = ${createUniqueId()}`);
	return shell("D1", setClicks, clicks);
}

/* -------------------------------------------------------------------- D2 --
 * CANDIDATE 1 — hydration-id-keyed marker. `createUniqueId()` mints the key
 * symmetrically; the server writes a marker under it from the effect phase;
 * the client reads it AT CREATION and suppresses run #1 only.
 *
 * The read has to happen at creation, not inside the effect fn: by the time
 * the effect phase runs the client is past hydration and `sharedConfig.has`
 * may be gone. Clicking twice afterwards proves the boundary still tracks.
 * ------------------------------------------------------------------------ */
export function ProbeD2() {
	const [clicks, setClicks] = createSignal(0);
	const key = createUniqueId();
	const seen = readMarker(key);
	log(
		"D2",
		`key=${key} serverAlreadyFired=${seen.has} value=${String(seen.value)}`,
	);

	let n = 0;
	let suppressed = false;
	createRenderEffect(() => clicks(), ((v: number) => {
		n += 1;
		if (n === 1 && seen.has) {
			suppressed = true;
			log("D2", `SUPPRESSED run #1 (clicks=${v}) — server already fired`);
			return;
		}
		log("D2", `FIRED run #${n} (clicks=${v}) suppressedEarlier=${suppressed}`);
		if (n === 1) log("D2", `marker write: ${writeMarker(key)}`);
	}) as never);
	return shell("D2", setClicks, clicks);
}

/* -------------------------------------------------------------------- D3 --
 * CANDIDATE 2 — consumer-supplied identity. Identical to D2 except the key is
 * a literal the call site chose, so nothing touches Solid's id scheme. If an
 * arbitrary string round-trips, this candidate is implementable with no
 * dependency on hydration ids at all — the cost is purely ergonomic.
 * ------------------------------------------------------------------------ */
const D3_KEY = "solidifront:page-view";
export function ProbeD3() {
	const [clicks, setClicks] = createSignal(0);
	const seen = readMarker(D3_KEY);
	log(
		"D3",
		`key=${D3_KEY} serverAlreadyFired=${seen.has} value=${String(seen.value)}`,
	);

	let n = 0;
	createRenderEffect(() => clicks(), ((v: number) => {
		n += 1;
		if (n === 1 && seen.has) {
			log("D3", `SUPPRESSED run #1 (clicks=${v})`);
			return;
		}
		log("D3", `FIRED run #${n} (clicks=${v})`);
		if (n === 1) log("D3", `marker write: ${writeMarker(D3_KEY, "fired")}`);
	}) as never);
	return shell("D3", setClicks, clicks);
}

/* ------------------------------------------------------------------- D3B --
 * THE COST OF CANDIDATE 2. A consumer-supplied key is a name in a GLOBAL
 * namespace, so two instances of the same boundary in one document share it.
 * This renders the literal-keyed boundary twice and the `createUniqueId()`
 * boundary twice, in the same page, so the two candidates are read against
 * each other rather than against an argument.
 * ------------------------------------------------------------------------ */
function keyedBoundary(channel: string, label: string, key: string) {
	const seen = readMarker(key);
	let n = 0;
	createRenderEffect(() => 0, (() => {
		n += 1;
		if (n === 1 && seen.has) {
			log(channel, `${label} (key=${key}) SUPPRESSED run #1`);
			return;
		}
		log(channel, `${label} (key=${key}) FIRED run #${n}`);
		if (n === 1) log(channel, `${label} write: ${writeMarker(key)}`);
	}) as never);
}

export function ProbeD3Twice() {
	// Literal key, twice — both instances name the same slot.
	keyedBoundary("D3B", "literal A", "solidifront:page-view");
	keyedBoundary("D3B", "literal B", "solidifront:page-view");
	// createUniqueId, twice — each instance mints its own slot.
	keyedBoundary("D3B", "unique A", createUniqueId());
	keyedBoundary("D3B", "unique B", createUniqueId());
	return (
		<main>
			<h1>D3B — two instances, one key</h1>
			<p id="marker">rendered</p>
		</main>
	);
}

/* -------------------------------------------------------------------- D4 --
 * THE NO-SERVER-RUN CASE. A boundary the server never rendered, mounted after
 * hydration — the client-side-navigation shape. Two hazards:
 *   (a) it must FIRE (a dedup keyed on "the server fired" must not suppress a
 *       first run that had no server counterpart), and
 *   (b) its `createUniqueId()` must not collide with a key the server DID
 *       serialize for some other boundary earlier in the document.
 * The `<Show>` is opened from the driver by clicking #mount, so the server
 * genuinely renders the fallback branch and the client genuinely allocates
 * this subtree's ids fresh.
 * ------------------------------------------------------------------------ */
function LateBoundary() {
	const key = createUniqueId();
	const seen = readMarker(key);
	log("D4", `late boundary key=${key} serverAlreadyFired=${seen.has}`);
	let n = 0;
	createRenderEffect(() => 0, (() => {
		n += 1;
		if (n === 1 && seen.has) {
			log("D4", "late boundary SUPPRESSED run #1 — FALSE POSITIVE");
			return;
		}
		log("D4", `late boundary FIRED run #${n}`);
	}) as never);
	// The same late mount, but keyed the candidate-2 way. The eager boundary
	// above already wrote this literal server-side, so if the literal key is
	// what identifies a boundary, this one suppresses a run that never had a
	// server counterpart — the false positive candidate 1 has to avoid too.
	const seenLiteral = readMarker(D4_LITERAL_KEY);
	log("D4", `late literal-keyed serverAlreadyFired=${seenLiteral.has}`);
	let m = 0;
	createRenderEffect(() => 0, (() => {
		m += 1;
		if (m === 1 && seenLiteral.has) {
			log("D4", "late literal-keyed SUPPRESSED run #1 — FALSE POSITIVE");
			return;
		}
		log("D4", `late literal-keyed FIRED run #${m}`);
	}) as never);
	return <p id="late">late</p>;
}

const D4_LITERAL_KEY = "solidifront:d4-literal";

export function ProbeD4() {
	const [mounted, setMounted] = createSignal(false);
	// An eager boundary FIRST, so the server writes at least one marker into
	// `_$HY.r` before the late one allocates its key — that is what makes a
	// collision possible at all.
	const eagerKey = createUniqueId();
	const eagerSeen = readMarker(eagerKey);
	log("D4", `eager key=${eagerKey} serverAlreadyFired=${eagerSeen.has}`);
	let n = 0;
	createRenderEffect(() => 0, (() => {
		n += 1;
		if (n === 1 && eagerSeen.has) {
			log("D4", "eager SUPPRESSED run #1");
			return;
		}
		log("D4", `eager FIRED run #${n}`);
		if (n === 1) {
			log("D4", `eager marker write: ${writeMarker(eagerKey)}`);
			// Also claim the literal key, so the late literal-keyed boundary
			// below has something to falsely match against.
			log("D4", `eager literal write: ${writeMarker(D4_LITERAL_KEY)}`);
		}
	}) as never);

	return (
		<main>
			<h1>D4 — a boundary the server never rendered</h1>
			<button id="mount" type="button" onClick={() => setMounted(true)}>
				mount
			</button>
			<Show when={mounted()}>
				<LateBoundary />
			</Show>
			<p id="marker">rendered</p>
		</main>
	);
}

/* -------------------------------------------------------------------- D5 --
 * CANDIDATE 3 — no cross-environment dedup; the server run is the only run.
 * The client's effect phase is suppressed PERMANENTLY rather than once. The
 * question is not whether it works (it trivially does) but what it costs: does
 * the compute keep tracking, does disposal still run cleanups, and is the
 * resulting primitive still usable for anything that re-fires. Clicking twice
 * is the whole measurement.
 * ------------------------------------------------------------------------ */
export function ProbeD5() {
	const [clicks, setClicks] = createSignal(0);
	// "Am I the environment that renders?" without an `isServer` import — the
	// same feature check the write half uses.
	const isServerEnv = !!(sharedConfig as { context?: ServerCtx }).context;
	log("D5", `isServerEnv=${isServerEnv}`);
	let computes = 0;
	let n = 0;
	createRenderEffect(
		() => {
			computes += 1;
			log("D5", `COMPUTE #${computes}`);
			return clicks();
		},
		((v: number) => {
			if (!isServerEnv) {
				log("D5", `effect phase suppressed permanently (clicks=${v})`);
				return;
			}
			log("D5", `FIRED run #${++n} (clicks=${v})`);
		}) as never,
	);
	return shell("D5", setClicks, clicks);
}

/* -------------------------------------------------------------------- D6 --
 * CANDIDATE 1' — THE COMPUTE'S OWN SERIALIZED VALUE AS THE MARKER. No key of
 * our own and no write of our own: with an explicit `ssrSource`, `serverEffect`
 * runs `processResult`, which serializes under the EFFECT'S own owner id; on
 * the client `readSerializedOrCompute` then skips the compute for run #1 and
 * adopts that value. So "did the compute run?" answers "did the server run?".
 *
 * Two variants because `processResult` only serializes thenables:
 *   D6  — compute returns a Promise (should serialize)
 *   D6S — compute returns a sync value (should NOT serialize)
 * If D6S adopts anyway, the read of the source was wrong; if D6 holds the
 * document, this candidate carries E3's +149ms and is disqualified on cost.
 * ------------------------------------------------------------------------ */
function d6Body(label: string, async: boolean) {
	const [clicks, setClicks] = createSignal(0);
	let computes = 0;
	let n = 0;
	createRenderEffect(
		() => {
			computes += 1;
			log(label, `COMPUTE #${computes} (owner.id=${ownerId()})`);
			return async ? Promise.resolve(clicks()) : clicks();
		},
		((v: unknown) => {
			n += 1;
			const computeRanThisTime = computes >= n;
			log(
				label,
				`EFFECT run #${n} value=${String(v)} computes-so-far=${computes} computeRan=${computeRanThisTime}`,
			);
		}) as never,
		{ ssrSource: "server" } as never,
	);
	return shell(label, setClicks, clicks);
}
export function ProbeD6() {
	return d6Body("D6", true);
}
export function ProbeD6Sync() {
	return d6Body("D6S", false);
}

/* -------------------------------------------------------------------- D7 --
 * DOES THE MARKER SURVIVE A STREAMED, LATE-RESOLVING DOCUMENT? #27 found the
 * response headers commit at shell flush and a later write throws. The
 * serializer is a different channel and streams its own script tags, but that
 * is a claim until measured: this boundary sits behind a memo that resolves
 * after the shell has flushed, so its marker is written late.
 * ------------------------------------------------------------------------ */
export function ProbeD7() {
	const [clicks, setClicks] = createSignal(0);
	const key = createUniqueId();
	const seen = readMarker(key);
	log("D7", `key=${key} serverAlreadyFired=${seen.has}`);
	const slow = createMemo(async () => {
		await new Promise((r) => setTimeout(r, 150));
		return "late";
	});
	let n = 0;
	createRenderEffect(
		() => {
			// Reading the pending memo in a render-effect compute is #30's E3
			// shape — it holds the shell. That is the point: it forces the
			// marker write to happen AFTER the shell would otherwise flush.
			return `${slow()}:${clicks()}`;
		},
		((v: string) => {
			n += 1;
			if (n === 1 && seen.has) {
				log("D7", `SUPPRESSED run #1 (v=${v})`);
				return;
			}
			log("D7", `FIRED run #${n} (v=${v})`);
			if (n === 1) log("D7", `late marker write: ${writeMarker(key)}`);
		}) as never,
	);
	return shell("D7", setClicks, clicks);
}

/* ------------------------------------------------------------------------ */
function shell(
	label: string,
	setClicks: (f: (c: number) => number) => void,
	clicks: () => number,
) {
	return (
		<main>
			<h1>{label}</h1>
			<button id="bump" type="button" onClick={() => setClicks((c) => c + 1)}>
				bump
			</button>
			<p>
				clicks: <span id="clicks">{clicks()}</span>
			</p>
			<p id="marker">rendered</p>
		</main>
	);
}
