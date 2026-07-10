import * as path from 'path';
import * as vscode from 'vscode';
import { testHover, testGoToDefinition, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'test3');
const testUri = vscode.Uri.file(path.join(fixturePath, 'customload_test.lua'));
const modAUri = vscode.Uri.file(
    path.join(fixturePath, 'modules', 'sub', 'mod_a.lua'),
);

// 测试自定义加载函数特性（lua-tags.customLoadFunc）
// 配置 customLoadFunc: ["import", "include"] 后，import/include 等同 require
suite('Custom Load Func Test3 Suite', () => {
    // import("modules.sub.mod_a") 跳转到 mod_a.lua
    test('import jumps to module file', async () => {
        await testGoToDefinition(testUri, new vscode.Position(3, 11), [{
            uri: modAUri,
            range: new vscode.Range(0, 0, 0, 0),
        }]);
    }).timeout(10240);

    // N.greet 解析到 mod_a.lua 中的 greet（N 由 import 引入）
    test('hover on N.greet (import)', async () => {
        const val = 'mod_a.lua  \n```lua\nfunction greet(name) : any\n```';
        await testHover(testUri, new vscode.Position(4, 13), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);

    // include("modules.sub.mod_a.lua") 跳转到 mod_a.lua（带 .lua 后缀也能解析）
    test('include with .lua suffix jumps to module file', async () => {
        await testGoToDefinition(testUri, new vscode.Position(6, 11), [{
            uri: modAUri,
            range: new vscode.Range(0, 0, 0, 0),
        }]);
    }).timeout(10240);

    // P.magic 解析到 mod_a.lua 中的 magic（P 由 include 引入，带 .lua 后缀）
    test('hover on P.magic (include with .lua)', async () => {
        const val = 'mod_a.lua  \n```lua\nfunction magic() : any\n```';
        await testHover(testUri, new vscode.Position(7, 13), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);
});
