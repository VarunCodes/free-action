// ESLint for the app's code in src/ and for the tests. Run it with `npm run lint`.
//
// Every file gets the bug rules (eslint:recommended): undefined or unused names, unreachable code,
// duplicate keys and so on. The JavaScript is indented with 4 spaces per level.
//
// The modules already written as readable code also get the readability rules below. The older dense
// files join that list as the main.js refactor (#45) rewrites them; until then they'd fail on almost
// every line.
//
// The unit tests (tests/unit/) are linted like the readable modules. The Playwright tests and their
// config are TypeScript: typescript-eslint reads them, and they get the same readability rules.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import typescript from 'typescript-eslint';

// What the app uses from the browser. Anything not listed here is reported as undefined.
const browser = Object.fromEntries([
    'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB',
    'fetch', 'URL', 'Blob', 'AbortController', 'Event', 'CSS', 'setTimeout', 'clearTimeout',
    'confirm', 'alert', 'console',
].map(name => [name, 'readonly']));

// Readable code: short lines, one statement per line, and small functions.
const READABLE = [
    'tests/unit/**/*.js',
    'src/storage.js',
    'src/rules.js',
    'src/rolls.js',
    'src/text.js',
    'src/html.js',
    'src/effects.js',
    'src/gearUpgrade.js',
    'src/library.js',
    'src/library/*.js',
    'src/main.js',
    'src/sheet.js',
    'src/sections/*.js',
    'src/actions/*.js',
    'src/ui.js',
];

// Short lines, one statement per line, small functions and names that say what they hold.
const readableRules = {
    '@stylistic/max-len': ['error', { code: 120, ignoreUrls: true, ignoreRegExpLiterals: true }],
    '@stylistic/max-statements-per-line': ['error', { max: 1 }],
    '@stylistic/semi': ['error', 'always'],
    '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
    '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
    '@stylistic/comma-dangle': ['error', 'always-multiline'],
    'max-depth': ['error', 3],
    'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
    complexity: ['error', 12],
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always'],
    // Names say what they hold: no one-letter names except the loop counters i and j.
    // (Object keys are left alone, since the saved sheet uses short ones.)
    'id-length': ['error', { min: 2, properties: 'never', exceptions: ['i', 'j'] }],
};

const TYPESCRIPT_TESTS = ['tests/e2e/**/*.ts', 'playwright.config.ts'];

export default [
    { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', '.claude/'] },
    {
        files: ['src/**/*.js', 'tests/unit/**/*.js', 'eslint.config.js'],
        ...js.configs.recommended,
        plugins: { '@stylistic': stylistic },
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: browser },
        rules: {
            ...js.configs.recommended.rules,
            // try { … } catch (e) { return null; } is how storage and parsing say "couldn't".
            'no-unused-vars': ['error', { caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            // Four spaces per level.
            '@stylistic/indent': ['error', 4],
        },
    },
    { files: READABLE, rules: readableRules },
    { files: TYPESCRIPT_TESTS, ...js.configs.recommended },
    ...typescript.configs.recommended.map(config => ({ ...config, files: TYPESCRIPT_TESTS })),
    {
        files: TYPESCRIPT_TESTS,
        plugins: { '@stylistic': stylistic },
        rules: {
            ...readableRules,
            // Playwright's own style: two spaces per level, as in its docs and generated code.
            '@stylistic/indent': ['error', 2],
            // Test titles and expected messages stay whole, so a failure's text can be searched for: a line
            // that starts a test, or a line holding only a string, may run long.
            '@stylistic/max-len': ['error', {
                code: 120, ignoreUrls: true, ignoreRegExpLiterals: true,
                ignorePattern: /^\s*(?:test(?:\.(?:describe|step|fail|fixme))?\(|(['"`]).*\1,?$)/.source,
            }],
            // A test.describe() callback holds all of its tests, so it's as long as they are together.
            'max-lines-per-function': 'off',
        },
    },
];
