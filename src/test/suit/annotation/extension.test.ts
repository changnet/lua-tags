import { before } from 'mocha';
import * as vscode from 'vscode';
import { activateExtension, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'annotation');

suite('Extension Test Suite2', () => {
    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('test active', async () => {
        await activateExtension();
    }).timeout(10240);
});
