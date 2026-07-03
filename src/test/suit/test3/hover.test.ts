import * as path from 'path';
import * as vscode from 'vscode';
import { testHover, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'test3');
const testUri = vscode.Uri.file(path.join(fixturePath, "test3.lua"));

suite('Extension Hover Test3 Suite', () => {

    test("test3", async () => {
        let val = "```lua\nlocal a : any\n-- 注释a\n```";
        await testHover(testUri, new vscode.Position(1, 6), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);

        val = "```lua\nlocal b : any -- 注释b\n```";
        await testHover(testUri, new vscode.Position(3, 6), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }
        ]);
    });
});
