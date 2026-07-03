import { before } from 'mocha';
import * as vscode from 'vscode';
import { activateExtension } from '../../helper';

suite('Extension Test Suite3', () => {
    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('test active', async () => {
        await activateExtension();
    }).timeout(10240);
});
