import * as path from 'path';
import * as vscode from 'vscode';
import { testSignatureHelp, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'core');
const testPath = path.join(fixturePath, "test.lua");
const testUri = vscode.Uri.file(testPath);

suite('Extension Signature Test Suite', () => {

    test("test other file signature help", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

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
                parameters: [
                    {label: [24,25]},{label: [27,28]},{label: [30,31]},
                ]
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

    test("test dot call colon function signalture", async () => {
        await testSignatureHelp(testUri, new vscode.Position(184, 26), {
            signatures: [{
                label: 'function call_with_dot(args1, args2)',
                parameters: [
                    { label: [23, 28] },
                    { label: [30, 35] },
                ],
            }
            ],
            activeSignature: 0,
            activeParameter: 0
        });
    });

    test("test colon call dot function signalture", async () => {
        await testSignatureHelp(testUri, new vscode.Position(185, 27), {
            signatures: [{
                label: 'function call_with_colon(args1, args2)',
                parameters: [
                    { label: [25, 30] },
                    { label: [32, 37] },
                ],
            }
            ],
            activeSignature: 0,
            activeParameter: 1
        });
    });
});
