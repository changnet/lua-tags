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
    SymbolQuery
} from "./symbol"

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
        symList: SymbolInformation[] | null, symName: string, kind: SymbolKind) {
        if (!symList) return null;

        let loc: Definition = []
        for (let sym of symList) {
            if (sym.name == symName) loc.push(sym.location);
        }

        if (loc.length > 0) return loc;

        return null;
    }

    // 根据模块名查找符号
    // 在Lua中，可能会出现局部变量名和全局一致，这样就会出错。
    // 暂时不考虑这种情况，真实项目只没见过允许这种写法的
    public getGlobalModuleDefinition(query: SymbolQuery) {
        let mdName = query.mdName
        if (!mdName || "self" == mdName) return null;

        let symList = Symbol.instance().getGlobalModule(mdName);

        return this.checkSymDefinition(symList,query.symName,query.kind)
    }


    // 根据模块名查找某个文档的符号位置
    public getDocumentModuleDefinition(query: SymbolQuery) {
        let mdName = query.mdName
        if (!mdName) return null;

        let symbol = Symbol.instance();
        let rawUri = symbol.getRawUri(query.uri,mdName)

        return this.checkSymDefinition(
            symbol.getDocumentModule(rawUri,mdName),query.symName,query.kind)
    }


    // 根据模块名查询局部变量位置
    public getLocalModuleDefinition(query: SymbolQuery, text: string[]) {
        let mdName = query.mdName
        if (!mdName) return null;

        let symbol = Symbol.instance();
        let iderInfo = symbol.getLocalRawModule(mdName,text);
        if (!iderInfo) return null;

        if (iderInfo.uri) {
            let symList = symbol.getDocumentSymbol(iderInfo.uri)
            return this.checkSymDefinition(symList,query.symName,query.kind)
        }

        if (iderInfo.mdName) {
            let newQuery = Object.assign({},query)
            newQuery.mdName = iderInfo.mdName
            return this.getGlobalModuleDefinition(newQuery)
        }
        return null
    }

    // 从全局符号获取符号定义
    public getGlobalDefinition(query: SymbolQuery) {
        let symList = Symbol.instance().getGlobalSymbol(query.symName);

        return this.checkSymDefinition(symList,query.symName,query.kind)
    }

    // 获取当前文档的符号定义
    public getDocumentDefinition(query: SymbolQuery) {
        let symList = Symbol.instance().getDocumentSymbol(query.uri);

        return this.checkSymDefinition(symList,query.symName,query.kind)
    }

    // 获取局部变量位置
    public getlocalDefinition(query: SymbolQuery, text: string[]) {
        let symbol = Symbol.instance();
        return symbol.parselocalSymLocation(query.uri, query.symName, text);
    }
}
