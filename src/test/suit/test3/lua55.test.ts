import * as path from 'path';
import * as vscode from 'vscode';
import { testHover, resolveFixture, activateExtension } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'test3');
const testUri = vscode.Uri.file(path.join(fixturePath, 'lua55_test.lua'));

// 验证 lua-tags 对 Lua 5.5 新增语法（global 关键字、命名可变参数 ...args 等）的解析能力。
// 测试思路：lua55_test.lua 先集中写出所有 Lua 5.5 相关语法，再在末尾声明一个普通变量
// lua55_parse_ok。只要 vscode 能解析到这个末尾变量（hover 能命中），即说明整文件的
// 语法解析正常；若前面任意一处 5.5 语法解析失败，luaparse 会直接抛错导致整文件解析失败，
// 末尾变量将无法被解析，hover 为空。
suite('Lua 5.5 Syntax Parse Test3 Suite', () => {
    test('lua 5.5 syntax parse (last variable resolvable)', async () => {
        const val = '```lua\nlocal lua55_parse_ok = true : boolean\n```';
        await testHover(testUri, new vscode.Position(36, 6), [
            {
                contents: [{ value: val } as vscode.MarkdownString],
            },
        ]);
    }).timeout(10240);
});
