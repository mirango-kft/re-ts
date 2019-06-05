import typescript from "rollup-plugin-typescript2";
import { terser } from "rollup-plugin-terser";

const dependencies = Object.keys(require("./package.json").dependencies);

export default {
  input: "./src/index.ts",
  output: [
    { file: "dist/index.js", format: "cjs" },
    { file: "dist/index.module.js", format: "esm" }
  ],
  external: dependencies,
  plugins: [terser(), typescript({ cacheRoot: ".cache" })]
};
