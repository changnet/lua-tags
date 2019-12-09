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

const samplePath = path.resolve(__dirname, "../../../src/test/sample");
const testPath = path.join(samplePath, "test.lua");
const testUri = vscode.Uri.file(testPath);

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Activates the vscode extension
 */
export async function activateExtension() {
	try {
		// The extensionId is `publisher.name` from package.json
		const ext = vscode.extensions.getExtension('changnet.lua-tags')!;
		await ext.activate();
		await sleep(2000); // Wait for server activation
	} catch (e) {
		assert.ok(false, `error in activate extension ${e}`);
	}
}

suite('Extension Test Suite', () => {
	before(() => {
		vscode.window.showInformationMessage('Start all tests.');
	});

	activateExtension();

	const conf = Object.create(vscode.workspace.getConfiguration('lua-tags'), {
		'excludeDir': { value: 'exclude/*' }
	});

	async function testWorkspaceSymbol() {
		try {
			const textDocument = await vscode.workspace.openTextDocument(testUri);
		} catch (e) {
			assert.ok(false, `error in OpenTextDocument ${e}`);
		}
	}

	async function testCompletion(
		docUri: vscode.Uri,
		position: vscode.Position,
		expectedCompletionList: vscode.CompletionList
	) {	
		const doc = await vscode.workspace.openTextDocument(testUri);
		await vscode.window.showTextDocument(doc);

		// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
		const actualCompletionList = (await vscode.commands.executeCommand(
			'vscode.executeCompletionItemProvider',
			docUri,
			position
		)) as vscode.CompletionList;
	
		console.log(`${JSON.stringify(actualCompletionList)}`)
		assert.equal(actualCompletionList.items.length, expectedCompletionList.items.length);
		expectedCompletionList.items.forEach((expectedItem, i) => {
			const actualItem = actualCompletionList.items[i];
			assert.equal(actualItem.label, expectedItem.label);
			assert.equal(actualItem.kind, expectedItem.kind);
		});
	}

	test('test workspace symbol', async () => {
		await testWorkspaceSymbol();
		assert.equal(-1, [1, 2, 3].indexOf(5));
		assert.equal(-1, [1, 2, 3].indexOf(0));
	});

	test('test auto completioin', async () => {
		await testCompletion(testUri, new vscode.Position(4, 14), {
			items: [
				{ label: 'anno_conf', kind: vscode.CompletionItemKind.File },
				{ label: 'large_conf', kind: vscode.CompletionItemKind.File },
				{ label: 'lite_conf', kind: vscode.CompletionItemKind.File },
			]
		});
	});
});
