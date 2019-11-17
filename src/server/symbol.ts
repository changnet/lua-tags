// 符号处理

import { g_utils } from "./utils";
import { g_setting, FileParseType } from "./setting";

import {
    Options,
    parse as luaParse,
    Parser as luaParser,

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

import Uri from 'vscode-uri';
import { promises as fs } from "fs";

// luaParser.lex()
// https://github.com/oxyc/luaparse
// type expressed as an enum flag which can be matched with luaparse.tokenTypes.
// 这些没有包里找到定义

export const LuaTokenType = {
    EOF: 1,
    StringLiteral: 2,
    Keyword: 4,
    Identifier: 8,
    NumericLiteral: 16,
    Punctuator: 32,
    BooleanLiteral: 64,
    NilLiteral: 128,
    VarargLiteral: 256
};

// 用于go to definition查询的数据结构
export interface SymbolQuery {
    uri: string; // 要查询的符号在哪个文档
    mdName: string | null; // 模块名，m:test中的m
    symName: string; // 符号名，m:test中的test
    kind: SymbolKind; // 查询的符号是什么类型
    leftWords: string | null; // 光标左边分解得到需要查询的字符串
    position: Position; // 光标位置
    text: string; // 符号所在的整行代码
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

// 在vs code的符号基础上扩展一些字段，方便类型跟踪
export interface SymInfoEx extends SymbolInformation {
    refType?: string; // local N = M时记录引用的类型M
    refUri?: string; // local M = require "x"时记录引用的文件x
    value?: string; // local V = 2这种静态数据时记录它的值
    parameters?: string[]; // 如果是函数，记录其参数
    subSym?: SymInfoEx[]; // 子符号
    base?: string; // M.N时记录模块名M
}

type VSCodeSymbol = SymInfoEx | null;
type SymInfoMap = { [key: string]: SymInfoEx[] };

export class Symbol {
    private static ins: Symbol;

    private options: Options;

    // 是否需要更新全局符号
    private needUpdate: boolean = true;

    // 全局符号缓存，CTRL + T用的
    private globalSymbol: SymInfoMap = {};

    // 全局模块缓存，方便快速查询符号 identifier
    private globalModule: SymInfoMap = {};

    // 各个文档的符号缓存，uri为key
    private documentSymbol: SymInfoMap = {};
    // 各个文档的符号缓存，第一层uri为key，第二层模块名为key
    private documentModule: { [key: string]: SymInfoMap } = {};

    // 下面是一些解析当前文档的辅助变量
    private parseUri: string = "";
    private parseScopeDeepth: number = 0;
    private parseNodeList: Node[] = [];
    private parseSymList: SymInfoEx[] = [];
    // 各个文档的符号缓存，ider名为key
    private parseModule: { [key: string]: SymInfoEx[] } = {};

    private pathSlash: string = "/";

    private parseOptSub = false; // 是否解析子符号
    private parseOptAnonymous = false; // 是否解析匿名符号

    private constructor() {
        this.options = {
            locations: true, // 是否记录语法节点的位置(node)
            scope: true, // 是否记录作用域
            wait: false, // 是否等待显示调用end函数
            comments: false, // 是否记录注释
            ranges: true, // 记录语法节点的字符位置(第几个字符开始，第几个结束)
            luaVersion: g_setting.luaVersion,
            onCreateScope: () => this.onCreateScope(),
            onDestroyScope: () => this.onDestoryScope(),
            onCreateNode: (node) => this.onCreateNode(node)
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
        // 不是全局或者模块中的符号，不用解析
        if (this.parseScopeDeepth > g_setting.scopeDeepth) {
            return;
        }

        // g_utils.log(`onc onCreateNode ========== ${JSON.stringify(node)}`);
        switch (node.type) {
            case "FunctionDeclaration": // 函数
            case "LocalStatement": // local变量赋值 local var = x
            case "AssignmentStatement": // 全局变量 g_var = x 成员变量赋值 M.var = x
            case "ReturnStatement": // return { a = 111 } 这种情况
                this.parseNodeList.push(node);
                break;
        }
    }

    // 解析节点
    private parseNode(node: Node) {
        let symList;
        switch (node.type) {
            case "FunctionDeclaration": // 函数
                symList = this.parseFunctionExpr(node);
                break;
            case "LocalStatement": // local变量
            case "AssignmentStatement": // 全局变量
                symList = this.parseVariableStatement(node);
                break;
            case "ReturnStatement": // return { a = 111 } 这种情况
                symList = this.parseReturnStatement(node);
                break;
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
        ider: Identifier | MemberExpression | IndexExpression | null) {
        let baseName = { name: "", base: "" };
        if (!ider) {
            return baseName;
        }

        if (ider.type === "Identifier") {
            // function test() 这种直接声明函数的写法
            baseName.name = ider.name;
        }
        else if (ider.type === "MemberExpression") {
            // function m:test()、M.val = xxx 或者 function m.test() 这种成员函数写法
            baseName.name = ider.identifier.name;
            // 用json打印出来，这里明明有个name，但是导出的符号里没有
            baseName.base = (ider.base as any).name;
        }
        // IndexExpression是list[idx]这种，暂时没用到

        return baseName;
    }

    // 把一个解析好的符号存到临时解析数组
    private pushParseSymbol(sym: SymInfoEx) {
        this.parseSymList.push(sym);
        if (sym.subSym) {
            for (let subSym of sym.subSym) {
                this.parseSymList.push(subSym);
            }
        }

        const base = sym.base;
        if (base) {
            if (!this.parseModule[base]) {
                this.parseModule[base] = [];
            }
            this.parseModule[base].push(sym);
        }
    }

    // 解析一个表达式
    private parseOneExpression(expr: Expression): SymInfoEx[] {
        switch (expr.type) {
            case "FunctionDeclaration": {
                return this.parseFunctionExpr(expr);
            }
            case "TableConstructorExpression": {
                return this.parserTableConstructorExpr(expr);
            }
        }

        return [];
    }

    private parseOneStatement(stat: Statement): SymInfoEx[] {
        let symList: SymInfoEx[] = [];
        switch (stat.type) {
            case "LocalStatement":
            case "AssignmentStatement": {
                return this.parseVariableStatement(stat);
            }
            case "ReturnStatement": {
                // 处理 return function(a,b,c) ... end 这种情况
                for (let sub of stat.arguments) {

                }
                break;
            }
            case "IfStatement": break;
            case "WhileStatement": break;
            case "DoStatement": break;
            case "RepeatStatement": break;
            case "FunctionDeclaration": break;
            case "ForNumericStatement": break;
            case "ForGenericStatement": break;
        }

        return [];
    }

    // 解析函数的子符号
    private parseStatement(states: Statement[]): SymInfoEx[] {
        let symList: SymInfoEx[] = [];
        for (let stat of states) {

        }

        return symList;
    }

    // 解析函数声明
    private parseFunctionExpr(expr: FunctionDeclaration): SymInfoEx[] {
        // return function() ... end 这种匿名函数没有identifier
        let baseName = this.parseBaseName(expr.identifier);
        if ("" === baseName.name && !this.parseOptAnonymous) {
            return [];
        }

        let sym = this.toSym(baseName.name, expr, undefined, baseName.base);
        if (!sym) {
            return [];
        }

        if (sym && this.parseOptSub) {
            sym.subSym = this.parseStatement(expr.body);
        }

        return [sym];
    }

    // 解析子变量
    // local M = { a= 1, b = 2} 这种const变量，也当作变量记录到文档中
    private parserTableConstructorExpr(expr: TableConstructorExpression) {
        let symList: SymInfoEx[] = [];
        for (let field of expr.fields) {
            // local M = { 1, 2, 3}这种没有key对自动补全、跳转都没用,没必要处理
            // local M = { a = 1, [2] = 2}这种就只能处理有Key的那部分了
            if (("TableKey" !== field.type && "TableKeyString" !== field.type)
                || "Identifier" !== field.key.type) {
                continue;
            }

            let sym = this.toSym(field.key.name, field.value);

            if (sym) { symList.push(sym); }
        }

        return symList;
    }

    // 解析 return
    private parseReturnStatement(node: ReturnStatement) {
        for (let argument of node.arguments) {
            // 如果是用来显示文档符号的，只处理 return {}
            if (!this.parseOptSub
                && "TableConstructorExpression" === argument.type) {
                return this.parserTableConstructorExpr(argument);
            }

            // parseOptSub是用来处理局部符号的，只处理return function() ... end
            if ("FunctionDeclaration" === argument.type) {
                return this.parseFunctionExpr(argument);
            }

        }

        return [];
    }

    // 解析变量声明
    private parseVariableStatement(
        stat: LocalStatement | AssignmentStatement, isSub: boolean = false) {
        let symList: SymInfoEx[] = [];
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            let varNode = stat.variables[index];
            let baseName = this.parseBaseName(varNode);

            let name = baseName.name;
            if ("" === name && !this.parseOptAnonymous) {
                continue;
            }

            const init = stat.init[index];
            let sym = this.toSym(name, varNode, init);
            if (!sym) {
                continue;
            }
            symList.push(sym);

            if (isSub) {
                sym.subSym = this.parseOneExpression(init);
                continue;
            }

            // 把 local M = { A = 1,B = 2}中的 A B符号解析出来
            // 因为常量声明在lua中很常用，显示出来比较好，这里特殊处理下
            if (!sym || "TableConstructorExpression" !== init.type) {
                continue;
            }

            sym.subSym = this.parserTableConstructorExpr(init);
        }

        return symList;
    }

    // 构建一个vs code的符号
    // @loc: luaparse中的loc位置结构
    private toSym(name: string, node: Statement | Expression,
        init?: Statement | Expression, base?: string): VSCodeSymbol {
        const loc = node.loc;
        if (!loc) {
            return null;
        }

        let sym: SymInfoEx = {
            name: name,
            base: base,
            kind: SymbolKind.Variable,
            location: {
                uri: this.parseUri,
                range: {
                    start: {
                        line: loc.start.line - 1, character: loc.start.column
                    },
                    end: { line: loc.end.line - 1, character: loc.end.column }
                }
            }
        };

        let initNode = init || node;
        switch (initNode.type) {
            case "Identifier": {
                // 在顶层作用域中 local N = M 会被视为把模块M本地化为N
                // 在跟踪N的符号时会在M查找
                // 如果是local M = M这种同名的，则不处理，反正都是根据名字去查找
                if (1 === this.parseScopeDeepth) {
                    if (name !== initNode.name) {
                        sym.refType = initNode.name;
                    }
                }
                break;
            }
            case "StringLiteral": {
                sym.value = initNode.value;
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
            case "TableConstructorExpression": {
                sym.kind = SymbolKind.Module;
                break;
            }
            case "FunctionDeclaration": {
                sym.kind = SymbolKind.Function;

                sym.parameters = [];
                for (let para of initNode.parameters) {
                    // function(a, ...) a是name
                    if ("Identifier" === para.type) {
                        sym.parameters.push(para.name);
                    }
                    else if ("VarargLiteral" === para.type) {
                        sym.parameters.push(para.value);
                    }
                }
                break;
            }
            case "CallExpression": {// local M = require("x")
                let base = initNode.base;
                if ("Identifier" === base.type && "require" === base.name) {
                    let arg = initNode.arguments[0];
                    if (arg.type === "StringLiteral") {
                        sym.refUri = arg.value;
                    }
                }
                break;
            }
            case "StringCallExpression": {// local M = require "x"
                let base = initNode.base;
                if ("Identifier" === base.type && "require" === base.name) {
                    let arg = initNode.argument;
                    if (arg.type === "StringLiteral") {
                        sym.refUri = arg.value;
                    }
                }
                break;
            }

        }

        return sym;
    }

    // 更新全局符号缓存
    private updateGlobal() {
        let globalSymbol: SymInfoMap = {};
        let globalModule: SymInfoMap = {};

        for (let uri in this.documentSymbol) {
            for (let sym of this.documentSymbol[uri]) {
                if (!globalSymbol[sym.name]) {
                    globalSymbol[sym.name] = [];
                }

                globalSymbol[sym.name].push(sym);
            }
        }

        for (let uri in this.documentModule) {
            for (let name in this.documentModule[uri]) {
                globalModule[name] = [];
                let moduleList = globalModule[name];
                for (let sym of this.documentModule[uri][name]) {
                    moduleList.push(sym);
                }
            }
        }

        this.needUpdate = false;
        this.globalSymbol = globalSymbol;
        this.globalModule = globalModule;
    }

    // 获取某个模块的符号
    public getGlobalModule(mdName: string) {
        if (this.needUpdate) { this.updateGlobal(); }

        return this.globalModule[mdName];
    }

    // 正常解析
    private parseText(uri: string, text: string) {
        try {
            luaParse(text, this.options);
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

            g_utils.diagnostics(uri, [diagnostic]);
            */
            return false;
        }

        return true;
    }

    // 解析一段代码，如果这段代码有错误，会发给vs code
    public parse(uri: string, text: string): SymbolInformation[] {
        let ft = g_setting.getFileType(uri, text.length);
        if (FileParseType.FPT_NONE === ft) {
            return [];
        }

        this.parseUri = uri;
        this.parseScopeDeepth = 0;
        this.parseNodeList = [];
        this.parseSymList = [];
        this.parseModule = {};

        this.parseOptSub = false; // 是否解析子符号
        this.parseOptAnonymous = false; // 是否解析匿名符号

        let ok = (0 === (ft & FileParseType.FPT_LARGE)) ?
            this.parseText(uri, text) : this.parseLarge(text);
        if (!ok) {
            return [];
        }

        for (let node of this.parseNodeList) {
            this.parseNode(node);
        }

        // 不是工程文件，不要把符号添加到工程里
        if (0 !== (FileParseType.FPT_SINGLE & ft)) {
            return this.parseSymList;
        }

        // 解析成功，更新缓存，否则使用旧的
        this.documentSymbol[uri] = this.parseSymList;
        this.documentModule[uri] = this.parseModule;

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalModule = {};
        this.globalSymbol = {};
        this.needUpdate = true;

        return this.parseSymList;
    }

    // 获取所有文档的uri
    public getAllDocUri() {
        return Object.keys(this.documentSymbol);
    }

    // 删除某个文档的符号
    public delDocumentSymbol(uri: string) {
        delete this.documentSymbol[uri];
        delete this.documentModule[uri];

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalModule = {};
        this.globalSymbol = {};
        this.needUpdate = true;
    }

    // 获取某个文档的符号
    public getDocumentSymbol(uri: string): SymbolInformation[] | null {
        let symList: SymbolInformation[] = this.documentSymbol[uri];

        return symList;
    }

    // 获取某个文档里的某个模块
    public getDocumentModule(uri: string, mdName: string) {
        let mdMap = this.documentModule[uri];
        if (!mdMap) { return null; }

        return mdMap[mdName];
    }

    // 获取全局符号
    public getGlobalSymbol(query?: string): SymbolInformation[] {
        if (this.needUpdate) {
            this.updateGlobal();
        }

        let symList: SymbolInformation[] = [];
        for (let name in this.globalSymbol) {
            for (let sym of this.globalSymbol[name]) {
                if (!query || sym.name === query) { symList.push(sym); }
            }
        }
        return symList;
    }

    // 解析根目录的所有lua文件
    public async parseRoot(path: string) {
        // TODO:没打开目录时没有rootPath，后面再处理
        // 使用和vs code一样的路径分隔符，不然无法根据uri快速查询符号
        if (-1 === path.indexOf(this.pathSlash)) {
            this.pathSlash = "\\";
        }

        await this.parseDir(path);
    }

    // 解析单个目录的Lua文件
    private async parseDir(path: string) {
        // 当使用 withFileTypes 选项设置为 true 调用 fs.readdir() 或
        // fs.readdirSync() 时，生成的数组将填充 fs.Dirent 对象，而不是路径字符串
        let files = await fs.readdir(path, { withFileTypes: true });

        for (let file of files) {
            let subPath = `${path}${this.pathSlash}${file.name}`;

            if (file.isDirectory()) {
                await this.parseDir(subPath);
            }
            else if (file.isFile()) {
                await this.parseFile(subPath);
            }
        }
    }

    // 解析单个Lua文件
    public async parseFile(path: string) {
        if (!path.endsWith(".lua")) { return; }

        // uri总是用/来编码，在win下，路径是用\的
        // 这时编码出来的uri和vs code传进来的就会不一样，无法快速根据uri查询符号
        const uri = Uri.from({
            scheme: "file",
            path: "/" !== this.pathSlash ? path.replace(/\\/g, "/") : path
        }).toString();

        let data = await fs.readFile(path);

        //g_utils.log(data.toString())
        this.parse(uri, data.toString());
    }

    // 查找经过本地化的原符号uri
    public getRawUri(uri: string, mdName: string): string {
        // 模块名为self则是当前文档self:test()这种用法
        if ("self" === mdName) { return uri; }

        const symList = this.documentSymbol[uri];
        if (!symList) {
            return uri;
        }

        let sym;
        for (let one of symList) {
            if (one.name === mdName) {
                sym = one;
            }
        }
        if (!sym) {
            return uri;
        }

        // local M = require "abc" 这种用法
        if (sym.refUri) {
            return this.getRequireUri(sym.refUri);
        }

        // local N = M 这种用法
        if (sym.refType) {
            let symList = this.getGlobalModule(sym.refType);
            // 如果查找到模块名为M的在多个文件，那
        }

        // 都找不到，默认查找当前文档
        return uri;
    }

    // 查找经过本地化的原符号名字
    public getRawModule(uri: string, mdName: string): string {
        // 模块名为self则是当前文档self:test()这种用法
        if ("self" === mdName) { return mdName; }

        const symList = this.documentSymbol[uri];
        if (!symList) {
            return mdName;
        }

        let sym;
        for (let one of symList) {
            if (one.name === mdName) {
                sym = one;
            }
        }
        if (!sym) {
            return mdName;
        }

        // local N = M 这种用法
        // 都找不到，默认查找当前文档
        return sym.refType || mdName;
    }

    // 检测是否结束作用局域
    // 当遇到本地函数:local function 或者 全局函数:function 时结束
    private isLocalScopeEnd(token: Token,
        last: Token | null, text: string[], line: number): boolean {
        // 遇到 function行首的，是函数声明，作用域已经结束，不再查找
        // return function或者 var = function这种则继续查找upvalue
        if (token.value !== "function"
            || token.type !== LuaTokenType.Keyword) {
            return false;
        }

        // local function
        if (last && last.value === "local"
            && last.type === LuaTokenType.Keyword) {
            return true;
        }

        // 没有last，则表明function在行首的，简单处理下面这种换行
        // local x =
        //      function()
        // 加了注释的情况，暂时不考虑。如果要处理这里得用lexer来解析了
        while (line >= 0) {
            line = line - 1;
            let lineText = text[line];
            if (lineText.length > 0) {
                let isMatch = lineText.match(/[return|=]\s*$/g);
                return isMatch ? false : true;
            }
        }

        return false;
    }

    // 解析对应符号的词法
    // 返回 m = ... 之后 ... 的词法
    private parseLexerToken(mdName: string, text: string[]): Token[] {
        if (text.length <= 0) { return []; }

        // 反向一行行地查找符号所在的位置
        let line = text.length - 1;
        let foundToken: Token[] = [];
        // 注意下，这里用一个parser持续write得到的token值是对的
        // 但token里的line和range是错的，不过这里没用到位置信息可以这样用
        // 正确的用法是每行创建一个parser
        let parser: luaParser = luaParse("", { wait: true });
        do {
            parser.write(text[line]);

            let last = null;
            let found = false;
            let token: Token | null = null;

            do {
                token = parser.lex();

                // 记录查询到的符号后面的词法
                // m = M()查询m将记录= m()这几个词法
                // 当然有可能会出现换行，这里也不考虑
                if (found && token.type !== LuaTokenType.EOF) {
                    foundToken.push(token);
                }

                if (this.isLocalScopeEnd(token, last, text, line)) { return []; }

                // 查询到对应的符号赋值操作 m = ...
                if (token.value === mdName
                    && token.type === LuaTokenType.Identifier) {
                    token = parser.lex();
                    if (token.value === "="
                        && token.type === LuaTokenType.Punctuator) {
                        found = true;
                    }
                    continue;
                }

                last = token;
            } while (token.type !== LuaTokenType.EOF);

            if (found) { break; }

            line--;
        } while (line >= 0);

        return foundToken;
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
        path = this.toUriFormat(path);

        // 在所有uri里查询匹配的uri
        // 由于不知道项目中的path设置，因此这个路径其实可长可短
        // 如果项目中刚好有同名文件，而且刚好require的路径无法区分，那也没办法了
        for (let uri in this.documentModule) {
            if (uri.endsWith(`${path}.lua`)) { return uri; }
        }

        return "";
    }

    // 获取 m = require("xxx")对应的模块名
    private getRequireFromLexer(token: Token[]): string | null {
        if (token.length < 2 || "require" !== token[0].value) { return null; }

        let path = token[1].value; // m = require "xxx"
        if (token[1].type !== LuaTokenType.StringLiteral) {
            // m = require("xxx")
            if (token.length < 4
                || token[3].type !== LuaTokenType.StringLiteral) {
                return null;
            }
            path = token[3].value;
        }

        // 这个路径，可能是 a.b.c a/b/c a\b\c 这三种形式，把路径转换为uri形式
        return this.getRequireUri(path);
    }

    /* local M = GlobalSymbol
     * M:test()
     * 查询局部模块名M真正的模块名GlobalSymbol，注意只是局部的，比如一个函数里的。
     * 不查询整个文档local化的那种，那种在上面的getDocumentIderDefinition处理
     */
    public getLocalRawModule(mdName: string, text: string[]) {
        let token = this.parseLexerToken(mdName, text);

        // 尝试根据下面几种情况推断出真正的类型
        // 1. 全局本地化: m = M
        // 2. 通过__call创建新对象: m = M()
        // 3. 通过new函数创建对象: m = M.new()
        // 4. require引用: m = require "xxx"
        if (token.length <= 0) { return null; }

        if (token[0].type !== LuaTokenType.Identifier) { return null; }

        let newModuleName = token[0].value;
        // 1. 全局本地化: m = M
        if (1 === token.length) {
            return { uri: null, mdName: newModuleName };
        }

        // 4. require引用: m = require "xxx"
        // require 只能定位到uri，m这个不一定是模块名
        if ("require" === newModuleName) {
            let uri = this.getRequireFromLexer(token);
            if (!uri) { return null; }

            return {
                uri: uri,
                mdName: null
            };
        }

        if (token.length < 2) { return null; }

        // 2. 通过__call创建新对象: m = M()
        // 当然很多情况下，也有可能是 m = get_something()这样调用普通函数，这时
        // 不过get_somthing这个函数一般不会和模块名相同，所以也不会有太大问题，反正
        // 也无法继续推断m的类型了
        if (token[1].value === "("
            && token[1].type === LuaTokenType.Punctuator) {
            return { uri: null, mdName: newModuleName };
        }

        if (token.length < 4) { return null; }

        // 3. 通过new函数创建对象: m = M.new()
        // 如果有人定义了一个普通函数也叫new，那就会出错
        if (token[1].value === "."
            && token[1].type === LuaTokenType.Punctuator
            && (token[2].value === "new" || token[2].value === "new")
            && token[2].type === LuaTokenType.Identifier
            && token[3].value === "("
            && token[3].type === LuaTokenType.Punctuator) {
            return { uri: null, iderName: newModuleName };
        }

        return null;
    }


    // 获取局部变量位置
    public parselocalSymLocation(uri: string, symName: string, text: string[]) {
        if (text.length <= 0) { return []; }

        // 反向一行行地查找符号所在的位置
        let line = text.length - 1;
        let found: Token | null = null;
        // 用一个全局parser的话,token的range不准确
        //let parser: luaParser = luaParse("",{ wait: true })
        do {
            //parser.write(text[line]);
            let parser: luaParser = luaParse(text[line], { wait: true });
            // parser.write("\n");

            let last = null;
            let stop = false;
            let token: Token | null = null;

            do {
                token = parser.lex();

                // 作用域结束，但这个符号仍有可能是这个函数的参数，继续查找这一行
                if (this.isLocalScopeEnd(token, last, text, line)) { stop = true; }

                // 查询到对应的符号声明 local m
                if (token.value === symName
                    && token.type === LuaTokenType.Identifier) {
                    found = token;
                    found.line = line;
                    if (last && last.value === "local"
                        && last.type === LuaTokenType.Keyword) {
                        stop = true;
                        break;
                    }
                }

                last = token;
            } while (token.type !== LuaTokenType.EOF);

            if (stop) { break; }

            line--;
        } while (line >= 0);

        if (!found) { return null; }

        return Location.create(uri, {
            start: { line: found.line, character: found.range[0] },
            end: { line: found.line, character: found.range[1] }
        });
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
            luaVersion: g_setting.luaVersion
        });

        let token;
        do {
            token = parser.lex();

            if (token.type === LuaTokenType.EOF) {
                return false;
            }

            if (token.type === LuaTokenType.Keyword
                && token.value === "return") {
                return false;
            }

            if (token.type === LuaTokenType.Identifier) {
                break;
            }
        } while (token.type !== LuaTokenType.EOF);

        let node: LocalStatement = {
            "type": "LocalStatement",
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
        return true;
    }
}
