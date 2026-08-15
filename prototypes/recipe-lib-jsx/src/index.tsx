import { createSignal } from "solid-js";
export function Counter(props: { label: string }) {
	const [n, setN] = createSignal(0);
	return (
		<button type="button" onClick={() => setN(n() + 1)}>
			{props.label}: {n()}
		</button>
	);
}
