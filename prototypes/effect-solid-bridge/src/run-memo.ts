/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #20.
 *
 * QUESTION: how does an Effect run inside a Solid 2 ASYNC MEMO — the primitive
 * the data layer should actually use? #8 answered the createEffect case, which
 * the Solid guide reserves for imperative boundaries.
 *
 * Run under BOTH conditions:
 *   node --experimental-strip-types src/run-memo.ts
 *   node --conditions=development --experimental-strip-types src/run-memo.ts
 */
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import {
	createMemo,
	createRoot,
	createSignal,
	flush,
	isPending,
	latest,
	resolve,
} from "@solidjs/signals";

const lines: string[] = [];
const log = (c: string, m: string) => lines.push(`  [${c}] ${m}`);
const banner = (s: string) => lines.push(`\n=== ${s} ===`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OWNED = { ownedWrite: true } as const;

/** Records fiber lifecycle so we can see interruption (or its absence). */
function tracked(label: string, ms: number, value: string) {
	return Effect.gen(function* () {
		yield* Effect.onExit(Effect.sleep(`${ms} millis`), (exit) =>
			Effect.sync(() =>
				log("fiber", `${label} exited: ${exit._tag}`),
			),
		);
		return value;
	});
}

async function main() {
	// ------------------------------------------------------------------ A1
	banner("A1 — does an Effect compose with createMemo(async …)?");
	await createRoot(async (dispose) => {
		const [id] = createSignal(1, OWNED);
		const data = createMemo(async () => {
			const input = id(); // read BEFORE the await — should track
			return await Effect.runPromise(
				Effect.map(Effect.succeed(input), (n) => `result(${n})`),
			);
		});
		try {
			const v = await resolve(() => data());
			log("resolve", `resolve(() => data()) → ${JSON.stringify(v)}`);
			log("VERDICT", "PASS — Effect.runPromise composes inside an async memo");
		} catch (e) {
			log("VERDICT", `FAIL — ${(e as Error).message}`);
		}
		dispose();
	});

	// ------------------------------------------------------------------ A2
	banner("A2 — tracking: read before vs after the await, inside a memo");
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, OWNED);
		let goodRuns = 0;
		let badRuns = 0;

		const good = createMemo(async () => {
			goodRuns++;
			const input = id(); // BEFORE await
			return await Effect.runPromise(tracked(`good#${goodRuns}`, 10, `g(${input})`));
		});
		const bad = createMemo(async () => {
			badRuns++;
			await Effect.runPromise(Effect.sleep("10 millis")); // gap FIRST
			const input = id(); // AFTER await — should not track
			return `b(${input})`;
		});

		log("v", `good=${JSON.stringify(await resolve(() => good()))}`);
		log("v", `bad =${JSON.stringify(await resolve(() => bad()))}`);
		log("action", "setId(2)");
		setId(2);
		flush();
		await sleep(60);
		log("state", `goodRuns=${goodRuns} badRuns=${badRuns}`);
		log(
			"VERDICT",
			goodRuns > 1 && badRuns === 1
				? "CONFIRMED — read-before-await tracks; read-after-await does not, silently"
				: `goodRuns=${goodRuns} badRuns=${badRuns} (unexpected)`,
		);
		dispose();
	});

	// ------------------------------------------------------------------ A3
	banner("A3 — does Solid drop stale results by itself? (is the #8 generation counter redundant?)");
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, OWNED);
		// earlier ids resolve LATER — the out-of-order race
		const data = createMemo(async () => {
			const n = id();
			return await Effect.runPromise(tracked(`race#${n}`, 120 - n * 40, `result(${n})`));
		});
		await resolve(() => data());
		setId(2);
		flush();
		setId(3);
		flush();
		await sleep(260);
		const final = await resolve(() => data());
		log("state", `final=${JSON.stringify(final)}`);
		log(
			"VERDICT",
			final === "result(3)"
				? "PASS — Solid dropped the slower older results with NO manual generation counter"
				: `FAIL — stale value won: ${JSON.stringify(final)}`,
		);
		dispose();
	});

	// ------------------------------------------------------------------ A4
	banner("A4 — cancellation: does a re-running memo interrupt the previous fiber?");
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, OWNED);
		const data = createMemo(async () => {
			const n = id();
			return await Effect.runPromise(tracked(`cancel#${n}`, 200, `result(${n})`));
		});
		void resolve(() => data());
		await sleep(30);
		log("action", "setId(2) while run #1 is still in flight");
		setId(2);
		flush();
		await sleep(300);
		log(
			"NOTE",
			"if cancel#1 exited Success, Solid did NOT interrupt the fiber — it only ignored the result",
		);
		dispose();
	});

	// ------------------------------------------------------------------ A5
	banner("A5 — Effect failure: what surfaces to the consumer?");
	await createRoot(async (dispose) => {
		const data = createMemo(async () =>
			Effect.runPromise(Effect.fail(new Error("storefront exploded"))),
		);
		try {
			const v = await resolve(() => data());
			log("VERDICT", `no throw — got ${JSON.stringify(v)}`);
		} catch (e) {
			log(
				"VERDICT",
				`throws — ${(e as Error).constructor.name}: ${(e as Error).message.slice(0, 90)}`,
			);
		}
		dispose();
	});

	// ------------------------------------------------------------------ A6
	banner("A6 — isPending / latest during an in-flight memo");
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, OWNED);
		const data = createMemo(async () => {
			const n = id();
			return await Effect.runPromise(tracked(`pending#${n}`, 80, `result(${n})`));
		});
		await resolve(() => data());
		log("state", `settled: isPending=${isPending(data)} latest=${JSON.stringify(latest(data))}`);
		setId(2);
		flush();
		await sleep(20);
		log("state", `in-flight: isPending=${isPending(data)} latest=${JSON.stringify(latest(data))}`);
		await sleep(120);
		log("state", `resettled: isPending=${isPending(data)} latest=${JSON.stringify(latest(data))}`);
		dispose();
	});

	// ------------------------------------------------------------------ A7
	banner("A7 — can a thin wrapper add cancellation without losing A3/A6?");
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, OWNED);

		// The candidate primitive: identical to an async memo, except it
		// interrupts the previous fiber in the SYNCHRONOUS part of the memo body
		// (before the first await), which is the only hook Solid gives us.
		let inFlight: { interrupt: () => void } | undefined;
		const data = createMemo(async () => {
			const n = id(); // tracked read, before any await
			inFlight?.interrupt();
			const fiber = Effect.runFork(tracked(`wrapped#${n}`, 200, `result(${n})`));
			inFlight = { interrupt: () => void Effect.runFork(Fiber.interrupt(fiber)) };
			const exit = await Effect.runPromise(Fiber.await(fiber));
			if (Exit.isSuccess(exit)) return exit.value;
			throw new Error(`interrupted-or-failed(${n})`);
		});

		void resolve(() => data()).catch((e) => log("caught", (e as Error).message));
		await sleep(30);
		log("action", "setId(2) while run #1 is in flight");
		setId(2);
		flush();
		await sleep(300);
		log("state", `isPending=${isPending(data)} latest=${JSON.stringify(latest(data))}`);
		log(
			"NOTE",
			"wrapped#1 should now exit Failure (interrupted) instead of Success",
		);
		dispose();
	});

	console.log(lines.join("\n"));
}

main().then(
	() => process.exit(0),
	(e) => {
		console.log(lines.join("\n"));
		console.error("\nHARNESS ERROR:", e);
		process.exit(1);
	},
);
