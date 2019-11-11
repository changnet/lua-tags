// 符号处理

import { g_utils } from "./utils";
import { g_setting, FileType } from "./setting";

import {
    Options,
    parse as luaParse,
    Parser as luaParser,

    Node,
    Identifier,
    FunctionDeclaration,
    LocalStatement,
    MemberExpression,
    AssignmentStatement,
    Token,
    Expression,
    IndexExpression
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

// lua符号数据结构 M.val
interface SymIdentifier {
    name: string | null; // 变量名val
    base: string | null; // 模块名M
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

type NodeCache = { [key: string]: Node };
type VSCodeSymbol = SymbolInformation | null;
type VariableStatement = LocalStatement | AssignmentStatement;
type SymInfoMap = { [key: string]: SymbolInformation[] };

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
    // 各个文档的符号缓存，第一层uri为key，第二层ider名为key
    private documentModule: { [key: string]: SymInfoMap } = {};
    // 各个文档的语法节点缓存，uri为key
    private documentNode: { [key: string]: NodeCache } = {};

    // 下面是一些解析当前文档的辅助变量
    private parseUri: string = "";
    private parseScopeDeepth: number = 0;
    private parseNodeList: Node[] = [];
    private parseSymList: SymbolInformation[] = [];
    // 各个文档的符号缓存，ider名为key
    private parseModule: { [key: string]: SymbolInformation[] } = {};

    private pathSlash: string = "/";

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
                this.parseNodeList.push(node);
                break;
        }
    }

    // 解析节点
    private parseNode(node: Node) {
        switch (node.type) {
            case "FunctionDeclaration": // 函数
                this.parseFunctionNode(node);
                break;
            case "LocalStatement": // local变量
            case "AssignmentStatement": // 全局变量
                this.parseVariableStatement(node);
                break;
        }
    }

    // 解析成员变量赋值
    private parseIdentifier(ider: Identifier | MemberExpression | IndexExpression): SymIdentifier {
        let name: string | null = null;
        let base: string | null = null;
        if (ider.type === "Identifier") {
            // function test() 这种直接声明函数的写法
            name = ider.name;
        }
        else if (ider.type === "MemberExpression") {
            // function m:test()、M.val = xxx 或者 function m.test() 这种成员函数写法
            name = ider.identifier.name;
            // 用json打印出来，这里明明有个name，但是导出的符号里没有
            base = (ider.base as any).name;
        }

        return { name: name, base: base };
    }

    // 把一个解析好的符号存到临时解析数组
    private pushParseSymbol(ider: SymIdentifier, sym: SymbolInformation | null) {
        if (!sym) { return; }

        this.parseSymList.push(sym);

        let base = ider.base;
        if (base) {
            if (!this.parseModule[base]) {
                this.parseModule[base] = [];
            }
            this.parseModule[base].push(sym);
        }
    }

    // 解析函数声明
    private parseFunctionNode(node: FunctionDeclaration) {
        let identifier = node.identifier;
        if (!identifier) {
            return;
        }

        let ider = this.parseIdentifier(identifier);

        let name = ider.name;
        if (!name) { return; }

        let sym = this.toSym(this.parseUri, name, SymbolKind.Function, node.loc);
        this.pushParseSymbol(ider, sym);
    }

    // 解析子变量
    // local M = { a= 1, b = 2} 这种const变量，也当作变量记录到文档中
    private parserSubVariable(initExpr: Expression[], index: number) {
        let init = initExpr[index];
        if ("TableConstructorExpression" !== init.type) {
            return [];
        }

        let symList: SymbolInformation[] = [];
        for (let field of init.fields) {
            // local M = { 1, 2, 3}这种没有key对自动补全、跳转都没用,没必要处理
            // local M = { a = 1, [2] = 2}这种就只能处理有Key的那部分了
            if (("TableKey" !== field.type && "TableKeyString" !== field.type)
                || "Identifier" !== field.key.type) {
                continue;
            }

            let kind = this.getVariableKind(field.value.type);
            let sym = this.toSym(
                this.parseUri, field.key.name, kind, field.key.loc);

            symList.push(sym);
        }

        return symList;
    }

    // 解析变量声明
    private parseVariableStatement(node: VariableStatement) {
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let index = 0; index < node.variables.length; index++) {
            let ider = this.parseIdentifier(node.variables[index]);

            let name = ider.name;
            if (!name) { continue; }

            let sym = this.variableToSym(this.parseUri, name, node, index);

            this.pushParseSymbol(ider, sym);

            if (!sym || SymbolKind.Module !== sym.kind) { continue; }

            // 把 local M = { A = 1,B = 2}中的 A B符号解析出来
            if (!this.parseModule[name]) { this.parseModule[name] = []; }
            let subSymList = this.parserSubVariable(node.init, index);

            for (let subSym of subSymList) {
                this.parseSymList.push(subSym);
                this.parseModule[name].push(subSym);
            }
        }
    }

    // 构建一个vs code的符号
    // @loc: luaparse中的loc位置结构
    private toSym(uri: string, name: string, kind: SymbolKind, loc: any): SymbolInformation {
        return {
            name: name,
            kind: kind,
            location: {
                uri: uri,
                range: {
                    start: { line: loc.start.line - 1, character: loc.start.column },
                    end: { line: loc.end.line - 1, character: loc.end.column }
                }
            }
        };
    }

    // 获取变量类型
    private getVariableKind(rawType: string) {
        let kind: SymbolKind = SymbolKind.Variable;

        switch (rawType) {
            case "StringLiteral":
                kind = SymbolKind.String;
                break;
            case "NumericLiteral":
                kind = SymbolKind.Number;
                break;
            case "BooleanLiteral":
                kind = SymbolKind.Boolean;
                break;
            case "TableConstructorExpression":
                kind = SymbolKind.Module;
                break;
            case "FunctionDeclaration":
                kind = SymbolKind.Function;
                break;
        }
        return kind;
    }

    // 把变量声明转换为vs code的符号格式
    private variableToSym(uri: string, name: string,
        node: VariableStatement, index: number): VSCodeSymbol {
        let loc = node.variables[index].loc;
        if (!loc) { return null; }

        let kind: SymbolKind = SymbolKind.Variable;
        if (node.init.length > index) {
            kind = this.getVariableKind(node.init[index].type);
        }

        return this.toSym(uri, name, kind, loc);
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

    // 解析一段代码，如果这段代码有错误，会发给vs code
    public parse(uri: string, text: string): SymbolInformation[] {
        let ft = g_setting.getFileType(uri, text.length);
        if (FileType.FT_NONE === ft) {
            return [];
        }

        this.parseUri = uri;
        this.parseScopeDeepth = 0;
        this.parseNodeList = [];
        this.parseSymList = [];
        this.parseModule = {};

        try {
            luaParse(text, this.options);
        } catch (e) {
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
            return [];
        }

        for (let node of this.parseNodeList) {
            this.parseNode(node);
        }

        // 不是工程文件，不要把符号添加到工程里
        if (FileType.FT_SINGLE === ft) {
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
    private async parseFile(path: string) {
        if (!path.endsWith(".lua")) { return; }

        let stat = await fs.stat(path);
        if (stat.size > g_setting.maxFileSize) { return; }

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

        // local M = require "abc" 这种用法

        // local M = M 这种用法

        // 都找不到，默认查找当前文档
        return uri;
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
}
