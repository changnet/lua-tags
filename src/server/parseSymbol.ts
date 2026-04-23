// 符号处理

import { Utils } from './utils';
import { Setting, FileParseType } from './setting';

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
} from 'luaparse';

import { CacheSymbol } from './cacheSymbol';
import { Location, SymbolKind, SymbolInformation } from 'vscode-languageserver';

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
    VarargLiteral = 256,
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
    LT_FOR_VAR = 3, // for k,v in或者for idx = 1, N do中的局部变量
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

export class ParseSymbol {
    public static refMark = '==';

    private options: Options;

    // 下面是一些解析当前文档的辅助变量
    private parseUri: string = '';
    private parseScopeDeepth: number = 0;
    private parseNodeList: Node[] = [];
    private parseCacheList: Node[] = [];
    private parseSymList: SymInfoEx[] = [];
    private parseModule = new Map<string, SymInfoEx>();
    private parseComments: Comment[] = [];
    private parseCodeLine: number[] = [];
    private parseModuleName: string | null = null;

    public constructor() {
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
            onLocalDeclaration: () => {},
            extendedIdentifiers: false,
            // luaparse v0.3.0 需要指定编码才会把字符串解析到value字段
            encodingMode: 'none',
        } as Options;
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
        if (loc && node.type !== 'Comment') {
            const line = loc.end.line;
            const codeLine = this.parseCodeLine;
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
            case 'FunctionDeclaration': // 函数
            case 'LocalStatement': // local变量赋值 local var = x
            case 'AssignmentStatement': // 全局变量 g_var = x 成员变量赋值 M.var = x
            case 'ReturnStatement': // return { a = 111 } 这种情况
                this.parseNodeList.push(node);
                break;
            case 'CallStatement': {
                // module("test", package.seeall)
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
        if (expr.type !== 'CallExpression') {
            return null;
        }

        const base = expr.base;
        if (base.type !== 'Identifier' || base.name !== 'module') {
            return null;
        }

        if (expr.arguments.length < 1) {
            return null;
        }
        const argument = expr.arguments[0];
        if (argument.type !== 'StringLiteral') {
            return null;
        }

        return ParseSymbol.stringLiteralValue(argument);
    }

    // 解析节点
    private parseNode(node: Node) {
        let symList;
        switch (node.type) {
            case 'FunctionDeclaration': // 函数
                symList = this.parseFunctionExpr(node);
                break;
            case 'LocalStatement': // local变量
                symList = this.parseVariableStatement(node, LocalType.LT_LOCAL);
                break;
            case 'AssignmentStatement': // 全局变量
                symList = this.parseVariableStatement(node);
                break;
            case 'ReturnStatement': // return { a = 111 } 这种情况
                symList = this.parseReturnStatement(node);
                break;
            case 'CallStatement': {
                // module("test", package.seeall)
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
        ider: Identifier | MemberExpression | IndexExpression | null,
    ): NameInfo {
        const nameInfo: NameInfo = { name: '' };
        if (!ider) {
            return nameInfo;
        }

        if (ider.type === 'Identifier') {
            // function test() 这种直接声明函数的写法
            nameInfo.name = ider.name;
        } else if (ider.type === 'MemberExpression') {
            // function m:test()、M.val = xxx 或者 function m.test() 这种成员函数写法
            nameInfo.name = ider.identifier.name;
            if (ider.base.type === 'Identifier') {
                if ('_G' !== ider.base.name) {
                    nameInfo.base = ider.base.name;
                }
                nameInfo.indexer = ider.indexer;
            }
        }
        // IndexExpression是list[idx]这种，暂时没用到

        return nameInfo;
    }

    // 创建一个不存在的外部模块符号
    public static createModuleSym(name: string, scope: number = 0): SymInfoEx {
        return {
            name: name,
            kind: SymbolKind.Namespace,
            location: {
                uri: '',
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 0 },
                },
            },
            scope: scope,
            subSymList: [],
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
            if (
                sym.name === name &&
                sym.scope === this.parseScopeDeepth &&
                sym.kind === SymbolKind.Variable
            ) {
                return sym;
            }
        }

        return undefined;
    }

    private pushModuleSymbol(name: string, sym: SymInfoEx) {
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
            moduleSym = ParseSymbol.createModuleSym(name);
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
        if (
            !base &&
            sym.kind !== SymbolKind.Module &&
            !sym.local &&
            this.parseModuleName
        ) {
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
        const sym: SymInfoEx = {
            name: name,
            scope: this.parseScopeDeepth,
            kind: SymbolKind.Module,
            location: ParseSymbol.toLocation(this.parseUri, stat.loc),
        };

        return [sym];
    }

    // 解析函数声明
    private parseFunctionExpr(expr: FunctionDeclaration): SymInfoEx[] {
        // return function() ... end 这种匿名函数没有identifier
        const nameInfo = this.parseBaseName(expr.identifier);
        if ('' === nameInfo.name) {
            return [];
        }

        let local;
        if (expr.isLocal) {
            local = LocalType.LT_LOCAL;
        }
        const sym = this.toParseSym(nameInfo, expr, undefined, local);
        if (!sym) {
            return [];
        }

        return [sym];
    }

    // 解析子变量
    // local M = { a= 1, b = 2} 这种const变量，也当作变量记录到文档中
    public parseTableConstructorExpr(
        expr: TableConstructorExpression,
        base?: string,
    ) {
        const symList: SymInfoEx[] = [];

        this.parseScopeDeepth++;
        for (const field of expr.fields) {
            // local M = { 1, 2, 3}这种没有key对自动补全、跳转都没用,没必要处理
            // local M = { a = 1, [2] = 2}这种就只能处理有Key的那部分了
            if (
                ('TableKey' !== field.type &&
                    'TableKeyString' !== field.type) ||
                'Identifier' !== field.key.type
            ) {
                continue;
            }

            const sym = this.toParseSym(
                {
                    name: field.key.name,
                    base: base,
                },
                field.key,
                field.value,
            );

            // 解析子table
            if (
                sym &&
                this.parseScopeDeepth < 8 &&
                field.value.type === 'TableConstructorExpression'
            ) {
                sym.subSymList = this.parseTableConstructorExpr(
                    field.value,
                    field.key.name,
                );
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
        for (const argument of node.arguments) {
            // 如果是用来显示文档符号的，只处理 return {}
            if ('TableConstructorExpression' === argument.type) {
                return this.parseTableConstructorExpr(argument);
            }
        }

        return [];
    }

    // 解析变量声明
    private parseVariableStatement(
        stat: LocalStatement | AssignmentStatement,
        local?: LocalType,
    ) {
        const symList: SymInfoEx[] = [];
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            const varNode = stat.variables[index];
            const nameInfo = this.parseBaseName(varNode);

            const name = nameInfo.name;
            if ('' === name) {
                continue;
            }

            const init = stat.init[index];

            const sym = this.toParseSym(nameInfo, varNode, init, local);
            if (!sym) {
                continue;
            }
            symList.push(sym);

            // 把 local M = { A = 1,B = 2}中的 A B符号解析出来
            // 因为常量声明在lua中很常用，显示出来比较好，这里特殊处理下
            if (init && 'TableConstructorExpression' === init.type) {
                sym.subSymList = this.parseTableConstructorExpr(init, name);
                // vs code在显示文档符号时，会自动判断各个符号的位置，如果发现某个符号
                // 属于另一个符号的位置范围内，则认为这个符号是另一个符号的子符号，可以
                // 把子符号折叠起来
                // 但lua中允许这种写法 local x, y = {a = 1, b = 2}, 2
                // 这时候如果想让a、b成为x的子符号，那么x的范围就必须包含y，这显然无法
                // 接受，那么这里特殊处理local x = {a = 1, b = 2}这种情况即可
                if (init.loc && 1 === stat.variables.length) {
                    const endLoc = sym.location.range.end;
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
                    line: loc.start.line - 1,
                    character: loc.start.column,
                },
                end: { line: loc.end.line - 1, character: loc.end.column },
            },
        };
    }

    // 记录local MAX = M.X.Y 这种引用
    private static toRefVallue(node: MemberExpression) {
        const refVal: string[] = [];

        let init = node;
        for (let deepth = 0; deepth < 8; deepth++) {
            if (init.indexer !== '.') {
                return;
            }

            refVal.push(init.identifier.name);

            const base = init.base;
            // 最后一个是Identifier而不是MemberExpression
            if (base.type === 'Identifier') {
                refVal.push(base.name);
                break;
            }

            if (base.type !== 'MemberExpression') {
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
    private static stringLiteralValue(val: StringLiteral) {
        if (val.value) {
            return val.value;
        }

        // lua的字符串可能包含在 ''、""、[[]]中
        const raw = val.raw;
        if (raw.startsWith("'") || raw.startsWith('"')) {
            return raw.substring(1, raw.length - 1);
        }

        return raw.substring(2, raw.length - 2);
    }

    private static toConst(expr: Node): string | null {
        switch (expr.type) {
            case 'UnaryExpression':
                return ParseSymbol.toConstUnaryVal(expr);
            case 'BinaryExpression':
                return ParseSymbol.toConstBinaryVal(expr);
            case 'StringLiteral':
                return expr.raw;
            case 'NumericLiteral':
                return expr.raw;
        }

        return null;
    }

    // 把 local a = -1中的-1表达式转换成常量显示
    private static toConstUnaryVal(expr: UnaryExpression) {
        const arg = expr.argument;
        if (arg.type === 'StringLiteral') {
            return expr.operator + ParseSymbol.stringLiteralValue(arg);
        }

        if (arg.type === 'NumericLiteral') {
            return expr.operator + arg.value;
        }

        return null;
    }

    // 把 local a = 1 << 32中的 1 << 32表达式转换成常量显示
    private static toConstBinaryVal(expr: BinaryExpression) {
        // TODO: 这里的字符串格式化可能有问题，AST后，括号去掉了，简单地按左右拼接可能
        // 导致优先级错误
        const left = ParseSymbol.toConst(expr.left);
        const right = ParseSymbol.toConst(expr.right);

        if (left && right) {
            return `${left} ${expr.operator} ${right}`;
        }

        return null;
    }

    public toParseSym(
        nameInfo: NameInfo,
        node: Statement | Expression,
        init?: Statement | Expression,
        local?: LocalType,
    ): VSCodeSymbol {
        return ParseSymbol.toSym(
            nameInfo,
            node,
            this.parseScopeDeepth,
            this.parseUri,
            init,
            local,
        );
    }

    // 构建一个vs code的符号
    // @loc: luaparse中的loc位置结构
    public static toSym(
        nameInfo: NameInfo,
        node: Statement | Expression,
        scope: number,
        uri: string,
        init?: Statement | Expression,
        local?: LocalType,
    ): VSCodeSymbol {
        const loc = node.loc;
        if (!loc) {
            return null;
        }

        // T.t = 99 这种写法，t属于T，故t的作用域不应该为0，但解析时parseScope是为0
        // 只有 T = { t = 99 } 这种写法parseScore才不为0
        if (0 === scope && nameInfo.base) {
            scope = 1;
        }
        const sym: SymInfoEx = {
            name: nameInfo.name,
            base: nameInfo.base,
            indexer: nameInfo.indexer,
            scope: scope,
            kind: SymbolKind.Variable,
            location: ParseSymbol.toLocation(uri, loc),
        };

        const initNode = init || node;
        switch (initNode.type) {
            case 'Identifier': {
                // local N = M 会被视为把模块M本地化为N
                // 在跟踪N的符号时会在M查找
                // 给scope限定一个范围，不然大量的配置会有常量，导致记录太多数据内在激增
                if (sym.scope >= 0 && sym.scope <= 2 && init) {
                    sym.refType = [initNode.name];
                }
                break;
            }
            case 'MemberExpression': {
                if (sym.scope >= 0 && sym.scope <= 2 && init) {
                    sym.refType = ParseSymbol.toRefVallue(initNode);
                }
                break;
            }
            case 'StringLiteral': {
                sym.value = initNode.raw;
                sym.kind = SymbolKind.String;
                break;
            }
            case 'NumericLiteral': {
                sym.value = initNode.raw;
                sym.kind = SymbolKind.Number;
                break;
            }
            case 'BooleanLiteral': {
                sym.value = initNode.raw;
                sym.kind = SymbolKind.Boolean;
                break;
            }
            case 'UnaryExpression': {
                // local a = -1
                const val = ParseSymbol.toConstUnaryVal(initNode);
                if (val) {
                    sym.value = val;
                    sym.kind = SymbolKind.Number;
                }
                break;
            }
            case 'BinaryExpression': {
                // local a = 1 << 2
                const val = ParseSymbol.toConstBinaryVal(initNode);
                if (val) {
                    sym.value = val;
                    sym.kind = SymbolKind.Number;
                }
                break;
            }
            case 'TableConstructorExpression': {
                sym.kind = SymbolKind.Namespace;
                break;
            }
            case 'FunctionDeclaration': {
                sym.kind = SymbolKind.Function;

                sym.parameters = [];
                for (const para of initNode.parameters) {
                    const paramName =
                        'Identifier' === para.type ? para.name : para.value;

                    sym.parameters.push(paramName);
                }
                break;
            }
            case 'CallExpression': {
                // local M = require("x")
                const base = initNode.base;
                if ('Identifier' === base.type && 'require' === base.name) {
                    const arg = initNode.arguments[0];
                    if (arg.type === 'StringLiteral') {
                        sym.refUri = ParseSymbol.stringLiteralValue(arg);
                    }
                }
                break;
            }
            case 'StringCallExpression': {
                // local M = require "x"
                const base = initNode.base;
                if ('Identifier' === base.type && 'require' === base.name) {
                    const arg = initNode.argument;
                    if (arg.type === 'StringLiteral') {
                        sym.refUri = ParseSymbol.stringLiteralValue(arg);
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

    // 正常解析
    private parseText(uri: string, text: string) {
        this.parseUri = uri;
        try {
            const chunk = luaParse(text, this.options);
            this.parseComments = chunk.comments as any as Comment[];
        } catch (e: any) {
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
            Utils.instance().Debug(`${uri} ${e.message}`);
            return false;
        }

        return true;
    }

    // 解析一段代码，如果这段代码有错误，会发给vs code
    public parse(uri: string, text: string, ft: FileParseType): SymInfoEx[] {
        const nodeList = this.rawParse(uri, text, ft);
        if (!nodeList) {
            return [];
        }

        this.parseScopeDeepth = 0;
        for (const node of nodeList) {
            this.parseNode(node);
        }
        ParseSymbol.appendComment(
            this.parseComments,
            this.parseSymList,
            this.parseCodeLine,
        );

        return this.parseSymList;
    }

    // 获取已经解析好的模块信息
    public getParseModule() {
        return this.parseModule;
    }

    // 解析一段代码并查找局部变量
    private rawParse(
        uri: string,
        text: string,
        ft: FileParseType,
    ): Node[] | null {
        // Utils.instance().debug(`rawparse file ${uri}`);

        try {
            const ok =
                0 === (ft & FileParseType.FPT_LARGE)
                    ? this.parseText(uri, text)
                    : this.parseLarge(text);

            if (!ok) {
                return null;
            }
        } catch (e) {
            Utils.instance().anyError(e);
            Utils.instance().error(uri);
        }

        CacheSymbol.instance().updateCache(
            uri,
            this.parseCacheList,
            this.parseComments,
            this.parseCodeLine,
        );

        return this.parseNodeList;
    }

    // 解析大文件
    // 一般是配置文件，为一个很大的lua table，参考测试中的large_conf.lua
    // 只要尝试把这个table名解析出来就好
    private parseLarge(text: string) {
        // 只解析前512个字符，还找不到table名，就放弃
        const head = text.substring(0, 512);
        const parser: luaParser = luaParse(head, {
            locations: true, // 是否记录语法节点的位置(node)
            scope: false, // 是否记录作用域
            wait: true, // 是否等待显示调用end函数
            comments: false, // 是否记录注释
            ranges: true, // 记录语法节点的字符位置(第几个字符开始，第几个结束)
            luaVersion: Setting.instance().getLuaVersion(),
        });

        let token;
        do {
            token = parser.lex();

            if (token.type === LTT.EOF) {
                return false;
            }

            if (token.type === LTT.Keyword && token.value === 'return') {
                return false;
            }

            if (token.type === LTT.Identifier) {
                break;
            }
        } while (token.type !== LTT.EOF);

        const node: AssignmentStatement = {
            type: 'AssignmentStatement',
            variables: [
                {
                    type: 'Identifier',
                    name: token.value,
                    loc: {
                        start: {
                            line: token.line,
                            column: token.range[0] - token.lineStart,
                        },
                        end: {
                            line: token.line,
                            column: token.range[1] - token.lineStart,
                        },
                    },
                },
            ],
            init: [
                {
                    type: 'TableConstructorExpression',
                    fields: [],
                },
            ],
        };

        this.parseNodeList.push(node);
        this.parseCacheList.push(node);
        return true;
    }

    // 对比符号和luaparse的位置
    private static compPos(symLoc: Location, loc: LuaLocation) {
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
    private static getCommentValue(comment: Comment) {
        return comment.raw;
        // 之前是想统一格式化显示的内容，例如--后面必须有一个空格
        // 但是不同写法差异很大，比如有些 ---@param 就变成了 -- -@param
        // if (comment.loc!.start.line === comment.loc!.end.line) {
        //     return "-- " + comment.value.trim();
        // }

        // return `--[[\n${comment.value}]]`;
    }

    private static AppendOneComment(
        symList: SymInfoEx[],
        comments: Comment[],
        begIndex: number,
        index: number,
        continueIndex: number,
        codeLine: number[],
    ) {
        const comment = comments[index];
        if (!comment.loc) {
            return {
                index: begIndex,
                reset: false,
            };
        }

        let reset = false;
        for (let symIndex = begIndex; symIndex < symList.length; symIndex++) {
            const sym = symList[symIndex];
            const comp = ParseSymbol.compPos(sym.location, comment.loc);
            // 注释在当前符号之后了，当前符号之前的都不需要再查找
            if (-1 === comp) {
                begIndex = symIndex;
                continue;
            }

            // 行数相等，为行尾注释
            if (0 === comp) {
                reset = true;
                sym.ctType = CommentType.CT_LINEEND;
                sym.comment = ParseSymbol.getCommentValue(comment);

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
                const line = sym.location.range.start.line;
                if (line < codeLine.length && 1 === codeLine[line]) {
                    continue;
                }
                sym.ctType = CommentType.CT_ABOVE;
                if (-1 === continueIndex) {
                    sym.comment = this.getCommentValue(comment);
                } else {
                    const symComment: string[] = [];
                    for (let idx = continueIndex; idx <= index; idx++) {
                        // 多行注释有对齐，不要去掉空格
                        symComment.push(this.getCommentValue(comments[idx]));
                    }
                    sym.comment = symComment.join('\n');
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
            index: begIndex,
            reset: reset,
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
    public static appendComment(
        comments: Comment[],
        symList: SymInfoEx[],
        codeLine: number[],
    ) {
        let lastSymIndex = 0;

        let continueLine = -1;
        let continueIndex = -1;

        comments.forEach((comment, index) => {
            if (!comment.loc) {
                return;
            }

            // 记录连续多行的注释
            if (
                -1 !== continueIndex &&
                continueLine + 1 === comment.loc.start.line
            ) {
                continueLine = comment.loc.end.line;
            } else {
                continueIndex = -1;
            }

            const ok = ParseSymbol.AppendOneComment(
                symList,
                comments,
                lastSymIndex,
                index,
                continueIndex,
                codeLine,
            );

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
}
