import {
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

import { Symbol } from "./symbol"
import { timingSafeEqual } from 'crypto';

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
        // 因为js的this是调用者，
        // 因此这里用arrow function来保证symbol调用log函数时this是server
        this.symbols.log = (ctx) => this.log(ctx);
        this.connection.onInitialize(handler => this.onInitialize(handler));
        this.connection.onInitialized(() => this.onInitialized());
        this.connection.onCompletion(pos => this.onCompletion(pos));
        this.connection.onDocumentSymbol(handler => this.onDocumentSymbol(handler));
        this.connection.onWorkspaceSymbol(handler => this.onWorkspaceSymbol(handler));
    }

    public init() {
        this.documents.listen(this.connection);
        this.connection.listen();
    }

    public log(ctx: string): void {
        this.connection.console.log(ctx)
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
        this.log("Lua LSP Server started")
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
        this.log(`check uri ========================${uri}`)

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
        this.log(`check symbol ${uri}`)

        // return [
        //     {
        //         name: "lua_tags",
        //         kind: SymbolKind.Function,
        //         location: { uri: uri, range: { start: { line: 1, character: 0 },
        //         end: { line: 1, character: 5 } } }
        //     }
        // ];
        this.log(`sym uri ============================${uri}`)
        return this.symbols.getDocumentSymbol(uri)
    }

    // 返回工作目录的符号(全局符号列表)
    private onWorkspaceSymbol(
        handler: WorkspaceSymbolParams): SymbolInformation[] {
        return this.symbols.getGlobalSymbol(handler.query)
    }
}

let srv = new Server()
srv.init()

