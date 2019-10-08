// 符号处理

import { g_utils } from "./utils"
import { g_setting } from "./setting"

import {
    Options,
    parse as luaparse,

    Node,
    Identifier,
    FunctionDeclaration,
    LocalStatement,
    AssignmentStatement
} from 'luaparse';

import {
    Range,
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
    SymbolKind
} from 'vscode-languageserver';

import Uri from 'vscode-uri';
import { promises as fs } from "fs"

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

export class Symbol {
    private options: Options;

    // 全局符号缓存，CTRL + T用的
    private globalSymbol: { [key: string]: SymbolInformation[] } | null = null;

    // 各个文档的符号缓存，uri为key
    private documentSymbol: { [key: string]: SymbolInformation[] } = {};
    // 各个文档的语法节点缓存，uri为key
    private documentNode: { [key: string]: NodeCache } = {};

    // 下面是一些解析当前文档的辅助变量
    private parseUri: string = "";
    private parseScopeDeepth: number = 0;
    private parseNodeList: Node[] = [];
    private parseNodeCache: NodeCache = {}
    private parseSymList: SymbolInformation[] = [];

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

        let name: string
        if (identifier.type == "Identifier") {
            // function test() 这种直接声明函数的写法
            name = identifier.name
        }
        else if (identifier.type == "MemberExpression") {
            // function m:test() 或者 function m.test() 这种成员函数写法
            name = identifier.identifier.name
        }
        else {
            return;
        }
        this.parseNodeCache[name] = node;

        let sym = this.functionNodeToSym(this.parseUri,name,node)
        if (sym) {
            this.parseSymList.push(sym)
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
                    start: { line: loc.start.line, character: loc.start.column },
                    end: { line: loc.end.line, character: loc.end.column }
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
                        start: { line: loc.start.line, character: loc.start.column },
                        end: { line: loc.end.line, character: loc.end.column }
                    }
                }
            };
    }

    // 更新全局符号缓存
    private updateGlobalSymbol() {
        let globalSymbol: { [key: string]: SymbolInformation[] } = {}
        for (let uri in this.documentSymbol) {
            for (let sym of this.documentSymbol[uri]) {
                if (!globalSymbol[sym.name]) {
                    globalSymbol[sym.name] = []
                }

                globalSymbol[sym.name].push(sym)
            }
        }

        return globalSymbol
    }

    public parse(uri: string, text: string) {
        this.parseUri = uri;
        this.parseScopeDeepth = 0;
        this.parseNodeList = [];
        this.parseSymList = [];
        this.parseNodeCache = {};

        try {
            luaparse(text, this.options);
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

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalSymbol = null

        //g_utils.log(`parse done ${JSON.stringify(this.parseSymList)}`)
    }

    // 获取某个文档的符号
    public getDocumentSymbol(uri: string): SymbolInformation[] {
        let symList: SymbolInformation[] = this.documentSymbol[uri]

        return symList ? symList : []
    }

    // 获取全局符号
    public getGlobalSymbol(query: string): SymbolInformation[] {
        if (!this.globalSymbol) {
            this.globalSymbol = this.updateGlobalSymbol();
        }

        g_utils.log(`check global log:${JSON.stringify(this.globalSymbol)}`)

        let symList: SymbolInformation[] = []
        for (let name in this.globalSymbol) {
            // TODO:这里匹配一下query，甚至做下模糊匹配
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

}
