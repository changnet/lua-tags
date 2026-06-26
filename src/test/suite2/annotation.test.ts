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
    console.log(">>>>>>>> ACTUAL\n", JSON.stringify(actualList, null, 2), "\n<<<<<<<<");
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
        const val = "placeholder"; // We just want to see actual output
        await testHover(uri, new vscode.Position(8, 9), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试@alias注解的hover显示（别名本身没有类型注解，只有原始定义）
    test("test @alias annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_type.lua"));
        const val = "placeholder";
        await testHover(uri, new vscode.Position(2, 10), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试类型推断的hover显示
    test("test type inference hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_infer.lua"));
        const val = "placeholder";
        await testHover(uri, new vscode.Position(13, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试数据和注解合并的hover显示
    test("test data and annotation merge hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_merge.lua"));
        const val = "placeholder";
        await testHover(uri, new vscode.Position(6, 4), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    // 测试@param注解的函数hover显示
    test("test @param annotation function hover", async () => {
        const uri = vscode.Uri.file(path.join(samplePath, "annotation_function.lua"));
        const val = "placeholder";
        await testHover(uri, new vscode.Position(5, 12), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });
});
