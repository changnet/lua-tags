// 处理自动补全

import {
    Position,
    CompletionItem,
    CompletionItemKind,
    SymbolKind,
} from 'vscode-languageserver';

import {
    SymbolEx,
    SymInfoEx,
    SymbolQuery,
    CommentType,
    LocalType
} from "./symbol";

import { Server } from './server';
import { Search, Filter } from './search';

export class AutoCompletion {
    private static accurate = -500;
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

        const item: CompletionItem = {
            label: sym.name,
            kind: kind
        };

        if (sym.location.uri !== uri) {
            const file = SymbolEx.getSymbolPath(sym);
            if (file) {
                item.detail = file;
            }
        }

        let doc = "";
        if (sym.comment && sym.ctType === CommentType.CT_HTML) {
            doc = sym.comment + "\n";
        }

        let mdDoc = ""; // markdown documentation
        // 显示上方的注释
        if (sym.comment && sym.ctType === CommentType.CT_ABOVE) {
            mdDoc += `${sym.comment}\n`;
        }
        // 如果是常量，显示常量值： test.lua: val = 999
        if (sym.value) {
            mdDoc += `${sym.name} = ${sym.value}`;
        } else if (sym.kind === SymbolKind.Function) {
            // 如果是函数，显示参数: test.lua: function(a, b, c)
            const local = SymbolEx.getLocalTypePrefix(sym.local);
            const base = sym.base && sym.indexer ? sym.base + sym.indexer : "";
            const parameters = sym.parameters ? sym.parameters.join(", ") : "";
            mdDoc += `${local}function ${base}${sym.name}(${parameters})`;
        } else {
            const local = SymbolEx.getLocalTypePrefix(sym.local);
            const base = sym.base && sym.indexer ? sym.base + sym.indexer : "";
            mdDoc += `${local}${base}${sym.name}`;
        }

        // 显示引用的变量
        const ref = SymbolEx.instance().getRefValue(sym);
        if (ref) {
            mdDoc += ref;
        }
        // 显示行尾的注释
        if (sym.comment && sym.ctType === CommentType.CT_LINEEND) {
            mdDoc += ` ${sym.comment}`;
        }
        if (doc.length > 0 || mdDoc.length > 0) {
            item.documentation = {
                kind: "markdown",
                value: doc
            };

            if (mdDoc.length > 0) {
                item.documentation.value += `\`\`\`lua\n${mdDoc}\n\`\`\``;
            }
        }

        return item;
    }

    // 检测路径匹配
    // @beg: 比如sample.conf中写了一半sample.co中的co
    // @end: 结束的路径，比如sample.conf.monster_conf.lua中的conf.monster_conf.lua
    private checkPathMatch(beg: string | null, end: string) {
        // 得到左边的路径名conf.monster中的conf
        const matchs = end.match(/^\w+/g);
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
        const matchs = end.match(/(\w+)\.lua$/);
        if (!matchs) {
            return null;
        }

        // 匹配文件名
        if (SymbolEx.checkMatch(beg, matchs[1]) > -1000) {
            return null;
        }

        // 得到没有后缘的文件路径
        const endPath = end.substring(0, end.length - ".lua".length);
        // 把uri中的/替换为.
        return endPath.replace(/\//g, ".");
    }

    // require "a.b.c" 自动补全后面的路径
    public getRequireCompletion(line: string, pos: number) {
        const text = line.substring(0, pos);

        // 匹配require "a.b.c"或者 require（"a.b.c"）
        const found = text.match(/require\s*[(]?\s*"([/|\\|.|\w]+)/);
        if (!found || !found[1]) {
            return null;
        }

        // 得到path = a.b.c
        const symbol = SymbolEx.instance();
        let path = symbol.toUriFormat(found[1]);

        // 匹配写了一半的路径，比如 sample.conf只写了sqmple.co中的co
        let leftWord: string | null = null;
        const lMathList = path.match(/\w+$/g);
        if (lMathList) {
            leftWord = lMathList[0];
            path = path.substring(0, path.length - leftWord.length);
        }

        // 同一个路径下可能有多个文件，过滤掉同名文件
        const itemFilter = new Map<string, boolean>();
        const items: CompletionItem[] = [];

        symbol.eachUri(uri => {
            const index = uri.indexOf(path);
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
        const symList: SymInfoEx[] = [];

        const duplicateSym = new Map<string, boolean>();

        const baseName = query.base;
        const symName = query.name;
        const emptyName = 0 === symName.length;
        const symbol = SymbolEx.instance();
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
                // 局部变量如果不是local，多数是同一个变量赋值
                if (!local && duplicateSym.get(name)) {
                    return;
                }
                if (emptyName || SymbolEx.checkMatch(symName, name) > -100) {
                    const sym = symbol.toSym(
                        { name: name, base: base }, node, init, local);
                    if (sym) {
                        duplicateSym.set(name, true);
                        symList.push(sym);
                    }
                }
            }
        );

        return symList.length > 0 ? symList : null;
    }

    /**
     * 搜索模块名
     * 正常情况下，声明一个模块都会产生一个符号
     * 但table.empty = function() ... end这种扩展标准库或者C++导出的模块时就没有
     * 所以这里特殊处理
     */
    private searchModuleName(
        name: string, items: CompletionItem[] | null, base?: string) {
        if (base) {
            return items;
        }

        const newItems = items || [];
        SymbolEx.instance().eachModuleName(mdName => {
            if (SymbolEx.checkMatch(name, mdName) < AutoCompletion.accurate) {
                return;
            }

            // 目前无法知道某个模块的声明在不在lua中，只能循环排除
            if (items) {
                for (const item of items) {
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
        const search = Search.instance();

        let found = false;
        const symName = query.name;
        const filter: Filter = symList => {
            if (!symList) {
                return null;
            }
            return symList.filter(sym => {
                if (sym.name.startsWith(symName)) {
                    found = true;
                    return true;
                }
                return 0 === symName.length
                    || SymbolEx.checkMatch(symName, sym.name)
                    > AutoCompletion.accurate;
            });
        };

        const items: SymInfoEx[] = [];

        // 优先根据模块名匹配全局符号
        let tmps = search.searchGlobalModule(query, filter);
        if (tmps) {
            items.push(...tmps);
            if (found) {
                return items;
            }
        }

        // 根据模块名匹配文档符号
        tmps = search.searchDocumentModule(query, filter);
        if (tmps) {
            items.push(...tmps);
            if (found) {
                return items;
            }
        }

        // 查找局部变量
        const uri = query.uri;
        srv.ensureSymbolCache(uri);
        tmps = this.getlocalCompletion(query);
        if (tmps) {
            items.push(...tmps);
        }
        if (items.length > 0) {
            return items;
        }

        // 自动补全时，M. 时符号名为空，仅列出模块下的所有符号
        if (symName.length <= 0) {
            return null;
        }

        const symbol = SymbolEx.instance();
        // 忽略模块名，直接查找当前文档符号
        tmps = filter(symbol.getDocumentSymbol(uri));
        if (tmps) {
            const symList = search.filterLocalSym(tmps, query);
            if (symList.length > 0) {
                return symList;
            }
        }

        // 忽略模块名，直接查找全局符号
        tmps = filter(symbol.getAnySymbol(
            false, sym => sym.location.uri !== uri));
        if (tmps) {
            const symList = search.filterLocalSym(tmps, query);
            if (symList.length > 0) {
                return symList;
            }
            return tmps;
        }

        return null;
    }

    public doCompletion(srv: Server, uri: string, pos: Position) {
        const line = srv.getQueryText(uri, pos);
        if (!line) { return []; }

        // require("a.b.c") 跳转到对应的文件
        let items: CompletionItem[] | null =
            this.getRequireCompletion(line, pos.character);
        if (items) { return items; }

        const query = srv.getQuerySymbol(uri, line, pos);
        if (!query) { return []; }

        const list = this.doSearch(srv, query);
        if (!list) {
            return [];
        }

        items = [];
        for (const sym of list) {
            items.push(this.toCompletion(sym, uri));
        }

        return this.searchModuleName(query.name, items, query.base);
    }
}
