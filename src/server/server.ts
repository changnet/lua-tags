import {
    Definition,
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
    Position
} from 'vscode-languageserver';

import {
    Symbol,
    SymbolQuery
} from "./symbol"

import Uri from 'vscode-uri';
import { g_utils } from "./utils"
import { g_setting } from './setting';

// https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
class Server {
    // Create a connection for the server. The connection uses Node's IPC as a transport.
    // Also include all preview / proposed LSP features.
    private connection = createConnection(ProposedFeatures.all);

    // Create a simple text document manager. The text document manager
    // supports full document sync only
    private documents: TextDocuments = new TextDocuments();

    private rootUri: string | null = null;

    // 哪些字符触发函数提示
    private readonly triggerCharacters = ['.', ':'];

    // 记录解析过的符号
    private symbols: Symbol = new Symbol();

    public constructor() {
        g_utils.initialize(this.connection)
        this.connection.onInitialize(handler => this.onInitialize(handler));
        this.connection.onInitialized(() => this.onInitialized());
        this.connection.onCompletion(pos => this.onCompletion(pos));
        this.connection.onDocumentSymbol(handler => this.onDocumentSymbol(handler));
        this.connection.onWorkspaceSymbol(handler => this.onWorkspaceSymbol(handler));
        this.connection.onDefinition(handler => this.onDefinition(handler));
    }

    public init() {
        this.documents.listen(this.connection);
        this.connection.listen();
    }

    private onInitialize(params: InitializeParams) {
        this.rootUri = params.rootUri;

        return {
            capabilities: {
                // Use full sync mode for now.
                // TODO: Add support for Incremental changes. Full syncs will not scale very well.
                textDocumentSync: this.documents.syncKind,
                // 单个文档符号，左边的大纲(Outliine) CTRL + SHIFT + O
                documentSymbolProvider: true,
                workspaceSymbolProvider: true, // 整个工程符号 CTRL + T
                definitionProvider: true, // go to definition
                completionProvider: { // 打.或者:时列出可自动完成的函数
                    // resolve是命中哪个函数后，有一个回调回来，现在用不到
                    resolveProvider: false,
                    triggerCharacters: this.triggerCharacters
                }
                //documentFormattingProvider: true, // 格式化整个文档
                //documentRangeFormattingProvider: true // 格式化选中部分
            }
        };
    }
    private onInitialized() {
        g_utils.log(`Lua LSP Server started:${this.rootUri}`)

        /* non-null assertion operator
         * A new ! post-fix expression operator may be used to assert that its
         * operand is non-null and non-undefined in contexts where the type
         * checker is unable to conclude that fact. Specifically, the operation
         * x! produces a value of the type of x with null and undefined excluded.
         * The description contains many fancy words, but in plain English, it
         * means: when you add an exclamation mark after variable/property name,
         * you're telling to TypeScript that you're certain that value is not
         * null or undefined.
         */
        const uri = Uri.parse(this.rootUri!);
        this.symbols.parseRoot(uri.fsPath);

        g_utils.log(`Lua initialized done:${this.rootUri}`)
    }

    // 代码自动完成提示
    private onCompletion(pos: TextDocumentPositionParams): CompletionItem[] {
        const uri = pos.textDocument.uri;

        let query = this.getSymbolQuery(uri,pos.position)

        g_utils.log(`check uri =====${JSON.stringify(query)}`)
        if (!query) return [];

        // return [
        //     {
        //         label: 'TypeScript',
        //         kind: CompletionItemKind.Text,
        //         data: 1
        //     },
        //     {
        //         label: 'JavaScript',
        //         kind: CompletionItemKind.Text,
        //         data: 2
        //     }
        // ];

        let items = this.symbols.getGlobalIderCompletion(query);
        if (items) return items;

        return [];
    }

    // 返回当前文档的符号
    private onDocumentSymbol(
        handler: DocumentSymbolParams): SymbolInformation[] {
        const uri = handler.textDocument.uri;

        // return [
        //     {
        //         name: "lua_tags",
        //         kind: SymbolKind.Function,
        //         location: { uri: uri, range: { start: { line: 1, character: 0 },
        //         end: { line: 1, character: 5 } } }
        //     }
        // ];

        // 刚启动的时候，还没来得及解析文件
        // 如果就已经打开文件了，优先解析这一个，多次解析同一个文件不影响
        let symList = this.symbols.getDocumentSymbol(uri)
        if (!symList) {
            const document = this.documents.get(uri);
            if (!document) {
                return [];
            }

            const text = document.getText();
            this.symbols.parse(uri, text);

            symList = this.symbols.getDocumentSymbol(uri)
        }

        return symList ? symList : []
    }

    // 返回工作目录的符号(全局符号列表)
    private onWorkspaceSymbol(
        handler: WorkspaceSymbolParams): SymbolInformation[] {
        return this.symbols.getGlobalSymbol(handler.query)
    }

    // 根据光标位置分解出要查询的符号信息
    private getSymbolQuery(uri: string,pos: Position): SymbolQuery | null {
        const document = this.documents.get(uri);

        if (!document) return null;

        // vs code的行数和字符数是从0开始的，但是状态栏里Ln、Col是从1开始的

        // 获取所在行的字符，因为不知道行的长度，直接传一个很大的数字
        let text = document.getText({
            start: {line: pos.line,character: 0},
            end: {line: pos.line,character: 10240000}
        })

        // vs code发过来的只是光标的位置，并不是要查询的符号，我们需要分解出来
        const leftText = text.substring(0,pos.character);
        const rightText = text.substring(pos.character);

        // let module = null;
        let symName: string = ""
        let kind: SymbolKind = SymbolKind.Variable

        // 模块名，即m:test()中的m
        let mdName: string | null = null

        // 匹配到的字符
        let matchWords: string | null = null;

        /*
         * https://javascript.info/regexp-groups
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match
         * \w是匹配单词字符，即a-zA-Z0-9_
         * .|:是匹配lua中m.n或者m:n的调用方式
         * (\w+)([.|:]))?是说m:n中，m:可能不会出现，只有一个n
         * (\w+)?$是在自动自动完成时，可能会出现 ev: 这种情况，有模块名无符号名
         */
        const leftWords = leftText.match(/((\w+)([.|:]))?\s*(\w+)?$/);
        if (leftWords) {
            // match在非贪婪模式下，总是返回 总匹配字符串，然后是依次匹配到字符串
            //m:n将会匹配到strs = ["m:n","m:","m",".","n"]
            matchWords = leftWords[0]
            if (leftWords[2]) mdName = leftWords[2];
            if (leftWords[4]) symName = leftWords[4];
        }

        // test()分解成test和(，如果不是函数调用，则第二个括号则不存在
        const rightWords = rightText.match(/^(\w+)\s*(\()?/);
        if (rightWords) {
            // test() 匹配到 ["test(","test","("]
            if (rightWords[1]) symName += rightWords[1];
            if (rightWords[2]) kind = SymbolKind.Function;
        }

        return {
            uri: uri,
            mdName: mdName,
            symName: symName,
            kind: kind,
            leftWords: matchWords,
            position: pos
        }
    }

    // 获取查询本地符号需要解析的文本内容
    private getLocalText(query: SymbolQuery): string[] {
        const document = this.documents.get(query.uri);

        if (!document) return [];

        const line = query.position.line;
        const matchWords = query.leftWords;

        // 把当前整个文档内容按行分解
        const allText = document.getText();
        let lines = allText.split(/\r?\n/g);
        if (lines.length < line + 1) {
            g_utils.log(
                `document lines error ${
                    query.uri} expect ${line} got ${lines.length}`)
            return []
        }

        // 去掉多余的行数
        lines.length = line + 1
        // 把当前行中已匹配的内容去掉
        if (matchWords) {
            lines[line] = lines[line].substring(
                0, query.position.character - matchWords.length)
        }

        return lines
    }

    // go to definetion
    private onDefinition(handler: TextDocumentPositionParams): Definition {
        const uri = handler.textDocument.uri;

        let query = this.getSymbolQuery(uri,handler.position)
        if (!query || query.symName == "") return [];

        g_utils.log(`goto definition ${JSON.stringify(query)}`)

        let loc: Definition | null = null

        /* 查找一个符号，正常情况下应该是 局部-当前文档-全局 这样的顺序才是对的
         * 但事实是查找局部是最困难的，也是最耗时的，因此放在最后面
         * 全局和文档都做了符号hash缓存，因此优先匹配
         */

        // 根据模块名匹配全局
        loc = this.symbols.getGlobalModuleDefinition(query);
        if (loc) return loc;

        // 根据模块名匹配当前文档
        loc = this.symbols.getDocumentModuleDefinition(query);
        if (loc) return loc;

        // 根据模块名匹配局部变量
        let localText:string[] | null = null;

        if (query.mdName) {
            localText = this.getLocalText(query)
            loc = this.symbols.getLocalModuleDefinition(query, localText);
            if (loc) return loc;
        }

        // 上面的方法都找不到，可能是根本没有模块名mdName
        // 或者按模块名没有匹配到任何符号，下面开始忽略模块名

        // 当前文档符号匹配
        loc = this.symbols.getDocumentDefinition(query);
        if (loc) return loc;
        // 全局符号匹配
        loc = this.symbols.getGlobalDefinition(query);
        if (loc) return loc;
        // 局部符号匹配
        if (!localText) localText = this.getLocalText(query);
        loc = this.symbols.getlocalDefinition(query,localText);
        if (loc) return loc;

        return [];
    }
}

let srv = new Server()
srv.init()

