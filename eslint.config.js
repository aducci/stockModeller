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
  semantics: ["model", "engine"],
  views: ["model", "engine", "semantics"],
  client: ["model", "engine"],
  web: ["model", "engine", "client", "semantics", "views"],
  server: ["model", "engine", "db", "content", "semantics"],
};
const packages = Object.keys(allowed);
const forbidden = (pkg) =>
  packages.filter((p) => p !== pkg && !allowed[pkg].includes(p)).map((p) => `@connectome/${p}`);
const dir = (pkg) => (pkg === "server" || pkg === "web" ? `apps/${pkg}` : `packages/${pkg}`);

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "design/**",
      "**/dist/**",
      "**/coverage/**",
      "**/test-results/**",
      "**/playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  // The web app runs in the browser.
  { files: ["apps/web/src/**/*.{ts,tsx}"], languageOptions: { globals: { ...globals.browser } } },
  ...packages.map((pkg) => ({
    files: [`${dir(pkg)}/src/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...(forbidden(pkg).length > 0
              ? [
                  {
                    group: forbidden(pkg),
                    message: `@connectome/${pkg} may only import: ${allowed[pkg].join(", ") || "no other package"} (see eslint.config.js).`,
                  },
                ]
              : []),
            { group: ["../../*"], message: "Import other packages by name, not by relative path." },
          ],
          // The engine is pure: no I/O, so it runs unchanged in the browser and on the server.
          // The client and the web app run in the browser: no Node modules.
          ...(pkg === "engine" ||
          pkg === "model" ||
          pkg === "semantics" ||
          pkg === "views" ||
          pkg === "client" ||
          pkg === "web"
            ? { paths: ["pg", "kysely", "fs", "node:fs", "net", "node:net", "http", "node:http"] }
            : {}),
        },
      ],
    },
  })),
);
