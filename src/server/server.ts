
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
    Position,
    DidChangeWatchedFilesParams,
    TextDocumentChangeEvent,
    FileChangeType
} from 'vscode-languageserver';

import {
    Symbol,
    SymbolQuery
} from "./symbol";

// can only be default-imported using the 'esModuleInterop' flag
// import assert from "assert";

import Uri from 'vscode-uri';
import { g_utils } from "./utils";
import { AutoCompletion } from "./autoCompletion";
import { GoToDefinition } from "./goToDefinition";
import { g_setting } from './setting';

// https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
class Server {
    // Create a connection for the server. The connection uses Node's IPC as a transport.
    // Also include all preview / proposed LSP features.
    private connection = createConnection(ProposedFeatures.all);

    // Create a simple text document manager. The text document manager
    // supports full document sync only
    private documents: TextDocuments = new TextDocuments();

    // 检测文件增删
    // private fileWatcher =
    //     vscode.workspace.createFileSystemWatcher(
    //         "**/*.lua", false, true, false);

    private rootUri: string | null = null;

    public constructor() {
        let conn = this.connection;

        g_utils.initialize(conn);

        conn.onInitialize(handler => this.onInitialize(handler));
        conn.onInitialized(() => this.onInitialized());
        conn.onCompletion(handler => this.onCompletion(handler));
        conn.onDocumentSymbol(handler => this.onDocumentSymbol(handler));
        conn.onWorkspaceSymbol(handler => this.onWorkspaceSymbol(handler));
        conn.onDefinition(handler => this.onDefinition(handler));
        conn.onDidChangeWatchedFiles(handler => this.onFilesChange(handler));

        let doc = this.documents;
        doc.onDidChangeContent(handler => this.onDocumentChange(handler));
    }

    public init() {
        this.documents.listen(this.connection);
        this.connection.listen();
    }

    private onInitialize(params: InitializeParams) {
        this.rootUri = params.rootUri;
        g_setting.setRootPath(this.rootUri || "");

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
                    // 哪些字符触发函数提示
                    // 默认情况下，vs code是代码部分都会请求自动补全
                    // 但在字符串里，只有这些特殊字符才会触发，比如做路径补全时用到
                    triggerCharacters: ['.', ':']
                }
                //documentFormattingProvider: true, // 格式化整个文档
                //documentRangeFormattingProvider: true // 格式化选中部分
            }
        };
    }
    private async onInitialized() {
        g_utils.log(`Lua LSP Server started:${this.rootUri}`);
        if (!this.rootUri) {
            return;
        }

        const uri = Uri.parse(this.rootUri);
        let symbol = Symbol.instance();

        let beg = Date.now();

        await symbol.parseRoot(uri.fsPath);
        symbol.setCacheOpen();

        let end = Date.now();
        g_utils.log(`Lua initialized done:${this.rootUri}, msec:${end - beg}`);
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
        // 或者这个文件不是工程目录里的文件，不做缓存
        let symbol = Symbol.instance();
        let symList = symbol.getDocumentSymbol(uri);
        if (!symList) {
            const document = this.documents.get(uri);
            if (!document) {
                return [];
            }

            const text = document.getText();
            symList = symbol.parse(uri, text);
        }

        return symList ? symList : [];
    }

    // 返回工作目录的符号(全局符号列表)
    private onWorkspaceSymbol(
        handler: WorkspaceSymbolParams): SymbolInformation[] {
        // TODO:这里匹配一下query，甚至做下模糊匹配
        // 全部发给vs code的话，vs code自己会匹配
        return Symbol.instance().getGlobalSymbol(); // handler.query
    }

    // 获取查询符号所在行的文本内容
    private getQueryLineText(uri: string, pos: Position): string | null {
        const document = this.documents.get(uri);

        if (!document) { return null; }

        // vs code的行数和字符数是从0开始的，但是状态栏里Ln、Col是从1开始的

        // 获取所在行的字符，因为不知道行的长度，直接传一个很大的数字
        return document.getText({
            start: { line: pos.line, character: 0 },
            end: { line: pos.line, character: 10240000 }
        });
    }

    // 根据光标位置分解出要查询的符号信息
    private getSymbolQuery(
        uri: string, text: string, pos: Position): SymbolQuery | null {
        // vs code发过来的只是光标的位置，并不是要查询的符号，我们需要分解出来
        const leftText = text.substring(0, pos.character);
        const rightText = text.substring(pos.character);

        // let module = null;
        let symName: string = "";
        let kind: SymbolKind = SymbolKind.Variable;

        // 模块名，即m:test()中的m
        let mdName: string | undefined = undefined;

        // 匹配到的字符
        let matchWords: string | null = null;

        let beg: number = pos.character;
        let end: number = pos.character;

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
            matchWords = leftWords[0];
            if (leftWords[2]) {
                mdName = leftWords[2];
            }
            if (leftWords[4]) {
                symName = leftWords[4];
                beg -= symName.length;
                // assert(beg >= 0);
            }
        }

        // test()分解成test和(，如果不是函数调用，则第二个括号则不存在
        const rightWords = rightText.match(/^(\w+)\s*(\()?/);
        if (rightWords) {
            // test() 匹配到 ["test(","test","("]
            const rightSym = rightWords[1];
            if (rightSym) {
                symName += rightSym;
                end += rightSym.length;
            }
            if (rightWords[2]) {
                kind = SymbolKind.Function;
            }
        }

        return {
            uri: uri,
            mdName: mdName,
            symName: symName,
            kind: kind,
            leftWords: matchWords,
            position: { line: pos.line, beg: beg, end: end },
            text: text
        };
    }

    // 确定有当前符号的缓存，没有则解析
    private ensureSymbolCache(uri: string) {
        if (Symbol.instance().getCache(uri)) {
            return;
        }
        const document = this.documents.get(uri);
        if (!document) {
            return;
        }

        Symbol.instance().rawParse(uri, document.getText());
    }

    // go to definetion
    private onDefinition(handler: TextDocumentPositionParams): Definition {
        const uri = handler.textDocument.uri;

        let line = this.getQueryLineText(uri, handler.position);
        if (!line) { return []; }

        let loc: Definition | null = null;
        let definetion = GoToDefinition.instance();

        // require("a.b.c") 跳转到对应的文件
        loc = definetion.getRequireDefinition(line, handler.position);
        if (loc) { return loc; }

        let query = this.getSymbolQuery(uri, line, handler.position);
        if (!query || query.symName === "") { return []; }

        g_utils.log(`goto definition ${JSON.stringify(query)}`);

        /* 查找一个符号，正常情况下应该是 局部-当前文档-全局 这样的顺序才是对的
         * 但事实是查找局部是最困难的，也是最耗时的，因此放在最后面
         * 全局和文档都做了符号hash缓存，因此优先匹配
         */

        // 根据模块名匹配全局
        loc = definetion.getGlobalModuleDefinition(query);
        if (loc) { return loc; }

        // 根据模块名匹配当前文档
        loc = definetion.getDocumentModuleDefinition(query);
        if (loc) { return loc; }

        // 上面的方法都找不到，可能是根本没有模块名mdName
        // 或者按模块名没有匹配到任何符号，下面开始忽略模块名

        // 当前文档符号匹配
        loc = definetion.getDocumentDefinition(query);
        loc = definetion.localizationFilter(query, loc);
        if (loc) { return loc; }
        // 全局符号匹配
        loc = definetion.getGlobalDefinition(query);
        loc = definetion.localizationFilter(query, loc);
        if (loc) { return loc; }
        // 局部符号匹配
        this.ensureSymbolCache(uri);
        loc = definetion.getlocalDefinition(query);
        if (loc) { return loc; }

        return [];
    }

    // 代码自动补全
    private onCompletion(handler: TextDocumentPositionParams): CompletionItem[] {
        const uri = handler.textDocument.uri;

        let line = this.getQueryLineText(uri, handler.position);
        if (!line) { return []; }

        let completion = AutoCompletion.instance();
        // 根据模块名，匹配全局符号
        let items = completion.getRequireCompletion(
            line, handler.position.character);
        if (items) { return items; }

        let query = this.getSymbolQuery(uri, line, handler.position);

        // g_utils.log(`check uri =====${JSON.stringify(query)}`);
        if (!query) { return []; }

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


        // 根据模块名，匹配全局符号
        items = completion.getGlobalModuleCompletion(query);
        if (items) { return items; }

        // 根据模块名，匹配文档符号
        items = completion.getDocumentModuleCompletion(query);
        if (items) { return items; }

        if (query.symName.length <= 0) { return []; }

        // 根据模块名无法匹配到，下面开始忽略模块名
        // 当前文档符号匹配
        items = completion.getDocumentCompletion(query);
        if (items) { return items; }
        // 全局符号匹配
        items = completion.getGlobalCompletion(query);
        if (items) { return items; }
        // 局部符号匹配
        items = completion.getlocalCompletion(query);
        if (items) { return items; }

        return [];
    }

    // 已打开的文档内容变化，注意是已打开的
    // 在编辑器上修改文档内容没保存，或者其他软件直接修改文件都会触发
    private onDocumentChange(handler: TextDocumentChangeEvent) {
        let uri = handler.document.uri;
        Symbol.instance().parse(uri, handler.document.getText());
    }

    // 文件增删
    private onFilesChange(handler: DidChangeWatchedFilesParams) {
        let symbol = Symbol.instance();
        for (let event of handler.changes) {

            let uri = event.uri;
            let type = event.type;
            switch (type) {
                case FileChangeType.Created: {
                    let path = Uri.parse(uri);
                    symbol.parseFile(path.fsPath);
                    break;
                }
                case FileChangeType.Changed: {
                    let doc = this.documents.get(uri);
                    // 取得到文档，说明是已打开的文件，在 onDocumentChange 处理
                    // 这里只处理没打开的文件
                    if (doc) { return; }

                    let path = Uri.parse(uri);
                    symbol.parseFile(path.fsPath);
                    break;
                }
                case FileChangeType.Deleted: {
                    symbol.delDocumentSymbol(uri);
                    break;
                }
            } // switch
        } // for
    }
}

let srv = new Server();
srv.init();

