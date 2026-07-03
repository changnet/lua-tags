const { defineConfig } = require('@vscode/test-cli');

module.exports = defineConfig([
    {
        label: 'core',
        files: 'out/test/suit/core/**/*.test.js',
        workspaceFolder: 'src/test/fixture/core',
        mocha: { ui: 'tdd' },
        launchArgs: ['--disable-extensions'],
    },
    {
        label: 'annotation',
        files: 'out/test/suit/annotation/**/*.test.js',
        workspaceFolder: 'src/test/fixture/annotation',
        mocha: { ui: 'tdd' },
        launchArgs: ['--disable-extensions'],
    },
    {
        label: 'test3',
        files: 'out/test/suit/test3/**/*.test.js',
        workspaceFolder: 'src/test/fixture/test3',
        mocha: { ui: 'tdd' },
        launchArgs: ['--disable-extensions'],
    },
]);
