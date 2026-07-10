import * as path from 'path';
import * as vscode from 'vscode';
import {
    testHover,
    testGoToDefinition,
    testWorkspaceSymbol,
    resolveFixture,
} from '../../helper';

const fixturePath = resolveFixture(__dirname, 'test3');
const testUri = vscode.Uri.file(path.join(fixturePath, 'filemode_test.lua'));
const modAUri = vscode.Uri.file(
    path.join(fixturePath, 'modules', 'sub', 'mod_a.lua'),
);

// 测试 file mode 特性（lua-tags.defaultFileMode / lua-tags.fileMode）
// modules/sub/mod_a.lua 匹配 fileMode "modules/*/*.lua" => module 方式加载
suite('File Mode Test3 Suite', () => {
    // require("modules.sub.mod_a") 跳转到 mod_a.lua
    test('require jumps to module file', async () => {
        await testGoToDefinition(testUri, new vscode.Position(3, 12), [{
            uri: modAUri,
            range: new vscode.Range(0, 0, 0, 0),
        }]);
    }).timeout(10240);

    // M.greet 解析到 mod_a.lua 中的 greet 函数
    test('hover on M.greet resolves to module symbol', async () => {
        const val = 'mod_a.lua  \n```lua\nfunction greet(name) : any\n```';
        await testHover(testUri, new vscode.Position(5, 12), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);

    // M.magic 解析到 mod_a.lua 中的 magic 函数
    test('hover on M.magic resolves to module symbol', async () => {
        const val = 'mod_a.lua  \n```lua\nfunction magic() : any\n```';
        await testHover(testUri, new vscode.Position(6, 12), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);

    // module 方式加载的文件会注册一个带文件位置的模块符号 modules.sub.mod_a
    test('workspace symbol finds derived module', async () => {
        await testWorkspaceSymbol('modules', [
            {
                name: 'modules.sub.mod_a',
                kind: vscode.SymbolKind.Module,
                containerName: '',
                location: new vscode.Location(
                    modAUri,
                    new vscode.Range(0, 0, 0, 'modules.sub.mod_a'.length),
                ),
            } as vscode.SymbolInformation,
        ]);
    }).timeout(10240);
});
