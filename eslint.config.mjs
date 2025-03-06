import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [...compat.extends(
    "plugin:vue/recommended",
    "eslint:recommended",
    "prettier",
    "plugin:prettier/recommended",
), {
    languageOptions: {
        globals: {
            ...globals.node,
            $nuxt: true,
        },

        ecmaVersion: 13,
        sourceType: "module",

        parserOptions: {
            parser: "@babel/eslint-parser",
        },
    },

    rules: {
        "vue/component-name-in-template-casing": ["error", "PascalCase"],
        "vue/multi-word-component-names": "off",
        "no-console": "off",
        "no-debugger": "off",
        "no-unused-vars": "warn",
    },
}];