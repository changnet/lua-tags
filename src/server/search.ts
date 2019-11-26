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

    private filter: Filter | null = null;
    private constructor() {
    }

    public static instance() {
        if (!Search.ins) {
            Search.ins = new Search();
        }

        return Search.ins;
    }

    // 判断符号是否在该节点内
    // node < pos: -1;node = pos: 0;node > pos: 1; node包含pos: 2
    private compNodePos(node: Node, pos: QueryPos) {
        const loc = node.loc;
        if (!loc) {
            return -1;
        }

        const beg = pos.beg;
        const end = pos.end;
        const line = pos.line;

        const startLine = loc.start.line - 1;
        if (startLine > line
            || (startLine === line && loc.start.column > end)) {
            return 1;
        }

        const endLine = loc.end.line - 1;
        if (endLine < line || (endLine === line && loc.end.column < beg)) {
            return -1;
        }

        if (startLine === line && endLine === line
            && loc.start.column === beg && loc.end.column === end) {
            return 0;
        }

        return 2;
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
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            let varNode = stat.variables[index];
            if (!this.searchOne(varNode, LocalType.LT_LOCAL, varNode.name)
                || !this.searchExpression(stat.init[index], varNode.name)) {
                return false;
            }
        }

        return true;
    }

    // x = ... list[1] = ... m.n = ...
    private searchAssignmentStatement(stat: AssignmentStatement) {
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            let varNode = stat.variables[index];

            let baseName;
            if (varNode.type === "Identifier") {
                baseName = varNode.name;
                if (!this.searchOne(varNode, LocalType.LT_NONE, baseName)) {
                    return false;
                }
            }

            if (!this.searchExpression(stat.init[index], baseName)) {
                return false;
            }
        }

        return true;
    }

    // 解析返回语句，仅处理 return function() ... end 这种情况
    private searchReturnStatement(stat: ReturnStatement) {
        for (const expr of stat.arguments) {
            if (expr.type === "FunctionDeclaration") {
                return this.searchFunctionDeclaration(expr);
            }
        }
    }

    private searchFunctionDeclaration(expr: FunctionDeclaration) {
        // return function() ... end 这种没有identifier
        const ider = expr.identifier;
        if (ider && ider.type === "Identifier") {
            let local = expr.isLocal ? LocalType.LT_LOCAL : LocalType.LT_NONE;
            if (!this.searchOne(ider, local, ider.name)) {
                return false;
            }
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
            if (!this.searchStatement(stat)) {
                return false;
            }
        }

        return true;
    }

    // 搜索某个节点，返回是否继续搜索
    private searchOne(node: Statement | Expression, local: LocalType,
        name: string, base?: string, init?: Statement | Expression) {
        const comp = this.compNodePos(node, this.pos!);
        // 搜索位置已超过目标位置，不再搜索
        if (1 === comp) {
            return false;
        }

        this.callBack!(node, local, name, base, init);

        // 已到达搜索位置，中止搜索
        if (0 === comp) {
            return false;
        }

        // -1 === comp 可能是upvalue，不用处理
        if (-1 === comp) {
            return true;
        }

        // 2 === comp 则需要搜索局部变量了
        return true;
    }

    // 搜索局部符号
    // @callBack: 过滤函数，主要用于回调
    public searchLocal(uri: string, pos: QueryPos, callBack: CallBack) {
        let symbol = Symbol.instance();

        const nodeList = symbol.getCache(uri);
        if (!nodeList) {
            return null;
        }

        this.pos = pos;
        this.callBack = callBack;

        // 从函数开始搜索，非函数会在文档符号中查找
        for (const node of nodeList) {
            if (node.type === "FunctionDeclaration"
                && !this.searchFunctionDeclaration(node)) {
                return;
            }
        }
    }


    // 根据模块名查找符号
    // 在Lua中，可能会出现局部变量名和全局一致，这样就会出错。
    // 暂时不考虑这种情况，真实项目只没见过允许这种写法的
    private searchGlobalModule(query: SymbolQuery) {
        let mdName = query.mdName;
        if (!mdName || "self" === mdName) { return null; }

        let symbol = Symbol.instance();

        let rawName = symbol.getRawModule(query.uri, mdName);
        let symList = symbol.getGlobalModule(rawName);

        return this.filter!(symList);
    }

    // 根据模块名查找某个文档的符号
    private searchDocumentModule(query: SymbolQuery) {
        let mdName = query.mdName;
        if (!mdName) { return null; }

        let symbol = Symbol.instance();
        let rawUri = symbol.getRawUri(query.uri, mdName);

        return this.filter!(symbol.getDocumentModule(rawUri, mdName));
    }

    // 搜索符号
    public search(query: SymbolQuery, filter: Filter, localSearch: Function) {
        this.filter = filter;
        let symbol = Symbol.instance();

        /* 查找一个符号，正常情况下应该是 局部-当前文档-全局 这样的顺序才是对的
         * 但事实是查找局部是最困难的，也是最耗时的，因此放在最后面
         * 全局和文档都做了符号hash缓存，因此优先匹配
         */

        // 优先根据模块名匹配全局符号
        let items = this.searchGlobalModule(query);
        if (items) {
            return items;
        }

        // 根据模块名匹配文档符号
        items = this.searchDocumentModule(query);
        if (items) {
            return items;
        }

        // 查找局部变量
        items = localSearch();
        if (items) {
            return items;
        }

        // 忽略模块名，直接查找全局符号
        items = filter(symbol.getDocumentSymbol(query.uri));
        if (items) {
            return items;
        }

        // 忽略模块名，直接查找全局符号
        items = filter(symbol.getGlobalSymbol(query.symName));
        if (items) {
            return items;
        }

        return null;
    }
}
