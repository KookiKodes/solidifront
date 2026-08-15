import { babel } from "@rollup/plugin-babel";
import nodeResolve from "@rollup/plugin-node-resolve";
// The no-build fallback ONLY. Consumers with the `solid` condition get dist/index.jsx.
export default {
  input: "dist/index.jsx",
  // NB: exact match, NOT a regex — a regex like /solid-js/ also matches any
  // absolute path containing "solid-js", which silently externalises the entry.
  external: (id) =>
    id === "solid-js" || id.startsWith("solid-js/") || id.startsWith("@solidjs/"),
  output: { file: "dist/index.js", format: "esm" },
  plugins: [
    nodeResolve({ extensions: [".js", ".jsx"] }),
    babel({
      babelHelpers: "bundled",
      extensions: [".js", ".jsx"],
      presets: [["babel-preset-solid", {}], "@babel/preset-typescript"],
    }),
  ],
};
