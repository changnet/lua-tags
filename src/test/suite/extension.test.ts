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
async function activateExtension() {
	try {
		const conf = vscode.workspace.getConfiguration('lua-tags');
		await conf.update('excludeDir',['exclude/*']);

		// The extensionId is `publisher.name` from package.json
		const ext = vscode.extensions.getExtension('changnet.lua-tags')!;
		await ext.activate();
		await sleep(2000); // Wait for server activation
	} catch (e) {
		assert.ok(false, `error in activate extension ${e}`);
	}
}

// test work space symbol
async function testWorkspaceSymbol() {
	const list = (await vscode.commands.executeCommand(
		"vscode.executeWorkspaceSymbolProvider", "")) as vscode.SymbolInformation[];

	// console.log(`check ${JSON.stringify(list)}`);
	assert.equal(list.length, 46);
}

// test document symbol
async function testDocumentSymbol(uri: vscode.Uri, items: vscode.SymbolInformation[]) {
	const rawList = (await vscode.commands.executeCommand(
		"vscode.executeDocumentSymbolProvider", uri));

	console.log(`check ${JSON.stringify(rawList)}`);
	const list = rawList  as vscode.SymbolInformation[];
	assert.equal(list.length, items.length);
	items.forEach((sym, index) => {
		assert.equal(sym.name, list[index].name);
	});
}

// test auto completion
async function testCompletion(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectedCompletionList: vscode.CompletionList
) {	
	const doc = await vscode.workspace.openTextDocument(testUri);
	await vscode.window.showTextDocument(doc);

	// https://code.visualstudio.com/api/references/commands
	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualCompletionList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		docUri,
		position
	)) as vscode.CompletionList;

	// console.log(`${JSON.stringify(actualCompletionList)}`);

	assert.equal(actualCompletionList.items.length, expectedCompletionList.items.length);
	expectedCompletionList.items.forEach((expectedItem, i) => {
		const actualItem = actualCompletionList.items[i];
		assert.equal(actualItem.label, expectedItem.label);
		assert.equal(actualItem.kind, expectedItem.kind);
	});
}

// BDD测试用descript、it
// TDD测试用suite、test

suite('Extension Test Suite', () => {
	before(() => {
		vscode.window.showInformationMessage('Start all tests.');
	});

	// timeout设置超时时间 
	test("test active", async ()=> {
		await activateExtension();
	}).timeout(10240);

	test('test workspace symbol', async () => {
		await testWorkspaceSymbol();
	});

	test("test anonymous table document symbol", async ()=> {
		const uri = vscode.Uri.file("");
		const range = new vscode.Range(0, 0, 0, 0);

		const docPath = path.join(samplePath, "conf", "skill_conf.lua");
		await testDocumentSymbol(vscode.Uri.file(docPath), [
			{name: "skill_id", kind: 0, containerName: "", location: {uri: uri, range: range}},
			{name: "level", kind: 0, containerName: "", location: {uri: uri, range: range}},
			{name: "desc", kind: 0, containerName: "", location: {uri: uri, range: range}},
		]);
	});

	test("test table document symbol", async ()=> {
		const uri = vscode.Uri.file("");
		const range = new vscode.Range(0, 0, 0, 0);

		const docPath = path.join(samplePath, "conf", "battle_conf.lua");
		await testDocumentSymbol(vscode.Uri.file(docPath), [
			{name: "BattleConf", kind: 0, containerName: "", location: {uri: uri, range: range}}
			// 这里需要注意下，BattleConf包含下面这几个符号信息(在OUTLINE可以折叠)，这个接口只返回一个符号
			// TODO:暂时不知道原因
			// {name: "max_player", kind: 0, containerName: "", location: {uri: uri, range: range}},
			// {name: "scene", kind: 0, containerName: "", location: {uri: uri, range: range}},
			// {name: "timeout", kind: 0, containerName: "", location: {uri: uri, range: range}},
		]);
	});

	test('test require path completion', async () => {
		await testCompletion(testUri, new vscode.Position(4, 14), {
			items: [
				{ label: 'battle_conf', kind: vscode.CompletionItemKind.File },
				{ label: 'monster_conf', kind: vscode.CompletionItemKind.File },
				{ label: 'skill_conf', kind: vscode.CompletionItemKind.File },
			]
		});
	}).timeout(10240);
});
