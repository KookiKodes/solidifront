import { Counter } from "@recipe/lib-jsx";
import { createCounter } from "@recipe/lib-plain";
export function App() {
	const c = createCounter(5);
	return (
		<div>
			<Counter label="clicks" />
			<span>{c.n()}</span>
		</div>
	);
}
