/** THROWAWAY PROTOTYPE — wayfinder ticket #22. Index shown when no ?probe= is given. */
import { PROBES } from "./registry.ts";

export default function App() {
	return (
		<main>
			<h1>effect-solid-bridge — hydration probes (#22)</h1>
			<p>Pick one. One probe per page load, deliberately.</p>
			<ul>
				{Object.keys(PROBES).map((name) => (
					<li>
						<a href={`/?probe=${name}`}>{name}</a>
					</li>
				))}
			</ul>
		</main>
	);
}
