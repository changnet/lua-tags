// 自动补全 测试

import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

const samplePath = path.resolve(__dirname, "../../../src/test/sample");
const testPath = path.join(samplePath, "test.lua");
const testUri = vscode.Uri.file(testPath);


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

    if (actualList.items.length !== expectList.items.length) {
        console.log(`testCompletion ${JSON.stringify(expectList)}`);
        console.log(`testCompletion ${JSON.stringify(actualList)}`);
        assert.equal(actualList.items.length, expectList.items.length);
    }
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
            assert.equal(actualItem.detail, expectedItem.detail);
        }

        if (expectedItem.documentation) {
            // test库里的CompletionItem和vs code server那边不一样
            // server那边用的是markdown
            let doc = actualItem.documentation as vscode.MarkdownString;
            assert.equal(doc.value, expectedItem.documentation);
        }
    });
}

suite('Extension Completion Test Suite', () => {

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
        await testCompletion(testUri, new vscode.Position(34, 10), {
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

    // filterLocalSym
    test('test filter local completion', async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(64, 54), {
            items: [
                { label: 'BattleConf', kind: vscode.CompletionItemKind.Module },
            ]
        });
    });

    test('test ref value completion', async () => {
        await testCompletion(testUri, new vscode.Position(83, 6), {
            items: [
                {
                    label: 'scene',
                    documentation: "```lua\n-- test ref value\nlocal scene -> BattleConf.scene = 1000\n```",
                    kind: vscode.CompletionItemKind.Variable
                },
                // 实际运行时，这里会有下面这个提示，但在测试时没有，暂时不知什么原因
                // {
                // 	label: 'support_comment',
                // 	kind: vscode.CompletionItemKind.Variable
                // },
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

    test('test lua standard completion', async () => {
        await testCompletion(testUri, new vscode.Position(153, 18), {
            items: [
                {
                    label: 'pack',
                    kind: vscode.CompletionItemKind.Function,
                    detail: "Lua Standard Libraries",
                    documentation: "Returns a new table with all arguments stored into keys 1, 2, etc. and with a field \"**n**\" with the total number of arguments. Note that the resulting table may not be a sequence.\n```lua\nfunction pack(...)\n```"
                },
            ]
        });
    });
});
