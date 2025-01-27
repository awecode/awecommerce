import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
  // If entries is not provided, will be automatically inferred from package.json
  entries: [
    {
      builder: "mkdist",
      input: ".",
      outDir: "./dist",
    },
  ],

  // Change outDir, default is 'dist'
  outDir: "dist",

  // Generates .d.ts declaration file
  declaration: true,
});
