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
    mdName?: string; // 模块名，m:test中的m
    symName: string; // 符号名，m:test中的test
    kind: SymbolKind; // 查询的符号是什么类型
    position: QueryPos; //符号位置
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
    scope: number; // 第几层作用域
    refType?: string; // local N = M时记录引用的类型M
    refUri?: string; // local M = require "x"时记录引用的文件x
    value?: string; // local V = 2这种静态数据时记录它的值
    parameters?: string[]; // 如果是函数，记录其参数
    subSym?: SymInfoEx[]; // 子符号
    base?: string; // M.N时记录模块名M
    local?: boolean; // 是否Local符号
}

export type VSCodeSymbol = SymInfoEx | null;
type SymInfoMap = { [key: string]: SymInfoEx[] };

interface NodeCache {
    uri: string;
    nodes: Node[];
}

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

    private openCache = false;
    // 缓存8个文档的符号数据，用于本地符号的查找等
    private docNodeCache = new Array<NodeCache>();

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
            // 如果这个符号包含子符号，则一定被当作模块
            // 目前只有table这样处理
            const base = sym.name;
            if (!this.parseModule[base]) {
                this.parseModule[base] = [];
            }
            for (let subSym of sym.subSym) {
                this.parseSymList.push(subSym);
                this.parseModule[base].push(subSym);
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

    // 解析函数声明
    private parseFunctionExpr(expr: FunctionDeclaration): SymInfoEx[] {
        // return function() ... end 这种匿名函数没有identifier
        let baseName = this.parseBaseName(expr.identifier);
        if ("" === baseName.name) {
            return [];
        }

        let sym = this.toSym(baseName.name, expr, undefined, baseName.base);
        if (!sym) {
            return [];
        }

        return [sym];
    }

    // 解析子变量
    // local M = { a= 1, b = 2} 这种const变量，也当作变量记录到文档中
    private parseTableConstructorExpr(expr: TableConstructorExpression) {
        let symList: SymInfoEx[] = [];

        this.parseScopeDeepth++;
        for (let field of expr.fields) {
            // local M = { 1, 2, 3}这种没有key对自动补全、跳转都没用,没必要处理
            // local M = { a = 1, [2] = 2}这种就只能处理有Key的那部分了
            if (("TableKey" !== field.type && "TableKeyString" !== field.type)
                || "Identifier" !== field.key.type) {
                continue;
            }

            let sym = this.toSym(field.key.name, field.key, field.value);

            if (sym) { symList.push(sym); }
        }
        this.parseScopeDeepth--;

        return symList;
    }

    // 解析 return
    private parseReturnStatement(node: ReturnStatement) {
        for (let argument of node.arguments) {
            // 如果是用来显示文档符号的，只处理 return {}
            if ("TableConstructorExpression" === argument.type) {
                return this.parseTableConstructorExpr(argument);
            }

            // parseOptSub是用来处理局部符号的，只处理return function() ... end
            if ("FunctionDeclaration" === argument.type) {
                return this.parseFunctionExpr(argument);
            }

        }

        return [];
    }

    // 解析变量声明
    private parseVariableStatement(stat: LocalStatement | AssignmentStatement) {
        let symList: SymInfoEx[] = [];
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < stat.variables.length; index++) {
            let varNode = stat.variables[index];
            let baseName = this.parseBaseName(varNode);

            let name = baseName.name;
            if ("" === name) {
                continue;
            }

            const init = stat.init[index];

            let sym = this.toSym(name, varNode, init, baseName.base);
            if (!sym) {
                continue;
            }
            symList.push(sym);

            // 把 local M = { A = 1,B = 2}中的 A B符号解析出来
            // 因为常量声明在lua中很常用，显示出来比较好，这里特殊处理下
            if ("TableConstructorExpression" === init.type) {
                sym.subSym = this.parseTableConstructorExpr(init);
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

    // 构建一个vs code的符号
    // @loc: luaparse中的loc位置结构
    public toSym(name: string, node: Statement | Expression,
        init?: Statement | Expression, base?: string): VSCodeSymbol {
        const loc = node.loc;
        if (!loc) {
            return null;
        }

        let sym: SymInfoEx = {
            name: name,
            base: base,
            scope: this.parseScopeDeepth,
            kind: SymbolKind.Variable,
            location: Symbol.toLocation(this.parseUri, loc),
        };

        let initNode = init || node;
        switch (initNode.type) {
            case "Identifier": {
                // local N = M 会被视为把模块M本地化为N
                // 在跟踪N的符号时会在M查找
                // 如果是local M = M这种同名的，则不处理，反正都是根据名字去查找
                // 仅仅处理文件顶层作用域
                if (0 === sym.scope && name !== initNode.name) {
                    sym.refType = initNode.name;
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

        // 用json打印整个node，发现有isLocal这个字段，但这里只有函数识别出这个字段
        let anyNode = node as any;
        if (initNode.loc) {
            sym.local = anyNode.isLocal;
        }
        return sym;
    }

    // 更新全局符号缓存
    private updateGlobal() {
        let globalSymbol: SymInfoMap = {};
        let globalModule: SymInfoMap = {};

        for (let uri in this.documentSymbol) {
            for (let sym of this.documentSymbol[uri]) {
                // 不在顶层作用域的不放到全局符号，因为太多了，多数是配置
                // 一般都是宏定义或者配置字段，如 M = { a = 1 }这种
                // M:func = funciton() ... end 这种算是顶层的，这些在解析符号处理
                if (sym.scope > 0) {
                    continue;
                }
                const name = sym.name;
                if (!globalSymbol[name]) {
                    globalSymbol[name] = [];
                }

                globalSymbol[name].push(sym);
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
    public parse(uri: string, text: string): SymInfoEx[] {
        let ft = g_setting.getFileType(uri, text.length);
        if (FileParseType.FPT_NONE === ft) {
            return [];
        }

        this.parseSymList = [];
        this.parseModule = {};

        const nodeList = this.rawParse(uri, text);

        this.parseScopeDeepth = 0;
        for (let node of nodeList) {
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

    public setCacheOpen() {
        this.openCache = true;
    }

    public getCache(uri: string): Node[] | null {
        for (const cache of this.docNodeCache) {
            if (uri === cache.uri) {
                return cache.nodes;
            }
        }

        return null;
    }

    // 更新文档缓存
    private updateCache(uri: string, nodes: Node[]) {
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
        this.docNodeCache.push({ uri: uri, nodes: nodes });
    }

    // 解析一段代码并查找局部变量
    public rawParse(uri: string, text: string): Node[] {
        let ft = g_setting.getFileType(uri, text.length);
        if (FileParseType.FPT_NONE === ft) {
            return [];
        }

        this.parseUri = uri;
        this.parseScopeDeepth = 0;
        this.parseNodeList = [];

        let ok = (0 === (ft & FileParseType.FPT_LARGE)) ?
            this.parseText(uri, text) : this.parseLarge(text);

        if (!ok) {
            return [];
        }

        this.updateCache(uri, this.parseNodeList);

        return this.parseNodeList;
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
    public getDocumentSymbol(uri: string): SymInfoEx[] | null {
        let symList: SymInfoEx[] = this.documentSymbol[uri];

        return symList;
    }

    // 获取某个文档里的某个模块
    public getDocumentModule(uri: string, mdName: string) {
        let mdMap = this.documentModule[uri];
        if (!mdMap) { return null; }

        return mdMap[mdName];
    }

    // 获取全局符号
    public getGlobalSymbol(query?: string): SymInfoEx[] {
        if (this.needUpdate) {
            this.updateGlobal();
        }

        let symList: SymInfoEx[] = [];
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
                break;
            }
        }
        if (!sym) {
            return mdName;
        }

        // local N = M 这种用法
        // 都找不到，默认查找当前文档
        return sym.refType || mdName;
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

    public static getSymbolPath(sym: SymInfoEx): string | null {
        const match = sym.location.uri.match(/\/(\w+.\w+)$/);
        return match ? match[1] : null;
    }
}
