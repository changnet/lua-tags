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
        g_utils.log(`sym uri ============================${uri}`)
        return this.symbols.getDocumentSymbol(uri)
    }

    // 返回工作目录的符号(全局符号列表)
    private onWorkspaceSymbol(
        handler: WorkspaceSymbolParams): SymbolInformation[] {
        return this.symbols.getGlobalSymbol(handler.query)
    }

    // go to definetion
    private onDefinition(handler: TextDocumentPositionParams): Definition {
        return [];
    }
}

let srv = new Server()
srv.init()

