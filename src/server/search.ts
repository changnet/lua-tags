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

    // node < pos: -1;node = pos: 0;node > pos: 1; node包含pos: 2
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

    // local X = { a = 1 }，需要X来定位
    private searchExpression(expr: Expression, base?: string) {
        if (expr.type === "FunctionDeclaration"
            && !this.searchFunctionDeclaration(expr)) {
            return false;
        } else if (expr.type === "TableConstructorExpression"
            && !this.searchTableExpression(expr, base)) {
            return false;
        }

        // 其他类型的不用搜索，不确定是否继续。返回true表示继续搜索
        return true;
    }

    private searchStatement(stat: Statement) {
        switch (stat.type) {
            case "LocalStatement":
                return this.searchLocalStatement(stat);
            case "AssignmentStatement":
                return this.searchAssignmentStatement(stat);
            case "FunctionDeclaration":
                return this.searchFunctionDeclaration(stat);
            case "ReturnStatement":
                return this.searchReturnStatement(stat);
            case "IfStatement":
                return this.searchIfStatement(stat);
            case "DoStatement":
            case "WhileStatement":
            case "RepeatStatement": {
                if (2 !== this.compNodePos(stat, this.pos!)) {
                    return true;
                }
                stat.body.forEach(sub => {
                    if (!this.searchStatement(sub)) {
                        return;
                    }
                });
                break;
            }
            case "ForGenericStatement":
                return this.searchForGenericStatement(stat);
            case "ForNumericStatement":
                return this.searchForNumbericStatement(stat);
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
                if (!this.searchStatement(sub)) {
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
            if (!this.searchStatement(sub)) {
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
            if (!this.searchStatement(sub)) {
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
            return this.searchExpression(expr, sub.name);
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

            return this.searchExpression(expr, base);
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
        if (2 !== this.compNodePos(expr, this.pos!)) {
            return true;
        }
        // 函数名不用搜索，如果是顶层使用域的函数，应该被解析成文档符号
        // 如果是局部的，不允许直接声明一个函数，不会有函数名的
        // return function() ... end 这种没有identifier
        // const ider = expr.identifier;
        // if (ider && ider.type === "Identifier") {
        //     let local = expr.isLocal ? LocalType.LT_LOCAL : LocalType.LT_NONE;
        //     if (!this.searchOne(ider, local, ider.name)) {
        //         return false;
        //     }
        // }
        // 搜索函数参数
        for (const param of expr.parameters) {
            if (param.type === "Identifier"
                && !this.searchOne(param, LocalType.LT_PARAMETER, param.name)) {
                return false;
            }
        }
        // 扫完函数局部变量
        for (const stat of expr.body) {
            if (!this.searchStatement(stat)) {
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

        // 从函数开始搜索，非函数会在文档符号中查找
        for (const node of cache.nodes) {
            if (node.type === "FunctionDeclaration") {
                if (!this.searchFunctionDeclaration(node)) {
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
    // 在Lua中，可能会出现局部变量名和全局一致，这样就会出错。
    // 暂时不考虑这种情况，真实项目只没见过允许这种写法的
    public searchGlobalModule(query: SymbolQuery, filter: Filter) {
        let base = query.base;
        if (!base) {
            return null;
        }

        let symbol = Symbol.instance();

        let rawName = symbol.getRawModule(query.uri, base);
        let symList = symbol.getGlobalModule(rawName);

        return filter(symList);
    }

    // 根据模块名查找某个文档的符号
    public searchDocumentModule(query: SymbolQuery, filter: Filter) {
        let base = query.base;
        if (!base) {
            return null;
        }

        let symbol = Symbol.instance();
        let rawUri = symbol.getRawUri(query.uri, base);
        if (!rawUri) {
            return null;
        }

        return filter(symbol.getDocumentSymbol(rawUri));
    }

    // 如果找到了位置一致的符号，则认为是需要查找的符号，过滤掉其他同名符号
    public filterPosition(query: SymbolQuery, symList: SymInfoEx[] | null) {
        if (!symList) {
            return null;
        }

        for (const sym of symList) {
            if (query.uri !== sym.location.uri) {
                continue;
            }

            const range = sym.location.range;
            if ( 0 === this.compPos(
                range.start.line, range.start.character,
                range.end.line, range.end.character, query.position)) {
                return [sym];
            }
        }

        return symList;
    }

    // 在当前文档符号中查找时，如果是local符号，则需要判断一下位置
    // 避免前面调用的全局符号，跳转到后面的同名local变量
    public filterLocalSym(symList: SymInfoEx[], query: SymbolQuery) {
        return symList.filter(sym => {
            if (!sym.local) {
                return true;
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

    // 搜索符号
    public search(srv: Server, query: SymbolQuery) {
        let symbol = Symbol.instance();

        let filter: Filter = symList => {
            return this.filterPosition(query,
                this.localizationFilter(query!,
                    this.checkSymDefinition(symList, query!.name, query!.kind)
            ));
        };

        /* 查找一个符号，正常情况下应该是 局部-当前文档-全局 这样的顺序才是对的
         * 但事实是查找局部是最困难的，也是最耗时的，因此放在最后面
         * 全局和文档都做了符号hash缓存，因此优先匹配
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

        // 查找局部变量
        const uri = query.uri;
        srv.ensureSymbolCache(uri);
        items = this.searchlocal(query);
        if (items) {
            return items;
        }

        // 忽略模块名，直接查找当前文档符号
        items = filter(symbol.getDocumentSymbol(uri));
        if (items) {
            let symList = this.filterLocalSym(items, query);
            if (symList.length > 0) {
                return symList;
            }
        }

        // 忽略模块名，直接查找全局符号
        items = filter(symbol.getGlobalSymbol(
            false, sym => sym.location.uri !== uri));
        if (items) {
            return items;
        }

        return null;
    }
}
