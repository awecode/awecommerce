import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  // If entries is not provided, will be automatically inferred from package.json
  entries: [
    {
      builder: "mkdist",
      input: ".",
      outDir: "./dist",
      format: "esm",
    },
    {
      builder: "mkdist",
      input: ".",
      outDir: "./dist",
      format: "cjs",
      ext: "cjs",
    }
  ],

  // Change outDir, default is 'dist'
  outDir: "dist",

  // Generates .d.ts declaration file
  declaration: true,


  rollup: {
    emitCJS: true,
  },
});
