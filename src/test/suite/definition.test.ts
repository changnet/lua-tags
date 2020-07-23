// 跳转到定义 测试

import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

const samplePath = path.resolve(__dirname, "../../../src/test/sample");
const testPath = path.join(samplePath, "test.lua");
const testUri = vscode.Uri.file(testPath);


// test go to definition
async function testGoToDefinition(uri: vscode.Uri,
    position: vscode.Position, expectList: vscode.Location[]) {

    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        uri,
        position
    )) as vscode.Location[];

    // console.log(`${JSON.stringify(actualList)}`);

    if (actualList.length !== expectList.length) {
        console.log(`${JSON.stringify(expectList)}`);
        console.log(`${JSON.stringify(actualList)}`);
        assert.equal(actualList.length, expectList.length);
    }
    expectList.forEach((expectedItem, index) => {
        const actualItem = actualList[index];
        assert.equal(actualItem.uri.path, expectedItem.uri.path);

        const actualRange = actualItem.range;
        const expectRange = expectedItem.range;
        assert.equal(actualRange.start.line, expectRange.start.line);
        assert.equal(actualRange.start.character, expectRange.start.character);
        assert.equal(actualRange.end.line, expectRange.end.line);
        assert.equal(actualRange.end.character, expectRange.end.character);
    });
}

suite('Extension Definition Test Suite', () => {

    test("test require path definition", async () => {
        const docPath = path.join(samplePath, "conf", "battle_conf.lua");
        await testGoToDefinition(testUri, new vscode.Position(6, 33), [{
            uri: vscode.Uri.file(docPath),
            range: new vscode.Range(0, 0, 0, 0)
        }
        ]);
    });

    test("test parameter definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(36, 16), [{
            uri: uri,
            range: new vscode.Range(19, 20, 19, 26)
        }
        ]);
    });

    // 用局部变量覆盖同名变量
    test("test shadowing definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(30, 32), [{
            uri: uri,
            range: new vscode.Range(29, 45, 29, 51)
        }
        ]);
    });

    test("test for number loop definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(30, 21), [{
            uri: uri,
            range: new vscode.Range(26, 18, 26, 25)
        }
        ]);
    });

    test("test for loop definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(42, 21), [{
            uri: uri,
            range: new vscode.Range(41, 19, 41, 29)
        }
        ]);
    });

    test("test repeat definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(47, 30), [{
            uri: uri,
            range: new vscode.Range(45, 18, 45, 28)
        }
        ]);
    });

    test("test upvalue definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(50, 44), [{
            uri: uri,
            range: new vscode.Range(16, 8, 16, 14)
        }
        ]);
    });

    test("test no definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(54, 45), []);
    });

    test("test multi definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(54, 20), [{
            uri: vscode.Uri.file(path.join(samplePath, "animal.lua")),
            range: new vscode.Range(11, 0, 12, 3)
        }, {
            uri: vscode.Uri.file(path.join(samplePath, "monster.lua")),
            range: new vscode.Range(7, 0, 8, 3)
        }

        ]);
    });

    test("test position filter definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(49, 7), [{
            uri: testUri,
            range: new vscode.Range(49, 6, 49, 9)
        }
        ]);
    });

    // 符号被同名本地化时，要能区分本地和全局
    test("test localize filter definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(49, 14), [{
            uri: testUri,
            range: new vscode.Range(45, 0, 48, 3)
        }
        ]);
    });

    test("test local unreachable definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(77, 2), [{
            uri: testUri,
            range: new vscode.Range(78, 0, 79, 3)
        }
        ]);
    });

    test("test main chunk for loop local var definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(88, 15), [{
            uri: testUri,
            range: new vscode.Range(87, 10, 87, 15)
        }
        ]);
    });

    // 当require bbb时，不要跳转到aaabbb
    test("test require file path definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(141, 37), []);
    });


    test("test exclude dir definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(73, 21), []);
    });

    // 当一个符号被多个文档本地化时，要能过滤掉其他文档中的本地符号
    test("test filter local definition", async () => {
        const docPath = path.join(samplePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(64, 23), [{
            uri: vscode.Uri.file(
                path.join(samplePath, "conf", "battle_conf.lua")),
            range: new vscode.Range(2, 0, 17, 1)
        }]);
    });

    test("test lua standard definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(154, 19), []);
    });

    test("test local document definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(157, 5), [{
            uri: testUri,
            range: new vscode.Range(153, 6, 153, 8)
        }]);
    });
});
