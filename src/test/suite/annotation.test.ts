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

// test go to definition
async function testGoToDefinition(uri: vscode.Uri,
    position: vscode.Position, expectList: vscode.Location[]) {

    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        uri,
        position
    )) as vscode.Location[];

    if (actualList.length !== expectList.length) {
        console.log(`${JSON.stringify(expectList)}`);
        console.log(`${JSON.stringify(actualList)}`);
        assert.strictEqual(actualList.length, expectList.length);
    }
    expectList.forEach((expectedItem, index) => {
        const actualItem = actualList[index];
        assert.strictEqual(actualItem.uri.path, expectedItem.uri.path);

        const actualRange = actualItem.range;
        const expectRange = expectedItem.range;
        assert.strictEqual(actualRange.start.line, expectRange.start.line);
        assert.strictEqual(
            actualRange.start.character, expectRange.start.character);
        assert.strictEqual(actualRange.end.line, expectRange.end.line);
        assert.strictEqual(
            actualRange.end.character, expectRange.end.character);
    });
}

suite('Annotation Test Suite', () => {

    // 测试@type注解的hover显示
    test("test @type annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        const val = "```lua\n@type Animal\nlocal my_pet\n```";
        await testHover(uri, new vscode.Position(8, 9), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试@field注解的hover显示
    test("test @field annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_class.lua"));
        // hover在Animal类的name字段上
        const val = "```lua\n@type string\nname\n```";
        await testHover(uri, new vscode.Position(3, 10), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试@alias注解的hover显示
    test("test @alias annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // hover在MyFunc别名上
        const val = "```lua\n@type func(a:number, b:string):boolean\nMyFunc\n```";
        await testHover(uri, new vscode.Position(4, 10), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试类型推断的hover显示
    test("test type inference hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_infer.lua"));
        // player是从create_player()返回的，应该推断为Player类型
        const val = "```lua\n@type Player\nlocal player\n```";
        await testHover(uri, new vscode.Position(10, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试数据和注解合并的hover显示
    test("test data and annotation merge hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_merge.lua"));
        // hover在EXAMPLE.a上，应该同时显示值1和描述"变量a"
        const val = "```lua\n@type number\nEXAMPLE.a = 1 -- 变量a\n```";
        await testHover(uri, new vscode.Position(9, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试@param注解的函数hover显示
    test("test @param annotation function hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_function.lua"));
        // hover在test_func函数上
        const val = "```lua\nfunction test_func(a: number, b: boolean)\n@return string\n@param a: 参数a\n@param b: 参数b\n```";
        await testHover(uri, new vscode.Position(7, 12), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });
});
