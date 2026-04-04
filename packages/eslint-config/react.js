import base from "./base.js";

export default [
  ...base,
  {
    files: ["**/*.tsx", "**/*.ts"],
    rules: {
      "no-console": "warn",
    },
  },
];
