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


    // 根据模块名查询局部变量位置
    public getLocalModuleDefinition(query: SymbolQuery, text: string[]) {
        let mdName = query.mdName;
        if (!mdName) { return null; }

        let symbol = Symbol.instance();
        let iderInfo = symbol.getLocalRawModule(mdName, text);
        if (!iderInfo) { return null; }

        if (iderInfo.uri) {
            let symList = symbol.getDocumentSymbol(iderInfo.uri);
            return this.checkSymDefinition(symList, query.symName, query.kind);
        }

        if (iderInfo.mdName) {
            let newQuery = Object.assign({}, query);
            newQuery.mdName = iderInfo.mdName;
            return this.getGlobalModuleDefinition(newQuery);
        }
        return null;
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

    // 对比符号位置
    // -1sym的位置小于(line,pos)
    // 0表示sym位置等于(line,pos)
    // 1表示sym的位置大于(line,pos)
    // 2表示sym范围包含(line,pos)
    private compSymLocation(
        sym: SymInfoEx, line: number, beg: number, end: number) {
        const loc = sym.location.range;

        const startLine = loc.start.line;
        if (startLine > line
            || (startLine === line && loc.start.character > end)) {
            return 1;
        }

        const endLine = loc.end.line;
        if (endLine < line || (endLine === line && loc.end.character < beg)) {
            return -1;
        }

        if (endLine === line && startLine === line
            && loc.start.character === beg && loc.end.character === end) {
            return 0;
        }
        return 2;
    }

    // 查找子符号的位置
    private searchSubSym(name: string, line: number, beg: number,
        end: number, baseSym: SymInfoEx, base?: string, ): VSCodeSymbol {

        let foundLocal = null;
        let foundGlobal = null;
        // 在函数参数中找一下
        if (baseSym.parameters) {
            for (const param of baseSym.parameters) {
                if (param.name === name) {
                    foundLocal = param;
                }
            }
        }
        const symList = baseSym.subSym || [];

        for (const sym of symList) {
            let comp = this.compSymLocation(sym, line, beg, end);
            // 超出范围，不用找了
            if (1 === comp) {
                break;
            }

            if (name === sym.name) {
                if (sym.local) {
                    foundLocal = sym;
                } else {
                    foundGlobal = sym;
                }
            }

            // 搜索到了要查找的符号本身，返回之前查找到的符号
            // 最后一个local优先，因为本地变量可以同名覆盖
            // 非local变量可能是赋值
            if (0 === comp) {
                return foundLocal || foundGlobal;
            }

            // 要查找的符号包含在这个符号里，去子作用域找找
            // 或者模块名和当前符号相等(比如一个table)
            if (2 === comp || base === sym.name) {
                const foundSym = this.searchSubSym(name, line, beg, end, sym);
                if (!foundSym) {
                    continue;
                }
                if (foundSym.local) {
                    foundLocal = foundSym;
                } else {
                    foundGlobal = foundSym;
                }
            }
        }

        return foundLocal || foundGlobal;
    }

    // 获取局部变量位置
    public getlocalDefinition(query: SymbolQuery, text: string) {
        let symbol = Symbol.instance();
        const line = query.position.line;
        const beg = query.position.beg;
        const end = query.position.end;
        // return symbol.parselocalSymLocation(query.uri, query.symName, text);
        const sym = symbol.getlocalSymList(query.uri, line, end, text);
        if (!sym) {
            return null;
        }
        const foundSym = this.searchSubSym(
            query.symName, line, beg, end, sym, query.mdName);

        return foundSym ? [foundSym.location] : null;
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
