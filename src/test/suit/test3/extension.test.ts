import { before } from 'mocha';
import * as vscode from 'vscode';
import { activateExtension } from '../../helper';

suite('Extension Test Suite3', () => {
    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('test active', async () => {
        // 必须以高版本启动，否则 <const>/<close> 以及 Lua 5.5 的 global 关键字等会被当作语法错误
        await activateExtension({ luaVersion: '5.5' });
    }).timeout(10240);
});
