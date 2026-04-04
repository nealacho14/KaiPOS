import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  prettier,
  {
    ignores: ["node_modules/", "dist/", ".turbo/"],
  },
);
