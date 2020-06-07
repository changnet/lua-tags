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
async function testWorkspaceSymbol(query: string, expect: string[]) {
	const actualList = (await vscode.commands.executeCommand(
		"vscode.executeWorkspaceSymbolProvider", query)
	) as vscode.SymbolInformation[];

	assert.equal(actualList.length, expect.length, "workspace symbol count");

	actualList.sort((src, dst) => {
		if (src.name === dst.name) {
			return 0;
		}
		return src.name > dst.name ? 1 : 0;
	});

	//console.log(`check ${JSON.stringify(actualList)}`);
	expect.forEach((name, index) => {
		assert.equal(actualList[index].name, name, "sym name");
	});
}

// test document symbol
async function testDocumentSymbol(
	uri: vscode.Uri, items: vscode.SymbolInformation[]) {
	const rawList = (await vscode.commands.executeCommand(
		"vscode.executeDocumentSymbolProvider", uri));

	// console.log(`check ${JSON.stringify(rawList)}`);
	const list = rawList as vscode.SymbolInformation[];
	assert.equal(list.length, items.length, "document symbol count");
	items.forEach((sym, index) => {
		assert.equal(sym.name, list[index].name);
	});
}

// test auto completion
async function testCompletion(
	docUri: vscode.Uri,
	position: vscode.Position,
	expectList: vscode.CompletionList) {
	// const doc = await vscode.workspace.openTextDocument(testUri);
	// await vscode.window.showTextDocument(doc);

	// https://code.visualstudio.com/api/references/commands
	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualList = (await vscode.commands.executeCommand(
		'vscode.executeCompletionItemProvider',
		docUri,
		position
	)) as vscode.CompletionList;

	// console.log(`check completion ${JSON.stringify(actualList)}`);
	assert.equal(actualList.items.length, expectList.items.length);
	// vs code返回的数组是不规则的，内容是同一样的
	// 但位置不一定，导致多次测试结果不一致，暂时不知道原因
	actualList.items.sort((src, dst) => {
		if (src.label === dst.label) {
			return 0;
		}
		return src.label > dst.label ? 1 : 0;
	});
	expectList.items.forEach((expectedItem, i) => {
		const actualItem = actualList.items[i];
		assert.equal(actualItem.label, expectedItem.label, "label check");
		assert.equal(actualItem.kind, expectedItem.kind, "kind check");
		if (expectedItem.detail) {
			assert.equal(actualItem.detail, expectedItem.detail, "detail check");
		}
	});
}

// test go to definition
async function testGoToDefinition(uri: vscode.Uri,
	position: vscode.Position, expectList: vscode.Location[]) {

	const actualList = (await vscode.commands.executeCommand(
		'vscode.executeDefinitionProvider',
		uri,
		position
	)) as vscode.Location[];

	// console.log(`${JSON.stringify(actualList)}`);

	if (actualList.length !== expectList.length) {
		console.log(`${JSON.stringify(expectList)}`);
		console.log(`${JSON.stringify(actualList)}`);
		assert.equal(actualList.length, expectList.length);
	}
	expectList.forEach((expectedItem, index) => {
		const actualItem = actualList[index];
		assert.equal(actualItem.uri.path, expectedItem.uri.path);

		const actualRange = actualItem.range;
		const expectRange = expectedItem.range;
		assert.equal(actualRange.start.line, expectRange.start.line);
		assert.equal(actualRange.start.character, expectRange.start.character);
		assert.equal(actualRange.end.line, expectRange.end.line);
		assert.equal(actualRange.end.character, expectRange.end.character);
	});
}


// test hover
async function testHover(uri: vscode.Uri,
	position: vscode.Position, expectList: vscode.Hover[]) {

	const actualList = (await vscode.commands.executeCommand(
		'vscode.executeHoverProvider',
		uri,
		position
	)) as vscode.Hover[];

	// console.log(`${JSON.stringify(actualList)}`);

	assert.equal(actualList.length, expectList.length);
	expectList.forEach((expectedItem, index) => {
		const actualItem = actualList[index];
		expectedItem.contents.forEach((ctx, ctxIdx) => {
			const expectCtx = ctx as vscode.MarkdownString;
			const actualCtx = actualItem.contents[ctxIdx] as vscode.MarkdownString;
			assert.equal(actualCtx.value, expectCtx.value);
		});
	});
}

// test signature help
async function testSignatureHelp(uri: vscode.Uri,
	position: vscode.Position, expect: vscode.SignatureHelp) {

	const actual = (await vscode.commands.executeCommand(
		'vscode.executeSignatureHelpProvider',
		uri,
		position
	)) as vscode.SignatureHelp;

	// console.log(`${JSON.stringify(actualList)}`);

	assert.equal(
		actual.activeParameter, expect.activeParameter, "activeparameter");
	assert.equal(
		actual.activeSignature, expect.activeSignature, "active signature");

	expect.signatures.forEach((expectedItem, index) => {
		const actualItem = actual.signatures[index];
		assert.equal(actualItem.label, expectedItem.label, "label");
		assert.equal(actualItem.parameters.length,
			expectedItem.parameters.length, "parameters length");
		assert.equal(actualItem.documentation,
			expectedItem.documentation, "documentation");
		expectedItem.parameters.forEach((param, paramIdx) => {
			const actualParam = actualItem.parameters[paramIdx];
			assert.equal(actualParam.label[0], param.label[0], "param label 0");
			assert.equal(actualParam.label[1], param.label[1], "param label 1");
		});
	});
}


// test lua check
// !!! 如果需要测试其他文件，注意修改.luacheckrc !!!
async function testLuaCheck(uri: vscode.Uri, expectList: vscode.Diagnostic[]) {

	const actualList = vscode.languages.getDiagnostics(uri);

	// console.log(`${JSON.stringify(actualList)}`);

	assert.equal(actualList.length, expectList.length);
	expectList.forEach((expectedItem, index) => {
		const actualItem = actualList[index];
		assert.equal(actualItem.severity, expectedItem.severity, "serverity");
		assert.equal(actualItem.message, expectedItem.message, "message");
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
		await testWorkspaceSymbol("mon", [
			"monster", "MonsterConf", "Monster", "Monster", "multi_comment"
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

	// FIXME: this test expect a empty array but always fail
	// test('test no function itself parameters completion', async () => {
	// 	await testCompletion(testUri, new vscode.Position(78, 27), {
	// 		items: []
	// 	});
	// });

	test('test require path completion', async () => {
		await testCompletion(testUri, new vscode.Position(4, 16), {
			items: [
				{ label: 'animal', kind: vscode.CompletionItemKind.File },
				{ label: 'battle', kind: vscode.CompletionItemKind.File },
				{ label: 'check', kind: vscode.CompletionItemKind.File },
				{ label: 'conf', kind: vscode.CompletionItemKind.File },
				{ label: 'monster', kind: vscode.CompletionItemKind.File },
				{ label: 'new_object', kind: vscode.CompletionItemKind.File },
				{ label: 'oo', kind: vscode.CompletionItemKind.File },
				{ label: 'test', kind: vscode.CompletionItemKind.File },
			]
		});
	}).timeout(10240);

	test('test module completion', async () => {
		await testCompletion(testUri, new vscode.Position(10, 10), {
			items: [
				{ label: 'factory', kind: vscode.CompletionItemKind.Function },
				{ label: 'start', kind: vscode.CompletionItemKind.Function },
				{ label: 'stop', kind: vscode.CompletionItemKind.Function },
			]
		});
	});

	test('test local document module completion', async () => {
		const docPath = path.join(samplePath, "new_object.lua");

		const uri = vscode.Uri.file(docPath);
		await testCompletion(uri, new vscode.Position(19, 13), {
			items: [
				{ label: 'new', kind: vscode.CompletionItemKind.Function },
			]
		});
	});

	test('test external module completion', async () => {
		await testCompletion(testUri, new vscode.Position(33, 7), {
			items: [
				{ label: 'table', kind: vscode.CompletionItemKind.Module },
			]
		});
	});

	test('test external module function completion', async () => {
		await testCompletion(testUri, new vscode.Position(34, 9), {
			items: [
				{ label: 'empty', kind: vscode.CompletionItemKind.Function },
			]
		});
	});

	test('test sub function completion', async () => {
		await testCompletion(testUri, new vscode.Position(69, 13), {
			items: [
				{ label: 'sub_func', kind: vscode.CompletionItemKind.Function },
			]
		});
	});

	test('test anonymous table completion', async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testCompletion(uri, new vscode.Position(28, 48), {
			items: [
				{ label: 'boss', kind: vscode.CompletionItemKind.Module },
				{ label: 'desc', kind: vscode.CompletionItemKind.Variable },
				{ label: 'level', kind: vscode.CompletionItemKind.Variable },
				{ label: 'monster', kind: vscode.CompletionItemKind.Module },
				{ label: 'parameters', kind: vscode.CompletionItemKind.Module },
				{ label: 'player', kind: vscode.CompletionItemKind.Module },
				{ label: 'skill_id', kind: vscode.CompletionItemKind.Variable },
			]
		});
	});

	test('test local variable completion', async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testCompletion(uri, new vscode.Position(31, 47), {
			items: [
				{ label: 'Monster', kind: vscode.CompletionItemKind.Module },
				{ label: 'monster', kind: vscode.CompletionItemKind.Variable },
				{ label: 'monster_attack', kind: vscode.CompletionItemKind.Module },
				{ label: 'MonsterConf', kind: vscode.CompletionItemKind.Module },
			]
		});
	});

	test('test upvalue completion', async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testCompletion(uri, new vscode.Position(50, 65), {
			items: [
				{ label: 'BT_PVE', kind: vscode.CompletionItemKind.Variable },
				{ label: 'BT_PVP', kind: vscode.CompletionItemKind.Variable },
			]
		});
	});

	test('test parameter completion', async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testCompletion(uri, new vscode.Position(36, 47), {
			items: [
				{ label: 'player', kind: vscode.CompletionItemKind.Variable },
			]
		});
	});

	// 当一个符号被多个文档本地化时，要能过滤掉其他文档中的本地符号
	test('test filter local completion', async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testCompletion(uri, new vscode.Position(68, 6), {
			items: [
				{ label: 'new', kind: vscode.CompletionItemKind.Function },
			]
		});
	});

	test('test ref value completion', async () => {
		await testCompletion(testUri, new vscode.Position(83, 7), {
			items: [
				{
					label: 'MonsterConf',
					kind: vscode.CompletionItemKind.Module
				},
				{
					label: 'scene',
					detail: "-- test ref value\nlocal scene -> BattleConf.scene = 1000",
					kind: vscode.CompletionItemKind.Variable
				},
				{
					label: 'support_comment',
					kind: vscode.CompletionItemKind.Variable
				},
			]
		});
	});

	// 局部符号多次赋值时应该被过滤掉
	test('test local duplicate symbol filter completion', async () => {
		await testCompletion(testUri, new vscode.Position(108, 15), {
			items: [
				{
					label: 'lsdf_name',
					kind: vscode.CompletionItemKind.Variable
				},
			]
		});
	});

	// 全局符号递归搜索
	test('test global recursive search symbol completion', async () => {
		await testCompletion(testUri, new vscode.Position(112, 28), {
			items: [
				{
					label: 'boss',
					kind: vscode.CompletionItemKind.Variable
				},
				{
					label: 'monster',
					kind: vscode.CompletionItemKind.Variable
				},
			]
		});
	});

	// 当前文档符号递归搜索
	test('test document recursive search symbol completion', async () => {
		await testCompletion(testUri, new vscode.Position(118, 13), {
			items: [
				{
					label: 'effect',
					kind: vscode.CompletionItemKind.Variable
				},
				{
					label: 'factor',
					kind: vscode.CompletionItemKind.Variable
				},
			]
		});
	});

	// 当前文档符号递归搜索
	test('test wrap completion', async () => {
		await testCompletion(testUri, new vscode.Position(150, 11), {
			items: [
				{
					label: 'class',
					kind: vscode.CompletionItemKind.Function
				},
			]
		});
	});

	test("test require path definition", async () => {
		const docPath = path.join(samplePath, "conf", "battle_conf.lua");
		await testGoToDefinition(testUri, new vscode.Position(6, 33), [{
			uri: vscode.Uri.file(docPath),
			range: new vscode.Range(0, 0, 0, 0)
		}
		]);
	});

	test("test parameter definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(36, 16), [{
			uri: uri,
			range: new vscode.Range(19, 20, 19, 26)
		}
		]);
	});

	// 用局部变量覆盖同名变量
	test("test shadowing definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(30, 32), [{
			uri: uri,
			range: new vscode.Range(29, 45, 29, 51)
		}
		]);
	});

	test("test for number loop definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(30, 21), [{
			uri: uri,
			range: new vscode.Range(26, 18, 26, 25)
		}
		]);
	});

	test("test for loop definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(42, 21), [{
			uri: uri,
			range: new vscode.Range(41, 19, 41, 29)
		}
		]);
	});

	test("test repeat definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(47, 30), [{
			uri: uri,
			range: new vscode.Range(45, 18, 45, 28)
		}
		]);
	});

	test("test upvalue definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(50, 44), [{
			uri: uri,
			range: new vscode.Range(16, 8, 16, 14)
		}
		]);
	});

	test("test no definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(54, 45), []);
	});

	test("test multi definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(54, 20), [{
			uri: vscode.Uri.file(path.join(samplePath, "animal.lua")),
			range: new vscode.Range(11, 0, 12, 3)
		}, {
			uri: vscode.Uri.file(path.join(samplePath, "monster.lua")),
			range: new vscode.Range(7, 0, 8, 3)
		}

		]);
	});

	test("test position filter definition", async () => {
		await testGoToDefinition(testUri, new vscode.Position(49, 7), [{
			uri: testUri,
			range: new vscode.Range(49, 6, 49, 9)
		}
		]);
	});

	// 符号被同名本地化时，要能区分本地和全局
	test("test localize filter definition", async () => {
		await testGoToDefinition(testUri, new vscode.Position(49, 14), [{
			uri: testUri,
			range: new vscode.Range(45, 0, 48, 3)
		}
		]);
	});

	test("test local unreachable definition", async () => {
		await testGoToDefinition(testUri, new vscode.Position(77, 2), [{
			uri: testUri,
			range: new vscode.Range(78, 0, 79, 3)
		}
		]);
	});

	test("test main chunk for loop local var definition", async () => {
		await testGoToDefinition(testUri, new vscode.Position(88, 15), [{
			uri: testUri,
			range: new vscode.Range(87, 10, 87, 15)
		}
		]);
	});

	// 当require bbb时，不要跳转到aaabbb
	test("test require file path definition", async () => {
		await testGoToDefinition(testUri, new vscode.Position(141, 37), []);
	});

	test("test query no base but symbol has hove", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		const val = "\`\`\`lua\nBT_PVP = 1 -- player vs player\n\`\`\`";
		await testHover(uri, new vscode.Position(15, 12), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test local hove", async () => {
		const val = "\`\`\`lua\n-- 测试声明多个变量\nlocal N = 1\n\`\`\`";
		await testHover(testUri, new vscode.Position(13, 9), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test main chunk do end block local hove", async () => {
		const val = "```lua\nlocal var = 100 -- const\n```";
		await testHover(testUri, new vscode.Position(96, 17), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test table hove", async () => {
		const val = "\`\`\`lua\n-- 测试声明多个变量\n(table) local M\n\`\`\`";
		await testHover(testUri, new vscode.Position(13, 7), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test file path hove", async () => {
		const val = 'battle_conf.lua\n```lua\nmax_player = 8\n```';
		await testHover(testUri, new vscode.Position(42, 64), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test module hove", async () => {
		const val = "\`\`\`lua\n(module) table\n\`\`\`";
		await testHover(testUri, new vscode.Position(30, 1), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test multi function hove", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		const val = 'animal.lua\n```lua\n-- called when the animal be killed\nfunction Animal:on_kill(who, ...)\n```\n---\nmonster.lua\n```lua\n-- called when monster was killed\nfunction Monster:on_kill(who, ...)\n```';
		await testHover(uri, new vscode.Position(54, 20), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test multi comment hove", async () => {
		const val = "```lua\n-- 测试混合多行注释\n-- comment 111\n--[[\n    这是\n    多行\n    注释\n]]\nlocal multi_comment = true\n```";
		await testHover(testUri, new vscode.Position(62, 14), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test multi comment break by code hove", async () => {
		const val = '```lua\nfunction cmt() -- 测试注释1\n```';
		await testHover(testUri, new vscode.Position(49, 13), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test should not have comment hove", async () => {
		const val = '```lua\nlocal support_comment = 9\n```';
		await testHover(testUri, new vscode.Position(53, 17), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test ref value hove", async () => {
		const val = "```lua\n-- test ref value\nlocal scene -> BattleConf.scene = 1000\n```";
		await testHover(testUri, new vscode.Position(82, 9), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test ref function hove", async () => {
		const val = "```lua\nlocal empty -> function table.empty(tbl)\n-- test function assignment\n-- multiline comment1\n-- multiline comment2\n```";
		await testHover(testUri, new vscode.Position(124, 18), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test member ref function hove", async () => {
		const val = "```lua\nref_tbl.empty -> function table.empty(tbl)\n-- test function assignment\n-- multiline comment1\n-- multiline comment2\n```";
		await testHover(testUri, new vscode.Position(127, 10), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test same name ref symbol dead loop hove", async () => {
		const val = "```lua\nlocal ipair -> ipair\n```";
		await testHover(testUri, new vscode.Position(129, 8), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test document recursive search hover", async () => {
		const val = "skill_conf.lua\n```lua\nfactor = 0.01\n```";
		await testHover(testUri, new vscode.Position(119, 33), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test const expression hover", async () => {
		const val = "```lua\n-- test const expression hover\nlocal const_v = -16 + 1 << 32 + 8 >> \"32\" + 2 * 4 - 5 / 2 + 8 % 2\n```";
		await testHover(testUri, new vscode.Position(135, 11), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test table function hover", async () => {
		const val = "```lua\nfunction ENUM.E_FUNCTION() -- enum function\n```";
		await testHover(testUri, new vscode.Position(22, 6), [{
			contents: [{ value: val } as vscode.MarkdownString],
		}
		]);
	});

	test("test other file signature help", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testSignatureHelp(uri, new vscode.Position(54, 31), {
			signatures: [{
				label: 'function on_kill(who, ...)',
				parameters: [
					{ label: [17, 20] }, { label: [22, 25] }
				],
				documentation: 'animal.lua\n-- called when the animal be killed'
			}, {
				label: 'function on_kill(who, ...)',
				parameters: [
					{ label: [17, 20] }, { label: [22, 25] }
				],
				documentation: 'monster.lua\n-- called when monster was killed'
			}
			],
			activeSignature: 0,
			activeParameter: 1
		});
	});

	test("test multi signature help", async () => {
		await testSignatureHelp(testUri, new vscode.Position(42, 75), {
			signatures: [{
				label: 'function signature_help(a, b, c)',
				parameters: []
			}, {
				label: 'function signature_help(a, b, c, d)',
				parameters: [
					{ label: [24, 25] }, { label: [27, 28] },
					{ label: [30, 31] }, { label: [33, 34] },
				]
			}
			],
			activeSignature: 1,
			activeParameter: 3
		});
	});

	test("test no self function defintion signature help", async () => {
		await testSignatureHelp(testUri, new vscode.Position(78, 57), {
			signatures: [
			],
			activeSignature: 0,
			activeParameter: 0
		});
	});

	// local comp = string_comp，comp应该能提示string_comp的参数
	test("test ref function signature help", async () => {
		await testSignatureHelp(testUri, new vscode.Position(132, 17), {
			signatures: [{
				label: 'function empty -> table.empty(tbl)',
				parameters: [
					{ label: [30, 33] },
				],
				documentation: '-- test function assignment\n-- multiline comment1\n-- multiline comment2'
			}
			],
			activeSignature: 0,
			activeParameter: 0
		});
	});

	test("test exclude dir definition", async () => {
		await testGoToDefinition(testUri, new vscode.Position(73, 21), []);
	});

	// 当一个符号被多个文档本地化时，要能过滤掉其他文档中的本地符号
	test("test filter local definition", async () => {
		const docPath = path.join(samplePath, "battle.lua");

		const uri = vscode.Uri.file(docPath);
		await testGoToDefinition(uri, new vscode.Position(64, 23), [{
			uri: vscode.Uri.file(
				path.join(samplePath, "conf", "battle_conf.lua")),
			range: new vscode.Range(2, 0, 17, 1)
		}]);
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
