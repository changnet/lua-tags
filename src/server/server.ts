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
    CompletionItemKind,
    TextDocumentPositionParams
  } from 'vscode-languageserver';

// https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
class Server
{
    // Create a connection for the server. The connection uses Node's IPC as a transport.
    // Also include all preview / proposed LSP features.
    private connection = createConnection(ProposedFeatures.all);

    // Create a simple text document manager. The text document manager
    // supports full document sync only
    private documents: TextDocuments = new TextDocuments();

    private rootUri: string | null = null;

    // 哪些字符触发函数提示
    private readonly triggerCharacters = ['.', ':'];

    public constructor()
    {
        this.connection.onInitialize(handler => this.onInitialize(handler));
        this.connection.onInitialized(() => this.onInitialized());
        this.connection.onCompletion(pos => this.onCompletion(pos));
    }

    public init()
    {
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
                //documentSymbolProvider: true, // 单个文档符号 CTRL + SHIFT + O
                //workspaceSymbolProvider: true, // 整个工程符号 CTRL + T
                completionProvider: { // 打.或者:时列出可自动完成的函数
                    resolveProvider: true,
                    triggerCharacters: this.triggerCharacters
                }
                //documentFormattingProvider: true, // 格式化整个文档
                //documentRangeFormattingProvider: true // 格式化选中部分
            }
        };
    }

    private onInitialized()
    {
        this.connection.console.log("Lua LSP Server started")
    }

    private onCompletion(pos: TextDocumentPositionParams): CompletionItem[]
    {
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
}

let srv = new Server()
srv.init()

