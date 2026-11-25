// ESLint for the app's code in src/, the tests and the config files. Run it with `npm run lint`.
//
// Every file gets the bug rules (eslint:recommended): undefined or unused names, unreachable code,
// duplicate keys and so on, and the readability rules below, which check what they can of
// docs/code-style.md. The JavaScript is indented with 4 spaces per level.
//
// The Playwright tests and their config are TypeScript: typescript-eslint reads them, and they get the
// same readability rules.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import typescript from 'typescript-eslint';

// What the app uses from the browser. Anything not listed here is reported as undefined.
const browser = Object.fromEntries([
    'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage', 'indexedDB',
    'fetch', 'URL', 'Blob', 'AbortController', 'Event', 'CSS', 'setTimeout', 'clearTimeout',
    'confirm', 'alert', 'console',
].map(name => [name, 'readonly']));

const JAVASCRIPT = ['src/**/*.js', 'tests/unit/**/*.js', 'eslint.config.js', 'vite.config.js'];

// Names from before the refactor (#45) that said too little. Saved keys (str, ab, fx, …) aren't listed:
// they're the saved format, and object keys are left alone.
const OLD_NAMES = [
    'abilityMod', 'profBonus', 'skillProf', 'weaponMod', 'withMod', 'esc', 'md', 'lib', 'crit', 'expr',
    'uniq', 'dup', 'asi', 'ob', 'tmp', 'btn', 'msg', 'idx', 'obj', 'arr', 'val', 'elem', 'cb', 'fn',
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
    // Names are whole words: at least three letters, except the loop counters i and j, and two-letter
    // names everyone knows (ui, id, CI, js) or the game uses (hp, ac, dc).
    // (Object keys are left alone, since the saved sheet uses short ones.)
    'id-length': ['error', {
        min: 3, properties: 'never', exceptions: ['i', 'j', 'ui', 'id', 'CI', 'js', 'hp', 'ac', 'dc'],
    }],
    'id-denylist': ['error', ...OLD_NAMES],
};

// HTML is built only in src/sections/ with the html tag, and in src/html.js, which provides it.
// Anywhere else, a tag in a string or a hand-escaped value is an error.
const MARKUP_ONLY_IN_SECTIONS = {
    'no-restricted-syntax': ['error',
        {
            selector: 'TemplateElement[value.raw=/<\\/?[a-z][a-z0-9]*[\\s>]/]',
            message: 'Build HTML in src/sections/ with the html tag (docs/code-style.md).',
        },
        {
            selector: 'Literal[value=/<\\/?[a-z][a-z0-9]*[\\s>]/]',
            message: 'Build HTML in src/sections/ with the html tag (docs/code-style.md).',
        },
    ],
    'no-restricted-imports': ['error', {
        paths: [{
            name: '../html.js',
            importNames: ['escapeHtml'],
            message: 'Write markup with the html tag, which escapes every value (docs/code-style.md).',
        }, {
            name: './html.js',
            importNames: ['escapeHtml'],
            message: 'Write markup with the html tag, which escapes every value (docs/code-style.md).',
        }],
    }],
};

const TYPESCRIPT_TESTS = ['tests/e2e/**/*.ts', 'playwright.config.ts'];

export default [
    { ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', '.claude/'] },
    {
        files: JAVASCRIPT,
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
    { files: JAVASCRIPT, rules: readableRules },
    { files: ['src/**/*.js'], ignores: ['src/sections/**', 'src/html.js'], rules: MARKUP_ONLY_IN_SECTIONS },
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
