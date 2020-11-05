// 搜索符号功能

import {
    Node,
    Statement,
    Identifier,
    FunctionDeclaration,
    LocalStatement,
    MemberExpression,
    AssignmentStatement,
    Token,
    Expression,
    IndexExpression,
    ReturnStatement,
    CallExpression,
    TableConstructorExpression,
    IfStatement,
    ForGenericStatement,
    ForNumericStatement
} from 'luaparse';

import {
    Symbol,
    QueryPos,
    SymbolQuery,
    SymInfoEx,
    LocalType
} from "./symbol";
import { Server } from './server';
import { SymbolKind, Location } from 'vscode-languageserver';

export interface SearchResult {
    // name: string; // 名字，暂时不记，在SymbolQuery中有
    node: Statement | Expression;
    local: LocalType;
    base?: string;
    init?: Statement | Expression;
}

// 搜索局部变量回调函数
export type CallBack = (node: Statement | Expression, local: LocalType,
    name: string, base?: string, init?: Statement | Expression) => void;
// 搜索符号时过滤函数
export type Filter = (symList: SymInfoEx[] | null) => SymInfoEx[] | null;

export class Search {
    private static ins: Search;

    private pos: QueryPos | null = null;
    private callBack: CallBack | null = null;

    private constructor() {
    }

    public static instance() {
        if (!Search.ins) {
            Search.ins = new Search();
        }

        return Search.ins;
    }

    /**
     * 对比两个位置 start < end: -1;start = end: 0;start > end: 1; start包含end: 2
     */
    private compPos(startLine: number, startCol: number,
        endLine: number, endCol: number, pos: QueryPos) {

        const beg = pos.beg;
        const end = pos.end;
        const line = pos.line;

        if (startLine > line
            || (startLine === line && startCol > end)) {
            return 1;
        }

        if (endLine < line || (endLine === line && endCol < beg)) {
            return -1;
        }

        if (startLine === line && endLine === line
            && startCol === beg && endCol === end) {
            return 0;
        }

        return 2;
    }

    // 判断符号是否在该节点内
    private compNodePos(node: Node, pos: QueryPos) {
        const loc = node.loc;
        if (!loc) {
            return -1;
        }

        return this.compPos(loc.start.line - 1,
            loc.start.column, loc.end.line - 1, loc.end.column, pos);
    }

    // local X = { a = 1 }，搜索table时，需要base（X）来判断是否为需要搜索的符号
    private searchNode(node: Node, base?: string) {
        switch (node.type) {
            case "FunctionDeclaration":
                return this.searchFunctionDeclaration(node);
            case "TableConstructorExpression":
                return this.searchTableExpression(node, base);
            case "LocalStatement":
                return this.searchLocalStatement(node);
            case "AssignmentStatement":
                return this.searchAssignmentStatement(node);
            case "FunctionDeclaration":
                return this.searchFunctionDeclaration(node);
            case "ReturnStatement":
                return this.searchReturnStatement(node);
            case "IfStatement":
                return this.searchIfStatement(node);
            case "DoStatement":
            case "WhileStatement":
            case "RepeatStatement": {
                if (2 !== this.compNodePos(node, this.pos!)) {
                    return true;
                }
                node.body.forEach(sub => {
                    if (!this.searchNode(sub)) {
                        return;
                    }
                });
                break;
            }
            case "ForGenericStatement":
                return this.searchForGenericStatement(node);
            case "ForNumericStatement":
                return this.searchForNumbericStatement(node);
        }

        return true;
    }

    private searchTableExpression(
        expr: TableConstructorExpression, base?: string) {
        // table中的值可以访问，因为-1时是需要继续查找table值的
        let comp = this.compNodePos(expr, this.pos!);
        if (1 === comp || 0 === comp) {
            return false;
        }

        for (const field of expr.fields) {
            // local M = { 1, 2, 3}这种没有key对自动补全、跳转都没用,没必要处理
            if (("TableKey" !== field.type && "TableKeyString" !== field.type)
                || "Identifier" !== field.key.type) {
                continue;
            }

            if (!this.searchOne(field.key,
                LocalType.LT_NONE, field.key.name, base, field.value)) {
                return false;
            }
        }

        return true;
    }

    private searchIfStatement(stat: IfStatement) {
        for (const clause of stat.clauses) {
            for (const sub of clause.body) {
                if (!this.searchNode(sub)) {
                    return false;
                }
            }
        }

        return true;
    }

    private searchForNumbericStatement(stat: ForNumericStatement) {
        if (2 !== this.compNodePos(stat, this.pos!)) {
            return true;
        }

        if (!this.searchOne(
            stat.variable, LocalType.LT_FOR_VAR, stat.variable.name)) {
            return false;
        }
        for (const sub of stat.body) {
            if (!this.searchNode(sub)) {
                return false;
            }
        }

        return true;
    }

    private searchForGenericStatement(stat: ForGenericStatement) {
        if (2 !== this.compNodePos(stat, this.pos!)) {
            return true;
        }
        for (const variable of stat.variables) {
            if (!this.searchOne(
                variable, LocalType.LT_FOR_VAR, variable.name)) {
                return false;
            }
        }

        for (const sub of stat.body) {
            if (!this.searchNode(sub)) {
                return false;
            }
        }

        return true;
    }

    // 解析变量声明 local x,y = ...
    private searchLocalStatement(stat: LocalStatement) {
        let comp = this.compNodePos(stat, this.pos!);
        if (1 === comp) {
            return false;
        }
        // lua支持同时初始化多个变量 local x,y = 1,2
        let nextSearch = stat.variables.every((sub, index) => {
            let init = stat.init[index];
            return this.searchOne(sub,
                LocalType.LT_LOCAL, sub.name, undefined, init);
        });
        if (!nextSearch) {
            return false;
        }

        // 先搜索变量名，再搜索初始化。因为是按位置判断是否继续搜索的
        nextSearch = stat.init.every((expr, index) => {
            let sub = stat.variables[index];
            // like local a = 1, 2, you dont get the sub for 2nd init value
            if (!sub) {
                return true;
            }
            return this.searchNode(expr, sub.name);
        });
        if (!nextSearch) {
            return false;
        }

        return (0 === comp || 2 === comp) ? false : true;
    }

    // x = ... list[1] = ... m.n = ...
    private searchAssignmentStatement(stat: AssignmentStatement) {
        let comp = this.compNodePos(stat, this.pos!);
        if (1 === comp) {
            return false;
        }
        // lua支持同时初始化多个变量 x,y = 1,2
        let nextSearch = stat.variables.every((sub, index) => {
            if (sub.type !== "Identifier") {
                return true;
            }
            let init = stat.init[index];
            return this.searchOne(sub,
                LocalType.LT_NONE, sub.name, undefined, init);
        });
        if (!nextSearch) {
            return false;
        }

        nextSearch = stat.init.every((expr, index) => {
            let base;
            let sub = stat.variables[index];
            if (sub && sub.type === "Identifier") {
                base = sub.name;
            }

            return this.searchNode(expr, base);
        });
        if (!nextSearch) {
            return false;
        }

        return (0 === comp || 2 === comp) ? false : true;
    }

    // 解析返回语句，仅处理 return function() ... end 这种情况
    private searchReturnStatement(stat: ReturnStatement) {
        if (2 !== this.compNodePos(stat, this.pos!)) {
            return true;
        }
        for (const expr of stat.arguments) {
            if (expr.type === "FunctionDeclaration") {
                return this.searchFunctionDeclaration(expr);
            }
        }

        return true;
    }

    private searchFunctionDeclaration(expr: FunctionDeclaration) {
        const comp = this.compNodePos(expr, this.pos!);
        if (1 === comp) {
            return false;
        }

        // 局部函数声明
        const ider = expr.identifier;
        if (ider && ider.type === "Identifier") {
            let local = expr.isLocal ? LocalType.LT_LOCAL : LocalType.LT_NONE;
            if (!this.searchOne(expr, local, ider.name)) {
                return false;
            }
        }

        // 函数局部的内容不需要搜索，不在对应的作用域
        if (2 !== comp) {
            return true;
        }

        // 搜索函数参数
        for (const param of expr.parameters) {
            if (param.type === "Identifier"
                && !this.searchOne(param, LocalType.LT_PARAMETER, param.name)) {
                return false;
            }
        }
        // 扫完函数局部变量
        for (const stat of expr.body) {
            if (!this.searchNode(stat)) {
                return false;
            }
        }

        return true;
    }

    // 搜索某个节点，返回是否继续搜索
    private searchOne(node: Statement | Expression, local: LocalType,
        name: string, base?: string, init?: Statement | Expression) {

        this.callBack!(node, local, name, base, init);

        return true;
    }

    // 搜索局部符号
    // @callBack: 过滤函数，主要用于回调
    public rawSearchLocal(uri: string, pos: QueryPos, callBack: CallBack) {
        let symbol = Symbol.instance();

        const cache = symbol.getCache(uri);
        if (!cache) {
            return null;
        }

        this.pos = pos;
        this.callBack = callBack;

        // 仅当某个节点包含所需要查找的符号时，才进入该节点内部搜索
        // 这导致当需要查找的符号在文件顶层定义时，无法搜索到，在search中额外处理
        for (const node of cache.nodes) {
            if (2 === this.compNodePos(node, pos)) {
                if (!this.searchNode(node)) {
                    return;
                }
            }
        }
    }

    // 获取局部变量位置
    private searchlocal(query: SymbolQuery) {
        let foundLocal: SearchResult | null = null;
        let foundGlobal: SearchResult | null = null;
        this.rawSearchLocal(query.uri, query.position,
            (node, local, name, base, init) => {
                /* query是通过正则得到的，因此如果base和name不在同一行，是不准的
                 * 因此这里base相等或者位置相同，都判断为同一符号
                 */
                if (name === query.name && (base === query.base
                    || (base && 0 === this.compNodePos(node, query.position)))) {
                    if (local !== LocalType.LT_NONE) {
                        foundLocal = {
                            node: node, local: local, base: base, init: init
                        };
                    } else {
                        foundGlobal = {
                            node: node, local: local, base: base, init: init
                        };
                    }
                }
            }
        );

        // 这里foundLocal、foundGlobal会被识别为null类型，因为它们是在lambda中被
        // 赋值的，而typescript无法保证这个lambda什么时候会被调用，因此要用!
        // https://github.com/Microsoft/TypeScript/issues/15631

        let symbol = Symbol.instance();
        let found: SymInfoEx | null = null;
        let re = foundLocal || foundGlobal;
        if (re) {
            const r: SearchResult = re!;
            found = symbol.toSym(
                { name: query.name, base: r.base }, r.node, r.init, r.local);
        }

        let symList = found ? [found] : null;
        if (!symList) {
            return null;
        }

        const cache = symbol.getCache(query.uri);
        if (!cache) {
            return symList;
        }

        symbol.appendComment(
            cache.comments, symList, cache.codeLine);
        return symList;
    }

    // 根据模块名查找符号
    // MMM.nnn中搜索模块名，如果只有MMM模块名，不是在这里处理的
    // 在Lua中，可能会出现局部变量名和全局一致，这样就会出错，暂时不考虑这种情况
    public searchGlobalModule(query: SymbolQuery, filter: Filter) {
        let base = query.base;
        if (!base) {
            return null;
        }

        let symbol = Symbol.instance();

        let rawBases = symbol.getRawModule(query.uri, base);
        let symList = symbol.getGlobalModuleSubList(rawBases);
        if (symList && query.extBase) {
            symList = symbol.getSubSymbolFromList(
                query.extBase, 0, query.uri, symList);
        }

        return filter(symList);
    }

    // 根据模块名查找某个文档的符号
    public searchDocumentModule(query: SymbolQuery, filter: Filter) {
        let base = query.base;
        if (!base || "self" === base || "_G" === base) {
            return null;
        }

        let symbol = Symbol.instance();

        // 先查找当前文档的local模块
        let symList = symbol.getDocumentModuleSubList(query.uri, [base]);
        if (symList && query.extBase) {
            symList = symbol.getSubSymbolFromList(
                query.extBase, 0, query.uri, symList);
        }
        return filter(symList);
    }

    /**
     * 如果找到了位置一致的符号，则认为是需要查找的符号，过滤掉其他同名符号
     */
    public filterPosition(query: SymbolQuery, symList: SymInfoEx[] | null) {
        if (!symList) {
            return null;
        }

        for (const sym of symList) {
            if (query.uri !== sym.location.uri) {
                continue;
            }

            const range = sym.location.range;
            if (0 === this.compPos(
                range.start.line, range.start.character,
                range.end.line, range.end.character, query.position)) {
                return [sym];
            }
        }

        return symList;
    }

    /**
     * 
     * 在当前文档符号中查找时，如果是local符号，则需要是否在同一文件以及判断一下位置
     * 避免前面调用的全局符号，跳转到后面的同名local变量
     * local a = test()
     * local test = function() end
     * 第一个调用的test，不要跳转到后面才声明的第二个test
     */
    public filterLocalSym(symList: SymInfoEx[], query: SymbolQuery) {
        return symList.filter(sym => {
            if (!sym.local) {
                return true;
            }

            // 不同文件的local无法访问
            if (sym.location.uri !== query.uri) {
                return false;
            }

            const loc = sym.location.range;
            let comp = this.compPos(
                loc.start.line, loc.start.character,
                loc.end.line, loc.end.character, query.position);

            return 1 === comp ? false : true;
        });
    }


    // 判断是否本地化
    private isLocalization(query: SymbolQuery, sym: SymInfoEx) {
        const loc: Location = sym.location;
        if (query.uri !== loc.uri) { return false; }
        if (query.position.line !== loc.range.start.line) { return false; }

        // 找出 M = M
        let re = new RegExp(query.name + "\\s*=\\s*" + query.name, "g");
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

    private checkSymList(
        symList: SymInfoEx[] | null, name: string, kind: SymbolKind) {
        if (!symList) { return null; }

        let foundList: SymInfoEx[] = [];
        for (let sym of symList) {
            if (sym.name === name) {
                foundList.push(sym);
            }
        }

        if (foundList.length > 0) {
            return foundList;
        }

        return null;
    }

    // searchLocal只查找非顶层的局部符号，因此顶层的local符号在这里处理
    private checkHasLocalSym(symList: SymInfoEx[], query: SymbolQuery) {
        // 带base肯定不是局部符号
        if (query.base) {
            return null;
        }

        // 不需要对比名字了，在checkSymList中对比过了
        for (let sym of symList) {
            if (sym.local) {
                // 暂不考虑出现多个同名local变量的情况
                return [sym];
            }
        }

        return null;
    }

    // 搜索符号
    public search(srv: Server, query: SymbolQuery) {
        let symbol = Symbol.instance();

        let filter: Filter = symList => {
            return this.filterPosition(query,
                this.localizationFilter(query!,
                    this.checkSymList(symList, query!.name, query!.kind)
                ));
        };

        /* 查找一个符号，正常情况下应该是 局部-当前文档-全局 这样的顺序才是对的
         * 但事实是查找局部是最困难的，也是最耗时的，因此放在最后面
         * 全局和文档都做了符号hash缓存，优先匹配
         */

        // 优先根据模块名匹配全局符号
        let items = this.searchGlobalModule(query, filter);
        if (items) {
            return items;
        }

        // 根据模块名匹配文档符号
        items = this.searchDocumentModule(query, filter);
        if (items) {
            return items;
        }

        // 查找局部变量(不包含顶层局部变量)
        let possibleSym: SymInfoEx[] = [];
        const uri = query.uri;
        srv.ensureSymbolCache(uri);
        items = this.searchlocal(query);
        if (items) {
            let symList = this.localizationFilter(query, items);
            if (symList && this.checkHasLocalSym(symList, query)) {
                return symList;
            } else {
                /*
                 * foo()
                 * local function foo() end
                 * allow the first foo() call to jump to the later definition if
                 * no other fefinition found
                 */
                possibleSym.push(...items);
            }
        }

        // 忽略模块名，直接查找当前文档符号
        items = filter(symbol.getDocumentSymbol(uri));
        if (items) {
            // 优先查找顶层的local变量
            const topSym = this.checkHasLocalSym(items, query);
            if (topSym) {
                return topSym;
            }
            let symList = this.filterLocalSym(items, query);
            if (symList.length > 0) {
                return symList;
            } else {
                possibleSym.push(...items);
            }
        }

        // 忽略模块名，直接查找所有可能匹配的符号
        items = filter(symbol.getAnySymbol(
            true, sym => sym.location.uri !== uri && query.name === sym.name));
        if (items) {
            let symList = this.filterLocalSym(items, query);
            if (symList.length > 0) {
                return symList;
            }
            // 如果过滤后找不到任何符号，则使用未过滤后的
            // 因为lua中的local函数等可以赋值传递
            return possibleSym.length > 0 ? possibleSym : items;
        }

        return possibleSym;
    }
}
