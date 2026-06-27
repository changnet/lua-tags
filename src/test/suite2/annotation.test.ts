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

// test go-to-definition
async function testDefinition(uri: vscode.Uri,
    position: vscode.Position, expectList: vscode.Location[]) {

    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        uri,
        position
    )) as vscode.Location[];

    assert.strictEqual(actualList.length, expectList.length);
    if (expectList.length > 0) {
        for (let i = 0; i < expectList.length; i++) {
            const actual = actualList[i];
            const expected = expectList[i];
            assert.strictEqual(actual.uri.fsPath, expected.uri.fsPath);
            assert.strictEqual(actual.range.start.line, expected.range.start.line);
        }
    }
}

suite('Annotation Test Suite', () => {

    // 测试@type注解的hover显示
    test("test @type annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        await testHover(uri, new vscode.Position(8, 9), [{
            contents: [{ value: "```lua\nlocal my_dog : Dog\n-- @type Dog - 狗\n```" } as vscode.MarkdownString],
        }]);
    });

    // 测试@alias注解的hover显示（注释行没有hover）
    test("test @alias annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        await testHover(uri, new vscode.Position(2, 10), []);
    });

    // 测试类型推断的hover显示（从@return推断）
    test("test type inference hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_infer.lua"));
        await testHover(uri, new vscode.Position(13, 8), [{
            contents: [{ value: "```lua\nlocal player : Player\n-- 类型推断：player的类型应为Player\n```" } as vscode.MarkdownString],
        }]);
    });

    // 测试数据和注解合并的hover显示
    test("test data and annotation merge hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_merge.lua"));
        await testHover(uri, new vscode.Position(6, 4), [{
            contents: [{ value: "```lua\nclass EXAMPLE {\n    a : number -- 变量a\n    b : string -- 变量b\n}\n\n-- 示例类\n```" } as vscode.MarkdownString],
        }]);
    });

    // 测试@param注解的函数hover显示
    test("test @param annotation function hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_function.lua"));
        await testHover(uri, new vscode.Position(5, 12), [{
            contents: [{ value: "```lua\nfunction test_func(a: number, b: boolean) : string\n-- @param a number - 参数a\n-- @param b boolean - 参数b\n-- @return string - 返回字符串\n```" } as vscode.MarkdownString],
        }]);
    });

    // 测试在@type注解行hover类型名，显示类定义
    test("test hover on type name in @type annotation", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // line 7: -- @type Dog - 狗, hover on "Dog" (char 9)
        await testHover(uri, new vscode.Position(7, 9), [{
            contents: [{ value: "```lua\nclass Dog {\n    breed : string -- 品种\n    owner : string -- 主人\n    age : number -- 年龄\n}\n\n-- 狗类\n```" } as vscode.MarkdownString],
        }]);
    });

    // 测试ctrl+click注解类型名跳转到类定义
    test("test go to definition on type name in @type annotation", async () => {
        const classUri = vscode.Uri.file(path.join(samplePath, "annotation_class.lua"));
        const typeUri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // line 7: -- @type Dog - 狗, click on "Dog" (char 9)
        await testDefinition(typeUri, new vscode.Position(7, 9), [{
            uri: classUri,
            range: new vscode.Range(6, 10, 6, 13),
        }]);
    });

    // 测试@type变量的成员补全
    test("test @type variable member completion", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        const actualList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(16, 27),
        )) as vscode.CompletionList;

        const names = actualList.items.map(i => i.label as string).sort();
        assert.ok(names.includes('breed'), `should include 'breed', got: ${names}`);
        assert.ok(names.includes('owner'), `should include 'owner', got: ${names}`);
    });

    // 测试跳转到@field成员定义
    test("test go to definition on @field member access", async () => {
        const classUri = vscode.Uri.file(path.join(samplePath, "annotation_class.lua"));
        const typeUri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // line 18: local owner_name = my_dog.owner, click on "owner" (char 30)
        await testDefinition(typeUri, new vscode.Position(18, 30), [{
            uri: classUri,
            range: new vscode.Range(8, 10, 8, 15),
        }]);
    });

    // 测试跳转到my_dog.age到Dog类的age字段
    test("test go to definition on my_dog.age", async () => {
        const classUri = vscode.Uri.file(path.join(samplePath, "annotation_class.lua"));
        const typeUri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // line 22: local animal_age = my_dog.age, click on "age" (char 26)
        await testDefinition(typeUri, new vscode.Position(21, 26), [{
            uri: classUri,
            range: new vscode.Range(9, 10, 9, 13),
        }]);
    });

    // 测试my_dog.age的hover显示
    test("test hover on my_dog.age", async () => {
        const typeUri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        // line 22: local animal_age = my_dog.age, hover on "age" (char 27)
        await testHover(typeUri, new vscode.Position(21, 27), [{
            contents: [{ value: "annotation_class.lua  \n```lua\nage : number 年龄\n```" } as vscode.MarkdownString],
        }]);
    });

    // ============ variable_tracking.lua tests ============

    // 测试跳转到Pet类的age字段
    test("test go to definition on my_dog.age in variable_tracking", async () => {
        const trackUri = vscode.Uri.file(path.join(samplePath, "variable_tracking.lua"));
        // line 35: my_dog.age = 3, click on "age" (char 8)
        await testDefinition(trackUri, new vscode.Position(34, 8), [{
            uri: trackUri,
            range: new vscode.Range(9, 10, 9, 13),
        }]);
    });

    // 测试my_dog.age的hover显示从Pet类获取信息
    test("test hover on my_dog.age in variable_tracking", async () => {
        const trackUri = vscode.Uri.file(path.join(samplePath, "variable_tracking.lua"));
        // line 35: my_dog.age = 3, hover on "age" (char 8)
        await testHover(trackUri, new vscode.Position(34, 8), [{
            contents: [{ value: "```lua\nage : number 动物年龄\n```" } as vscode.MarkdownString],
        }]);
    });
});
