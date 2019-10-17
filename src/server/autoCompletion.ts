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

import * as fuzzysort from "fuzzysort"
import { g_utils } from './utils';

export class AutoCompletion {
    private static ins: AutoCompletion;

    private constructor() {
    }

    public static instance() {
        if (!AutoCompletion.ins) {
            AutoCompletion.ins = new AutoCompletion();
        }

        return AutoCompletion.ins;
    }


    // 符号转自动完成格式
    private symbolToComplition(sym: SymbolInformation): CompletionItem {
        let kind: CompletionItemKind = CompletionItemKind.Text
        switch (sym.kind) {
            case SymbolKind.Function: kind = CompletionItemKind.Function; break;
            case SymbolKind.Variable: kind = CompletionItemKind.Variable; break;
        }

        let file = sym.location.uri.match(/\/(\w+.\w+)$/)

        let item: CompletionItem = {
            label: sym.name,
            kind: kind
        };

        if (file) item.detail = file[1];

        return item;
    }

    // 检测列表中哪些符号需要显示在自动完成列表
    private checkSymCompletion(
        symList: SymbolInformation[] | null, symName: string) {
        if (!symList) return null;

        let items: CompletionItem[] = []
        for (let sym of symList) {
            // let res = fuzzysort.single(symName,sym.name)
            // https://github.com/farzher/fuzzysort
            // res.score
            // exact match returns a score of 0. lower is worse
            // 不匹配返回null
            // g_utils.log(`check match ${symName} ${sym.name}
            //    ${JSON.stringify(fuzzysort.single(symName,sym.name))}`)
            if (0 == symName.length || fuzzysort.single(symName,sym.name)) {
                items.push(this.symbolToComplition(sym));
            }
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

    // 根据模块名查询局部变量位置
    public getLocalModuleCompletion(query: SymbolQuery, text: string[]) {
        let mdName = query.mdName
        if (!mdName) return null;

        let symbol = Symbol.instance();
        let iderInfo = symbol.getLocalRawModule(mdName, text);
        if (!iderInfo) return null;

        if (iderInfo.uri) {
            let symList = symbol.getDocumentSymbol(iderInfo.uri)
            return this.checkSymCompletion(symList, query.symName)
        }

        if (iderInfo.mdName) {
            let newQuery = Object.assign({}, query)
            newQuery.mdName = iderInfo.mdName
            return this.getGlobalModuleCompletion(newQuery)
        }
        return null
    }

    // 从全局符号获取符号定义
    public getGlobalCompletion(query: SymbolQuery) {
        let symList = Symbol.instance().getGlobalSymbol();

        return this.checkSymCompletion(symList,query.symName)
    }

    // 获取当前文档的符号定义
    public getDocumentCompletion(query: SymbolQuery) {
        let symList = Symbol.instance().getDocumentSymbol(query.uri);

        return this.checkSymCompletion(symList,query.symName)
    }

    // 获取局部变量位置
    // TODO: 局部变量不处理自动完成了，vs code会自动把当前文档的单词提示出来
    // 不地ts的是有提示的，以后看要不要做
    public getlocalCompletion(query: SymbolQuery, text: string[]) {
        return null;
    }
}
