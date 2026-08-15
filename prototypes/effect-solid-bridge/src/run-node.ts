/** THROWAWAY PROTOTYPE — headless validation of src/bridge.ts. */

import {
	createRoot,
	createSignal,
	flush,
	getOwner,
	isDisposed,
	onCleanup,
} from "@solidjs/signals";
import * as Effect from "effect/Effect";
import { createEffectResource, createEffectResourceNaive } from "./bridge.ts";

const lines: string[] = [];
const log = (channel: string, message: string) =>
	lines.push(`  [${channel}] ${message}`);
const banner = (s: string) => {
	lines.push(`\n=== ${s} ===`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetchish = (input: unknown) =>
	Effect.gen(function* () {
		yield* Effect.sleep("20 millis");
		return `result(${JSON.stringify(input)})`;
	});

async function main() {
	// ---------------------------------------------------------------- S1
	banner("S1 — compute/effect split: does the dependency edge survive?");
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, { ownedWrite: true });
		const r = createEffectResource(() => ({ id: id() }), fetchish, log);
		flush();
		await sleep(60);
		log("state", `runs=${r.runs()} value=${JSON.stringify(r.value())}`);
		log("action", "setId(2) — should re-run if the edge exists");
		setId(2);
		flush();
		await sleep(60);
		log("state", `runs=${r.runs()} value=${JSON.stringify(r.value())}`);
		log(
			"VERDICT",
			r.runs() === 2
				? "PASS — tracked compute phase created the edge"
				: `FAIL — runs=${r.runs()}, edge lost`,
		);
		dispose();
	});

	// ---------------------------------------------------------------- S2
	banner("S2 — reading a signal after the async gap (the bug)");
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, { ownedWrite: true });
		const r = createEffectResourceNaive(() => id(), fetchish, log);
		flush();
		await sleep(60);
		log("state", `runs=${r.runs()} value=${JSON.stringify(r.value())}`);
		log("action", "setId(2) — a correct impl would re-run");
		setId(2);
		flush();
		await sleep(60);
		log("state", `runs=${r.runs()} value=${JSON.stringify(r.value())}`);
		log(
			"VERDICT",
			r.runs() === 1
				? "CONFIRMED BUG — signal changed, computation never re-ran, no error raised"
				: `unexpected: runs=${r.runs()}`,
		);
		dispose();
	});

	// ---------------------------------------------------------------- S3
	banner("S3 — finalizer ordering: Effect Scope (LIFO) vs Solid onCleanup");
	await createRoot(async (dispose) => {
		onCleanup(() => log("solid-cleanup", "registered FIRST"));
		onCleanup(() => log("solid-cleanup", "registered SECOND"));
		onCleanup(() => log("solid-cleanup", "registered THIRD"));

		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					yield* Effect.addFinalizer(() =>
						Effect.sync(() => log("effect-finalizer", "registered FIRST")),
					);
					yield* Effect.addFinalizer(() =>
						Effect.sync(() => log("effect-finalizer", "registered SECOND")),
					);
					yield* Effect.addFinalizer(() =>
						Effect.sync(() => log("effect-finalizer", "registered THIRD")),
					);
				}),
			),
		);
		log("action", "disposing Solid root");
		dispose();
	});

	// ---------------------------------------------------------------- S4
	banner("S4 — disposal mid-flight: is the fiber interrupted?");
	let interrupted = false;
	await createRoot(async (dispose) => {
		const [id] = createSignal(1, { ownedWrite: true });
		createEffectResource(
			() => ({ id: id() }),
			() =>
				Effect.gen(function* () {
					yield* Effect.onExit(Effect.sleep("500 millis"), (exit) =>
						Effect.sync(() => {
							interrupted = exit._tag === "Failure";
							log(
								"fiber",
								`in-flight work exited: ${exit._tag}${interrupted ? " (interrupted)" : ""}`,
							);
						}),
					);
					return "should-never-land";
				}),
			log,
		);
		flush();
		await sleep(30);
		log("action", "dispose() while the fiber is still running");
		dispose();
		await sleep(80);
		log(
			"VERDICT",
			interrupted
				? "PASS — Solid disposal interrupted the Effect fiber via onCleanup"
				: "FAIL — fiber ran to completion after disposal",
		);
	});

	// ---------------------------------------------------------------- S5
	banner(
		"S5 — rapid input changes: can a stale response overwrite a newer one?",
	);
	await createRoot(async (dispose) => {
		const [id, setId] = createSignal(1, { ownedWrite: true });
		// Earlier ids resolve LATER — the classic out-of-order race.
		const raced = (input: { id: number }) =>
			Effect.gen(function* () {
				yield* Effect.sleep(`${120 - input.id * 40} millis`);
				return `result(${input.id})`;
			});
		const r = createEffectResource(() => ({ id: id() }), raced, log);
		flush();
		setId(2);
		flush();
		setId(3);
		flush();
		await sleep(250);
		log("state", `final value=${JSON.stringify(r.value())}`);
		log(
			"VERDICT",
			r.value() === "result(3)"
				? "PASS — generation guard dropped the slower, older responses"
				: `FAIL — stale write landed: ${r.value()}`,
		);
		dispose();
	});

	// ---------------------------------------------------------------- S6
	banner("S6 — isDisposed as the late-work guard");
	createRoot((dispose) => {
		const owner = getOwner();
		log(
			"state",
			`before dispose: isDisposed=${owner ? isDisposed(owner) : "?"}`,
		);
		dispose();
		log(
			"state",
			`after dispose:  isDisposed=${owner ? isDisposed(owner) : "?"}`,
		);
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
