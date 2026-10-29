// ESLint: the recommended rules of ESLint, typescript-eslint and eslint-plugin-svelte, nothing
// stricter. Formatting is Prettier's job, not this. `npm run lint`.

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
  { ignores: ['build/', '**/.svelte-kit/', 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Off: every app path here is built with resolve() and then given a query string
      // (`${resolve('signin')}?next=…`), or is a same-site path already checked by safeNext or
      // #lib/teams.ts, and the rule can't follow either through a template string or a helper.
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
);
