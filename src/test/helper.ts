import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

export function resolveFixture(dir: string, name: string): string {
    return path.resolve(dir, '../../../../src/test/fixture', name);
}

export async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// 共享的激活 Promise：保证多个 suite 的 before 钩子复用同一次激活
let activatePromise: Promise<void> | null = null;

export async function activateExtension(extraConfig?: Record<string, any>) {
    if (activatePromise) {
        return activatePromise;
    }
    activatePromise = (async () => {
        try {
            const conf = vscode.workspace.getConfiguration('lua-tags');
            await conf.update('excludeDir', ['exclude/*']);
            if (extraConfig) {
                for (const [key, value] of Object.entries(extraConfig)) {
                    await conf.update(key, value);
                }
            }
            const ext = vscode.extensions.getExtension('changnet.lua-tags')!;
            await ext.activate();
            await sleep(8000);
        } catch (e) {
            activatePromise = null;
            assert.ok(false, `error in activate extension ${e}`);
        }
    })();
    return activatePromise;
}

export async function testCompletion(
    docUri: vscode.Uri,
    position: vscode.Position,
    expectList: vscode.CompletionList,
) {
    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeCompletionItemProvider',
        docUri,
        position,
    )) as vscode.CompletionList;

    if (actualList.items.length !== expectList.items.length) {
        console.log(`testCompletion ${JSON.stringify(expectList)}`);
        console.log(`testCompletion ${JSON.stringify(actualList)}`);
        assert.strictEqual(actualList.items.length, expectList.items.length);
    }

    actualList.items.sort((src, dst) => {
        if (src.label === dst.label) {
            return 0;
        }
        return src.label > dst.label ? 1 : 0;
    });

    expectList.items.forEach((expectedItem, i) => {
        const actualItem = actualList.items[i];
        assert.strictEqual(actualItem.label, expectedItem.label, 'label check');
        assert.strictEqual(actualItem.kind, expectedItem.kind, 'kind check');

        if (expectedItem.detail) {
            assert.strictEqual(actualItem.detail, expectedItem.detail);
        }
        if (expectedItem.documentation) {
            const doc = actualItem.documentation as vscode.MarkdownString;
            assert.strictEqual(doc.value, expectedItem.documentation);
        }
    });
}

export async function testHover(
    uri: vscode.Uri,
    position: vscode.Position,
    expectList: vscode.Hover[],
) {
    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeHoverProvider',
        uri,
        position,
    )) as vscode.Hover[];

    assert.strictEqual(actualList.length, expectList.length);
    expectList.forEach((expectedItem, index) => {
        const actualItem = actualList[index];
        expectedItem.contents.forEach((ctx, ctxIdx) => {
            const expectCtx = ctx as vscode.MarkdownString;
            const actualCtx = actualItem.contents[
                ctxIdx
            ] as vscode.MarkdownString;
            assert.strictEqual(actualCtx.value, expectCtx.value);
        });
    });
}

export async function testGoToDefinition(
    uri: vscode.Uri,
    position: vscode.Position,
    expectList: vscode.Location[],
) {
    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeDefinitionProvider',
        uri,
        position,
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
            actualRange.start.character,
            expectRange.start.character,
        );
        assert.strictEqual(actualRange.end.line, expectRange.end.line);
        assert.strictEqual(
            actualRange.end.character,
            expectRange.end.character,
        );
    });
}

// 检查 hover 返回的内容（拼接后）包含指定子串，避免对完整 markdown 做脆弱的精确匹配
export async function testHoverContains(
    uri: vscode.Uri,
    position: vscode.Position,
    expectSubstr: string,
) {
    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeHoverProvider',
        uri,
        position,
    )) as vscode.Hover[];

    assert.ok(actualList.length > 0, 'expect at least one hover result');
    const allText = actualList
        .map((h) => {
            const c = h.contents as any;
            if (Array.isArray(c)) {
                return c
                    .map((x) => (x && x.value ? x.value : String(x)))
                    .join('\n');
            }
            if (c && c.value) {
                return c.value;
            }
            return '';
        })
        .join('\n')
        // 路径分隔符归一化：Windows 下 fsPath 用反斜杠，期望串用正斜杠，
        // 归一后便于跨平台比较（如 require("a/b/c") 的跳转/hover 路径）
        .replace(/\\/g, '/');
    assert.ok(
        allText.indexOf(expectSubstr) >= 0,
        `hover content should contain "${expectSubstr}", got: ${allText}`,
    );
}

export async function testSignatureHelp(
    uri: vscode.Uri,
    position: vscode.Position,
    expect: vscode.SignatureHelp,
) {
    const actual = (await vscode.commands.executeCommand(
        'vscode.executeSignatureHelpProvider',
        uri,
        position,
    )) as vscode.SignatureHelp;

    assert.strictEqual(
        actual.activeParameter,
        expect.activeParameter,
        'activeparameter',
    );
    assert.strictEqual(
        actual.activeSignature,
        expect.activeSignature,
        'active signature',
    );

    expect.signatures.forEach((expectedItem, index) => {
        const actualItem = actual.signatures[index];
        assert.strictEqual(actualItem.label, expectedItem.label, 'label');
        assert.strictEqual(
            actualItem.parameters.length,
            expectedItem.parameters.length,
            'parameters length',
        );

        if (expectedItem.documentation) {
            const doc = actualItem.documentation as vscode.MarkdownString;
            if (doc.value !== expectedItem.documentation) {
                console.log('expect', expectedItem.documentation);
                console.log('got', doc.value);
            }
            assert.strictEqual(
                doc.value,
                expectedItem.documentation,
                'documentation',
            );
        }
        expectedItem.parameters.forEach((param, paramIdx) => {
            const actualParam = actualItem.parameters[paramIdx];
            assert.strictEqual(
                actualParam.label[0],
                param.label[0],
                'param label 0',
            );
            assert.strictEqual(
                actualParam.label[1],
                param.label[1],
                'param label 1',
            );
        });
    });
}

export async function testWorkspaceSymbol(
    query: string,
    expect: vscode.SymbolInformation[],
) {
    const actualList = (await vscode.commands.executeCommand(
        'vscode.executeWorkspaceSymbolProvider',
        query,
    )) as vscode.SymbolInformation[];

    assert.strictEqual(
        actualList.length,
        expect.length,
        'workspace symbol count',
    );

    actualList.sort((src, dst) => {
        if (src.name === dst.name) {
            return src.location.uri.toString() > dst.location.uri.toString()
                ? 1
                : -1;
        }
        return src.name > dst.name ? 1 : -1;
    });

    expect.forEach((exp, index) => {
        const act = actualList[index];
        assert.strictEqual(act.name, exp.name, 'sym name');
        assert.strictEqual(
            act.location.uri.toString(),
            exp.location.uri.toString(),
            'location',
        );
    });
}

export async function testDocumentSymbol(
    uri: vscode.Uri,
    items: vscode.SymbolInformation[],
) {
    const rawList = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri,
    );

    const list = rawList as vscode.SymbolInformation[];
    assert.strictEqual(list.length, items.length, 'document symbol count');
    items.forEach((sym, index) => {
        assert.strictEqual(sym.name, list[index].name);
    });
}

export async function testLuaCheck(
    uri: vscode.Uri,
    expectList: vscode.Diagnostic[],
) {
    const actualList = vscode.languages.getDiagnostics(uri);

    assert.strictEqual(actualList.length, expectList.length);
    expectList.forEach((expectedItem, index) => {
        const actualItem = actualList[index];
        assert.strictEqual(
            actualItem.severity,
            expectedItem.severity,
            'serverity',
        );
        assert.strictEqual(actualItem.message, expectedItem.message, 'message');
    });
}
