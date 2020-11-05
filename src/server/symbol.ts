// 符号处理

import * as fs from "fs";
import * as path from "path";
import { Utils } from "./utils";
import * as fuzzysort from "fuzzysort";
import { Setting, FileParseType } from "./setting";

import {
    Options,
    parse as luaParse,
    Parser as luaParser,

    Node,
    Comment,
    Statement,
    Identifier,
    FunctionDeclaration,
    LocalStatement,
    MemberExpression,
    AssignmentStatement,
    Expression,
    IndexExpression,
    ReturnStatement,
    TableConstructorExpression,
    CallStatement,
    UnaryExpression,
    BinaryExpression,
    StringLiteral,
    NumericLiteral
} from 'luaparse';

import {
    Location,
    SymbolKind,
    SymbolInformation
} from 'vscode-languageserver';

// luaParser.lex()
// https://github.com/fstirlitz/luaparse
// type expressed as an enum flag which can be matched with luaparse.tokenTypes.
// 这些没有包里找到定义

// LuaTokenType
export enum LTT {
    EOF = 1,
    StringLiteral = 2,
    Keyword = 4,
    Identifier = 8,
    NumericLiteral = 16,
    Punctuator = 32,
    BooleanLiteral = 64,
    NilLiteral = 128,
    VarargLiteral = 256
}

// lua parser的位置格式
export interface LuaLocation {
    start: {
        line: number;
        column: number;
    };
    end: {
        line: number;
        column: number;
    };
}

//符号位置
export interface QueryPos {
    line: number;
    beg: number;
    end: number;
}

// 用于go to definition查询的数据结构
export interface SymbolQuery {
    uri: string; // 要查询的符号在哪个文档
    base?: string; // 模块名，m:test中的m
    extBase?: string[]; // A.B.C.E中的B.C
    name: string; // 符号名，m:test中的test
    kind: SymbolKind; // 查询的符号是什么类型
    position: QueryPos; //符号位置
    text: string; // 符号所在的整行代码
}

export interface NameInfo {
    name: string;
    base?: string;
    indexer?: string;
}

/* luaparse
 * scope: 作用域，和lua中的作用域一致，注意一开始会有一个global作用域
 * node: 语法节点，注意顺序和编译器一样，从右到左。其类型参考luaparse的ast.Node声明
 *      local x = "aaa"
 *      x: Identifier
 *      "aaa": StringLiteral
 *      local: LocalStatement
 *      文件结束时，还会有lua特有的Chunk
 */

export enum LocalType {
    LT_NONE = 0,
    LT_LOCAL = 1, // 普通local变量 local X
    LT_PARAMETER = 2, // 函数参数 function (a, b, c) end
    LT_FOR_VAR = 3  // for k,v in或者for idx = 1, N do中的局部变量
}

// 注释类型
export enum CommentType {
    CT_NONE = 0,
    CT_ABOVE = 1, // 在上方的注释
    CT_LINEEND = 2, // 在行尾的注释
    CT_HTML = 3, // html格式的注释，只有autoSTL解析出来的标准库有
}

// 在vs code的符号基础上扩展一些字段，方便类型跟踪
export interface SymInfoEx extends SymbolInformation {
    scope: number; // 第几层作用域, -1表示外部符号
    refType?: string[]; // local N = M时记录引用的类型M，local MAX = M.X.Y为多层引用
    refUri?: string; // local M = require "x"时记录引用的文件x
    value?: string; // local V = 2这种常量数据时记录它的值
    parameters?: string[]; // 如果是函数，记录其参数
    subSymList?: SymInfoEx[]; // 子符号
    base?: string; // M.N时记录模块名M
    local?: LocalType; // 是否Local符号
    indexer?: string; // M.N或者M:N中的[.:]
    comment?: string; // 注释
    ctType?: CommentType; // 注释类型
    baseModule?: string; // 用于处理module()
}

export type VSCodeSymbol = SymInfoEx | null;

interface NodeCache {
    uri: string;
    nodes: Node[];
    codeLine: number[];
    comments: Comment[];
}

export class Symbol {
    private static ins: Symbol;
    private static invalidLoc: Location = {
        uri: "", range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        }
    };

    private options: Options;

    // 是否需要更新全局符号
    private needUpdate: boolean = true;

    // 全局符号缓存（即_G中的符号），符号名为k，v为数组(可能存在同名全局符号)
    private globalSymbol = new Map<string, SymInfoEx[]>();

    // 全局模块缓存，符号名为k，方便快速查询符号 identifier
    private globalModule = new Map<string, SymInfoEx>();

    // lua标准库符号，符号名为k
    private stlSymbol = new Array<SymInfoEx>();

    /**
     * 各个文档的符号缓存，uri为key
     * 注意每个文档的符号是全部存到一个数组里，不是以树形结构存的
     * 必要时根据scope判断是否为自己所需要符号
     */
    private documentSymbol = new Map<string, SymInfoEx[]>();

    // 各个文档的符号缓存，第一层uri为key，第二层模块名为key
    // 下面这种写法，M就会被认为是一个documentModule
    // local M = MM
    // M.a = ...
    private documentModule = new Map<string, Map<string, SymInfoEx>>();

    // 下面是一些解析当前文档的辅助变量
    private parseUri: string = "";
    private parseScopeDeepth: number = 0;
    private parseNodeList: Node[] = [];
    private parseCacheList: Node[] = [];
    private parseSymList: SymInfoEx[] = [];
    private parseModule = new Map<string, SymInfoEx>();
    private parseComments: Comment[] = [];
    private parseCodeLine: number[] = [];
    private parseModuleName: string | null = null;

    private openCache = false;
    // 缓存8个文档的符号数据，用于本地符号的查找等
    private docNodeCache = new Array<NodeCache>();

    private constructor() {
        this.options = {
            locations: true, // 是否记录语法节点的位置(node)
            scope: true, // 是否记录作用域
            wait: false, // 是否等待显示调用end函数
            comments: true, // 是否记录注释
            ranges: true, // 记录语法节点的字符位置(第几个字符开始，第几个结束)
            luaVersion: Setting.instance().getLuaVersion(),
            onCreateScope: () => this.onCreateScope(),
            onDestroyScope: () => this.onDestoryScope(),
            onCreateNode: (node) => this.onCreateNode(node),
            onLocalDeclaration: () => { },
            extendedIdentifiers: false,
            // luaparse v0.3.0 需要指定编码才会把字符串解析到value字段
            encodingMode: "none"
        } as Options;
    }

    public static instance() {
        if (!Symbol.ins) {
            Symbol.ins = new Symbol();
        }

        return Symbol.ins;
    }

    // 作用域，和lua中的作用域一致，注意一开始会有一个global作用域
    private onCreateScope() {
        this.parseScopeDeepth++;
    }

    // 作用域结束
    private onDestoryScope() {
        this.parseScopeDeepth--;
    }

    //  语法节点结束
    private onCreateNode(node: Node) {
        const loc = node.loc;
        if (loc && node.type !== "Comment") {
            const line = loc.end.line;
            let codeLine = this.parseCodeLine;
            if (codeLine.length < line + 1) {
                codeLine.length = line + 1;
            }
            codeLine[line] = 1;
        }
        // 不是全局或者模块中的符号，不用解析
        if (this.parseScopeDeepth > 1) {
            return;
        }

        // 用来搜索局部变量的缓存，记录所有可能的语句
        this.parseCacheList.push(node);

        switch (node.type) {
            case "FunctionDeclaration": // 函数
            case "LocalStatement": // local变量赋值 local var = x
            case "AssignmentStatement": // 全局变量 g_var = x 成员变量赋值 M.var = x
            case "ReturnStatement": // return { a = 111 } 这种情况
                this.parseNodeList.push(node);
                break;
            case "CallStatement": {// module("test", package.seeall)
                if (this.getModuleCall(node)) {
                    this.parseNodeList.push(node);
                }
                break;
            }
        }
    }

    // 处理模块声明 module("test", package.seeall)
    private getModuleCall(node: CallStatement) {
        const expr = node.expression;
        if (expr.type !== "CallExpression") {
            return null;
        }

        const base = expr.base;
        if (base.type !== "Identifier" || base.name !== "module") {
            return null;
        }

        if (expr.arguments.length < 1) {
            return null;
        }
        const argument = expr.arguments[0];
        if (argument.type !== "StringLiteral") {
            return null;
        }

        return this.stringLiteralValue(argument);
    }

    // 解析节点
    private parseNode(node: Node) {
        let symList;
        switch (node.type) {
            case "FunctionDeclaration": // 函数
                symList = this.parseFunctionExpr(node);
                break;
            case "LocalStatement": // local变量
                symList = this.parseVariableStatement(node, LocalType.LT_LOCAL);
                break;
            case "AssignmentStatement": // 全局变量
                symList = this.parseVariableStatement(node);
                break;
            case "ReturnStatement": // return { a = 111 } 这种情况
                symList = this.parseReturnStatement(node);
                break;
            case "CallStatement": {// module("test", package.seeall)
                symList = this.parseCallStatement(node);
                break;
            }
        }

        if (!symList) {
            return;
        }
        for (const sym of symList) {
            this.pushParseSymbol(sym);
        }
    }

    // 解析成员变量赋值
    private parseBaseName(
        ider: Identifier | MemberExpression | IndexExpression | null): NameInfo {
        let nameInfo: NameInfo = { name: "" };
        if (!ider) {
            return nameInfo;
        }

        if (ider.type === "Identifier") {
            // function test() 这种直接声明函数的写法
            nameInfo.name = ider.name;
        }
        else if (ider.type === "MemberExpression") {
            // function m:test()、M.val = xxx 或者 function m.test() 这种成员函数写法
            nameInfo.name = ider.identifier.name;
            if (ider.base.type === "Identifier") {
                if ("_G" !== ider.base.name) {
                    nameInfo.base = ider.base.name;
                }
                nameInfo.indexer = ider.indexer;

            }
        }
        // IndexExpression是list[idx]这种，暂时没用到

        return nameInfo;
    }

    // 创建一个不存在的外部模块符号
    private createModuleSym(name: string, scope: number = 0): SymInfoEx {
        return {
            name: name,
            kind: SymbolKind.Namespace,
            location: {
                uri: "",
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 },
                }
            },
            scope: scope,
            subSymList: []
        };
    }

    /**
     * 解析文件时，查找模块符号
     * local C = init_class()
     * function C:test() end
     * 这种写法C无法识别为table，但很多情况下它就是一个table
     * 当然这个可能不太准确，但也只能猜了
     * @param name 模块名字
     */
    private findParseModuleSym(name: string) {
        for (const sym of this.parseSymList) {
            if (sym.name === name && sym.scope === this.parseScopeDeepth
                && sym.kind === SymbolKind.Variable) {
                return sym;
            }
        }

        return undefined;
    }

    private pushModuleSymbol(
        name: string, sym: SymInfoEx) {
        let moduleSym = this.parseModule.get(name);
        if (!moduleSym) {
            moduleSym = this.findParseModuleSym(name);
            if (moduleSym) {
                this.parseModule.set(name, moduleSym);
                moduleSym.kind = SymbolKind.Namespace;
            }
        }
        // 不存在则可能是外部模块
        // 比如 table.empty = function() end 这种找不到table模块声明的模块
        // 可能是扩展标准库或者C++中定义，又或者是同一个模块，分成多个文件
        // key为模块名，Value为uri
        if (!moduleSym) {
            moduleSym = this.createModuleSym(name);
            this.parseModule.set(name, moduleSym);
        }

        if (!moduleSym.subSymList) {
            moduleSym.subSymList = [];
        }
        moduleSym.subSymList.push(sym);
    }

    // 把一个解析好的符号存到临时解析数组
    private pushParseSymbol(sym: SymInfoEx) {
        this.parseSymList.push(sym);

        const subSym = sym.subSymList;
        if (subSym) {
            // 如果这个符号包含子符号，则一定被当作模块
            // 目前只有table这样处理
            this.parseModule.set(sym.name, sym);
            this.parseSymList.push(...subSym);
        }

        // 如果声明了模块，那么所有没有模块名的符号都会被加上一个符号名
        let base = sym.base;
        if (!base && sym.kind !== SymbolKind.Module
            && !sym.local && this.parseModuleName) {
            base = this.parseModuleName;
            sym.baseModule = this.parseModuleName;
        }
        if (base) {
            this.pushModuleSymbol(base, sym);
        }

        // table当作模块，主要是我们要确定一个模块是否为local
        // local M = {} 这种情况才能知道是否为local
        if (sym.kind === SymbolKind.Namespace) {
            this.parseModule.set(sym.name, sym);
        }
    }

    // 解析函数调用，目前仅特殊处理模块声明
    private parseCallStatement(stat: CallStatement) {
        const name = this.getModuleCall(stat);
        if (!name || !stat.loc) {
            return null;
        }

        // 记录当前文件的模块名
        // TODO: module("a.b.c") 这种现在暂时不支持
        this.parseModuleName = name;

        // 给模块名生成一个符号
        let sym: SymInfoEx = {
            name: name,
            scope: this.parseScopeDeepth,
            kind: SymbolKind.Module,
            location: Symbol.toLocation(this.parseUri, stat.loc),
        };

        return [sym];
    }

    // 解析函数声明
    private parseFunctionExpr(expr: FunctionDeclaration): SymInfoEx[] {
        // return function() ... end 这种匿名函数没有identifier
        let nameInfo = this.parseBaseName(expr.identifier);
        if ("" === nameInfo.name) {
            return [];
        }

        let local;
        if (expr.isLocal) {
            local = LocalType.LT_LOCAL;
        }
        let sym = this.toSym(nameInfo, expr, undefined, local);
        if (!sym) {
            return [];
        }

        return [sym];
    }

    // 解析子变量
    // local M = { a= 1, b = 2} 这种const变量，也当作变量记录到文档中
    public parseTableConstructorExpr(expr: TableConstructorExpression, base?: string) {
        let symList: SymInfoEx[] = [];

        this.parseScopeDeepth++;
        for (let field of expr.fields) {
            // local M = { 1, 2, 3}这种没有key对自动补全、跳转都没用,没必要处理
            // local M = { a = 1, [2] = 2}这种就只能处理有Key的那部分了
            if (("TableKey" !== field.type && "TableKeyString" !== field.type)
                || "Identifier" !== field.key.type) {
                continue;
            }

            let sym = this.toSym({
                name: field.key.name, base: base
            }, field.key, field.value);

            // 解析子table
            if (sym && this.parseScopeDeepth < 8
                && field.value.type === "TableConstructorExpression") {
                sym.subSymList = this.parseTableConstructorExpr(
                    field.value, field.key.name);
            }

            if (sym) {
                symList.push(sym);
            }
        }
        this.parseScopeDeepth--;

        return symList;
    }

    // 解析 return 仅特殊处理 return { a = 1, b = c } 这种返回
    private parseReturnStatement(node: ReturnStatement) {
        for (let argument of node.arguments) {
            // 如果是用来显示文档符号的，只处理 return {}
            if ("TableConstructorExpression" === argument.type) {
                return this.parseTableConstructorExpr(argument);
            }
        }

        return [];
    }

    // 解析变量声明
    private parseVariableStatement(
        stat: LocalStatement | AssignmentStatement, local?: LocalType) {
        let symList: SymInfoEx[] = [];
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            let varNode = stat.variables[index];
            let nameInfo = this.parseBaseName(varNode);

            let name = nameInfo.name;
            if ("" === name) {
                continue;
            }

            const init = stat.init[index];

            let sym = this.toSym(nameInfo, varNode, init, local);
            if (!sym) {
                continue;
            }
            symList.push(sym);

            // 把 local M = { A = 1,B = 2}中的 A B符号解析出来
            // 因为常量声明在lua中很常用，显示出来比较好，这里特殊处理下
            if (init && "TableConstructorExpression" === init.type) {
                sym.subSymList = this.parseTableConstructorExpr(init, name);
                // vs code在显示文档符号时，会自动判断各个符号的位置，如果发现某个符号
                // 属于另一个符号的位置范围内，则认为这个符号是另一个符号的子符号，可以
                // 把子符号折叠起来
                // 但lua中允许这种写法 local x, y = {a = 1, b = 2}, 2
                // 这时候如果想让a、b成为x的子符号，那么x的范围就必须包含y，这显然无法
                // 接受，那么这里特殊处理local x = {a = 1, b = 2}这种情况即可
                if (init.loc && 1 === stat.variables.length) {
                    let endLoc = sym.location.range.end;
                    endLoc.line = init.loc.end.line - 1;
                    endLoc.character = init.loc.end.column;
                }
            }
        }

        return symList;
    }

    public static toLocation(uri: string, loc: LuaLocation): Location {
        return {
            uri: uri,
            range: {
                start: {
                    line: loc.start.line - 1, character: loc.start.column
                },
                end: { line: loc.end.line - 1, character: loc.end.column }
            }
        };
    }

    // 记录local MAX = M.X.Y 这种引用
    private toRefVallue(node: MemberExpression) {
        let refVal: string[] = [];

        let init = node;
        for (let deepth = 0; deepth < 8; deepth++) {
            if (init.indexer !== ".") {
                return;
            }

            refVal.push(init.identifier.name);

            const base = init.base;
            // 最后一个是Identifier而不是MemberExpression
            if (base.type === "Identifier") {
                refVal.push(base.name);
                break;
            }

            if (base.type !== "MemberExpression") {
                return;
            }

            init = base;
        }

        // luaparse解析 M.X.Y 是逆序的
        refVal.reverse();
        return refVal;
    }

    /**
     * 获取字符串内容
     * luaparse 0.3.0后，根据encodingMode来解析字符串，但是没有提供解析utf8的方式？
     * x-user-defined pseudo-latin1都无法解析出中文
     */
    private stringLiteralValue(val: StringLiteral) {
        if (val.value) {
            return val.value;
        }

        // lua的字符串可能包含在 ''、""、[[]]中
        let raw = val.raw;
        if (raw.startsWith("'") || raw.startsWith("\"")) {
            return raw.substring(1, raw.length - 1);
        }

        return raw.substring(2, raw.length - 2);
    }

    private toConst(expr: Node): string | null {
        switch (expr.type) {
            case "UnaryExpression": return this.toConstUnaryVal(expr);
            case "BinaryExpression": return this.toConstBinaryVal(expr);
            case "StringLiteral": return expr.raw;
            case "NumericLiteral": return expr.raw;
        }

        return null;
    }

    // 把 local a = -1中的-1表达式转换成常量显示
    private toConstUnaryVal(expr: UnaryExpression) {
        const arg = expr.argument;
        if (arg.type === "StringLiteral") {
            return expr.operator + this.stringLiteralValue(arg);
        }

        if (arg.type === "NumericLiteral") {
            return expr.operator + arg.value;
        }

        return null;
    }

    // 把 local a = 1 << 32中的 1 << 32表达式转换成常量显示
    private toConstBinaryVal(expr: BinaryExpression) {
        // TODO: 这里的字符串格式化可能有问题，AST后，括号去掉了，简单地按左右拼接可能
        // 导致优先级错误
        let left = this.toConst(expr.left);
        let right = this.toConst(expr.right);

        if (left && right) {
            return `${left} ${expr.operator} ${right}`;
        }

        return null;
    }

    // 构建一个vs code的符号
    // @loc: luaparse中的loc位置结构
    public toSym(nameInfo: NameInfo,
        node: Statement | Expression,
        init?: Statement | Expression, local?: LocalType): VSCodeSymbol {
        const loc = node.loc;
        if (!loc) {
            return null;
        }

        // T.t = 99 这种写法，t属于T，故t的作用域不应该为0，但解析时parseScope是为0
        // 只有 T = { t = 99 } 这种写法parseScore才不为0
        let scope = this.parseScopeDeepth;
        if (0 === scope && nameInfo.base) {
            scope = 1;
        }
        let sym: SymInfoEx = {
            name: nameInfo.name,
            base: nameInfo.base,
            indexer: nameInfo.indexer,
            scope: scope,
            kind: SymbolKind.Variable,
            location: Symbol.toLocation(this.parseUri, loc),
        };

        let initNode = init || node;
        switch (initNode.type) {
            case "Identifier": {
                // local N = M 会被视为把模块M本地化为N
                // 在跟踪N的符号时会在M查找
                // 给scope限定一个范围，不然大量的配置会有常量，导致记录太多数据内在激增
                if (sym.scope >= 0 && sym.scope <= 2 && init) {
                    sym.refType = [initNode.name];
                }
                break;
            }
            case "MemberExpression": {
                if (sym.scope >= 0 && sym.scope <= 2 && init) {
                    sym.refType = this.toRefVallue(initNode);
                }
                break;
            }
            case "StringLiteral": {
                sym.value = initNode.raw;
                sym.kind = SymbolKind.String;
                break;
            }
            case "NumericLiteral": {
                sym.value = initNode.raw;
                sym.kind = SymbolKind.Number;
                break;
            }
            case "BooleanLiteral": {
                sym.value = initNode.raw;
                sym.kind = SymbolKind.Boolean;
                break;
            }
            case "UnaryExpression": {
                // local a = -1
                let val = this.toConstUnaryVal(initNode);
                if (val) {
                    sym.value = val;
                    sym.kind = SymbolKind.Number;
                }
                break;
            }
            case "BinaryExpression": {
                // local a = 1 << 2
                let val = this.toConstBinaryVal(initNode);
                if (val) {
                    sym.value = val;
                    sym.kind = SymbolKind.Number;
                }
                break;
            }
            case "TableConstructorExpression": {
                sym.kind = SymbolKind.Namespace;
                break;
            }
            case "FunctionDeclaration": {
                sym.kind = SymbolKind.Function;

                sym.parameters = [];
                for (let para of initNode.parameters) {
                    let paramName =
                        "Identifier" === para.type ? para.name : para.value;

                    sym.parameters.push(paramName);
                }
                break;
            }
            case "CallExpression": {// local M = require("x")
                let base = initNode.base;
                if ("Identifier" === base.type && "require" === base.name) {
                    let arg = initNode.arguments[0];
                    if (arg.type === "StringLiteral") {
                        sym.refUri = this.stringLiteralValue(arg);
                    }
                }
                break;
            }
            case "StringCallExpression": {// local M = require "x"
                let base = initNode.base;
                if ("Identifier" === base.type && "require" === base.name) {
                    let arg = initNode.argument;
                    if (arg.type === "StringLiteral") {
                        sym.refUri = this.stringLiteralValue(arg);
                    }
                }
                break;
            }
        }

        if (!sym.local) {
            if (local) {
                sym.local = local;
            }
        }
        return sym;
    }

    private isGlobalSym(sym: SymInfoEx) {
        // 不在顶层作用域的不放到全局符号，因为太多了，多数是配置
        // 一般都是宏定义或者配置字段，如 M = { a = 1 }这种
        // M:func = funciton() ... end 这种算是顶层的，这些在解析符号处理
        if (sym.local || sym.scope > 0 || sym.base || sym.baseModule) {
            return false;
        }

        return true;
    }

    private setGlobalSym(sym: SymInfoEx) {
        if (!this.isGlobalSym(sym)) {
            return;
        }
        const name = sym.name;
        let nameList = this.globalSymbol.get(name);
        if (!nameList) {
            nameList = new Array<SymInfoEx>();
            this.globalSymbol.set(name, nameList);
        }

        nameList.push(sym);
    }

    // 更新全局符号缓存
    private updateGlobal() {
        this.globalSymbol.clear();
        this.globalModule.clear();

        for (let v of this.stlSymbol) {
            this.setGlobalSym(v);
            if (v.kind === SymbolKind.Namespace && v.scope === 0) {
                if (this.globalModule.get(v.name)) {
                    Utils.instance().error(
                        `update global stl symbol module error: ${v.name}`);
                }
                this.globalModule.set(v.name, v);
            }
        }

        for (const [name, symList] of this.documentSymbol) {
            for (const sym of symList) {
                this.setGlobalSym(sym);
            }
        }

        // 处理globalModule
        for (const [uri, docModules] of this.documentModule) {
            for (const [name, sym] of docModules) {
                // local模块不放到全局
                if (!this.isGlobalSym(sym)) {
                    continue;
                }
                let moduleSym = this.globalModule.get(name);
                if (!moduleSym) {
                    this.globalModule.set(name, sym);
                    continue;
                }
                // 当同一个模块的符号分布在不同文档时，最终需要合并
                // 合并时不能修改原符号，只能重新创建一个
                if (-1 !== moduleSym.scope) {
                    // let newSym: SymInfoEx = Object.assign(moduleSym);
                    let newSym = this.createModuleSym(name, -1);

                    newSym.location = moduleSym.location;
                    if (!newSym.subSymList) {
                        newSym.subSymList = [];
                    }
                    if (moduleSym.subSymList) {
                        newSym.subSymList.push(...moduleSym.subSymList);
                    }
                    this.globalModule.set(name, newSym);

                    moduleSym = newSym;
                }

                // 之前保存的可能是外部符号，现在遇到定义的地方，则把位置修正为定义的位置
                if ("" !== sym.location.uri) {
                    moduleSym.location = sym.location;
                }
                // 合并模块中的符号
                if (!sym.subSymList) {
                    continue;
                }
                if (!moduleSym.subSymList) {
                    moduleSym.subSymList = [];
                }
                moduleSym.subSymList.push(...sym.subSymList);
            }
        }
        this.needUpdate = false;
    }

    /**
     * 获取引用的符号
     * @param base local N = M.X.Y中的M X Y
     * @param uri 当前需要搜索的文档
     */
    public getRefSym(sym: SymInfoEx, uri: string): VSCodeSymbol {
        const refType = sym.refType;
        if (!refType || refType.length <= 0) {
            return null;
        }

        let globalSym = this.getGlobalModule(refType);
        if (globalSym) {
            return globalSym;
        }

        // 本次查找不再递归查找引用的符号
        // 防止 local ipairs = ipairs这种同名引用死循环
        let docSym = this.getDocumentModule(uri, refType, false);
        if (docSym instanceof Array) {
            return null;
        }

        return docSym;
    }

    private getSymbolFromList(
        base: string[], index: number, symList?: SymInfoEx[]) {
        let final;
        for (let idx = index; idx < base.length; idx++) {
            if (!symList) {
                return null;
            }

            let found;
            let name = base[idx];
            for (let subSym of symList) {
                if (name === subSym.name) {
                    found = subSym;
                    break;
                }
            }

            if (!found || !found.subSymList) {
                return found || null;
            }

            final = found;
            symList = found.subSymList;
        }

        return final || null;
    }
    // 获取某个符号的子符号
    public getSubSymbolFromList(
        base: string[], index: number, uri: string, symList?: SymInfoEx[]) {
        const sym = this.getSymbolFromList(base, index, symList);
        if (!sym) {
            return null;
        }

        // 本身包含子符号列表，直接返回列表
        if (sym.subSymList) {
            return sym.subSymList;
        }

        // 本身引用了另一个模块，则返回另一个模块的符号列表
        if (sym.refType) {
            const refSym = this.getRefSym(sym, uri);
            if (refSym && refSym.subSymList) {
                return refSym.subSymList;
            }
        }

        return null;
    }

    // 获取全局模块本身
    private getGlobalModule(bases: string[]) {
        if (bases.length <= 0) {
            return null;
        }

        if (this.needUpdate) {
            this.updateGlobal();
        }

        let sym = this.globalModule.get(bases[0]);
        if (!sym || 1 === bases.length) {
            return sym || null;
        }
        return this.getSymbolFromList(bases, 1, sym.subSymList);
    }

    // 获取全局模块的所有子符号
    // @base: local N = M.X.Y中的M X Y
    public getGlobalModuleSubList(bases: string[]) {
        const sym = this.getGlobalModule(bases);

        return sym && sym.subSymList ? sym.subSymList : null;
    }

    // 正常解析
    private parseText(uri: string, text: string) {
        try {
            const chunk = luaParse(text, this.options);
            this.parseComments = chunk.comments as any as Comment[];
        } catch (e) {
            // 这个会导致在写代码写一半的时候频繁报错，暂时不启用
            // 后面在保存文件的时候lint一下就好了
            /*
            const lines = text.split(/\r?\n/g);
            const line = lines[e.line - 1];

            const range = Range.create(e.line - 1, e.column,
                e.line - 1, line.length);

            // Strip out the row and column from the message
            const message = e.message.match(/\[\d+:\d+\] (.*)/)[1];

            const diagnostic: Diagnostic = {
                range,
                message,
                severity: DiagnosticSeverity.Error,
                source: 'luaparse'
            };

            Utils.instance().diagnostics(uri, [diagnostic]);
            */
            return false;
        }

        return true;
    }

    // 解析一段代码，如果这段代码有错误，会发给vs code
    public parse(uri: string, text: string): SymInfoEx[] {
        let ft = Setting.instance().getFileType(uri, text.length);
        if (FileParseType.FPT_NONE === ft) {
            return [];
        }

        // 不能用clear，这里的数据会直接存到this.documentModule
        this.parseModule = new Map<string, SymInfoEx>();
        this.parseSymList = [];

        const nodeList = this.rawParse(uri, text);
        if (!nodeList) {
            return [];
        }

        this.parseScopeDeepth = 0;
        for (let node of nodeList) {
            this.parseNode(node);
        }
        this.appendComment(this.parseComments,
            this.parseSymList, this.parseCodeLine);

        // 不是工程文件，不要把符号添加到工程里
        if (0 !== (FileParseType.FPT_SINGLE & ft)) {
            return this.parseSymList;
        }

        // 解析成功，更新缓存，否则使用旧的
        this.documentSymbol.set(uri, this.parseSymList);
        this.documentModule.set(uri, this.parseModule);

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalModule.clear();
        this.globalSymbol.clear();
        this.needUpdate = true;

        return this.parseSymList;
    }

    public setCacheOpen() {
        this.openCache = true;
    }

    public getCache(uri: string): NodeCache | null {
        for (const cache of this.docNodeCache) {
            if (uri === cache.uri) {
                return cache;
            }
        }

        return null;
    }

    // 更新文档缓存
    private updateCache(uri: string,
        nodes: Node[], comments: Comment[], codeLine: number[]) {
        if (!this.openCache) {
            return;
        }

        let index = -1;
        for (let e of this.docNodeCache) {
            index++;
            if (e.uri === uri) {
                break;
            }
        }
        if (index >= 0) {
            this.docNodeCache.splice(index, 1);
        }
        if (this.docNodeCache.length >= 8) {
            this.docNodeCache.splice(0, 1);
        }
        this.docNodeCache.push({
            uri: uri, nodes: nodes, comments: comments, codeLine: codeLine
        });
    }

    // 解析一段代码并查找局部变量
    public rawParse(uri: string, text: string): Node[] | null {
        let ft = Setting.instance().getFileType(uri, text.length);
        if (FileParseType.FPT_NONE === ft) {
            return null;
        }

        this.parseUri = uri;
        this.parseScopeDeepth = 0;
        this.parseNodeList = [];
        this.parseCacheList = [];
        this.parseComments = [];
        this.parseCodeLine = [];
        this.parseModuleName = null;

        try {
            let ok = (0 === (ft & FileParseType.FPT_LARGE)) ?
                this.parseText(uri, text) : this.parseLarge(text);

            if (!ok) {
                return null;
            }
        } catch (e) {
            Utils.instance().anyError(e);
            Utils.instance().error(uri);
        }

        this.updateCache(uri, this.parseCacheList,
            this.parseComments, this.parseCodeLine);

        return this.parseNodeList;
    }

    // 遍历所有文档的uri
    public eachUri(callBack: (uri: string) => void) {
        for (let [uri, value] of this.documentSymbol) {
            callBack(uri);
        }
    }

    // 遍历所有文档的uri
    public eachModuleName(callBack: (name: string) => void) {
        if (this.needUpdate) {
            this.updateGlobal();
        }

        for (let [name, value] of this.globalModule) {
            callBack(name);
        }
    }

    // 删除某个文档的符号
    public delDocumentSymbol(uri: string) {
        this.documentSymbol.delete(uri);
        this.documentModule.delete(uri);

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalModule.clear();
        this.globalSymbol.clear();
        this.needUpdate = true;
    }

    // 获取某个文档的符号
    public getDocumentSymbol(uri: string): SymInfoEx[] | null {
        return this.documentSymbol.get(uri) || null;
    }

    // 获取某个文档里的某个模块
    public getDocumentModule(uri: string, bases: string[], ref = true) {
        // 先在当前文档的模块中查找
        const base = bases[0];
        let moduleHash = this.documentModule.get(uri);
        if (moduleHash) {
            const sym = moduleHash.get(base);
            if (sym) {
                if (1 === bases.length) {
                    return sym;
                }
                return this.getSymbolFromList(bases, 1, sym.subSymList);
            }
        }

        // 如果模块中找不到，则在变量里找
        // 正常情况下，没记录到documentModule的变量不会是模块
        // 但local M = A.B.C，如果C是一个模块，则M也是
        const symList = this.getDocumentSymbol(uri);
        if (!symList) {
            return null;
        }
        for (const sym of symList) {
            if (sym.name !== base) {
                continue;
            }

            if (ref && sym.refType) {
                let rawSym = this.getRefSym(sym, uri);
                if (1 === bases.length) {
                    return rawSym;
                }
                return rawSym ?
                    this.getSymbolFromList(bases, 1, sym.subSymList) : null;
            }

            if (sym.refUri) {
                const rawUri = this.getRawUri(uri, base);
                if (!rawUri) {
                    return null;
                }
                const symList = this.getDocumentSymbol(rawUri);
                // TODO:这里不太好处理 local M = require "a.b.c" 引用特定文件时
                // 由于没有解析对应文件的return值，无法确定引用的模块，或者该模块是
                // 一个匿名table，没有符号，这里返回所有符号，需要的地方需要特殊处理
                if (1 === bases.length) {
                    return symList;
                }
                return symList ?
                    this.getSymbolFromList(bases, 1, symList) : null;
            }

            // 本身没有引用其他变量
            return sym;
        }

        return null;
    }
    // 获取某个文档里的某个模块的所有子符号
    public getDocumentModuleSubList(uri: string, bases: string[]) {
        const sym = this.getDocumentModule(uri, bases);
        if (sym instanceof Array) {
            return sym;
        }
        return sym && sym.subSymList ? sym.subSymList : null;
    }

    /**
     * 把newSymList符号列表合并到另一个列表 symList
     * @param isSub 是否合并子符号
     * @param symList 最终的列表
     * @param newSymList 需要合并的列表
     * @param filter 过滤器，哪些符号需要合并
     */
    private appendSymList(isSub: boolean, symList: SymInfoEx[],
        newSymList: SymInfoEx[], filter?: (sym: SymInfoEx) => boolean) {
        for (let sym of newSymList) {
            if (!filter || filter(sym)) {
                symList.push(sym);
            }

            if (isSub && sym.subSymList) {
                this.appendSymList(isSub, symList, sym.subSymList, filter);
            }
        }
    }

    /**
     *  获取全局符号
     * @param isSub 是否查找子符号。跳转和自动补全无法精准定位时，会全局查找。这时并不
     * 希望查找子符号，因为这些符号都是必须通过模块名精准访问的
     */
    public getGlobalSymbol(isSub: boolean,
        filter?: (sym: SymInfoEx) => boolean, maxSize?: number): SymInfoEx[] {
        if (this.needUpdate) {
            this.updateGlobal();
        }

        let symList: SymInfoEx[] = [];
        for (let [name, newSymList] of this.globalSymbol) {
            this.appendSymList(isSub, symList, newSymList, filter);
            if (maxSize && symList.length >= maxSize) {
                break;
            }
        }

        return symList;
    }

    /**
     * 获取所有符号，包括本地和全局的
     */
    public getAnySymbol(isSub: boolean,
        filter?: (sym: SymInfoEx) => boolean, maxSize?: number): SymInfoEx[] {

        // 先搜索全局的
        let symList = this.getGlobalSymbol(isSub, filter, maxSize);

        // 再搜索非全局的
        // documentSymbol中不是以树形结构存符号，子符号也是在同一个数组里的
        for (const [name, newSymList] of this.documentSymbol) {
            for (let sym of newSymList) {
                // return { a = 2 } 这种匿名table里的符号scope > 0，但无base
                if (this.isGlobalSym(sym) || (sym.scope > 0 && sym.base)) {
                    continue;
                }

                if (!filter || filter(sym)) {
                    symList.push(sym);
                }

                if (isSub && sym.subSymList) {
                    this.appendSymList(isSub, symList, sym.subSymList, filter);
                }
            }
            if (maxSize && symList.length >= maxSize) {
                break;
            }
        }

        return symList;
    }

    // 查找经过本地化的原符号uri
    public getRawUri(uri: string, base: string): string | null {
        // 模块名为self则是当前文档self:test()这种用法
        if ("self" === base || "_G" === base) {
            return null;
        }

        const symList = this.documentSymbol.get(uri);
        if (!symList) {
            return null;
        }

        let sym;
        for (let one of symList) {
            if (one.name === base) {
                sym = one;
                break;
            }
        }
        if (!sym) {
            return null;
        }

        // local M = require "abc" 这种用法
        if (sym.refUri) {
            return this.getRequireUri(sym.refUri);
        }

        // 都找不到，默认查找当前文档
        return null;
    }

    // 查找经过本地化的原符号名字，local N = M时转到模块M查找
    public getRawModule(uri: string, base: string): string[] {
        // 模块名为self则是当前文档self:test()这种用法
        if ("self" === base || "_G" === base) {
            return [base];
        }

        const symList = this.documentSymbol.get(uri);
        if (!symList) {
            return [base];
        }

        let sym;
        for (let one of symList) {
            if (one.name === base) {
                sym = one;
                break;
            }
        }
        if (!sym || !sym.refType) {
            return [base];
        }

        return sym.refType;
    }

    // 转换成uri路径格式
    public toUriFormat(path: string): string {
        // 这个路径，可能是 a.b.c a/b/c a\b\c 这三种形式
        // uri总是使用a/b/c这种形式
        path = path.replace(/\\/g, "/");
        path = path.replace(/\./g, "/");

        return path;
    }

    // 获取 require("a.b.c") 中 a.b.c 路径的uri形式
    public getRequireUri(path: string): string {
        const endUri = `${this.toUriFormat(path)}.lua`;

        // 在所有uri里查询匹配的uri
        // 由于不知道项目中的path设置，因此这个路径其实可长可短
        // 如果项目中刚好有同名文件，而且刚好require的路径无法区分，那也没办法了
        for (let [uri, val] of this.documentModule) {
            if (uri.endsWith(endUri)) {
                // make sure bbb do not match conf/aaabbb
                let offset = uri.length - endUri.length;
                if (0 === offset || "/" === uri[offset - 1]) {
                    return uri;
                }
            }
        }

        return "";
    }

    // 解析大文件
    // 一般是配置文件，为一个很大的lua table，参考测试中的large_conf.lua
    // 只要尝试把这个table名解析出来就好
    private parseLarge(text: string) {
        // 只解析前512个字符，还找不到table名，就放弃
        let head = text.substring(0, 512);
        let parser: luaParser = luaParse(head, {
            locations: true, // 是否记录语法节点的位置(node)
            scope: false, // 是否记录作用域
            wait: true, // 是否等待显示调用end函数
            comments: false, // 是否记录注释
            ranges: true, // 记录语法节点的字符位置(第几个字符开始，第几个结束)
            luaVersion: Setting.instance().getLuaVersion()
        });

        let token;
        do {
            token = parser.lex();

            if (token.type === LTT.EOF) {
                return false;
            }

            if (token.type === LTT.Keyword
                && token.value === "return") {
                return false;
            }

            if (token.type === LTT.Identifier) {
                break;
            }
        } while (token.type !== LTT.EOF);

        let node: AssignmentStatement = {
            "type": "AssignmentStatement",
            "variables": [
                {
                    type: "Identifier",
                    "name": token.value,
                    "loc": {
                        "start": {
                            "line": token.line,
                            "column": token.range[0] - token.lineStart
                        },
                        "end": {
                            "line": token.line,
                            "column": token.range[1] - token.lineStart
                        }
                    }
                }],
            init: [
                {
                    type: "TableConstructorExpression",
                    fields: []
                }
            ]
        };

        this.parseNodeList.push(node);
        this.parseCacheList.push(node);
        return true;
    }

    /**
     * 获取符号所在的文件路径，展示用。目前只展示文件名
     */
    public static getSymbolPath(sym: SymInfoEx): string | null {
        if ("" === sym.location.uri) {
            return "Lua Standard Libraries";
        }
        const match = sym.location.uri.match(/\/(\w+.\w+)$/);
        return match ? match[1] : null;
    }

    /**
     * 获取符号所在的文件路径，展示用。目前只展示文件名
     */
    public static getPathPrefix(sym: SymInfoEx, uri?: string) {
        // 不在当前文件的符号中显示文件名
        if (uri && sym.location.uri === uri) {
            return "";
        }

        let file = Symbol.getSymbolPath(sym);

        // 加上markdown的换行，两个空格加\n
        return file ? `${file}  \n` : "";
    }

    // 获取符号的local类型，展示用
    public static getLocalTypePrefix(local?: LocalType) {
        if (!local) {
            return "";
        }

        switch (local) {
            case LocalType.LT_LOCAL: return "local ";
            case LocalType.LT_PARAMETER: return "(parameter) ";
            default: return "";
        }
    }

    // 获取符号的base，如 E = { FAIL = 1 } 中 E.FAIL中E.为base
    public static getBasePrefix(sym: SymInfoEx) {
        if (!sym.base) {
            return "";
        }

        // table field like: local tbl = { a = false } have no index
        let indexer = sym.indexer ? sym.indexer : ".";
        return `${sym.base}${indexer}`;
    }

    // 对比符号和luaparse的位置
    private compPos(symLoc: Location, loc: LuaLocation) {
        const startLine = loc.start.line - 1;
        const startCol = loc.start.column;
        const endLine = loc.end.line - 1;

        // 这里要注意下，某些符号的位置包含多行(比如一个table)
        // 以开始行为准
        const beg = symLoc.range.start.character;
        const line = symLoc.range.start.line;

        // 小于，符号在注释前面
        if (line < startLine) {
            return -1;
        }

        // 等于，则为行尾注释
        // 排除 --[[comment]] local x 这种注释
        if (line === startLine) {
            return beg > startCol ? -1 : 0;
        }

        // 注释在符号的前一行，为当前符号的注释
        if (line === endLine + 1) {
            return 1;
        }

        // 符号包含注释，这时符号应该是一个函数或者table
        if (line < startLine && symLoc.range.end.line >= endLine) {
            return 2;
        }

        // 超过一行，则不是
        if (line > endLine) {
            return 3;
        }

        return -1;
    }

    // 获取注释字符串
    private getCommentValue(comment: Comment) {
        return comment.raw;
        // 之前是想统一格式化显示的内容，例如--后面必须有一个空格
        // 但是不同写法差异很大，比如有些 ---@param 就变成了 -- -@param
        // if (comment.loc!.start.line === comment.loc!.end.line) {
        //     return "-- " + comment.value.trim();
        // }

        // return `--[[\n${comment.value}]]`;
    }

    private AppendOneComment(
        symList: SymInfoEx[], comments: Comment[], begIndex: number,
        index: number, continueIndex: number, codeLine: number[]) {
        const comment = comments[index];
        if (!comment.loc) {
            return {
                index: begIndex, reset: false
            };
        }

        let reset = false;
        for (let symIndex = begIndex;
            symIndex < symList.length; symIndex++) {
            let sym = symList[symIndex];
            const comp = this.compPos(sym.location, comment.loc);
            // 注释在当前符号之后了，当前符号之前的都不需要再查找
            if (-1 === comp) {
                begIndex = symIndex;
                continue;
            }

            // 行数相等，为行尾注释
            if (0 === comp) {
                reset = true;
                sym.ctType = CommentType.CT_LINEEND;
                sym.comment = this.getCommentValue(comment);

                // local x, y
                // 同一样可能存在多个变量，继续查找
                continue;
            }

            // 在符号上面的注释，可能存在多行
            if (1 === comp) {
                reset = true;

                // 函数上面的注释不要赋给参数
                if (sym.local === LocalType.LT_PARAMETER) {
                    continue;
                }
                /*
                 * test() -- abc
                 * local X = 1
                 *
                 * 注释是test()的，而不是X的
                 */
                let line = sym.location.range.start.line;
                if (line < codeLine.length && 1 === codeLine[line]) {
                    continue;
                }
                sym.ctType = CommentType.CT_ABOVE;
                if (-1 === continueIndex) {
                    sym.comment = this.getCommentValue(comment);
                } else {
                    let symComment: string[] = [];
                    for (let idx = continueIndex; idx <= index; idx++) {
                        // 多行注释有对齐，不要去掉空格
                        symComment.push(this.getCommentValue(comments[idx]));
                    }
                    sym.comment = symComment.join("\n");
                }
                continue;
            }

            // 子符号已经放到parseSymList里了，不用额外查找
            // 但是这里要reset = true，因为现在函数是不解析局部变量的，防止
            // 函数每一行都有注释时注释被连续拼接
            if (2 === comp && sym.subSymList) {
                reset = true;
                // this.AppendOneComment(
                //     sym.subSym, comments, 0, index, continueIndex);
            }

            break;
        }

        return {
            index: begIndex, reset: reset
        };
    }

    /* 把注释记录到符号中
     * 在符号上面连续的注释，或者在符号行尾的注释，则为该符号的注释
     * 行尾注释优先于上面的注释
     *
     * -- 这是上面的注释1
     * -- 这是上面的注释2
     * local sym = false -- 这是行尾的注释
     */
    public appendComment(comments: Comment[],
        symList: SymInfoEx[], codeLine: number[]) {
        let lastSymIndex = 0;

        let continueLine = -1;
        let continueIndex = -1;

        comments.forEach((comment, index) => {
            if (!comment.loc) {
                return;
            }

            // 记录连续多行的注释
            let nextLine = continueLine + 1;
            if (-1 !== continueIndex
                && continueLine + 1 === comment.loc.start.line) {
                continueLine = comment.loc.end.line;
            } else {
                continueIndex = -1;
            }

            let ok = this.AppendOneComment(symList,
                comments, lastSymIndex, index, continueIndex, codeLine);

            lastSymIndex = ok.index;
            if (ok.reset) {
                continueIndex = -1;
                return;
            }

            if (-1 === continueIndex) {
                continueIndex = index;
                continueLine = comment.loc.end.line;
                return;
            }
        });
    }

    // 获取变量本地化的引用提示
    // local M = X.Y.Z 提示为 local M -> X.Y.Z = 5
    public getRefValue(sym: SymInfoEx) {
        if (!sym.refType) {
            return "";
        }

        const refSym = this.getRefSym(sym, sym.location.uri);
        if (!refSym) {
            return "";
        }

        // 如果引用的是一个常量，那显示常量
        let val = "";
        let prefix = "";
        if (refSym.value) {
            val = ` = ${refSym.value}`;
        } else if (refSym.kind === SymbolKind.Function) {
            prefix = "function ";

            let parameters = "";
            if (refSym.parameters) {
                parameters = refSym.parameters.join(", ");
            }
            val = `(${parameters})`;

            // 如果原符号无注释，这里在后面显示注释
            if (refSym.comment && !sym.comment) {
                val += "\n" + refSym.comment;
            }
        }

        return ` -> ${prefix}${sym.refType.join(".")}${val}`;
    }

    /**
     * 获取全局符号(不包含STL中的符号)
     */
    public getGlobalSymbolList() {
        let symList: SymInfoEx[] = [];
        for (const [uri, docSymList] of this.documentSymbol) {
            for (const sym of docSymList) {
                if (!this.isGlobalSym(sym)) {
                    symList.push(sym);
                }
            }
        }

        return symList;
    }

    // 判断两个符号相似度
    public static checkMatch(src: string, dst: string): number {
        const res = fuzzysort.single(src, dst);

        // exact match returns a score of 0. lower is worse
        return res ? res.score : -1000000000;
    }

    private parseSTLSym(symbols: any) {
        // 先把模块都找出来缓存
        let stlModule = new Map<string, SymInfoEx>();
        for (let v of symbols) {
            if (v.kind !== SymbolKind.Namespace) {
                continue;
            }

            //Utils.instance().log(`json parse stl ${JSON.stringify(v)}`);
            let sym: SymInfoEx = {
                name: v.name,
                kind: v.kind,
                location: Symbol.invalidLoc,
                scope: 0,
                comment: v.comment,
                ctType: CommentType.CT_HTML
            };

            stlModule.set(v.name, sym);
            this.stlSymbol.push(sym);
        }

        for (let v of symbols) {
            if (v.kind === SymbolKind.Namespace) {
                continue;
            }

            let sym: SymInfoEx = {
                name: v.name,
                kind: v.kind,
                base: v.base,
                parameters: v.parameters,
                location: Symbol.invalidLoc,
                scope: v.base ? 1 : 0,
                comment: v.comment,
                ctType: CommentType.CT_HTML
            };

            this.stlSymbol.push(sym);

            if (v.base) {
                let baseSym = stlModule.get(v.base);
                if (!baseSym) {
                    Utils.instance().error(
                        `load stl no module found: ${v.base}`);
                    return;
                }

                if (!baseSym.subSymList) {
                    baseSym.subSymList = new Array<SymInfoEx>();
                }
                baseSym.subSymList.push(sym);
            }
        }
    }

    /**
     * 加载lua stand library
     */
    public loadStl() {
        let ver = Setting.instance().getLuaVersion();
        let uri = path.resolve(
            __dirname, `../../stl/stl_${ver}.json`);

        fs.readFile(uri, 'utf8', (err, data) => {
            if (err) {
                Utils.instance().log(`${JSON.stringify(err)}`);
                return;
            }
            let symbols = JSON.parse(data.toString());
            if (!symbols) {
                Utils.instance().log(`json parse stl for lua ${ver} error`);
                return;
            }

            this.parseSTLSym(symbols);
        });
    }
}
