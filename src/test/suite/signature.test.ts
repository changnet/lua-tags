/* eslint-disable max-len */
// 跳转到定义 测试

import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

const samplePath = path.resolve(__dirname, "../../../src/test/sample");
const testPath = path.join(samplePath, "test.lua");
const testUri = vscode.Uri.file(testPath);

// test signature help
async function testSignatureHelp(uri: vscode.Uri,
    position: vscode.Position, expect: vscode.SignatureHelp) {

    const actual = (await vscode.commands.executeCommand(
        'vscode.executeSignatureHelpProvider',
        uri,
        position
    )) as vscode.SignatureHelp;

    // console.log(`${JSON.stringify(actual)}`);

    assert.strictEqual(
        actual.activeParameter, expect.activeParameter, "activeparameter");
    assert.strictEqual(
        actual.activeSignature, expect.activeSignature, "active signature");

    expect.signatures.forEach((expectedItem, index) => {
        const actualItem = actual.signatures[index];
        assert.strictEqual(actualItem.label, expectedItem.label, "label");
        assert.strictEqual(actualItem.parameters.length,
            expectedItem.parameters.length, "parameters length");

        if (expectedItem.documentation) {
            const doc = actualItem.documentation as vscode.MarkdownString;
            if (doc.value !== expectedItem.documentation) {
                console.log("expect", expectedItem.documentation);
                console.log("got", doc.value);
            }
            assert.strictEqual(doc.value,
                expectedItem.documentation, "documentation");
        }
        expectedItem.parameters.forEach((param, paramIdx) => {
            const actualParam = actualItem.parameters[paramIdx];
            assert.strictEqual(
                actualParam.label[0], param.label[0], "param label 0");
            assert.strictEqual(
                actualParam.label[1], param.label[1], "param label 1");
        });
    });
}

suite('Extension Signature Test Suite', () => {

    test("test other file signature help", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testSignatureHelp(uri, new vscode.Position(54, 31), {
            signatures: [{
                label: 'function on_kill(who, ...)',
                parameters: [
                    { label: [17, 20] }, { label: [22, 25] }
                ],
                documentation: "animal.lua  \n```lua\n-- called when the animal be killed\n```"
            }, {
                label: 'function on_kill(who, ...)',
                parameters: [
                    { label: [17, 20] }, { label: [22, 25] }
                ],
                documentation: "monster.lua  \n```lua\n-- called when monster was killed\n```"
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
                label: 'function empty == table.empty(tbl)',
                parameters: [
                    { label: [30, 33] },
                ],
                documentation: '```lua\n-- test function assignment\n-- multiline comment1\n-- multiline comment2\n```'
            }
            ],
            activeSignature: 0,
            activeParameter: 0
        });
    });

    test("test lua standrard signature help", async () => {
        await testSignatureHelp(testUri, new vscode.Position(154, 42), {
            signatures: [{
                label: 'function insert(list, pos, value)',
                parameters: [
                    { label: [16, 20] },
                    { label: [22, 25] },
                    { label: [27, 32] },
                ],
                documentation: "Lua Standard Libraries  \nInserts element **value** at position **pos** in **list**, shifting up the elements **list[pos], list[pos+1], ..., list[#list]**. The default value for **pos** is **#list+1**, so that a call **table.insert(t,x)** inserts **x** at the end of list **t**."
            }
            ],
            activeSignature: 0,
            activeParameter: 1
        });
    });
});
