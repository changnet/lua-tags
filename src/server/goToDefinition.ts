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
        symList: SymInfoEx[] | null, symName: string, kind: SymbolKind) {
        if (!symList) { return null; }

        let loc: Definition = [];
        for (let sym of symList) {
            if (sym.name === symName) { loc.push(sym.location); }
        }

        if (loc.length > 0) { return loc; }

        return null;
    }

    // 根据模块名查找符号
    // 在Lua中，可能会出现局部变量名和全局一致，这样就会出错。
    // 暂时不考虑这种情况，真实项目只没见过允许这种写法的
    public getGlobalModuleDefinition(query: SymbolQuery) {
        let mdName = query.mdName;
        if (!mdName || "self" === mdName) { return null; }

        let symbol = Symbol.instance();

        let rawName = symbol.getRawModule(query.uri, mdName);
        let symList = symbol.getGlobalModule(rawName);

        return this.checkSymDefinition(symList, query.symName, query.kind);
    }

    // 根据模块名查找某个文档的符号位置
    public getDocumentModuleDefinition(query: SymbolQuery) {
        let mdName = query.mdName;
        if (!mdName) { return null; }

        let symbol = Symbol.instance();
        let rawUri = symbol.getRawUri(query.uri, mdName);

        return this.checkSymDefinition(
            symbol.getDocumentModule(rawUri, mdName), query.symName, query.kind);
    }

    // 从全局符号获取符号定义
    public getGlobalDefinition(query: SymbolQuery) {
        let symList = Symbol.instance().getGlobalSymbol(query.symName);

        return this.checkSymDefinition(symList, query.symName, query.kind);
    }

    // 获取当前文档的符号定义
    public getDocumentDefinition(query: SymbolQuery) {
        let symList = Symbol.instance().getDocumentSymbol(query.uri);

        return this.checkSymDefinition(symList, query.symName, query.kind);
    }

    // 获取局部变量位置
    public getlocalDefinition(query: SymbolQuery) {
        let foundLocal: Node | null = null;
        let foundGlobal: Node | null = null;
        Search.instance().search(query.uri, query.position,
            (node, isLocal, name, base) => {
                if (name === query.symName && base === query.mdName) {
                    if (isLocal) {
                        foundLocal = node;
                    } else {
                        foundGlobal = node;
                    }
                }
            }
        );

        // 这里foundLocal、foundGlobal会被识别为null类型，因为它们是在lambda中被
        // 赋值的，而typescript无法保证这个lambda什么时候会被调用，因此要用!
        // https://github.com/Microsoft/TypeScript/issues/15631
        g_utils.log(`check local ${JSON.stringify(foundLocal)}`);
        g_utils.log(`check global ${JSON.stringify(foundGlobal)}`);
        const found: Node | null = foundLocal || foundGlobal;
        if (found && found!.loc) {
            return [Symbol.toLocation(query.uri, found!.loc)];
        }

        return null;
    }

    // require("aaa.bbb")这种，则打开对应的文件
    public getRequireDefinition(text: string, pos: Position) {
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
    private isLocalization(query: SymbolQuery, loc: Location) {
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
    public localizationFilter(query: SymbolQuery, loc: Definition | null) {
        if (!loc) { return null; }

        if (!(loc instanceof Array)) {
            return this.isLocalization(query, loc) ? null : loc;
        }

        let newLoc = loc.filter(oneLoc => !this.isLocalization(query, oneLoc));

        return newLoc.length > 0 ? newLoc : null;
    }
}
