/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * QUESTION: does the imperative Effect↔Solid boundary (#8) behave the same
 * during SSR and hydration as it did headless?
 *
 * Three sub-questions, one probe component each — plus one that #22 did not
 * ask but that #13 §10's "isomorphic" claim depends on (S1).
 *
 * Every probe is its own PAGE LOAD, deliberately. `haltReactivity()` sets a
 * module-level flag that is never cleared outside Solid's internal test hook,
 * so a halt is process-wide and permanent: two probes on one page would mean
 * the first halt decides the second probe's result.
 *
 * All imports come from `solid-js`, never `@solidjs/signals` — the two have
 * different server builds and only `solid-js` resolves to the server one under
 * SSR. (src/bridge.ts, #8's artifact, imports @solidjs/signals and is therefore
 * client-only; the async bridge is re-stated inline here rather than shared.)
 */

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import {
	createEffect,
	createRenderEffect,
	createSignal,
	getOwner,
	isDisposed,
	onCleanup,
	Show,
} from "solid-js";
import { log, probe } from "./probe-log.ts";

const OWNED = { ownedWrite: true } as const;

/* ------------------------------------------------------------------ H0 --
 * THE CONTROL. Everything else in this file is worthless without it.
 *
 * H1/H2 came back clean, which could mean either "effect-phase writes are
 * fine" or "the dev guard isn't running in this build". H0 writes a signal
 * from a place that is unambiguously an owned scope — a component body — so a
 * clean H0 means the guard is dead and every other result is void.
 * ------------------------------------------------------------------------ */
export function ProbeH0() {
	const [clicks, setClicks] = createSignal(0);
	const [ticks, setTicks] = createSignal(0); // NO ownedWrite

	log("component-body", "writing a signal from the component body");
	try {
		setTicks(1);
		log("component-body", "write returned NORMALLY (guard did NOT fire)");
	} catch (e) {
		log("component-body", `write THREW: ${String(e).slice(0, 110)}`);
		throw e;
	}

	return (
		<main>
			<h1>H0 — control: owned-scope write from a component body</h1>
			<button id="bump" type="button" onClick={() => setClicks((c) => c + 1)}>
				bump
			</button>
			<p>
				clicks: <span id="clicks">{clicks()}</span>
			</p>
			<p>
				ticks: <span id="ticks">{ticks()}</span>
			</p>
		</main>
	);
}

/* ----------------------------------------------------------------- H0B --
 * The other half of the control: a write from the tracked COMPUTE phase of
 * createEffect, which #8 and the effect phase sit either side of.
 * ------------------------------------------------------------------------ */
export function ProbeH0Compute() {
	const [clicks, setClicks] = createSignal(0);
	const [ticks, setTicks] = createSignal(0); // NO ownedWrite

	createEffect(
		() => {
			const v = clicks();
			log("compute", "writing a signal from the COMPUTE phase");
			try {
				setTicks((t) => t + 1);
				log("compute", "write returned NORMALLY (guard did NOT fire)");
			} catch (e) {
				log("compute", `write THREW: ${String(e).slice(0, 110)}`);
				throw e;
			}
			return v;
		},
		() => log("effect-phase", "H0B effect phase ran"),
	);

	return (
		<main>
			<h1>H0B — control: owned-scope write from the compute phase</h1>
			<button id="bump" type="button" onClick={() => setClicks((c) => c + 1)}>
				bump
			</button>
			<p>
				clicks: <span id="clicks">{clicks()}</span>
			</p>
			<p>
				ticks: <span id="ticks">{ticks()}</span>
			</p>
		</main>
	);
}

/* ------------------------------------------------------------------ H1 --
 * Effect-phase signal write WITHOUT `ownedWrite`, on the effect's FIRST run —
 * i.e. as close to hydration as the effect queue allows.
 *
 * #8 found this raises [REACTIVE_WRITE_IN_OWNED_SCOPE] and then halts the
 * whole reactive system. #22 asks whether that is still what happens when it
 * lands mid-hydration, and what the user sees.
 * ------------------------------------------------------------------------ */
export function ProbeH1() {
	const [clicks, setClicks] = createSignal(0);
	const [ticks, setTicks] = createSignal(0); // NO ownedWrite — the violation

	createEffect(
		() => {
			log("compute", "H1 compute phase ran");
			return clicks();
		},
		(v: number) => {
			log("effect-phase", `H1 effect phase, clicks=${v} — writing ticks`);
			try {
				setTicks((t) => t + 1);
				log("effect-phase", "write returned NORMALLY (no throw)");
			} catch (e) {
				log("effect-phase", `write THREW: ${String(e).slice(0, 110)}`);
				throw e;
			}
		},
	);

	return (
		<main>
			<h1>H1 — effect-phase write, no ownedWrite, first run</h1>
			<button id="bump" type="button" onClick={() => setClicks((c) => c + 1)}>
				bump
			</button>
			<p>
				clicks: <span id="clicks">{clicks()}</span>
			</p>
			<p>
				ticks: <span id="ticks">{ticks()}</span>
			</p>
		</main>
	);
}

/* ----------------------------------------------------------------- H1B --
 * The control: the identical violation, but deferred past hydration. The
 * first effect run writes nothing; a click re-runs the effect, and THAT run
 * writes. Same code, same violation, different moment.
 * ------------------------------------------------------------------------ */
export function ProbeH1Late() {
	const [clicks, setClicks] = createSignal(0);
	const [ticks, setTicks] = createSignal(0); // NO ownedWrite

	createEffect(
		() => clicks(),
		(v: number) => {
			if (v === 0) {
				log("effect-phase", "H1B first run — deliberately writes nothing");
				return;
			}
			log("effect-phase", `H1B effect phase POST-hydration, clicks=${v}`);
			try {
				setTicks((t) => t + 1);
				log("effect-phase", "write returned NORMALLY (no throw)");
			} catch (e) {
				log("effect-phase", `write THREW: ${String(e).slice(0, 110)}`);
				throw e;
			}
		},
	);

	return (
		<main>
			<h1>H1B — same violation, post-hydration</h1>
			<button id="bump" type="button" onClick={() => setClicks((c) => c + 1)}>
				bump
			</button>
			<p>
				clicks: <span id="clicks">{clicks()}</span>
			</p>
			<p>
				ticks: <span id="ticks">{ticks()}</span>
			</p>
		</main>
	);
}

/* ------------------------------------------------------------------ H2 --
 * The sanctioned form: `ownedWrite: true`, written from the effect phase on
 * the first run, plus an ASYNC write landing from an Effect fiber observer
 * mid-hydration — the realistic analytics/OTEL shape from #8.
 *
 * Watching for: diagnostics, hydration-mismatch warnings (the SSR markup was
 * rendered with ticks=0 and the client immediately writes 1), and whether the
 * DOM actually reflects both writes.
 * ------------------------------------------------------------------------ */
export function ProbeH2() {
	const [clicks, setClicks] = createSignal(0);
	const [ticks, setTicks] = createSignal(0, OWNED);
	const [async_, setAsync] = createSignal("none", OWNED);

	createEffect(
		() => clicks(),
		(v: number) => {
			log("effect-phase", `H2 effect phase, clicks=${v} — sync write`);
			setTicks((t) => t + 1);
			log("effect-phase", "sync ownedWrite returned normally");

			const owner = getOwner();
			const fiber = Effect.runFork(
				Effect.map(Effect.sleep("1 millis"), () => `resolved@run${v}`),
			);
			fiber.addObserver((exit) => {
				if (owner && isDisposed(owner)) {
					log("async-write", "owner disposed — dropped");
					return;
				}
				log("async-write", "fiber settled — writing from the observer");
				if (Exit.isSuccess(exit)) setAsync(() => exit.value as string);
				log("async-write", "async ownedWrite returned normally");
			});
		},
	);

	return (
		<main>
			<h1>H2 — ownedWrite: true, sync + async, during hydration</h1>
			<button id="bump" type="button" onClick={() => setClicks((c) => c + 1)}>
				bump
			</button>
			<p>
				clicks: <span id="clicks">{clicks()}</span>
			</p>
			<p>
				ticks: <span id="ticks">{ticks()}</span>
			</p>
			<p>
				async: <span id="async">{async_()}</span>
			</p>
		</main>
	);
}

/* ------------------------------------------------------------------ H4 --
 * H2 without the `ownedWrite` opt-in anywhere. This is the shape the
 * analytics/OTEL boundary actually has — a sync write in the effect phase and
 * an async one from a fiber observer — and the question it settles is whether
 * #8's `OWNED` on every signal was ever load-bearing.
 * ------------------------------------------------------------------------ */
export function ProbeH4() {
	const [clicks, setClicks] = createSignal(0);
	const [ticks, setTicks] = createSignal(0); // NO ownedWrite
	const [async_, setAsync] = createSignal("none"); // NO ownedWrite

	createEffect(
		() => clicks(),
		(v: number) => {
			log("effect-phase", `H4 sync write, no ownedWrite (clicks=${v})`);
			try {
				setTicks((t) => t + 1);
				log("effect-phase", "sync write returned NORMALLY");
			} catch (e) {
				log("effect-phase", `sync write THREW: ${String(e).slice(0, 110)}`);
			}

			const fiber = Effect.runFork(
				Effect.map(Effect.sleep("1 millis"), () => `resolved@run${v}`),
			);
			fiber.addObserver((exit) => {
				log("async-write", "fiber observer writing, no ownedWrite");
				try {
					if (Exit.isSuccess(exit)) setAsync(() => exit.value as string);
					log("async-write", "async write returned NORMALLY");
				} catch (e) {
					log("async-write", `async write THREW: ${String(e).slice(0, 110)}`);
				}
			});
		},
	);

	return (
		<main>
			<h1>H4 — the #8 bridge shape with no ownedWrite at all</h1>
			<button id="bump" type="button" onClick={() => setClicks((c) => c + 1)}>
				bump
			</button>
			<p>
				clicks: <span id="clicks">{clicks()}</span>
			</p>
			<p>
				ticks: <span id="ticks">{ticks()}</span>
			</p>
			<p>
				async: <span id="async">{async_()}</span>
			</p>
		</main>
	);
}

/* ------------------------------------------------------------------ H3 --
 * Effect finalizers (LIFO) vs Solid cleanups (FIFO) when a subtree with an
 * in-flight fiber is disposed while hydration is still settling.
 *
 * The fiber is forked in the component body, which runs inside the hydrate()
 * pass. The driver disposes the subtree from a microtask queued the instant
 * hydrate() returns — the earliest externally reachable moment, and before the
 * fiber's 400ms sleep could resolve.
 * ------------------------------------------------------------------------ */
function H3Child() {
	onCleanup(() => log("solid-cleanup", "A — registered FIRST"));
	onCleanup(() => log("solid-cleanup", "B — registered SECOND"));

	const fiber = Effect.runFork(
		Effect.scoped(
			Effect.gen(function* () {
				yield* Effect.addFinalizer(() =>
					Effect.sync(() => log("effect-finalizer", "A — registered FIRST")),
				);
				yield* Effect.addFinalizer(() =>
					Effect.sync(() => log("effect-finalizer", "B — registered SECOND")),
				);
				log("fiber", "forked in the component body, sleeping 400ms");
				yield* Effect.sleep("400 millis");
				log("fiber", "COMPLETED — was never interrupted");
			}),
		),
	);
	fiber.addObserver((exit) =>
		log("fiber", `exit: ${exit._tag}${Exit.isSuccess(exit) ? "" : " (interrupted or failed)"}`),
	);

	onCleanup(() => {
		log("interrupt", "onCleanup interrupting the in-flight fiber");
		Effect.runFork(Fiber.interrupt(fiber));
	});
	onCleanup(() => log("solid-cleanup", "C — registered LAST"));

	return <p id="child">child alive</p>;
}

export function ProbeH3() {
	const [visible, setVisible] = createSignal(true);
	// The driver reaches in here; a component body cannot write a signal
	// itself without becoming a different violation (owned-scope write).
	probe().hide = () => {
		log("action", "disposing the hydrating subtree");
		setVisible(false);
	};

	return (
		<main>
			<h1>H3 — mid-flight disposal: finalizer vs cleanup order</h1>
			<button id="hide" type="button" onClick={() => probe().hide?.()}>
				hide
			</button>
			<Show when={visible()}>
				<H3Child />
			</Show>
		</main>
	);
}

/* ------------------------------------------------------------------ S1 --
 * Not asked by #22, but load-bearing for it: #13 §10 made the analytics/OTEL
 * code isomorphic, which presumes the effect phase runs under SSR at all.
 *
 * Reading solid/src/server/signals.ts, `createEffect` forwards `undefined` as
 * the effect function while `createRenderEffect` forwards the real one. This
 * probe checks that against the shipped build rather than the source.
 * ------------------------------------------------------------------------ */
export function ProbeS1() {
	const [n] = createSignal(1);

	createEffect(
		() => {
			log("S1", "createEffect COMPUTE ran");
			return n();
		},
		(v: number) => log("S1", `createEffect EFFECT PHASE ran (v=${v})`),
	);

	createRenderEffect(
		() => {
			log("S1", "createRenderEffect COMPUTE ran");
			return n();
		},
		(v: number) => log("S1", `createRenderEffect EFFECT PHASE ran (v=${v})`),
	);

	Effect.runFork(
		Effect.sync(() => log("S1", "a forked Effect ran (no Solid involvement)")),
	);

	return (
		<main>
			<h1>S1 — which phases run under SSR?</h1>
			<p id="marker">rendered</p>
		</main>
	);
}
