/* eslint-disable max-len */
// 注解功能测试

import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

const samplePath = path.resolve(__dirname, "../../../src/test/sample2");

// test hover
async function testHover(uri: vscode.Uri,
    position: vscode.Position, expectList: vscode.Hover[]) {

    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeHoverProvider',
        uri,
        position
    )) as vscode.Hover[];

    assert.strictEqual(actualList.length, expectList.length);
    expectList.forEach((expectedItem, index) => {
        const actualItem = actualList[index];
        expectedItem.contents.forEach((ctx, ctxIdx) => {
            const expectCtx = ctx as vscode.MarkdownString;
            const actualCtx = actualItem.contents[ctxIdx] as vscode.MarkdownString;
            assert.strictEqual(actualCtx.value, expectCtx.value);
        });
    });
}

suite('Annotation Test Suite', () => {

    // 测试@type注解的hover显示
    test("test @type annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // @type信息放在代码块外部，markdown可正确渲染
        const val = "@type Animal\n```lua\nlocal my_pet\n```";
        await testHover(uri, new vscode.Position(8, 9), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试@alias注解的hover显示（别名本身没有类型注解，只有原始定义）
    test("test @alias annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // MyFunc是全局别名，hover显示其定义位置的符号
        const val = "```lua\nMyFunc\n```";
        await testHover(uri, new vscode.Position(4, 10), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试类型推断的hover显示
    test("test type inference hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_infer.lua"));
        // player是从create_player()返回的，应该推断为Player类型
        const val = "@type Player\n```lua\nlocal player\n```";
        await testHover(uri, new vscode.Position(10, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试数据和注解合并的hover显示
    test("test data and annotation merge hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_merge.lua"));
        // hover在EXAMPLE上，应该显示值和类型
        const val = "```lua\nEXAMPLE\n```";
        await testHover(uri, new vscode.Position(9, 3), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试@param注解的函数hover显示
    test("test @param annotation function hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_function.lua"));
        // hover在test_func函数上，@return和@param信息放在代码块外部
        const val = "@return string\n@param a: 参数a\n@param b: 参数b\n```lua\nfunction test_func(a: number, b: boolean)\n```";
        await testHover(uri, new vscode.Position(7, 12), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });
});
