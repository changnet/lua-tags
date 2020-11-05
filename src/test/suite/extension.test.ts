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
		await conf.update('excludeDir', ['exclude/*']);

		// The extensionId is `publisher.name` from package.json
		const ext = vscode.extensions.getExtension('changnet.lua-tags')!;
		await ext.activate();
		// Wait for server activation and parse all file
		// it took a little time at my poor laptop
		await sleep(5000);
	} catch (e) {
		assert.ok(false, `error in activate extension ${e}`);
	}
}

// test work space symbol
async function testWorkspaceSymbol(query: string, expect: vscode.SymbolInformation[]) {
	const actualList = (await vscode.commands.executeCommand(
		"vscode.executeWorkspaceSymbolProvider", query)
	) as vscode.SymbolInformation[];

	assert.strictEqual(actualList.length, expect.length, "workspace symbol count");

	actualList.sort((src, dst) => {
		if (src.name === dst.name) {
			return src.location.uri.toString() > dst.location.uri.toString()
				? 1 : 0;
		}
		return src.name > dst.name ? 1 : 0;
	});

	//console.log(`check ${JSON.stringify(actualList)}`);
	expect.forEach((exp, index) => {
		const act = actualList[index];
		assert.strictEqual(act.name, exp.name, "sym name");
		assert.strictEqual(act.location.uri.toString(), exp.location.uri.toString(), "location");
	});
}

// test document symbol
async function testDocumentSymbol(
	uri: vscode.Uri, items: vscode.SymbolInformation[]) {
	const rawList = (await vscode.commands.executeCommand(
		"vscode.executeDocumentSymbolProvider", uri));

	// console.log(`check ${JSON.stringify(rawList)}`);
	const list = rawList as vscode.SymbolInformation[];
	assert.strictEqual(list.length, items.length, "document symbol count");
	items.forEach((sym, index) => {
		assert.strictEqual(sym.name, list[index].name);
	});
}

// test lua check
// !!! 如果需要测试其他文件，注意修改.luacheckrc !!!
async function testLuaCheck(uri: vscode.Uri, expectList: vscode.Diagnostic[]) {

	const actualList = vscode.languages.getDiagnostics(uri);

	// console.log(`${JSON.stringify(actualList)}`);

	assert.strictEqual(actualList.length, expectList.length);
	expectList.forEach((expectedItem, index) => {
		const actualItem = actualList[index];
		assert.strictEqual(actualItem.severity, expectedItem.severity, "serverity");
		assert.strictEqual(actualItem.message, expectedItem.message, "message");
	});
}

// BDD测试用descript、it
// TDD测试用suite、test

suite('Extension Test Suite', () => {
	before(() => {
		vscode.window.showInformationMessage('Start all tests.');
	});

	// timeout设置超时时间 
	test("test active", async () => {
		await activateExtension();
	}).timeout(10240);

	test('test no workspace symbol', async () => {
		await testWorkspaceSymbol("", []);
	});

	// 工作区所有符号模糊搜索
	test('test fuzz workspace symbol', async () => {
		const range = new vscode.Range(0, 0, 0, 0);
		const uri0 = vscode.Uri.file(path.join(samplePath, "conf", "battle_conf.lua"));
		const uri1 = vscode.Uri.file(path.join(samplePath, "conf", "monster_conf.lua"));
		const uri2 = vscode.Uri.file(path.join(samplePath, "conf", "skill_conf.lua"));
		const uri3 = vscode.Uri.file(path.join(samplePath, "test.lua"));
		const uri4 = vscode.Uri.file(path.join(samplePath, "monster.lua"));
		await testWorkspaceSymbol("mon", [
			{ name: "monster", kind: 0, containerName: "", location: { uri: uri0, range: range } },
			{ name: "MonsterConf", kind: 0, containerName: "", location: { uri: uri1, range: range } },
			{ name: "monster", kind: 0, containerName: "", location: { uri: uri2, range: range } },
			{ name: "Monster", kind: 0, containerName: "", location: { uri: uri4, range: range } },
			{ name: "Monster", kind: 0, containerName: "", location: { uri: uri3, range: range } },
		]);
	});

	test("test anonymous table document symbol", async () => {
		const uri = vscode.Uri.file("");
		const range = new vscode.Range(0, 0, 0, 0);

		const docPath = path.join(samplePath, "conf", "skill_conf.lua");
		await testDocumentSymbol(vscode.Uri.file(docPath), [
			{ name: "skill_id", kind: 0, containerName: "", location: { uri: uri, range: range } },
			{ name: "level", kind: 0, containerName: "", location: { uri: uri, range: range } },
			{ name: "desc", kind: 0, containerName: "", location: { uri: uri, range: range } },
			{ name: "parameters", kind: 0, containerName: "", location: { uri: uri, range: range } },
			{ name: "boss", kind: 0, containerName: "", location: { uri: uri, range: range } },
			{ name: "monster", kind: 0, containerName: "", location: { uri: uri, range: range } },
			{ name: "player", kind: 0, containerName: "", location: { uri: uri, range: range } },
		]);
	});

	test("test table document symbol", async () => {
		const uri = vscode.Uri.file("");
		const range = new vscode.Range(0, 0, 0, 0);

		const docPath = path.join(samplePath, "conf", "battle_conf.lua");
		await testDocumentSymbol(vscode.Uri.file(docPath), [
			{ name: "BattleConf", kind: 0, containerName: "", location: { uri: uri, range: range } }
			// 这里需要注意下，BattleConf包含下面这几个符号信息(在OUTLINE可以折叠)，这个接口只返回一个符号
			// TODO:暂时不知道原因
			// {name: "max_player", kind: 0, containerName: "", location: {uri: uri, range: range}},
			// {name: "scene", kind: 0, containerName: "", location: {uri: uri, range: range}},
			// {name: "timeout", kind: 0, containerName: "", location: {uri: uri, range: range}},
		]);
	});

	test('test luacheck', async () => {
		const docPath = path.join(samplePath, "check.lua");

		const uri = vscode.Uri.file(docPath);
		await testLuaCheck(uri, [{
			range: new vscode.Range(0, 0, 0, 0),
			severity: vscode.DiagnosticSeverity.Warning,
			message: "(W211)unused variable 'foo'",
		}, {
			range: new vscode.Range(0, 0, 0, 0),
			severity: vscode.DiagnosticSeverity.Warning,
			message: "(W211)unused function 'bar'",
		}]);
	}).timeout(2000);

	test('test large file luacheck', async () => {
		const docPath = path.join(samplePath, "conf", "monster_conf.lua");

		const uri = vscode.Uri.file(docPath);
		await testLuaCheck(uri, [{
			range: new vscode.Range(0, 0, 0, 0),
			severity: vscode.DiagnosticSeverity.Warning,
			message: "(W111)setting non-standard global variable 'MonsterConf'",
		}, {
			range: new vscode.Range(0, 0, 0, 0),
			severity: vscode.DiagnosticSeverity.Warning,
			message: "(W211)unused variable 'MK'",
		}]);
	}).timeout(2000);


});
