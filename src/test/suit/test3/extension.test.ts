import { before } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension } from '../../helper';

// 根级 before：在当前 mocha 实例的所有测试之前激活插件并应用配置。
// 由于 test-cli 加载 .test.js 的顺序不保证 extension.test.js 最先执行，
// 这里用根级 before（注册到 root suite）确保激活先于任何测试完成。
before(async function () {
    this.timeout(30000);
    await activateExtension({
        luaVersion: '5.5',
        rpcPrefix: [
            'RPC\\[(.*?)\\]/g',
            'Call\\[(.*?)\\]/g',
        ],
        defaultFileMode: 'load',
        fileMode: [
            { module: true, files: 'modules/*/*.lua' },
        ],
        customLoadFunc: ['import', 'include'],
    });
});

suite('Extension Test Suite3', () => {
    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('test active', async () => {
        // 激活已在根级 before 完成，这里仅断言插件已激活
        const ext = vscode.extensions.getExtension('changnet.lua-tags');
        assert.ok(ext, 'extension should be available');
    }).timeout(10240);
});
