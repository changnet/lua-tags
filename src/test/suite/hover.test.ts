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
        const val = "```lua\nBATTLE_TYPE.BT_PVP = 1 : number -- player vs player\n```";
        await testHover(uri, new vscode.Position(15, 12), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test local hove", async () => {
        const val = "```lua\nlocal N = 1 : number\n-- 测试声明多个变量\n```";
        await testHover(testUri, new vscode.Position(13, 9), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test main chunk do end block local hove", async () => {
        const val = "```lua\nlocal var = 100 : number -- const\n```";
        await testHover(testUri, new vscode.Position(96, 17), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test table hove", async () => {
        const val = "```lua\nlocal M : table\n-- 测试声明多个变量\n```";
        await testHover(testUri, new vscode.Position(13, 7), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test file path hove", async () => {
        const val = 'battle_conf.lua  \n```lua\nBattleConf.max_player = 8 : number\n```';
        await testHover(testUri, new vscode.Position(42, 64), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test module hove", async () => {
        const val = "Lua Standard Libraries  \nThis library provides generic functions for table manipulation. It provides all its functions inside the table **table**.\n```lua\ntable : table\n```";
        await testHover(testUri, new vscode.Position(30, 1), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test multi function hove", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        const val = 'animal.lua  \n```lua\nfunction Animal:on_kill(who, ...) : any\n-- called when the animal be killed\n```\n---\nmonster.lua  \n```lua\nfunction Monster:on_kill(who, ...) : any\n-- called when monster was killed\n```';
        await testHover(uri, new vscode.Position(54, 20), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test multi comment hove", async () => {
        const val = "```lua\nlocal multi_comment = true : boolean\n-- 测试混合多行注释\n-- comment 111\n--[[\n    这是\n    多行\n    注释\n]]\n```";
        await testHover(testUri, new vscode.Position(62, 14), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test multi comment break by code hove", async () => {
        const val = '```lua\nfunction cmt() : any -- 测试注释1\n```';
        await testHover(testUri, new vscode.Position(49, 13), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test should not have comment hove", async () => {
        const val = '```lua\nlocal support_comment = 9 : number\n```';
        await testHover(testUri, new vscode.Position(53, 17), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test ref value hove", async () => {
        const val = "```lua\nlocal scene : any == BattleConf.scene = 1000\n-- test ref value\n```";
        await testHover(testUri, new vscode.Position(82, 9), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test ref function hove", async () => {
        const val = "```lua\nlocal empty : any == function table.empty(tbl)\n-- test function assignment\n-- multiline comment1\n-- multiline comment2\n```";
        await testHover(testUri, new vscode.Position(124, 18), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test member ref function hove", async () => {
        const val = "```lua\nref_tbl.empty : any == function table.empty(tbl)\n-- test function assignment\n-- multiline comment1\n-- multiline comment2\n```";
        await testHover(testUri, new vscode.Position(127, 10), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test same name ref symbol dead loop hove", async () => {
        const val = "```lua\nlocal ipair : any == ipair\n```";
        await testHover(testUri, new vscode.Position(129, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test document recursive search hover", async () => {
        const val = "skill_conf.lua  \n```lua\nboss.factor = 0.01 : number\n```";
        await testHover(testUri, new vscode.Position(119, 33), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test const expression hover", async () => {
        const val = "```lua\nlocal const_v = -16 + 1 << 32 + 8 >> \"32\" + 2 * 4 - 5 / 2 + 8 % 2 : number\n-- test const expression hover\n```";
        await testHover(testUri, new vscode.Position(135, 11), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test table function hover", async () => {
        const val = "```lua\nfunction ENUM.E_FUNCTION() : any -- enum function\n```";
        await testHover(testUri, new vscode.Position(22, 6), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test lua standard hover", async () => {
        const val = "Lua Standard Libraries  \nInserts element **value** at position **pos** in **list**, shifting up the elements **list[pos], list[pos+1], ..., list[#list]**. The default value for **pos** is **#list+1**, so that a call **table.insert(t,x)** inserts **x** at the end of list **t**.\n```lua\nfunction table.insert(list, pos, value) : any\n```";
        await testHover(testUri, new vscode.Position(154, 21), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    test("test global module sub variable duplicate hover", async () => {
        const val = "new_object.lua  \n```lua\nT_GLOBAL.test_v = 100 : number\n```";
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
        const val = "```lua\nfunction ref_func() : any\n-- test global reference\n```";
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
        const val = "case1.lua  \n```lua\nCase1.local_func_export : any == function local_func_export()\n```";
        await testHover(test1Uri, new vscode.Position(1, 17), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    /**
     * 同一文档中，在同名的local函数之前调用，需要能跳转到全局函数
     */
    test("test global func before same name local call hover", async () => {
        const val = "case1.lua  \n```lua\nfunction g_func_test() : any\n```";
        await testHover(test1Uri, new vscode.Position(3, 8), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });

    /**
     * 同一文档中，在同名的local函数之后调用，需要能跳转到local函数
     */
    test("test local func after same name global call hover", async () => {
        const val = "```lua\nlocal function g_func_test() : any\n```";
        await testHover(test1Uri, new vscode.Position(8, 6), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });
});
