import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  { files: ["mobile/**/*.tsx"], rules: { "jsx-a11y/alt-text": "off" } },
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts", "mobile/.expo/**", "mobile/dist/**", "mobile/android/**", "mobile/ios/**", "mobile/node_modules/**"]),
]);
