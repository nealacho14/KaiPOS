import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import importX from "eslint-plugin-import-x";

export default tseslint.config(
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    plugins: {
      "import-x": importX,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      "import-x/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "never",
        },
      ],
      "import-x/no-duplicates": "warn",

      "no-console": "warn",
      eqeqeq: ["error", "always"],
      "no-constant-binary-expression": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "warn",
    },
  },
  prettier,
  {
    ignores: ["node_modules/", "dist/", ".turbo/"],
  },
);
