/* eslint-disable max-len */
// 鼠标悬浮提示 测试

import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

const samplePath = path.resolve(__dirname, "../../../src/test/sample");
const testUri = vscode.Uri.file(path.join(samplePath, "test.lua"));
const test1Uri = vscode.Uri.file(path.join(samplePath, "case/test1.lua"));


// test hover
async function testHover(uri: vscode.Uri,
    position: vscode.Position, expectList: vscode.Hover[]) {

    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeHoverProvider',
        uri,
        position
    )) as vscode.Hover[];

    // console.log(`${JSON.stringify(actualList)}`);

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

suite('Extension Hover Test Suite', () => {

    test("test query no base but symbol has hove", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        const val = "```lua\nBT_PVP = 1 -- player vs player\n```";
        await testHover(uri, new vscode.Position(15, 12), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test local hove", async () => {
        const val = "```lua\n-- 测试声明多个变量\nlocal N = 1\n```";
        await testHover(testUri, new vscode.Position(13, 9), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test main chunk do end block local hove", async () => {
        const val = "```lua\nlocal var = 100 -- const\n```";
        await testHover(testUri, new vscode.Position(96, 17), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test table hove", async () => {
        const val = "```lua\n-- 测试声明多个变量\n(table) local M\n```";
        await testHover(testUri, new vscode.Position(13, 7), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test file path hove", async () => {
        const val = 'battle_conf.lua  \n```lua\nmax_player = 8\n```';
        await testHover(testUri, new vscode.Position(42, 64), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test module hove", async () => {
        const val = "Lua Standard Libraries  \nThis library provides generic functions for table manipulation. It provides all its functions inside the table **table**.\n```lua\n(table) table\n```";
        await testHover(testUri, new vscode.Position(30, 1), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test multi function hove", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        const val = 'animal.lua  \n```lua\n-- called when the animal be killed\nfunction Animal:on_kill(who, ...)\n```\n---\nmonster.lua  \n```lua\n-- called when monster was killed\nfunction Monster:on_kill(who, ...)\n```';
        await testHover(uri, new vscode.Position(54, 20), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test multi comment hove", async () => {
        const val = "```lua\n-- 测试混合多行注释\n-- comment 111\n--[[\n    这是\n    多行\n    注释\n]]\nlocal multi_comment = true\n```";
        await testHover(testUri, new vscode.Position(62, 14), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test multi comment break by code hove", async () => {
        const val = '```lua\nfunction cmt() -- 测试注释1\n```';
        await testHover(testUri, new vscode.Position(49, 13), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test should not have comment hove", async () => {
        const val = '```lua\nlocal support_comment = 9\n```';
        await testHover(testUri, new vscode.Position(53, 17), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test ref value hove", async () => {
        const val = "```lua\n-- test ref value\nlocal scene == BattleConf.scene = 1000\n```";
        await testHover(testUri, new vscode.Position(82, 9), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test ref function hove", async () => {
        const val = "```lua\nlocal empty == function table.empty(tbl)\n-- test function assignment\n-- multiline comment1\n-- multiline comment2\n```";
        await testHover(testUri, new vscode.Position(124, 18), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test member ref function hove", async () => {
        const val = "```lua\nref_tbl.empty == function table.empty(tbl)\n-- test function assignment\n-- multiline comment1\n-- multiline comment2\n```";
        await testHover(testUri, new vscode.Position(127, 10), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test same name ref symbol dead loop hove", async () => {
        const val = "```lua\nlocal ipair == ipair\n```";
        await testHover(testUri, new vscode.Position(129, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test document recursive search hover", async () => {
        const val = "skill_conf.lua  \n```lua\nfactor = 0.01\n```";
        await testHover(testUri, new vscode.Position(119, 33), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test const expression hover", async () => {
        const val = "```lua\n-- test const expression hover\nlocal const_v = -16 + 1 << 32 + 8 >> \"32\" + 2 * 4 - 5 / 2 + 8 % 2\n```";
        await testHover(testUri, new vscode.Position(135, 11), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test table function hover", async () => {
        const val = "```lua\nfunction ENUM.E_FUNCTION() -- enum function\n```";
        await testHover(testUri, new vscode.Position(22, 6), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test lua standard hover", async () => {
        const val = "Lua Standard Libraries  \nInserts element **value** at position **pos** in **list**, shifting up the elements **list[pos], list[pos+1], ..., list[#list]**. The default value for **pos** is **#list+1**, so that a call **table.insert(t,x)** inserts **x** at the end of list **t**.\n```lua\nfunction table.insert(list, pos, value)\n```";
        await testHover(testUri, new vscode.Position(154, 21), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test global module sub variable duplicate hover", async () => {
        const val = "new_object.lua  \n```lua\ntest_v = 100\n```";
        await testHover(testUri, new vscode.Position(172, 14), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    /**
     * function ref_func() end
     * RefMob.ref_func = ref_func
     * 这种情况下，上面的全局函数ref_func能与RefMob.ref_func区分
     */
    test("test global function reference hover", async () => {
        const val = "```lua\n-- test global reference\nfunction ref_func()\n```";
        await testHover(testUri, new vscode.Position(175, 14), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    /**
     * local function local_func_export() end
     * Case1.local_func_export = local_func_export
     * 
     * 这种情况下，只显示一个Case1.local_func_export，不要显示local函数
     */
    test("test ref not using local func hover", async () => {
        const val = "case1.lua  \n```lua\nCase1.local_func_export == function local_func_export()\n```";
        await testHover(test1Uri, new vscode.Position(1, 17), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    /**
     * 同一文档中，在同名的local函数之前调用，需要能跳转到全局函数
     */
    test("test global func before same name local call hover", async () => {
        const val = "case1.lua  \n```lua\nfunction g_func_test()\n```";
        await testHover(test1Uri, new vscode.Position(3, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    /**
     * 同一文档中，在同名的local函数之后调用，需要能跳转到local函数
     */
    test("test local func after same name global call hover", async () => {
        const val = "```lua\nlocal function g_func_test()\n```";
        await testHover(test1Uri, new vscode.Position(8, 6), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });
});
