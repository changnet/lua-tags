// 跳转到符号定义

import {
    Range,
    Position,
    Location,
    createConnection,
    TextDocuments,
    TextDocument,
    Diagnostic,
    DiagnosticSeverity,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    CompletionItem,
    SymbolInformation,
    CompletionItemKind,
    DocumentSymbolParams,
    WorkspaceSymbolParams,
    TextDocumentPositionParams,
    SymbolKind,
    Definition
} from 'vscode-languageserver';

import {
    Symbol,
    SymInfoEx,
    SymbolQuery,
    VSCodeSymbol,
    LocalType
} from "./symbol";

import {
    Node
} from 'luaparse';

import {
    Search, SearchResult
} from "./search";

import {
    Server
} from "./server";

import { Utils } from './utils';

export class GoToDefinition {
    private static ins: GoToDefinition;

    private constructor() {
    }

    public static instance() {
        if (!GoToDefinition.ins) {
            GoToDefinition.ins = new GoToDefinition();
        }

        return GoToDefinition.ins;
    }


    // require("aaa.bbb")这种，则打开对应的文件
    private getRequireDefinition(text: string, pos: Position) {
        // 注意特殊情况下，可能会有 require "a/b" require "a\b"
        let found = text.match(/require\s*[(]?\s*"([/|\\|.|\w]+)"\s*[)]?/);
        if (!found || !found[1]) { return null; }

        // 光标的位置不在require("a.b.c")范围内
        let start = text.indexOf(found[0]);
        if (start > pos.character || pos.character > start + found[0].length) {
            return null;
        }

        let uri = Symbol.instance().getRequireUri(found[1]);
        if ("" === uri) { return null; }

        return {
            uri: uri,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 }
            }
        };
    }

    public doDefinition(srv: Server, uri: string, pos: Position) {
        let line = srv.getQueryText(uri, pos);
        if (!line) { return []; }

        // require("a.b.c") 跳转到对应的文件
        let loc: Definition | null = this.getRequireDefinition(line, pos);
        if (loc) { return loc; }

        let query = srv.getQuerySymbol(uri, line, pos);
        if (!query || query.name === "") { return []; }

        let list = Search.instance().search(srv, query);
        if (!list) {
            return [];
        }

        loc = [];
        for (let sym of list) {
            // stl 使用了一个空串作为位置
            if ("" === sym.location.uri) {
                continue;
            }
            loc.push(sym.location);
        }

        return loc;
    }
}
