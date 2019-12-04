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
    SymInfoEx,
    SymbolQuery
} from "./symbol";

import * as fuzzysort from "fuzzysort";
import { Utils } from './utils';
import { Server } from './server';
import { Search, Filter } from './search';

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
    private toCompletion(sym: SymInfoEx): CompletionItem {
        // vs code会自动补全上下文中的单词，默认类型为CompletionItemKind.Text
        // 所以我们默认使用variable类型，与text区分
        let kind: CompletionItemKind = CompletionItemKind.Variable;
        switch (sym.kind) {
            case SymbolKind.Function: kind = CompletionItemKind.Function; break;
            case SymbolKind.Namespace: kind = CompletionItemKind.Module; break;
            case SymbolKind.Module: kind = CompletionItemKind.Module; break;
        }

        let file = Symbol.getSymbolPath(sym);

        let item: CompletionItem = {
            label: sym.name,
            kind: kind
        };

        let detail = file ? `${file}\n` : "";
        // 如果有注释，显示注释
        if (sym.comment) {
            detail += `${sym.comment}\n`;
        }
        // 如果是常量，显示常量值： test.lua: val = 999
        if (sym.value) {
            detail += `${sym.name} = ${sym.value}`;
        }
        // 如果是函数，显示参数: test.lua: function(a, b, c)
        if (sym.parameters) {
            let parameters = sym.parameters.join(", ");
            let local = Symbol.getLocalTypePrefix(sym.local);
            detail += `${local}function ${sym.name}(${parameters})`;
        }
        if (detail && detail.length > 0) {
            item.detail = detail;
        }

        return item;
    }

    // require "a.b.c" 自动补全后面的路径
    public getRequireCompletion(line: string, pos: number) {
        const text = line.substring(0, pos);

        let found = text.match(/require\s*[(]?\s*"([/|\\|.|\w]+)/);
        if (!found || !found[1]) { return null; }

        let symbol = Symbol.instance();
        let path = symbol.toUriFormat(found[1]);

        let leftWord: string | null = null;
        let lMathList = path.match(/\w*$/g);
        if (lMathList) { leftWord = lMathList[0]; }

        let items: CompletionItem[] = [];

        const uris = symbol.getAllDocUri();
        for (let uri of uris) {
            let index = uri.indexOf(path);
            if (index < 0) { continue; }

            let rightText = uri.substring(index + path.length);

            let rMatchList = rightText.match(/^\w*/g);
            if (!rMatchList) { continue; }

            let name = rMatchList[0];
            if (leftWord) { name = leftWord + name; }

            items.push({ label: name, kind: CompletionItemKind.File });
        }

        if (items.length <= 0) { return null; }
        return items;
    }

    // 搜索局部变量
    private getlocalCompletion(query: SymbolQuery) {
        let symList: SymInfoEx[] = [];

        const baseName = query.base;
        const symName = query.name;
        const emptyName = 0 === symName.length;
        let symbol = Symbol.instance();
        Search.instance().rawSearchLocal(query.uri, query.position,
            (node, local, name, base, init) => {
                // 搜索局部变量时，如果存在模块名则模块名必须准确匹配
                if (base !== baseName) {
                    return;
                }
                if (emptyName || fuzzysort.single(symName, name)) {
                    let sym = symbol.toSym(
                        { name: name, base: base }, node, init, local);
                    if (sym) {
                        symList.push(sym);
                    }
                }
            }
        );

        return symList.length > 0 ? symList : null;
    }

    private doSearch(srv: Server, query: SymbolQuery) {
        let search = Search.instance();

        let symName = query.name;
        let filter: Filter = symList => {
            if (!symList) {
                return null;
            }
            return symList.filter(sym => {
                return 0 === symName.length
                    || fuzzysort.single(symName, sym.name);
            });
        };

        // 优先根据模块名匹配全局符号
        let items = search.searchGlobalModule(query, filter);
        if (items) {
            return items;
        }

        // 根据模块名匹配文档符号
        items = search.searchDocumentModule(query, filter);
        if (items) {
            return items;
        }

        // 查找局部变量
        srv.ensureSymbolCache(query.uri);
        items = this.getlocalCompletion(query);
        if (items) {
            return items;
        }

        // 自动补全时，M. 时符号名为空，仅列出模块下的所有符号
        if (symName.length <= 0) {
            return null;
        }

        let symbol = Symbol.instance();
        // 忽略模块名，直接查找当前文档符号
        items = filter(symbol.getDocumentSymbol(query.uri));
        if (items) {
            let symList = search.filterLocalSym(items, query);
            if (symList.length > 0) {
                return symList;
            }
        }

        // 忽略模块名，直接查找全局符号
        items = filter(symbol.getGlobalSymbol(undefined, query.uri));
        if (items) {
            return items;
        }

        return null;
    }

    public doCompletion(srv: Server, uri: string, pos: Position) {
        let line = srv.getQueryText(uri, pos);
        if (!line) { return []; }

        // require("a.b.c") 跳转到对应的文件
        let items: CompletionItem[] | null =
            this.getRequireCompletion(line, pos.character);
        if (items) { return items; }

        let query = srv.getSymbolQuery(uri, line, pos);
        if (!query) { return []; }

        let list = this.doSearch(srv, query);
        if (!list) {
            return [];
        }

        items = [];
        for (let sym of list) {
            items.push(this.toCompletion(sym));
        }

        return items;
    }
}
