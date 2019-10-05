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

import * as fs from "fs"
import Uri from 'vscode-uri';
import { Symbol } from "./symbol"
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
    private pathSlash: string = "/";

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

        // TODO:没打开目录时没有rootPath，后面再处理
        // 使用和vs code一样的路径分隔符，不然无法根据uri快速查询符号
        if ( params.rootPath && -1 == params.rootPath.indexOf(this.pathSlash)) {
            this.pathSlash = "\\";
        }

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

    private parseDir(path: string) {
        // 当使用 withFileTypes 选项设置为 true 调用 fs.readdir() 或 
        // fs.readdirSync() 时，生成的数组将填充 fs.Dirent 对象，而不是路径字符串
        fs.readdir(path,{ withFileTypes: true },(err,files: fs.Dirent[]) => {
            if (err) {
                this.log(`read root files fail:${path}`)
                return
            }
            for (let file of files) {
                let subPath = `${path}${this.pathSlash}${file.name}`

                if (file.isDirectory()) {
                    this.parseDir(subPath)
                }
                else if (file.isFile()) {
                    this.parseFile(subPath)
                }
            }
        })
    }

    private parseFile(path: string) {
        if (!path.endsWith(".lua")) return;
        fs.stat(path,(err,stat) => {
            if (stat.size > g_setting.maxFileSize) return;
        })
        // uri总是用/来编码，在win下，路径是用\的
        // 这时编码出来的uri和vs code传进来的就会不一样，无法快速根据uri查询符号
        const uri = Uri.from({
            scheme: "file",
            path: "/" != this.pathSlash ? path.replace(/\\/g,"/") : path
        })

        fs.readFile(path,(err,data) => {
            if (err) {
                this.log(`read file fail:${path}`)
                return
            }
            this.log(data.toString())
        })
    }

    private onInitialized() {
        this.log(`Lua LSP Server started:${this.rootUri}`)

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
        this.parseDir(uri.fsPath)
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

    // go to definetion
    private onDefinition(handler: TextDocumentPositionParams): Definition {
        return [];
    }
}

let srv = new Server()
srv.init()

