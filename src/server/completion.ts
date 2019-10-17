// 处理自动补全

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

export class Completion {
    private static ins: Completion;

    private constructor() {
    }

    public static instance() {
        if (!Completion.ins) {
            Completion.ins = new Completion();
        }

        return Completion.ins;
    }


    // 符号转自动完成格式
    private symbolToComplition(sym: SymbolInformation): CompletionItem {
        let kind: CompletionItemKind = CompletionItemKind.Text
        switch (sym.kind) {
            case SymbolKind.Function: kind = CompletionItemKind.Function; break;
            case SymbolKind.Variable: kind = CompletionItemKind.Variable; break;
        }

        return {
            label: sym.name,
            kind: kind
        }
    }

    private checkSymCompletion(
        symList: SymbolInformation[] | null, symName: string) {
        if (!symList) return null;

        let items: CompletionItem[] = []
        for (let sym of symList) {
            // 暂时不和symName对比过滤了，单个模块的符号应该不多，由vs code处理就行
            items.push(this.symbolToComplition(sym));
        }

        if (items.length > 0) return items;

        return null;
    }

    // 根据模块名(mdName)查找符号
    // 在Lua中，可能会出现局部变量名和全局一致，这样就会出错。
    // 暂时不考虑这种情况，真实项目只没见过允许这种写法的
    public getGlobalModuleCompletion(query: SymbolQuery) {
        let mdName = query.mdName
        if (!mdName || "self" == mdName) return null;

        let symList = Symbol.instance().getGlobalModule(mdName);

        return this.checkSymCompletion(symList,query.symName)
    }

    // 根据模块名查找某个文档的符号位置
    public getDocumentModuleCompletion(query: SymbolQuery) {
        let mdName = query.mdName
        if (!mdName) return null;

        let symbol = Symbol.instance();
        let rawUri = symbol.getRawUri(query.uri,mdName)

        return this.checkSymCompletion(
            symbol.getDocumentModule(rawUri,mdName),query.symName)
    }
}
