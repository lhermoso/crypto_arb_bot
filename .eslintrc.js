module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
  ],
  plugins: ['@typescript-eslint'],
  root: true,
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  globals: {
    NodeJS: 'readonly',
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-unused-vars': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-prototype-builtins': 'off',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
};