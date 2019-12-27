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
    SymbolQuery,
    CommentType,
    LocalType
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
    private toCompletion(sym: SymInfoEx, uri: string): CompletionItem {
        // vs code会自动补全上下文中的单词，默认类型为CompletionItemKind.Text
        // 所以我们默认使用variable类型，与text区分
        let kind: CompletionItemKind = CompletionItemKind.Variable;
        switch (sym.kind) {
            case SymbolKind.Function: kind = CompletionItemKind.Function; break;
            case SymbolKind.Namespace: kind = CompletionItemKind.Module; break;
            case SymbolKind.Module: kind = CompletionItemKind.Module; break;
        }

        let file;
        if (sym.location.uri !== uri) {
            file = Symbol.getSymbolPath(sym);
        }

        let item: CompletionItem = {
            label: sym.name,
            kind: kind
        };

        let detail = file ? `${file}\n` : "";
        // 显示上方的注释
        if (sym.comment && sym.ctType === CommentType.CT_ABOVE) {
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
        // 显示引用的变量
        let ref = Symbol.instance().getRefValue(sym);
        if (ref) {
            detail += ref;
        }
        // 显示行尾的注释
        if (sym.comment && sym.ctType === CommentType.CT_LINEEND) {
            detail += ` ${sym.comment}`;
        }
        if (detail && detail.length > 0) {
            item.detail = detail;
        }

        return item;
    }

    // 检测路径匹配
    // @beg: 比如sample.conf中写了一半sample.co中的co
    // @end: 结束的路径，比如sample.conf.monster_conf.lua中的conf.monster_conf.lua
    private checkPathMatch(beg: string | null, end: string) {
        // 得到左边的路径名conf.monster中的conf
        let matchs = end.match(/^\w+/g);
        if (!matchs) {
            return null;
        }
        if (!beg || matchs[0].startsWith(beg)) {
            return matchs[0];
        }

        return null;
    }

    // 检测文件名匹配
    private checkFileMatch(beg: string | null, end: string) {
        if (!beg) {
            return null;
        }

        // 自动补全多级路径直到文件名
        // sample.mon 补全为 sample.conf.monster
        let matchs = end.match(/(\w+)\.lua$/);
        if (!matchs) {
            return null;
        }

        // 匹配文件名
        if (!fuzzysort.single(beg, matchs[1])) {
            return null;
        }

        // 得到没有后缘的文件路径
        let endPath = end.substring(0, end.length - ".lua".length);
        // 把uri中的/替换为.
        return endPath.replace(/\//g, ".");
    }

    // require "a.b.c" 自动补全后面的路径
    public getRequireCompletion(line: string, pos: number) {
        const text = line.substring(0, pos);

        // 匹配require "a.b.c"或者 require（"a.b.c"）
        let found = text.match(/require\s*[(]?\s*"([/|\\|.|\w]+)/);
        if (!found || !found[1]) {
            return null;
        }

        // 得到path = a.b.c
        let symbol = Symbol.instance();
        let path = symbol.toUriFormat(found[1]);

        // 匹配写了一半的路径，比如 sample.conf只写了sqmple.co中的co
        let leftWord: string | null = null;
        let lMathList = path.match(/\w+$/g);
        if (lMathList) {
            leftWord = lMathList[0];
            path = path.substring(0, path.length - leftWord.length);
        }

        // 同一个路径下可能有多个文件，过滤掉同名文件
        let itemFilter = new Map<string, boolean>();
        let items: CompletionItem[] = [];

        symbol.eachUri(uri => {
            let index = uri.indexOf(path);
            if (index < 0) {
                return;
            }

            const endPath = uri.substring(index + path.length);
            // 检测下一级目录 sample.co中的sample.conf
            const nextPath = this.checkPathMatch(leftWord, endPath);
            if (nextPath && !itemFilter.get(nextPath)) {
                itemFilter.set(nextPath, true);
                items.push({ label: nextPath, kind: CompletionItemKind.File });
            }

            // TODO:这个暂时没用，因为在字符串中，只有打出指定的字符.才会触发自动完成
            // 自动补全多级路径直到文件名
            // sample.mon 补全为 sample.conf.monster
            const filePath = this.checkFileMatch(leftWord, endPath);
            if (filePath && !itemFilter.get(filePath)) {
                itemFilter.set(filePath, true);
                items.push({ label: filePath, kind: CompletionItemKind.File });
            }
        });

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
                // 如果当前正在写函数的参数，则不要补全已有的参数
                if (local === LocalType.LT_PARAMETER) {
                    const loc = node.loc;
                    if (loc && query.position.line === loc.start.line - 1) {
                        return;
                    }
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

    /* 搜索模块名
     * 正常情况下，声明一个模块都会产生一个符号
     * 但table.empty = function() ... end这种扩展标准库或者C++导出的模块时就没有
     * 所以这里特殊处理
     */
    private searchModuleName(
        name: string, items: CompletionItem[] | null, base?: string) {
        if (base) {
            return items;
        }

        let newItems = items || [];
        Symbol.instance().eachModuleName(mdName => {
            if (!fuzzysort.single(name, mdName)) {
                return;
            }

            // 目前无法知道某个模块的声明在不在lua中，只能循环排除
            if (items) {
                for (let item of items) {
                    if (mdName === item.label) {
                        return;
                    }
                }
            }

            newItems.push({
                label: mdName,
                kind: CompletionItemKind.Module
            });
        });

        return newItems;
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
        const uri = query.uri;
        srv.ensureSymbolCache(uri);
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
        items = filter(symbol.getDocumentSymbol(uri));
        if (items) {
            let symList = search.filterLocalSym(items, query);
            if (symList.length > 0) {
                return symList;
            }
        }

        // 忽略模块名，直接查找全局符号
        items = filter(symbol.getGlobalSymbol(
            false, sym => sym.location.uri !== uri));
        if (items) {
            let symList = search.filterLocalSym(items, query);
            if (symList.length > 0) {
                return symList;
            }
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
            items.push(this.toCompletion(sym, uri));
        }

        return this.searchModuleName(query.name, items, query.base);
    }
}
