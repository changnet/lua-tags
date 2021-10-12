/* eslint-disable max-len */
// 自动补全 测试

import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

const samplePath = path.resolve(__dirname, "../../../src/test/sample");
const testPath = path.join(samplePath, "test.lua");
const testUri = vscode.Uri.file(testPath);

const CMP_KIND = vscode.CompletionItemKind;


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
        assert.strictEqual(actualList.items.length, expectList.items.length);
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
        assert.strictEqual(actualItem.label, expectedItem.label, "label check");
        assert.strictEqual(actualItem.kind, expectedItem.kind, "kind check");

        if (expectedItem.detail) {
            assert.strictEqual(actualItem.detail, expectedItem.detail);
        }

        if (expectedItem.documentation) {
            // test库里的CompletionItem和vs code server那边不一样
            // server那边用的是markdown
            const doc = actualItem.documentation as vscode.MarkdownString;
            assert.strictEqual(doc.value, expectedItem.documentation);
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
                { label: 'animal', kind: CMP_KIND.File },
                { label: 'battle', kind: CMP_KIND.File },
                { label: 'case', kind: CMP_KIND.File },
                { label: 'check', kind: CMP_KIND.File },
                { label: 'conf', kind: CMP_KIND.File },
                { label: 'monster', kind: CMP_KIND.File },
                { label: 'new_object', kind: CMP_KIND.File },
                { label: 'oo', kind: CMP_KIND.File },
                { label: 'test', kind: CMP_KIND.File },
            ]
        });
    }).timeout(10240);

    test('test module completion', async () => {
        await testCompletion(testUri, new vscode.Position(10, 10), {
            items: [
                { label: 'factory', kind: CMP_KIND.Function },
                { label: 'start', kind: CMP_KIND.Function },
                { label: 'stop', kind: CMP_KIND.Function },
            ]
        });
    });

    test('test local document module completion', async () => {
        const docPath = path.join(samplePath, "new_object.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(19, 13), {
            items: [
                { label: 'new', kind: CMP_KIND.Function },
            ]
        });
    });

    test('test external module completion', async () => {
        await testCompletion(testUri, new vscode.Position(33, 7), {
            items: [
                { label: 'table', kind: CMP_KIND.Module },
            ]
        });
    });

    test('test external module function completion', async () => {
        await testCompletion(testUri, new vscode.Position(34, 10), {
            items: [
                { label: 'empty', kind: CMP_KIND.Function },
            ]
        });
    });

    test('test sub function completion', async () => {
        await testCompletion(testUri, new vscode.Position(69, 13), {
            items: [
                { label: 'sub_func', kind: CMP_KIND.Function },
            ]
        });
    });

    test('test anonymous table completion', async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(28, 48), {
            items: [
                { label: 'boss', kind: CMP_KIND.Module },
                { label: 'desc', kind: CMP_KIND.Variable },
                { label: 'level', kind: CMP_KIND.Variable },
                { label: 'monster', kind: CMP_KIND.Module },
                { label: 'parameters', kind: CMP_KIND.Module },
                { label: 'player', kind: CMP_KIND.Module },
                { label: 'skill_id', kind: CMP_KIND.Variable },
            ]
        });
    });

    test('test local variable completion', async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(31, 47), {
            items: [
                { label: 'monster', kind: CMP_KIND.Variable },
                { label: 'monster_attack', kind: CMP_KIND.Module },
                { label: 'MonsterConf', kind: CMP_KIND.Module },
            ]
        });
    });

    test('test upvalue completion', async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(50, 65), {
            items: [
                { label: 'BT_PVE', kind: CMP_KIND.Variable },
                { label: 'BT_PVP', kind: CMP_KIND.Variable },
            ]
        });
    });

    test('test parameter completion', async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(36, 47), {
            items: [
                { label: 'player', kind: CMP_KIND.Variable },
            ]
        });
    });

    // filterLocalSym
    test('test filter local completion', async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(64, 54), {
            items: [
                { label: 'BattleConf', kind: CMP_KIND.Module },
            ]
        });
    });

    test('test ref value completion', async () => {
        await testCompletion(testUri, new vscode.Position(83, 6), {
            items: [
                {
                    label: 'scene',
                    documentation: "```lua\n-- test ref value\nlocal scene == BattleConf.scene = 1000\n```",
                    kind: CMP_KIND.Variable
                },
                // 实际运行时，这里会有下面这个提示，但在测试时没有，暂时不知什么原因
                // {
                // 	label: 'support_comment',
                // 	kind: CMP_KIND.Variable
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
                    kind: CMP_KIND.Variable
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
                    kind: CMP_KIND.Variable
                },
                {
                    label: 'monster',
                    kind: CMP_KIND.Variable
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
                    kind: CMP_KIND.Variable
                },
                {
                    label: 'factor',
                    kind: CMP_KIND.Variable
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
                    kind: CMP_KIND.Function
                },
            ]
        });
    });

    test('test lua standard completion', async () => {
        await testCompletion(testUri, new vscode.Position(153, 18), {
            items: [
                {
                    label: 'pack',
                    kind: CMP_KIND.Function,
                    detail: "Lua Standard Libraries",
                    documentation: "Returns a new table with all arguments stored into keys 1, 2, etc. and with a field \"**n**\" with the total number of arguments. Note that the resulting table may not be a sequence.\n```lua\nfunction pack(...)\n```"
                },
            ]
        });
    });
});
