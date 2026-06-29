import * as path from 'path';
import * as vscode from 'vscode';
import { testCompletion, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'core');
const testPath = path.join(fixturePath, "test.lua");
const testUri = vscode.Uri.file(testPath);
const CMP_KIND = vscode.CompletionItemKind;

suite('Extension Completion Test Suite', () => {

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
        const docPath = path.join(fixturePath, "new_object.lua");

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
                { label: 'getmetatable', kind: CMP_KIND.Function },
                { label: 'setmetatable', kind: CMP_KIND.Function },
                { label: 'table', kind: CMP_KIND.Module },
            ]
        });
    });

    test('test external module function completion', async () => {
        await testCompletion(testUri, new vscode.Position(34, 10), {
            items: [
                { label: 'empty', kind: CMP_KIND.Function },
                { label: 'insert', kind: CMP_KIND.Function },
                { label: 'move', kind: CMP_KIND.Function },
                { label: 'remove', kind: CMP_KIND.Function },
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
        const docPath = path.join(fixturePath, "battle.lua");

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
        const docPath = path.join(fixturePath, "battle.lua");

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
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(50, 65), {
            items: [
                { label: 'BT_PVE', kind: CMP_KIND.Variable },
                { label: 'BT_PVP', kind: CMP_KIND.Variable },
            ]
        });
    });

    test('test parameter completion', async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testCompletion(uri, new vscode.Position(36, 47), {
            items: [
                { label: 'player', kind: CMP_KIND.Variable },
            ]
        });
    });

    test('test filter local completion', async () => {
        const docPath = path.join(fixturePath, "battle.lua");

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
                    documentation: "```lua\n-- test ref value\nlocal scene : any == BattleConf.scene = 1000\n```",
                    kind: CMP_KIND.Variable
                },
                {
                    label: 'support_comment',
                    kind: CMP_KIND.Variable
                },
                {
                    label: 'test_local_document_sym',
                    kind: CMP_KIND.Function
                },
            ]
        });
    });

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
                    label: 'empty',
                    kind: CMP_KIND.Function,
                },
                {
                    label: 'pack',
                    kind: CMP_KIND.Function,
                    detail: "Lua Standard Libraries (function)",
                    documentation: "Returns a new table with all arguments stored into keys 1, 2, etc. and with a field \"**n**\" with the total number of arguments. Note that the resulting table may not be a sequence.\n```lua\nfunction pack(...) : any\n```"
                },
                {
                    label: 'unpack',
                    kind: CMP_KIND.Function,
                },
            ]
        });
    });
});
