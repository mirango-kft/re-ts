import typescript from "rollup-plugin-typescript2";
import { terser } from "rollup-plugin-terser";

const dependencies = Object.keys(require("./package.json").dependencies);

export default {
  input: "./src/index.ts",
  output: [
    { file: "dist/cjs/index.js", format: "cjs" },
    { file: "dist/esm/index.js", format: "esm" }
  ],
  external: dependencies,
  plugins: [terser(), typescript({ cacheRoot: ".cache" })]
};
