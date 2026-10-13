import { defineBuildConfig } from "unbuild";

// Only library code goes into dist: no tests, configs, dev scripts or repo files
const pattern = [
  "apps/**",
  "core/**",
  "!**/tests/**",
  "!**/*.test.*",
  "!apps/product/seed.ts",
  "!core/db/pg/migrate.ts",
  "!core/db/pg/migrate-pglite.ts",
];

export default defineBuildConfig({
  // If entries is not provided, will be automatically inferred from package.json
  entries: [
    {
      builder: "mkdist",
      input: ".",
      outDir: "./dist",
      pattern,
      format: "esm",
    },
    {
      builder: "mkdist",
      input: ".",
      outDir: "./dist",
      pattern,
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
