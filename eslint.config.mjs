import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Boundary: the Three.js engine must never depend on React, the store, the UI, or DOM-by-id (K6).
  {
    files: ["src/engine/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react/*", "react-dom/*", "next", "next/*", "zustand", "zustand/*"], message: "src/engine is React-free: commands go through EngineHandle, state through EngineEvents/FrameBus." },
            { group: ["@/stores/*", "@/components/*", "@/hooks/*"], message: "src/engine cannot import UI/store code (React↔Three boundary)." },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Research evidence (minified source bundle) is not app code.
    "docs/**",
  ]),
]);

export default eslintConfig;
