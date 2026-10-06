// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

/** Module boundaries (ADR-002): each package may only import the packages listed here. */
const allowed = {
  model: [],
  content: ["model"],
  engine: ["model"],
  db: ["model", "engine"],
};
const packages = Object.keys(allowed);

export default tseslint.config(
  { ignores: ["**/node_modules/**", "design/**", "**/dist/**", "**/coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  ...packages.map((pkg) => ({
    files: [`packages/${pkg}/src/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: packages.filter((p) => p !== pkg && !allowed[pkg].includes(p)).map((p) => `@connectome/${p}`),
              message: `@connectome/${pkg} may only import: ${allowed[pkg].join(", ") || "no other package"} (see eslint.config.js).`,
            },
            { group: ["../../*"], message: "Import other packages by name, not by relative path." },
          ],
          // The engine is pure: no I/O, so it runs unchanged in the browser and on the server.
          ...(pkg === "engine" || pkg === "model"
            ? { paths: ["pg", "kysely", "fs", "node:fs", "net", "node:net", "http", "node:http"] }
            : {}),
        },
      ],
    },
  })),
);
