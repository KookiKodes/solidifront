/** THROWAWAY PROBE — onCleanup semantics inside the effect phase. */
import {
	createEffect,
	createRoot,
	createSignal,
	flush,
	onCleanup,
} from "@solidjs/signals";

const log: string[] = [];
createRoot((dispose) => {
	const [n, setN] = createSignal(1);
	createEffect(
		() => n(),
		(v) => {
			log.push(`effect run v=${v}`);
			onCleanup(() => log.push(`  cleanup from run v=${v}`));
		},
	);
	flush();
	log.push("--- setN(2) ---");
	setN(2);
	flush();
	log.push("--- setN(3) ---");
	setN(3);
	flush();
	log.push("--- dispose() ---");
	dispose();
});
console.log(log.join("\n"));
