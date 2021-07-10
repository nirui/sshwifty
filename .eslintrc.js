module.exports = {
  parserOptions: {
    parser: "@babel/eslint-parser",
  },
  root: true,
  env: {
    node: true,
  },
  extends: [
    "plugin:vue/recommended",
    "eslint:recommended",
    "prettier",
    "plugin:prettier/recommended",
  ],
  rules: {
    "vue/component-name-in-template-casing": ["error", "PascalCase"],
    "no-console": process.env.NODE_ENV === "production" ? "warn" : "off",
    "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off",
    "no-unused-vars": process.env.NODE_ENV === "production" ? "off" : "warn",
  },
  globals: {
    $nuxt: true,
  },
};
