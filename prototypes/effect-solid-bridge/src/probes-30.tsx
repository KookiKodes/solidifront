/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #30.
 *
 * QUESTION: `createEffect`'s effect phase does not run under SSR (#22, probe
 * S1). Which primitive gives analytics and OTEL a server-side effect phase —
 * and should they have one at all?
 *
 * Reading `solid/src/server/signals.ts` first turned up three things the
 * ticket did not know about, so the probes are shaped around them:
 *
 *   1. `serverEffect` takes `effectFn` and runs it INLINE, synchronously, right
 *      after the compute — not after a flush. `createEffect` passes
 *      `undefined`; `createRenderEffect` passes the real one (:1393/:1401).
 *   2. `EffectOptions` already carries TWO declared client-only seams:
 *      `ssrSource: "client"` (server: `createOwner(); return` — no compute, no
 *      effect, :1304) and `transparent: true`, which the client docs call
 *      "the supported alternative to branching on hydration state". #30's third
 *      sub-question — "an environment difference with no `isServer` to name it"
 *      — may already have a first-class name.
 *   3. `defer: true` skips the initial effect run, so server-side the effect
 *      function never fires at all while the compute still tracks (:1334).
 *
 * Every probe is its own page load, per the #22 harness convention.
 */

import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import {
	createEffect,
	createMemo,
	createRenderEffect,
	createSignal,
	Loading,
} from "solid-js";
import { log } from "./probe-log.ts";

/** Deterministic pending source. 150ms is long enough to lose a race with a
 * shell flush and short enough not to hit any stream timeout. */
const SLOW_MS = 150;
function slow<T>(value: T, ms = SLOW_MS): Promise<T> {
	return new Promise((r) => setTimeout(() => r(value), ms));
}

/* ------------------------------------------------------------------ E1 --
 * THE OPTIONS MATRIX. Six variants of the same effect, one component, so the
 * server and client render identical trees and hydration ids line up.
 *
 * For each: does the COMPUTE run, does the EFFECT PHASE run — under SSR, and
 * again on the client. That table is the whole "which primitive is the seam"
 * question, and it also prices the two declared client-only seams.
 *
 * The `[body]` / `[jsx]` markers bracket the effects so ordering relative to
 * the render is readable: an inline server effect phase lands between them.
 * ------------------------------------------------------------------------ */
export function ProbeE1() {
	const [n] = createSignal(1);
	const V = (name: string) =>
		[
			() => log("E1", `${name} COMPUTE`),
			(v: number) => log("E1", `${name} EFFECT PHASE (v=${v})`),
		] as const;

	log("E1", "[body] component body — before any effect is created");

	{
		const [c, e] = V("createEffect");
		createEffect(() => {
			c();
			return n();
		}, e as never);
	}
	{
		const [c, e] = V("createRenderEffect");
		createRenderEffect(() => {
			c();
			return n();
		}, e as never);
	}
	{
		const [c, e] = V("createRenderEffect+defer");
		createRenderEffect(
			() => {
				c();
				return n();
			},
			e as never,
			{ defer: true },
		);
	}
	{
		const [c, e] = V("createRenderEffect+transparent");
		createRenderEffect(
			() => {
				c();
				return n();
			},
			e as never,
			{ transparent: true } as never,
		);
	}
	{
		const [c, e] = V("createRenderEffect+ssrSource:client");
		createRenderEffect(
			() => {
				c();
				return n();
			},
			e as never,
			{ ssrSource: "client" } as never,
		);
	}
	{
		const [c, e] = V("createEffect+ssrSource:client");
		createEffect(
			() => {
				c();
				return n();
			},
			e as never,
			{ ssrSource: "client" } as never,
		);
	}

	log("E1", "[body] component body — after all six are created");

	return (
		<main>
			<h1>E1 — which primitive/option runs an effect phase under SSR</h1>
			{(() => {
				log("E1", "[jsx] children evaluating (render continues)");
				return null;
			})()}
			<p id="marker">rendered</p>
		</main>
	);
}

/* ------------------------------------------------------------------ E2 --
 * DOUBLE FIRE. The analytics hazard nobody has priced: if the effect phase
 * runs on the server AND again on the client, one logical "page viewed" is
 * two recorded events. The counter is module-scoped per environment, so the
 * server count and the client count are read independently.
 *
 * Includes the `transparent` variant, because if `transparent` changes the
 * client's first-run behaviour under hydration (its docs say the compute runs
 * live rather than adopting the serialized server value) it changes the
 * double-fire arithmetic too.
 * ------------------------------------------------------------------------ */
let e2Plain = 0;
let e2Transparent = 0;
export function ProbeE2() {
	const [clicks, setClicks] = createSignal(0);

	createRenderEffect(() => clicks(), ((v: number) => {
		e2Plain += 1;
		log("E2", `plain renderEffect FIRED — run #${e2Plain} (clicks=${v})`);
	}) as never);

	createRenderEffect(
		() => clicks(),
		((v: number) => {
			e2Transparent += 1;
			log(
				"E2",
				`transparent renderEffect FIRED — run #${e2Transparent} (clicks=${v})`,
			);
		}) as never,
		{ transparent: true } as never,
	);

	return (
		<main>
			<h1>E2 — does one event fire twice across SSR + hydration?</h1>
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

/* ---------------------------------------------------------- E2P / E2T --
 * ISOLATING THE HYDRATION WARNING. The first E1/E2 run came back with
 * "Hydration completed with 1 unclaimed server-rendered node(s)" while E3/E4/E5
 * came back clean — and the only thing E1 and E2 had that the others did not
 * was `transparent: true`. `transparent`'s docs sell it as the seam for
 * client-only effects; these two probes are identical except for the flag, so a
 * warning on E2T alone means the flag is only safe when the server genuinely
 * never created the effect — which is a real constraint on using it as #30's
 * "explicit seam".
 * ------------------------------------------------------------------------ */
function e2Body(label: string, options?: object) {
	const [clicks, setClicks] = createSignal(0);
	createRenderEffect(
		() => clicks(),
		((v: number) => log(label, `EFFECT PHASE FIRED (clicks=${v})`)) as never,
		options as never,
	);
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
/** Plain render-effect, isomorphic. Control for E2T. */
export function ProbeE2Plain() {
	return e2Body("E2P");
}
/** The same effect, `transparent: true`, still created in BOTH environments. */
export function ProbeE2Transparent() {
	return e2Body("E2T", { transparent: true });
}

/* ------------------------------------------------------------------ E3 --
 * THE COST OF THE SEAM. `serverEffect` catches a `NotReadyError` from the
 * compute and, when there is an `effectFn` and the render is async, calls
 * `ctx.block(source.then(retry))` — HOLDING THE FLUSH like top-level JSX
 * async — then re-runs the whole compute and fires the effect with the
 * resolved value. `createEffect` (no effectFn) swallows it outright.
 *
 * So an instrumentation effect that happens to read a pending signal can
 * delay the document. This measures both halves: the run counts here, and the
 * driver times the shell flush against the E3C control.
 * ------------------------------------------------------------------------ */
export function ProbeE3() {
	const data = createMemo(async () => {
		log("E3", "async memo BODY starting (will resolve in 150ms)");
		return await slow("resolved");
	});

	let renderComputes = 0;
	let renderEffects = 0;
	createRenderEffect(
		() => {
			renderComputes += 1;
			log("E3", `renderEffect COMPUTE attempt #${renderComputes} — reading`);
			const v = data();
			log("E3", `renderEffect COMPUTE #${renderComputes} READ THROUGH: ${v}`);
			return v;
		},
		((v: unknown) => {
			renderEffects += 1;
			log("E3", `renderEffect EFFECT PHASE #${renderEffects} — value=${v}`);
		}) as never,
	);

	let plainComputes = 0;
	createEffect(
		() => {
			plainComputes += 1;
			log("E3", `plain createEffect COMPUTE attempt #${plainComputes}`);
			const v = data();
			log("E3", `plain createEffect COMPUTE READ THROUGH: ${v}`);
			return v;
		},
		((v: unknown) =>
			log("E3", `plain createEffect EFFECT PHASE — value=${v}`)) as never,
	);

	return (
		<main>
			<h1>E3 — NotReadyError in a render-effect compute, under SSR</h1>
			<p id="marker">rendered</p>
		</main>
	);
}

/* E3's 151ms hold only indicts the RENDER EFFECT if the async memo cannot hold
 * the stream by itself. Two more controls, so the attribution is measured:
 *   E3D — the memo is created and never read by anyone.
 *   E3B — the memo is read, but only by a plain `createEffect` compute (whose
 *         NotReadyError is swallowed, never blocked).
 * Neither reads the memo in JSX, so if both flush fast, the hold in E3 belongs
 * to `createRenderEffect`'s compute and nothing else. */

/** E3D — async memo created, read by nobody. */
export function ProbeE3Unread() {
	createMemo(async () => {
		log("E3D", "async memo BODY starting — nobody reads this");
		return await slow("unread");
	});
	return (
		<main>
			<h1>E3D — pending memo created, never read</h1>
			<p id="marker">rendered</p>
		</main>
	);
}

/** E3B — the pending read happens in a plain `createEffect` compute only. */
export function ProbeE3PlainOnly() {
	const data = createMemo(async () => {
		log("E3B", "async memo BODY starting");
		return await slow("resolved");
	});
	let n = 0;
	createEffect(
		() => {
			n += 1;
			log("E3B", `plain createEffect COMPUTE attempt #${n}`);
			const v = data();
			log("E3B", `plain createEffect COMPUTE READ THROUGH: ${v}`);
			return v;
		},
		((v: unknown) =>
			log("E3B", `plain createEffect EFFECT PHASE — value=${v}`)) as never,
	);
	return (
		<main>
			<h1>E3B — pending read in a plain createEffect compute only</h1>
			<p id="marker">rendered</p>
		</main>
	);
}

/** E3C — the control: identical shape, nothing pending. Gives the driver a
 * baseline flush time so E3's hold is a measured delta, not a guess. */
export function ProbeE3Control() {
	const [n] = createSignal("sync");
	createRenderEffect(() => n(), ((v: string) =>
		log("E3C", `renderEffect EFFECT PHASE — value=${v}`)) as never);
	return (
		<main>
			<h1>E3C — control: no pending read</h1>
			<p id="marker">rendered</p>
		</main>
	);
}

/* ------------------------------------------------------------------ E4 --
 * INSIDE A LOADING BOUNDARY. #30 asks what `createRenderEffect` costs a
 * `<Loading>` boundary. Two things could happen server-side: the boundary
 * streams its fallback and the effect never fires (handed to the client), or
 * the effect holds the boundary open. Either answer changes whether an
 * instrumentation effect is safe to put in a suspending subtree.
 * ------------------------------------------------------------------------ */
function E4Child() {
	const data = createMemo(async () => await slow("child-data"));
	createRenderEffect(
		() => {
			log("E4", "child renderEffect COMPUTE — reading the pending memo");
			return data();
		},
		((v: unknown) =>
			log("E4", `child renderEffect EFFECT PHASE — value=${v}`)) as never,
	);
	return <p id="child">child: {data()}</p>;
}

export function ProbeE4() {
	return (
		<main>
			<h1>E4 — render-effect inside a Loading boundary</h1>
			<Loading fallback={<p id="fallback">loading…</p>}>
				<E4Child />
			</Loading>
			<p id="marker">rendered</p>
		</main>
	);
}

/* ------------------------------------------------------------------ E5 --
 * CAN A SERVER SPAN EVEN CLOSE? The OTEL half of the ticket. #22 found a fiber
 * forked in a component body is interrupted when the server render finishes.
 * This asks the same of the effect phase, which is where instrumentation
 * actually lives, and separates the two shapes a span can have:
 *
 *   - SYNC: opened and closed inside the effect phase (`Effect.runSync`).
 *     If this works, a server span needs no Solid effect phase to outlive.
 *   - ASYNC: opened in the effect phase, closed after an await (`runFork` +
 *     sleep). This is what "a span around the request" would need.
 *
 * A finalizer logs on both paths, so an interrupt is distinguishable from a
 * completion — and from silence.
 * ------------------------------------------------------------------------ */
export function ProbeE5() {
	const [n] = createSignal(1);

	createRenderEffect(() => n(), ((v: number) => {
		log("E5", `effect phase entered (v=${v})`);

		// (a) fully synchronous — the shape an Effect span around already
		// resolved work would have.
		Effect.runSync(
			Effect.sync(() => log("E5", "(a) SYNC effect ran to completion")),
		);

		// (b) async — opened here, must survive past the render to close.
		const fiber = Effect.runFork(
			Effect.onExit(
				Effect.flatMap(Effect.sleep("200 millis"), () =>
					Effect.sync(() => log("E5", "(b) ASYNC body COMPLETED after 200ms")),
				),
				(exit) =>
					Effect.sync(() =>
						log(
							"E5",
							`(b) finalizer ran — exit=${exit._tag}${
								Exit.isSuccess(exit) ? "" : " (interrupted/failed)"
							}`,
						),
					),
			),
		);
		fiber.addObserver((exit) => log("E5", `(b) observer — exit=${exit._tag}`));

		// (c) can we even ask for it back? An explicit interrupt is what a
		// close-on-unmount span would do; #22 found it drains inline.
		void Fiber.interrupt;
	}) as never);

	return (
		<main>
			<h1>
				E5 — does async work started in an SSR effect phase outlive the render?
			</h1>
			<p id="marker">rendered</p>
		</main>
	);
}
