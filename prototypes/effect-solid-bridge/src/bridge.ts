/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #8.
 *
 * The liftable bit. Everything else in this prototype is a shell around it.
 *
 * QUESTION: how does an Effect run inside Solid 2 reactivity, given that Solid
 * tracks dependencies synchronously and `Effect.gen` is a generator that
 * suspends?
 *
 * CLAIM UNDER TEST: Solid 2's mandatory `createEffect(compute, effectFn)` split
 * *is* the bridge. `compute` reads signals synchronously (tracked); `effectFn`
 * receives plain values and runs the Effect (untracked, async, interruptible).
 * Reading a signal inside `effectFn` is the bug, and it is invisible at runtime.
 */

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import {
	createEffect,
	createSignal,
	getOwner,
	isDisposed,
	onCleanup,
} from "@solidjs/signals";

/**
 * FINDING: Solid 2's dev build raises [REACTIVE_WRITE_IN_OWNED_SCOPE] and then
 * [REACTIVITY_HALTED] — killing the whole reactive system — when a signal is
 * written from inside an owned scope. Writing an Effect's result into a signal
 * from the effect phase is exactly that. `ownedWrite` is the sanctioned opt-in,
 * declared per-signal at creation. Prod does NOT check, so this is invisible
 * until you run a dev build.
 */
const OWNED = { ownedWrite: true } as const;

export type Log = (channel: string, message: string) => void;

export type Resource<A, E> = {
	readonly value: () => A | undefined;
	readonly error: () => E | undefined;
	readonly pending: () => boolean;
	/** How many times the tracked compute phase has re-run. */
	readonly runs: () => number;
};

/**
 * The proposed primitive.
 *
 * `track` is the tracked, synchronous read phase — it must read every reactive
 * input and return them as plain values. `make` turns those plain values into
 * an Effect. `make` never sees a signal, which is what makes the dependency
 * edges impossible to lose.
 */
export function createEffectResource<Input, A, E>(
	track: () => Input,
	make: (input: Input) => Effect.Effect<A, E>,
	log: Log,
): Resource<A, E> {
	const [value, setValue] = createSignal<A | undefined>(undefined, OWNED);
	const [error, setError] = createSignal<E | undefined>(undefined, OWNED);
	const [pending, setPending] = createSignal(false, OWNED);
	const [runs, setRuns] = createSignal(0, OWNED);

	// Generation counter: the guard against a stale response landing after a
	// newer one. Incremented in the effect phase, captured per run.
	let generation = 0;

	// FINDING (probe-cleanup.ts): `onCleanup` registered inside the effect phase
	// does NOT run between runs — every registration accumulates on the effect's
	// owner and fires only at disposal, FIFO. So per-run interruption cannot be
	// expressed with onCleanup. We interrupt the previous fiber explicitly at the
	// top of each run, and register exactly ONE onCleanup, here, for disposal.
	let inFlight: Fiber.Fiber<unknown, unknown> | undefined;
	const interruptInFlight = (why: string) => {
		if (!inFlight) return;
		log("interrupt", `${why} — interrupting in-flight fiber`);
		const f = inFlight;
		inFlight = undefined;
		Effect.runFork(Fiber.interrupt(f));
	};
	onCleanup(() => interruptInFlight("owner disposed"));

	createEffect(
		() => {
			// TRACKED PHASE — synchronous, no awaits, no yields.
			const input = track();
			log("track", `read inputs synchronously: ${JSON.stringify(input)}`);
			return input;
		},
		(input: Input) => {
			// EFFECT PHASE — untracked. Reading a signal here creates no edge.
			interruptInFlight(`superseded by run #${generation + 1}`);
			const mine = ++generation;
			const owner = getOwner();
			setRuns((n) => n + 1);
			setPending(true);

			const fiber = Effect.runFork(make(input));
			inFlight = fiber as Fiber.Fiber<unknown, unknown>;

			fiber.addObserver((exit) => {
				if (inFlight === (fiber as unknown)) inFlight = undefined;
				// Two independent staleness guards, and both are load-bearing:
				//  1. a newer run superseded this one
				//  2. the owning computation was disposed while we were in flight
				if (mine !== generation) {
					log("stale", `run #${mine} finished after #${generation} — dropped`);
					return;
				}
				if (owner && isDisposed(owner)) {
					log("disposed", `run #${mine} finished after owner disposal — dropped`);
					return;
				}
				setPending(false);
				if (Exit.isSuccess(exit)) {
					setValue(() => exit.value as A);
					log("resolve", `run #${mine} → ${JSON.stringify(exit.value)}`);
				} else {
					setError(() => exit.cause as unknown as E);
					log("reject", `run #${mine} failed or was interrupted`);
				}
			});

		},
	);

	return { value, error, pending, runs };
}

/**
 * The deliberately-wrong version, kept for contrast.
 *
 * Reads the signal *inside* the Effect, after a yield. Solid registers no
 * dependency, so the computation never re-runs when the signal changes. It
 * looks correct on first render, which is what makes it dangerous.
 */
export function createEffectResourceNaive<A, E>(
	readSignalInsideEffect: () => unknown,
	make: (input: unknown) => Effect.Effect<A, E>,
	log: Log,
): Resource<A, E> {
	const [value, setValue] = createSignal<A | undefined>(undefined, OWNED);
	const [runs, setRuns] = createSignal(0, OWNED);

	createEffect(
		() => {
			// Tracks NOTHING — the compute phase reads no signals at all.
			log("track", "compute phase read no signals — zero dependency edges");
			return undefined;
		},
		() => {
			setRuns((n) => n + 1);
			Effect.runFork(
				Effect.gen(function* () {
					yield* Effect.sleep("10 millis"); // the async gap
					const late = readSignalInsideEffect(); // too late to be tracked
					log("track-late", `read signal AFTER the gap: ${JSON.stringify(late)}`);
					const a = yield* make(late);
					setValue(() => a);
					log("resolve", `naive run → ${JSON.stringify(a)}`);
				}),
			);
		},
	);

	return { value, error: () => undefined, pending: () => false, runs };
}
