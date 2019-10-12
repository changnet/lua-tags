// 符号处理

import { g_utils } from "./utils"
import { g_setting } from "./setting"

import {
    Options,
    parse as luaParse,
    Parser as luaParser,

    Node,
    Identifier,
    FunctionDeclaration,
    LocalStatement,
    AssignmentStatement,
    Token
} from 'luaparse';

import {
    Range,
    Position,
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
import { promises as fs } from "fs"
import { Location } from "vscode";

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
}

// 用于go to definition查询的数据结构
export interface SymbolQuery {
    uri: string; // 要查询的符号在哪个文档
    iderName: string | null; // 模块名，m:test中的m
    symName: string; // 符号名，m:test中的test
    kind: SymbolKind; // 查询的符号是什么类型
    leftWords: string | null; // 光标左边分解得到需要查询的字符串
    position: Position; // 光标位置
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

type NodeCache = { [key: string]: Node }
type VSCodeSymbol = SymbolInformation | null;
type VariableStatement = LocalStatement | AssignmentStatement;
type SymInfoMap = { [key: string]: SymbolInformation[] };

export class Symbol {
    private options: Options;

    // 是否需要更新全局符号
    private needUpdate: boolean = true;

    // 全局符号缓存，CTRL + T用的
    private globalSymbol: SymInfoMap = {};

    // 全局模块缓存，方便快速查询符号 identifier
    private globalIder: SymInfoMap = {}

    // 各个文档的符号缓存，uri为key
    private documentSymbol: SymInfoMap = {};
    // 各个文档的符号缓存，第一层uri为key，第二层ider名为key
    private documentIder: { [key: string]: SymInfoMap } = {};
    // 各个文档的语法节点缓存，uri为key
    private documentNode: { [key: string]: NodeCache } = {};

    // 下面是一些解析当前文档的辅助变量
    private parseUri: string = "";
    private parseScopeDeepth: number = 0;
    private parseNodeList: Node[] = [];
    private parseNodeCache: NodeCache = {}
    private parseSymList: SymbolInformation[] = [];
    // 各个文档的符号缓存，ider名为key
    private parseIder: { [key: string]: SymbolInformation[] } = {};

    private pathSlash: string = "/";

    public constructor() {
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
        if (this.parseScopeDeepth > g_setting.scopeDeepth) return;

        // g_utils.log(`onc onCreateNode ========== ${JSON.stringify(node)}`)
        switch (node.type) {
            case "FunctionDeclaration": // 函数
            case "LocalStatement": // local变量
            case "AssignmentStatement": // 全局变量
                this.parseNodeList.push(node);
                break
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
                this.ParseVariableStatement(node);
                break
        }
    }

    // 解析函数声明
    private parseFunctionNode(node: FunctionDeclaration) {
        let identifier = node.identifier
        if (!identifier) return;

        // g_utils.log(`parse func ${JSON.stringify(node)}`)

        let name: string
        let base: string | null = null
        if (identifier.type == "Identifier") {
            // function test() 这种直接声明函数的写法
            name = identifier.name
        }
        else if (identifier.type == "MemberExpression") {
            // function m:test() 或者 function m.test() 这种成员函数写法
            name = identifier.identifier.name
            // 用json打印出来，这里明明有个name，但是导出的符号里没有
            base = (identifier.base as any).name
        }
        else {
            return;
        }
        this.parseNodeCache[name] = node;

        let sym = this.functionNodeToSym(this.parseUri,name,node)
        if (sym) {
            this.parseSymList.push(sym)
            if (base) {
                if (!this.parseIder[base]) {
                    this.parseIder[base] = [];
                }
                this.parseIder[base].push(sym)
            }
        }
    }

    // 解析变量声明
    private ParseVariableStatement(node: VariableStatement) {
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let variable of node.variables) {
            if (variable.type != "Identifier") continue;

            let name: string = variable.name
            this.parseNodeCache[name] = variable

            let sym = this.variableStatementToSym(this.parseUri,name,node)
            if (sym) {
                this.parseSymList.push(sym)
            }
        }
    }

    // 把luaparse的node转换为vs code的符号格式
    private functionNodeToSym(
        uri: string, name: string, node: FunctionDeclaration): VSCodeSymbol {
        let loc = node.loc
        if (!loc) return null;

        return {
            name: name,
            kind: SymbolKind.Function,
            location: {
                uri: uri,
                range: {
                    start: { line: loc.start.line - 1, character: loc.start.column },
                    end: { line: loc.end.line - 1, character: loc.end.column }
                }
            }
        };
    }

    // 把变量声明转换为vs code的符号格式
    private variableStatementToSym(
        uri: string, name: string, node: VariableStatement): VSCodeSymbol {
            let loc = node.loc
            if (!loc) return null;

            // TODO: 判断一下类型，可能是变量，或者const
            // 为空table或者nil的是变量，为固定table或者数字或者字符串的是const

            return {
                name: name,
                kind: SymbolKind.Variable,
                location: {
                    uri: uri,
                    range: {
                        start: { line: loc.start.line - 1, character: loc.start.column },
                        end: { line: loc.end.line - 1, character: loc.end.column }
                    }
                }
            };
    }

    // 更新全局符号缓存
    private updateGlobal() {
        let globalSymbol: SymInfoMap = {}
        let globalIder: SymInfoMap = {}

        for (let uri in this.documentSymbol) {
            for (let sym of this.documentSymbol[uri]) {
                if (!globalSymbol[sym.name]) {
                    globalSymbol[sym.name] = []
                }

                globalSymbol[sym.name].push(sym)
            }
        }

        for (let uri in this.documentIder) {
            for (let name in this.documentIder[uri]) {
                globalIder[name] = []
                let iderList = globalIder[name]
                for (let sym of this.documentIder[uri][name]) {
                    iderList.push(sym)
                }
            }
        }

        this.globalSymbol = globalSymbol
        this.globalIder = globalIder
    }

    // 解析一段代码，如果这段代码有错误，会发给vs code
    public parse(uri: string, text: string) {
        this.parseUri = uri;
        this.parseScopeDeepth = 0;
        this.parseNodeList = [];
        this.parseSymList = [];
        this.parseNodeCache = {};
        this.parseIder = {}

        try {
            luaParse(text, this.options);
        } catch(e) {
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

            g_utils.diagnostics(uri,[diagnostic]);
            return
        }

        for (let node of this.parseNodeList) {
            this.parseNode(node)
        }

        // 解析成功，更新缓存，否则使用旧的
        this.documentSymbol[uri] = this.parseSymList;
        this.documentNode[uri] = this.parseNodeCache;
        this.documentIder[uri] = this.parseIder;

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalIder = {}
        this.globalSymbol = {}
        this.needUpdate = true

        //g_utils.log(`parse done ${JSON.stringify(this.parseSymList)}`)
    }

    // 获取某个文档的符号
    public getDocumentSymbol(uri: string): SymbolInformation[] {
        let symList: SymbolInformation[] = this.documentSymbol[uri]

        return symList ? symList : []
    }

    // 获取全局符号
    public getGlobalSymbol(query: string): SymbolInformation[] {
        if (this.needUpdate) {
            this.updateGlobal();
        }

        g_utils.log(`check global log:${JSON.stringify(this.globalSymbol)}`)

        let symList: SymbolInformation[] = []
        for (let name in this.globalSymbol) {
            // TODO:这里匹配一下query，甚至做下模糊匹配
            // 全部发给vs code的话，vs code自己会匹配
            for (let sym of this.globalSymbol[name]) {
                symList.push(sym)
            }
        }
        return symList;
    }

    // 解析根目录的所有lua文件
    public async parseRoot(path: string) {
        // TODO:没打开目录时没有rootPath，后面再处理
        // 使用和vs code一样的路径分隔符，不然无法根据uri快速查询符号
        if ( -1 == path.indexOf(this.pathSlash)) {
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
            let subPath = `${path}${this.pathSlash}${file.name}`

            if (file.isDirectory()) {
                await this.parseDir(subPath)
            }
            else if (file.isFile()) {
                await this.parseFile(subPath)
            }
        }
    }

    // 解析单个Lua文件
    private async parseFile(path: string) {
        if (!path.endsWith(".lua")) return;

        let stat = await fs.stat(path)
        if (stat.size > g_setting.maxFileSize) return;

        // uri总是用/来编码，在win下，路径是用\的
        // 这时编码出来的uri和vs code传进来的就会不一样，无法快速根据uri查询符号
        const uri = Uri.from({
            scheme: "file",
            path: "/" != this.pathSlash ? path.replace(/\\/g,"/") : path
        }).toString()

        let data = await fs.readFile(path)

        //g_utils.log(data.toString())
        this.parse(uri,data.toString())
    }

    private checkSymDefinition(
        symList: SymbolInformation[] | null, symName: string, kind: SymbolKind) {
        if (!symList) return null;

        let loc: Definition = []
        for (let sym of symList) {
            if (sym.name == symName) loc.push(sym.location);
        }

        if (loc.length > 0) return loc;

        return null;
    }

    // 根据模块名(iderName)查找符号
    // 在Lua中，可能会出现局部变量名和全局一致，这样就会出错。
    // 暂时不考虑这种情况，真实项目只没见过允许这种写法的
    public getGlobalIderDefinition(query: SymbolQuery) {
        let iderName = query.iderName
        if (!iderName || "self" == iderName) return null;

        if (this.needUpdate) this.updateGlobal();

        return this.checkSymDefinition(
            this.globalIder[iderName],query.symName,query.kind)
    }

    // 查找经过本地化的原符号uri
    private getRawUri(uri: string, iderName: string): string {
        // 模块名为self则是当前文档self:test()这种用法
        if ("self" == iderName) return uri;

        // local M = require "abc" 这种用法

        // local M = M 这种用法

        // 都找不到，默认查找当前文档
        return uri
    }

    // 根据模块名查找某个文档的符号位置
    public getDocumentIderDefinition(query: SymbolQuery) {
        let iderName = query.iderName
        if (!iderName) return null;

        let rawUri = this.getRawUri(query.uri,iderName)

        let iderMap = this.documentIder[rawUri]
        if (!iderMap) return null;

        return this.checkSymDefinition(
            iderMap[iderName],query.symName,query.kind)
    }

    // 解析对应符号的词法
    private parseLexerToken(iderName: string,text: string[]):Token[] {
        if (text.length <= 0) return [];

        // 反向一行行地查找符号所在的位置
        let line = text.length - 1
        let foundToken: Token[] = [];
        let parser: luaParser = luaParse("",{ wait: true })
        do {
            parser.write(text[line])

            let found = false;
            let tokenIndex = 0;
            let token: Token | null = null
            do {
                tokenIndex ++;
                token = parser.lex();

                // g_utils.log(`lex ${JSON.stringify(token)}`)

                // 遇到 function行首的，是函数声明，作用域已经结束，不再查找
                // return function或者 var = function这种则继续查找upvalue
                // 对于刚好换行导致function在行首的，暂不考虑
                if (1 == tokenIndex
                    && token.type == LuaTokenType.Keyword
                    && token.value == "function") {
                    return [];
                }

                // 查询到对应的符号
                if (token.type == LuaTokenType.Identifier
                    && token.value == iderName) {
                    found = true;
                    continue;
                }

                // 记录查询到的符号后面的词法
                // m = M()查询m将记录= m()这几个词法
                // 当然有可能会出现换行，这里也不考虑
                if (found && token.type != LuaTokenType.EOF ) {
                    foundToken.push(token)
                }
            } while (token && token.type != LuaTokenType.EOF)

            line --;
        } while (line >= 0);

        return foundToken
    }

    // 获取 require("a.b.c") 中 a.b.c 路径的uri形式
    private getRequireUri(path: string): string {
        // 这个路径，可能是 a.b.c a/b/c a\b\c 这三种形式
        // uri总是使用a/b/c这种形式
        path = path.replace(/\\/g,"/");
        path = path.replace(/./g,"/");

        // 在所有uri里查询匹配的uri
        // 由于不知道项目中的path设置，因此这个路径其实可长可短
        // 如果项目中刚好有同名文件，而且刚好require的路径无法区分，那也没办法了
        for ( let uri in this.documentIder) {
            if (uri.match(/.lua/g)) return uri
        }

        return ""
    }

    // 获取 m = require("xxx")对应的模块名
    private getRequireFromLexer(token: Token[]): string | null {
        if (token.length < 4 || "require" != token[2].value) return null;

        let path = token[3].value // m = require "xxx"
        if (token[3].type != LuaTokenType.StringLiteral) {
            // m = require("xxx")
            if (token.length < 5
                || token[4].type != LuaTokenType.StringLiteral) {
                return null;
            }
            path = token[4].value
        }

        // 这个路径，可能是 a.b.c a/b/c a\b\c 这三种形式，把路径转换为uri形式
        return this.getRequireUri(path);
    }

    /* local M = GlobalSymbol
     * M:test()
     * 查询局部模块名M真正的模块名GlobalSymbol，注意只是局部的，比如一个函数里的。
     * 不查询整个文档local化的那种，那种在上面的getDocumentIderDefinition处理
     */
    private getLocalRawIder(iderName: string, text: string[]) {
        let token = this.parseLexerToken(iderName,text)

        // 尝试根据下面几种情况推断出真正的类型
        // 1. 全局本地化: m = M
        // 2. 通过__call创建新对象: m = M()
        // 3. 通过new函数创建对象: m = M.new()
        // 4. require引用: m = require "xxx"
        if (token.length < 2 || "=" != token[0].value ) return null;

        if (token[1].type != LuaTokenType.Identifier) return null;

        let newIderName = token[1].value

        // 4. require引用: m = require "xxx"
        // require 只能定位到uri，m这个不一定是模块名
        if ("require" == newIderName) {
            let uri = this.getRequireFromLexer(token)
            if (!uri)  return null;

            return {
                uri: uri,
                iderName: null
            }
        }

        if (token.length < 3) return null;

        // 2. 通过__call创建新对象: m = M()
        // 当然很多情况下，也有可能是 m = get_something()这样调用普通函数，这时
        // 不过get_somthing这个函数一般不会和模块名相同，所以也不会有太大问题，反正
        // 也无法继续推断m的类型了
        if (token[2].value == "("
            && token[2].type == LuaTokenType.Punctuator) {
            return { uri: null,iderName: newIderName};
        }

        if (token.length < 5) return null;

        // 3. 通过new函数创建对象: m = M.new()
        // 如果有人定义了一个普通函数也叫new，那就会出错
        if (token[2].value == "."
            && token[2].type == LuaTokenType.Punctuator
            && (token[3].value == "new" || token[3].value == "new")
            && token[3].type == LuaTokenType.Identifier
            && token[4].value == "("
            && token[4].type == LuaTokenType.Punctuator) {
            return { uri: null,iderName: newIderName};
        }

        return null;
    }

    // 根据模块名查询局部变量位置
    public getLocalIderDefinition(query: SymbolQuery, text: string[]) {
        let iderName = query.iderName
        if (!iderName) return null;

        let iderInfo = this.getLocalRawIder(iderName,text)
        if (!iderInfo) return null;

        if (iderInfo.uri) {
            let symList = this.documentSymbol[iderInfo.uri]
            return this.checkSymDefinition(symList,query.symName,query.kind)
        }

        if (iderInfo.iderName) {
            let newQuery = Object.assign({},query)
            newQuery.iderName = iderInfo.iderName
            return this.getGlobalIderDefinition(newQuery)
        }
        return null
    }

    public getlocalSymLocation() {
        let parser: luaParser = luaParse(",j,m = function(a,b",{ wait: true })

        let token: Token | null = null
        do {
            token = parser.lex();
            g_utils.log(`lex ${JSON.stringify(token)}`)
        } while (token && token.type != LuaTokenType.EOF)
    }

}
