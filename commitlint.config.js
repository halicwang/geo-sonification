/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        // --- Type ---
        'type-enum': [
            2,
            'always',
            ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'ci', 'perf', 'revert'],
        ],
        'type-case': [2, 'always', 'lower-case'],
        'type-empty': [2, 'never'],

        // --- Scope ---
        // Allow module names (lower-case) and milestone/phase tags (M3/P0).
        // Disabled because valid scopes include mixed-case phase tags.
        'scope-case': [0],

        // --- Subject ---
        // Blocklist mode: ban Sentence/Start/Pascal/UPPER case, but allow
        // mixed case so abbreviations like API, HTTP, DEM are accepted.
        'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
        'subject-empty': [2, 'never'],
        'subject-full-stop': [2, 'never', '.'],

        // --- Header ---
        'header-max-length': [2, 'always', 72],

        // --- Body ---
        'body-max-line-length': [2, 'always', 72],
        'body-leading-blank': [2, 'always'],

        // --- Footer ---
        'footer-leading-blank': [2, 'always'],
        'footer-max-line-length': [2, 'always', 72],
    },
};
