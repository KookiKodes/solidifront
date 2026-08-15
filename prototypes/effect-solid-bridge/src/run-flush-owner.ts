/**
 * THROWAWAY PROTOTYPE — wayfinder ticket #22.
 *
 * QUESTION: why does an effect-phase write without `ownedWrite` throw in #8's
 * headless harness but not in a real hydrating browser app?
 *
 * HYPOTHESIS: the effect phase does not establish an owner of its own —
 * `runEffect` calls `node._effectFn(...)` bare, with no `runWithOwner`. So the
 * guard in `setSignal` sees whatever `context` the *caller of the flush* left
 * on the stack. A synchronous `flush()` from inside `createRoot`'s body leaks
 * the root owner into every effect in that flush; a microtask flush has none.
 *
 * If that holds, the rule is about WHO FLUSHES, not about the effect phase.
 *
 *   node --conditions=development --experimental-strip-types src/run-flush-owner.ts
 */
import {
	createEffect,
	createRoot,
	createSignal,
	flush,
} from "@solidjs/signals";

const lines: string[] = [];
const log = (c: string, m: string) => lines.push(`  [${c}] ${m}`);
const banner = (s: string) => lines.push(`\n=== ${s} ===`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function effectThatWrites(label: string) {
	const [n, setN] = createSignal(0);
	const [out, setOut] = createSignal(0); // NO ownedWrite
	createEffect(
		() => n(),
		() => {
			try {
				setOut((v) => v + 1);
				log(label, "effect-phase write returned NORMALLY");
			} catch (e) {
				log(label, `effect-phase write THREW: ${String(e).slice(0, 80)}`);
			}
		},
	);
	return { setN, out };
}

async function main() {
	// ------------------------------------------------------------------- F1
	banner(
		"F1 — flush() called INSIDE createRoot's body (what #8's harness did)",
	);
	createRoot((dispose) => {
		effectThatWrites("F1");
		flush(); // context is still the root owner here
		dispose();
	});

	// ------------------------------------------------------------------- F2
	banner("F2 — flush() called AFTER createRoot returns (owner off the stack)");
	{
		let disposeLater!: () => void;
		createRoot((dispose) => {
			effectThatWrites("F2");
			disposeLater = dispose;
		});
		flush(); // context is null here
		disposeLater();
	}

	// ------------------------------------------------------------------- F3
	banner("F3 — no explicit flush; the scheduler's own microtask runs it");
	{
		let disposeLater!: () => void;
		createRoot((dispose) => {
			effectThatWrites("F3");
			disposeLater = dispose;
		});
		await sleep(20); // let queueMicrotask(flush) fire on its own
		disposeLater();
	}

	log(
		"VERDICT",
		"if F1 throws and F2/F3 do not, the guard tracks the flusher's owner," +
			" not the effect phase — and #8's rule is an artifact of its harness",
	);
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
