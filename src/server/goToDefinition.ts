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
    VSCodeSymbol
} from "./symbol";

import {
    Node
} from 'luaparse';

import {
    Search
} from "./search";

import {
    Server
} from "./server";

import { g_utils } from './utils';

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


    private checkSymDefinition(
        symList: SymInfoEx[] | null, name: string, kind: SymbolKind) {
        if (!symList) { return null; }

        let foundList: SymInfoEx[] = [];
        for (let sym of symList) {
            if (sym.name === name) { foundList.push(sym); }
        }

        if (foundList.length > 0) { return foundList; }

        return null;
    }

    // 获取局部变量位置
    private getlocalDefinition(query: SymbolQuery) {
        let localName: string | null = null;
        let globalName: string | null = null;
        let foundLocal: Node | null = null;
        let foundGlobal: Node | null = null;
        Search.instance().searchLocal(query.uri, query.position,
            (node, isLocal, name, base) => {
                if (name === query.symName && base === query.mdName) {
                    if (isLocal) {
                        foundLocal = node;
                        localName = name;
                    } else {
                        foundGlobal = node;
                        globalName = name;
                    }
                }
            }
        );

        // 这里foundLocal、foundGlobal会被识别为null类型，因为它们是在lambda中被
        // 赋值的，而typescript无法保证这个lambda什么时候会被调用，因此要用!
        // https://github.com/Microsoft/TypeScript/issues/15631

        let found: SymInfoEx | null = null;
        if (foundLocal && localName) {
            found = Symbol.instance().toSym(localName, foundLocal);
        } else if (foundGlobal && globalName) {
            found = Symbol.instance().toSym(globalName, foundGlobal);
        }

        return found ? [found] : null;
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

    // 判断是否本地化
    private isLocalization(query: SymbolQuery, sym: SymInfoEx) {
        const loc: Location = sym.location;
        if (query.uri !== loc.uri) { return false; }
        if (query.position.line !== loc.range.start.line) { return false; }

        // 找出 M = M
        let re = new RegExp(query.symName + "\\s*=\\s*" + query.symName, "g");
        let match = query.text.match(re);

        if (!match) { return false; }

        let startIdx = query.text.indexOf(match[0]);
        let eqIdx = query.text.indexOf("=", startIdx);

        // 在等号右边就是本地化的符号，要查找原符号才行
        return query.position.end > eqIdx ? true : false;
    }

    // 检测local M = M这种本地化并过滤掉，当查找后面那个M时，不要跳转到前面那个M
    private localizationFilter(query: SymbolQuery, symList: SymInfoEx[] | null) {
        if (!symList) { return null; }

        let newList = symList.filter(sym => !this.isLocalization(query, sym));

        return newList.length > 0 ? newList : null;
    }

    public doDefinition(srv: Server, uri: string, pos: Position) {
        let line = srv.getQueryLineText(uri, pos);
        if (!line) { return []; }

        // require("a.b.c") 跳转到对应的文件
        let loc: Definition | null = this.getRequireDefinition(line, pos);
        if (loc) { return loc; }

        let query = srv.getSymbolQuery(uri, line, pos);
        if (!query || query.symName === "") { return []; }

        let list = Search.instance().search(query, symList => {
            return this.localizationFilter(query!,
                this.checkSymDefinition(symList, query!.symName, query!.kind)
            );
        }, () => {
            srv.ensureSymbolCache(query!.uri);
            return this.getlocalDefinition(query!);
        });

        if (!list) {
            return [];
        }

        loc = [];
        for (let sym of list) {
            loc.push(sym.location);
        }

        return loc;
    }
}
