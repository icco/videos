import { fixupConfigRules } from "@eslint/compat"
import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"
import simpleImportSort from "eslint-plugin-simple-import-sort"

export default defineConfig([
  // Next's plugins still use rule APIs removed in ESLint 10.
  ...fixupConfigRules([...nextVitals, ...nextTypescript]),
  prettier,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
])
