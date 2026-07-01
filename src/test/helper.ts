import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';

export function resolveFixture(dir: string, name: string): string {
    return path.resolve(dir, '../../../../src/test/fixture', name);
}

export async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function activateExtension(extraConfig?: Record<string, any>) {
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
        assert.ok(false, `error in activate extension ${e}`);
    }
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
