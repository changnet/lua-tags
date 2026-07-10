import * as path from 'path';
import * as assert from 'assert';
import { before } from 'mocha';
import * as vscode from 'vscode';
import {
    activateExtension,
    testWorkspaceSymbol,
    testDocumentSymbol,
    testLuaCheck,
    resolveFixture,
} from '../../helper';

const fixturePath = resolveFixture(__dirname, 'core');
const testPath = path.join(fixturePath, 'test.lua');
const testUri = vscode.Uri.file(testPath);

suite('Extension Test Suite', () => {
    before(() => {
        vscode.window.showInformationMessage('Start all tests.');
    });

    test('test active', async () => {
        await activateExtension({
            luaVersion: '5.3',
            luacheck: true,
            checkOnInit: true,
        });
    }).timeout(10240);

    test('test no workspace symbol', async () => {
        await testWorkspaceSymbol('', []);
    });

    test('test fuzz workspace symbol', async () => {
        const range = new vscode.Range(0, 0, 0, 0);
        const uri0 = vscode.Uri.file(
            path.join(fixturePath, 'conf', 'battle_conf.lua'),
        );
        const uri1 = vscode.Uri.file(
            path.join(fixturePath, 'conf', 'monster_conf.lua'),
        );
        const uri2 = vscode.Uri.file(
            path.join(fixturePath, 'conf', 'skill_conf.lua'),
        );
        const uri3 = vscode.Uri.file(path.join(fixturePath, 'test.lua'));
        const uri4 = vscode.Uri.file(path.join(fixturePath, 'monster.lua'));
        await testWorkspaceSymbol('mon', [
            {
                name: 'Monster',
                kind: 0,
                containerName: '',
                location: { uri: uri4, range: range },
            },
            {
                name: 'Monster',
                kind: 0,
                containerName: '',
                location: { uri: uri3, range: range },
            },
            {
                name: 'MonsterConf',
                kind: 0,
                containerName: '',
                location: { uri: uri1, range: range },
            },
            {
                name: 'monster',
                kind: 0,
                containerName: '',
                location: { uri: uri0, range: range },
            },
            {
                name: 'monster',
                kind: 0,
                containerName: '',
                location: { uri: uri2, range: range },
            },
            {
                name: 'multi_comment',
                kind: 0,
                containerName: '',
                location: { uri: uri3, range: range },
            },
        ]);
    });

    test('test anonymous table document symbol', async () => {
        const uri = vscode.Uri.file('');
        const range = new vscode.Range(0, 0, 0, 0);

        const docPath = path.join(fixturePath, 'conf', 'skill_conf.lua');
        await testDocumentSymbol(vscode.Uri.file(docPath), [
            {
                name: 'skill_id',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
            {
                name: 'level',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
            {
                name: 'desc',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
            {
                name: 'parameters',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
            {
                name: 'boss',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
            {
                name: 'monster',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
            {
                name: 'player',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
        ]);
    });

    test('test table document symbol', async () => {
        const uri = vscode.Uri.file('');
        const range = new vscode.Range(0, 0, 0, 0);

        const docPath = path.join(fixturePath, 'conf', 'battle_conf.lua');
        await testDocumentSymbol(vscode.Uri.file(docPath), [
            {
                name: 'BattleConf',
                kind: 0,
                containerName: '',
                location: { uri: uri, range: range },
            },
        ]);
    });

    test('test luacheck', async () => {
        const docPath = path.join(fixturePath, 'check.lua');

        const uri = vscode.Uri.file(docPath);
        await testLuaCheck(uri, [
            {
                range: new vscode.Range(0, 0, 0, 0),
                severity: vscode.DiagnosticSeverity.Warning,
                message: "(W211)unused variable 'foo'",
            },
            {
                range: new vscode.Range(0, 0, 0, 0),
                severity: vscode.DiagnosticSeverity.Warning,
                message: "(W211)unused function 'bar'",
            },
        ]);
    }).timeout(2000);

    test('test large file luacheck', async () => {
        const docPath = path.join(fixturePath, 'conf', 'monster_conf.lua');

        const uri = vscode.Uri.file(docPath);
        await testLuaCheck(uri, [
            {
                range: new vscode.Range(0, 0, 0, 0),
                severity: vscode.DiagnosticSeverity.Warning,
                message:
                    "(W111)setting non-standard global variable 'MonsterConf'",
            },
            {
                range: new vscode.Range(0, 0, 0, 0),
                severity: vscode.DiagnosticSeverity.Warning,
                message: "(W211)unused variable 'MK'",
            },
        ]);
    }).timeout(2000);
});
