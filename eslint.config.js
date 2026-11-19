// ESLint for the app's code in src/. Run it with `npm run lint`.
//
// Every file gets the bug rules (eslint:recommended): undefined or unused names, unreachable code,
// duplicate keys and so on. The modules already written as readable code also get the readability
// rules below. The older dense files join that list as the main.js refactor (#45) rewrites them;
// until then they'd fail on almost every line.
//
// The Playwright tests are TypeScript, which ESLint can't read without typescript-eslint, so they
// aren't linted yet.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';

// What the app uses from the browser. Anything not listed here is reported as undefined.
const browser = Object.fromEntries([
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB',
  'fetch', 'URL', 'Blob', 'AbortController', 'Event', 'CSS', 'setTimeout', 'clearTimeout',
  'confirm', 'alert', 'console',
].map(name => [name, 'readonly']));

// Readable code: short lines, one statement per line, and small functions.
const READABLE = [
  'src/storage.js',
  'src/rules.js',
  'src/rolls.js',
  'src/text.js',
];

export default [
  { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', '.claude/'] },
  {
    files: ['src/**/*.js'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browser },
    rules: {
      ...js.configs.recommended.rules,
      // try { … } catch (e) { return null; } is how storage and parsing say "couldn't".
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: READABLE,
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/max-len': ['error', { code: 120, ignoreUrls: true, ignoreRegExpLiterals: true }],
      '@stylistic/max-statements-per-line': ['error', { max: 1 }],
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
      '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      'max-depth': ['error', 3],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 12],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
