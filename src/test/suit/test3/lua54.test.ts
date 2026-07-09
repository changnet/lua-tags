import * as path from 'path';
import * as vscode from 'vscode';
import { testHover, resolveFixture, activateExtension } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'test3');
const testUri = vscode.Uri.file(path.join(fixturePath, 'lua54_test.lua'));

// 验证 lua-tags 对 Lua 5.4 新增语法（<const>、<close> 等）的解析能力。
// 测试思路：lua54_test.lua 先集中写出所有 Lua 5.4 相关语法，再在末尾声明一个变量
// lua54_parse_ok。只要 vscode 能解析到这个末尾变量（hover 能命中），即说明整文件的
// 语法解析正常；若前面任意一处 5.4 语法解析失败，末尾变量将无法被解析，hover 为空。
suite('Lua 5.4 Syntax Parse Test3 Suite', () => {
    test('lua 5.4 syntax parse (last variable resolvable)', async () => {
        const val = '```lua\nlocal lua54_parse_ok = true : boolean\n```';
        await testHover(testUri, new vscode.Position(53, 6), [
            {
                contents: [{ value: val } as vscode.MarkdownString],
            },
        ]);
    }).timeout(10240);
});
