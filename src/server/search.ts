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
    TableConstructorExpression
} from 'luaparse';

import {
    Symbol,
    QueryPos,
    SymbolQuery
} from "./symbol";

export type Filter = (node: Node, local: boolean, name: string) => void;

export class Search {
    private static ins: Search;

    private pos: QueryPos | undefined = undefined;
    private filter: Filter | undefined = undefined;
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

    private searchExpression(expr: Expression) {
        if (expr.type === "FunctionDeclaration"
            && !this.searchFunctionDeclaration(expr)) {
            return false;
        } else if (expr.type === "TableConstructorExpression"
            && !this.searchTableExpression(expr)) {
            return false;
        }

        // 其他类型的不用搜索，不确定是否继续。返回true表示继续搜索
        return true;
    }

    private searchTableExpression(expr: TableConstructorExpression) {
        for (const field of expr.fields) {
            // local M = { 1, 2, 3}这种没有key对自动补全、跳转都没用,没必要处理
            if (("TableKey" !== field.type && "TableKeyString" !== field.type)
                || "Identifier" !== field.key.type) {
                continue;
            }

            if (!this.searchOne(field, false, field.key.name)) {
                return false;
            }
        }

        return true;
    }

    // 解析变量声明
    private searchLocalStatement(stat: LocalStatement) {
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            let varNode = stat.variables[index];
            if (!this.searchOne(varNode, true, varNode.name)
                || !this.searchExpression(stat.init[index])) {
                return false;
            }
        }

        return true;
    }

    private searchAssignmentStatement(stat: AssignmentStatement) {
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            let varNode = stat.variables[index];
            // list[1] = ... 这种没名字的，就不用搜索
            if (varNode.type === "Identifier"
                && !this.searchOne(varNode, false, varNode.name)) {
                return false;
            }

            if (!this.searchOne(stat.init[index], false)) {
                return false;
            }
        }

        return true;
    }

    private searchFunctionDeclaration(expr: FunctionDeclaration) {
        // return function() ... end 这种没有identifier
        const ider = expr.identifier;
        if (ider && ider.type === "Identifier"
            && !this.searchOne(ider, expr.isLocal, ider.name)) {
            return false;
        }
        // 搜索函数参数
        for (const param of expr.parameters) {
            if (param.type === "Identifier"
                && !this.searchOne(param, true, param.name)) {
                return false;
            }
        }
        // 扫完函数局部变量
        for (const stat of expr.body) {
            if (!this.searchOne(stat, stat.type === "LocalStatement")) {
                return false;
            }
        }

        return true;
    }

    // 搜索某个节点，返回是否继续搜索
    private searchOne(node: Node, local: boolean, name?: string) {
        const comp = this.compNodePos(node, this.pos!);
        // 搜索位置已超过目标位置，不再搜索
        if (1 === comp) {
            return false;
        }

        // 有些节点是没有名字的，比如return function() ... end
        if (name && "" !== name) {
            this.filter!(node, local, name);
        }

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

    // 在list中搜索符号
    // @filter: 过滤函数，return 0
    public search(list: Node[], pos: QueryPos, filter: Filter) {
        this.pos = pos;
        this.filter = filter;

        // 从函数开始搜索，非函数会在文档符号中查找
        for (const node of list) {
            if (node.type === "FunctionDeclaration"
                && !this.searchFunctionDeclaration(node)) {
                return;
            }
        }
    }
}
