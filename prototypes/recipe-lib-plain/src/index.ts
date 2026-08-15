import { createSignal } from "solid-js";
/** A primitive: no JSX anywhere. This is what core/solid/server/vite look like. */
export function createCounter(start = 0) {
  const [n, setN] = createSignal(start);
  return { n, inc: () => setN(n() + 1) };
}
