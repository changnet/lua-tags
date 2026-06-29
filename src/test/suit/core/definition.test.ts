import * as path from 'path';
import * as vscode from 'vscode';
import { testGoToDefinition, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'core');
const testPath = path.join(fixturePath, "test.lua");
const testUri = vscode.Uri.file(testPath);

suite('Extension Definition Test Suite', () => {

    test("test require path definition", async () => {
        const docPath = path.join(fixturePath, "conf", "battle_conf.lua");
        await testGoToDefinition(testUri, new vscode.Position(6, 33), [{
            uri: vscode.Uri.file(docPath),
            range: new vscode.Range(0, 0, 0, 0)
        }
        ]);
    });

    test("test parameter definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(36, 16), [{
            uri: uri,
            range: new vscode.Range(19, 20, 19, 26)
        }
        ]);
    });

    test("test shadowing definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(30, 32), [{
            uri: uri,
            range: new vscode.Range(29, 45, 29, 51)
        }
        ]);
    });

    test("test for number loop definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(30, 21), [{
            uri: uri,
            range: new vscode.Range(26, 18, 26, 25)
        }
        ]);
    });

    test("test for loop definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(42, 21), [{
            uri: uri,
            range: new vscode.Range(41, 19, 41, 29)
        }
        ]);
    });

    test("test repeat definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(47, 30), [{
            uri: uri,
            range: new vscode.Range(45, 18, 45, 28)
        }
        ]);
    });

    test("test upvalue definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(50, 44), [{
            uri: uri,
            range: new vscode.Range(16, 8, 16, 14)
        }
        ]);
    });

    test("test no definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(54, 45), []);
    });

    test("test multi definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(54, 20), [{
            uri: vscode.Uri.file(path.join(fixturePath, "animal.lua")),
            range: new vscode.Range(11, 0, 12, 3)
        }, {
            uri: vscode.Uri.file(path.join(fixturePath, "monster.lua")),
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

    test("test require file path definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(141, 37), []);
    });

    test("test exclude dir definition", async () => {
        await testGoToDefinition(testUri, new vscode.Position(73, 21), []);
    });

    test("test filter local definition", async () => {
        const docPath = path.join(fixturePath, "battle.lua");

        const uri = vscode.Uri.file(docPath);
        await testGoToDefinition(uri, new vscode.Position(64, 23), [{
            uri: vscode.Uri.file(
                path.join(fixturePath, "conf", "battle_conf.lua")),
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

    test("test possible definition", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "battle.lua"));
        const uri2 = vscode.Uri.file(path.join(fixturePath, "monster.lua"));
        await testGoToDefinition(uri, new vscode.Position(26, 32), [
            {
                uri: uri2,
                range: new vscode.Range(4, 6, 4, 13)
            },
            {
                uri: testUri,
                range: new vscode.Range(0, 6, 0, 13)
            }]);
    });
});
