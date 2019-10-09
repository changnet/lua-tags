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
    SymbolKind
} from 'vscode-languageserver';

import Uri from 'vscode-uri';
import { Symbol } from "./symbol"
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
    }

    private onCompletion(pos: TextDocumentPositionParams): CompletionItem[] {
        const uri = pos.textDocument.uri;
        const document = this.documents.get(uri);
        if (!document) {
            return [];
        }

        const text = document.getText();

        // const { prefixStartPosition, suffixEndPosition } = getCursorWordBoundry(documentText,
        //     pos.position);

        // const startOffset = document.offsetAt(prefixStartPosition);
        // const endOffset = document.offsetAt(suffixEndPosition);

        // analysis.write(documentText.substring(0, startOffset));

        this.symbols.parse(uri, text)
        g_utils.log(`check uri ========================${uri}`)

        return [
            {
                label: 'TypeScript',
                kind: CompletionItemKind.Text,
                data: 1
            },
            {
                label: 'JavaScript',
                kind: CompletionItemKind.Text,
                data: 2
            }
        ];
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

        return this.symbols.getDocumentSymbol(uri)
    }

    // 返回工作目录的符号(全局符号列表)
    private onWorkspaceSymbol(
        handler: WorkspaceSymbolParams): SymbolInformation[] {
        return this.symbols.getGlobalSymbol(handler.query)
    }

    // go to definetion
    private onDefinition(handler: TextDocumentPositionParams): Definition {
        const uri = handler.textDocument.uri;
        const document = this.documents.get(uri);

        if (!document) return [];

        // vs code的行数和字符数是从0开始的，但是状态栏里Ln、Col是从1开始的

        // 获取所在行的字符，因为不知道行的长度，直接传一个很大的数字
        const line = handler.position.line
        let text = document.getText({
            start: {line: line,character: 0},
            end: {line: line,character: 10240000}
        })

        // vs code发过来的只是光标的位置，并不是要查询的符号，我们需要分解出来
        const pos = handler.position.character;
        const leftText = text.substring(0,pos);
        const rightText = text.substring(pos);

        // let module = null;
        let sym: string = ""
        let isFunc: boolean = false

        // identifierName调用者，即m:test()中的m
        let iderName: string | null = null

        /*
         * https://javascript.info/regexp-groups
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match
         * \w是匹配单词字符，即a-zA-Z0-9_
         * .|:是匹配lua中m.n或者m:n的调用方式
         * (\w+)([.|:]))?是说m:n中，m:可能不会出现，只有一个n
         */
        const leftWords = leftText.match(/((\w+)([.|:]))?\s*(\w+)$/);
        if (leftWords) {
            // match在非贪婪模式下，总是返回 总匹配字符串，然后是依次匹配到字符串
            //m:n将会匹配到strs = ["m:n","m:","m",".","n"]
            if (leftWords[2]) iderName = leftWords[2];
            if (leftWords[4]) sym = leftWords[4];
        }

        // test()分解成test和(，如果不是函数调用，则第二个括号则不存在
        const rightWords = rightText.match(/(\w+)\s*(\()?/);
        if (rightWords) {
            // test() 匹配到 ["test(","test","("]
            if (rightWords[1]) sym += rightWords[1];
            if (rightWords[2]) isFunc = true;
        }

        if (sym == "") return [];

        g_utils.log(`goto definition ${iderName} ${sym} ${isFunc}`)

        this.symbols.getlocalSymLocation()

        return [];
    }
}

let srv = new Server()
srv.init()

