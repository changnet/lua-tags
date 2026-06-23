import * as path from 'path';
import * as assert from 'assert';
import { before } from 'mocha';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

// 使用npm来运行测试 npm run test
// Running extension tests from the command line is currently only supported if no other instance of Code is running.

// A GOOD example from Microsoft
// https://github.com/microsoft/vscode-go/blob/master/test/integration/extension.test.ts
// https://github.com/microsoft/vscode-extension-samples/blob/master/lsp-sample/client/src/test/completion.test.ts

const samplePath = path.resolve(__dirname, '../../../src/test/sample');
const testPath = path.join(samplePath, 'test.lua');
const testUri = vscode.Uri.file(testPath);

async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Activates the vscode extension
 */
async function activateExtension() {
    try {
        const conf = vscode.workspace.getConfiguration('lua-tags');
        await conf.update('excludeDir', ['exclude/*']);

        // The extensionId is `publisher.name` from package.json
        const ext = vscode.extensions.getExtension('changnet.lua-tags')!;
        await ext.activate();
        // Wait for server activation and parse all file
        // it took a little time at my poor laptop
        await sleep(8000);
    } catch (e) {
        assert.ok(false, `error in activate extension ${e}`);
    }
}

// BDD测试用descript、it
// TDD测试用suite、test

suite('Extension Test Suite2', () => {
    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    // timeout设置超时时间
    test('test active', async () => {
        await activateExtension();
    }).timeout(10240);
});
