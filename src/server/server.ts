
import {
    Hover,
    Definition,
    createConnection,
    TextDocuments,
    ProposedFeatures,
    InitializeParams,
    CompletionItem,
    SymbolInformation,
    DocumentSymbolParams,
    WorkspaceSymbolParams,
    TextDocumentPositionParams,
    SymbolKind,
    Position,
    DidChangeWatchedFilesParams,
    TextDocumentChangeEvent,
    FileChangeType,
    InitializeResult,
    SignatureHelp,
    DidChangeConfigurationParams,
    TextDocumentSyncKind
} from 'vscode-languageserver';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import {
    SymbolEx,
    SymbolQuery
} from "./symbol";

// can only be default-imported using the 'esModuleInterop' flag
// import assert from "assert";

import { URI } from 'vscode-uri';
import { Utils, DirWalker } from "./utils";
import { HoverProvider } from "./hoverProvider";
import { AutoCompletion } from "./autoCompletion";
import { GoToDefinition } from "./goToDefinition";
import { SignatureProvider } from "./signatureProvider";
import { DiagnosticProvider, CheckHow } from "./diagnosticProvider";
import { Setting, FileParseType } from './setting';

// https://code.visualstudio.com/api/language-extensions/language-server-extension-guide
export class Server {
    // Create a connection for the server. The connection uses Node's IPC as a transport.
    // Also include all preview / proposed LSP features.
    private connection = createConnection(ProposedFeatures.all);

    // Create a simple text document manager. The text document manager
    // supports full document sync only
    private documents = new TextDocuments(TextDocument);

    private rootUri: string | null = null;

    private isPreInit = false;

    private exportVer: number = 0;
    private exportSym = new Map<string, number>();

    public constructor() {
        const conn = this.connection;

        Utils.instance().initialize(conn);

        // TODO: wrap all function in try catch and send error to client
        // I didn't find a better way to do this. It is any ?

        conn.onInitialize(handler => this.onInitialize(handler));
        conn.onInitialized(async () => {
            try {
                // 阻塞初始一些必须的参数
                await this.preInitialized();
                // 解析、luacheck这些比较耗时，异步进行就可以了
                this.onInitialized();
            } catch (e) {
                Utils.instance().anyError(e);
            }
        });
        conn.onCompletion(handler => {
            try {
                return this.onCompletion(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        conn.onDocumentSymbol(handler => {
            try {
                return this.onDocumentSymbol(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        conn.onWorkspaceSymbol(handler => {
            try {
                return this.onWorkspaceSymbol(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        conn.onDefinition(handler => {
            try {
                return this.onDefinition(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });

        // TODO 这个貌似没有用了，没有触发
        // 使用下面doc.onDidOpen之类的事件
        conn.onDidChangeWatchedFiles(handler => {
            try {
                return this.onFilesChange(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        conn.onHover(handler => {
            try {
                return this.onHover(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        conn.onSignatureHelp(handler => {
            try {
                return this.onSignature(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        conn.onDidChangeConfiguration(handler => {
            try {
                return this.onConfiguration(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        conn.onNotification("__export", () => {
            try {
                const symList = SymbolEx.instance().getGlobalSymbolList();
                Utils.instance().writeGlobalSymbols(symList);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });

        const doc = this.documents;
        doc.onDidSave(handler => {
            try {
                return this.onSaveDocument(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        doc.onDidChangeContent(async handler => {
            try {
                await this.waitForPreInit();
                return this.onDocumentChange(handler);
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });

        // doc触发的文件类型在 documentSelector 中设置，比如只有lua类型才会触发
        doc.onDidClose(async handler => {
            // if a file is not in workspace, make sure clear it's diagnostic
            // message after it close
            try {
                const uri = handler.document.uri;
                const ft = Setting.instance().getFileType(uri, 1);
                if (ft & FileParseType.FPT_SINGLE) {
                    DiagnosticProvider.instance().deleteChecking(uri);
                }
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
        doc.onDidOpen(async handler => {
            try {
                await this.waitForPreInit();
                if (Setting.instance().isCheckOnFileOpen()) {
                    DiagnosticProvider.instance().check(
                        handler.document.uri, handler.document.getText());
                }
            } catch (e) {
                Utils.instance().anyError(e);
                return null;
            }
        });
    }

    public init() {
        this.documents.listen(this.connection);
        this.connection.listen();
    }

    private async waitForPreInit() {
        if (this.isPreInit) {
            return true;
        }

        // could not find a better way to wait...
        for (let ts = 0; ts < 32; ts++) {
            const ok = await new Promise((resolve) => setTimeout(() => {
                resolve(this.isPreInit);
            }, 100));

            if (ok) {
                return ok;
            }
        }

        return true;
    }

    private onInitialize(params: InitializeParams): InitializeResult {
        // TODO no multi dir support for now
        const folders = params.workspaceFolders;
        if (folders && folders.length > 0) {
            this.rootUri = folders[0].uri;
            Utils.instance().log(`using ${this.rootUri} as root`);
        }

        return {
            capabilities: {
                // Use full sync mode for now.
                // TODO: Add support for Incremental changes. Full syncs will not scale very well.
                textDocumentSync: TextDocumentSyncKind.Incremental,
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
                },
                hoverProvider: true, // 鼠标放上去的提示信息

                // 函数调用参数辅助
                signatureHelpProvider: {
                    triggerCharacters: ["(", ","]
                },
                //documentFormattingProvider: true, // 格式化整个文档
                //documentRangeFormattingProvider: true // 格式化选中部分
            }
        };
    }

    private async preInitialized() {
        if (!this.rootUri) {
            return;
        }

        const setting = Setting.instance();
        setting.setRawRootUri(this.rootUri);

        const conf =
            await this.connection.workspace.getConfiguration("lua-tags");
        setting.setConfiguration(conf);

        const diagnostic = DiagnosticProvider.instance();
        diagnostic.updateCmdArgs();

        this.isPreInit = true;
    }

    private async onInitialized() {
        if (!this.rootUri) {
            return;
        }

        const uri = URI.parse(this.rootUri);

        const symbol = SymbolEx.instance();
        const diagnostic = DiagnosticProvider.instance();

        const beg = Date.now();

        const checkOnInit = Setting.instance().isCheckOnInit();
        const files = await DirWalker.instance().walk(
            uri.fsPath, (uri, ctx) => {
                symbol.parse(uri, ctx, true);
                if (checkOnInit) {
                    diagnostic.check(uri, ctx, CheckHow.INITIALIZE);
                }
            });
        symbol.setCacheOpen();
        symbol.loadStl();

        const end = Date.now();
        Utils.instance().log(
            // eslint-disable-next-line max-len
            `Lua-tags LSP initialized done:${this.rootUri}, msec:${end - beg}, files:${files}`);

        const interval = Setting.instance().getExportInterval();
        if (interval > 0) {
            setInterval(() => {
                this.exportGlobalTimeout();
            }, interval * 1000);
        }
    }

    // 定时导出全局符号
    private exportGlobalTimeout() {
        const symbol = SymbolEx.instance();

        // no change
        if (this.exportVer === symbol.getUpdateVersion()) {
            return;
        }

        this.exportVer = symbol.getUpdateVersion();
        const symList = symbol.getGlobalSymbolList();

        let change = false;
        if (symList.length === this.exportSym.size) {
            for (const sym of symList) {
                if (!this.exportSym.get(sym.name)) {
                    change = true;
                    break;
                }
            }
        } else {
            change = true;
        }

        if (!change) {
            return;
        }

        this.exportSym.clear();
        for (const sym of symList) {
            this.exportSym.set(sym.name, 1);
        }

        Utils.instance().writeGlobalSymbols(symList);
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
        const symbol = SymbolEx.instance();
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
        handler: WorkspaceSymbolParams): SymbolInformation[] | null {
        const query = handler.query.trim();
        if (query === "") {
            return null;
        }

        return SymbolEx.instance().getAnySymbol(true, sym => {
            return SymbolEx.checkMatch(query, sym.name) > -500;
        }, 128);
    }

    // 获取查询符号所在行的文本内容
    public getQueryText(uri: string, pos: Position): string | null {
        const document = this.documents.get(uri);

        if (!document) {
            return null;
        }

        // vs code的行数和字符数是从0开始的，但是状态栏里Ln、Col是从1开始的

        // 获取所在行的字符，因为不知道行的长度，直接传一个很大的数字
        return document.getText({
            start: { line: pos.line, character: 0 },
            end: { line: pos.line, character: 10240000 }
        });
    }

    // 根据光标位置分解出要查询的符号信息
    public getQuerySymbol(
        uri: string, text: string, pos: Position): SymbolQuery | null {
        // vs code发过来的只是光标的位置，并不是要查询的符号，我们需要分解出来
        const leftText = text.substring(0, pos.character);
        const rightText = text.substring(pos.character);

        // let module = null;
        let name: string = "";
        let kind: SymbolKind = SymbolKind.Variable;

        // 模块名，即m:test()中的m
        let base;
        let extBase;

        // 调用方式，是通过.还是:调用
        let indexer;

        let beg: number = pos.character;
        let end: number = pos.character;

        /*
         * https://javascript.info/regexp-groups
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/match
         * \w是匹配单词字符，即a-zA-Z0-9_
         * .|:是匹配lua中m.n或者m:n的调用方式
         * (\w+)?$是在自动自动完成时，可能会出现 ev: 这种情况，有模块名无符号名
         * A:B.C.D.E: ==>  Array ["A:B.C.D.E:", "E:", undefined]
         * A:B.C.D.E:F ==> Array ["A:B.C.D.E:F", "E:", "F"]
         * ABC ==> Array ["ABC", undefined, "ABC"]
         */
        const leftWords = leftText.match(/(\w+[.|:])*(\w+)?$/);
        if (leftWords) {
            // match在非贪婪模式下，总是返回 总匹配字符串，然后是依次匹配到字符串
            if (leftWords[1]) {
                // A:B.C.D.E:F ==> Array ["A", "B", "C", "D", "E", "F"]
                const allBase = leftWords[0].split(/[.|:]/g);
                base = allBase[0];
                if (allBase.length > 2) {
                    extBase = allBase.slice(1, allBase.length - 1);
                }
            }
            if (leftWords[2]) {
                name = leftWords[2];
                // name开始的位置，查找时用于精准对比符号的位置
                beg -= name.length;
            }
        }

        // test()分解成test和(，如果不是函数调用，则第二个括号则不存在
        const rightWords = rightText.match(/^(\w+)\s*(\()?/);
        if (rightWords) {
            // test() 匹配到 ["test(","test","("]
            const rightSym = rightWords[1];
            if (rightSym) {
                name += rightSym;
                end += rightSym.length;
            }
            // 如果有括号，查找的是函数
            if (rightWords[2]) {
                kind = SymbolKind.Function;
            }
        }

        const dotPos = text.lastIndexOf(".", beg);
        if (dotPos > 0) {
            indexer = ".";
        }
        const colonPos = text.lastIndexOf(":", beg);
        if (colonPos > dotPos) {
            indexer = ":";
        }

        return {
            uri: uri,
            base: base,
            name: name,
            kind: kind,
            extBase: extBase,
            position: { line: pos.line, beg: beg, end: end },
            text: text,
            indexer: indexer
        };
    }

    // 确定有当前符号的缓存，没有则解析
    public ensureSymbolCache(uri: string) {
        if (SymbolEx.instance().getCache(uri)) {
            return;
        }
        const document = this.documents.get(uri);
        if (!document) {
            return;
        }

        SymbolEx.instance().rawParse(uri, document.getText());
    }

    // go to definetion
    private onDefinition(handler: TextDocumentPositionParams): Definition {
        return GoToDefinition.instance().doDefinition(
            this, handler.textDocument.uri, handler.position);
    }

    // 代码自动补全
    private onCompletion(
        handler: TextDocumentPositionParams): CompletionItem[] | null {
        const uri = handler.textDocument.uri;

        return AutoCompletion.instance().doCompletion(
            this, uri, handler.position);
    }

    // 已打开的文档内容变化，注意是已打开的
    // 在编辑器上修改文档内容没保存，或者其他软件直接修改文件都会触发
    private onDocumentChange(handler: TextDocumentChangeEvent<TextDocument>) {
        const uri = handler.document.uri;
        const text = handler.document.getText();
        SymbolEx.instance().parse(uri, text);

        if (Setting.instance().isCheckOnTyping()) {
            DiagnosticProvider.instance().check(uri, text);
        }
    }

    // 这里处理因第三方软件直接修改文件造成的文件变化
    private doFileChange(uri: string, doSym: boolean) {
        const path = URI.parse(uri);
        DirWalker.instance().walkFile(path.fsPath, (fileUri, ctx) => {
            if (doSym) {
                SymbolEx.instance().parse(fileUri, ctx);
            }
            if (Setting.instance().isLuaCheckOpen()) {
                DiagnosticProvider.instance().check(fileUri, ctx);
            }
        }, uri
        );
    }

    // 文件增删
    private onFilesChange(handler: DidChangeWatchedFilesParams) {
        for (const event of handler.changes) {

            const uri = event.uri;
            const type = event.type;
            switch (type) {
                case FileChangeType.Created: {
                    this.doFileChange(uri, true);
                    break;
                }
                case FileChangeType.Changed: {
                    const doc = this.documents.get(uri);
                    // 取得到文档，说明是已打开的文件，在 onDocumentChange 处理
                    // 这里只处理没打开的文件
                    if (doc) {
                        this.doFileChange(uri, false);
                        return;
                    }

                    this.doFileChange(uri, true);
                    break;
                }
                case FileChangeType.Deleted: {
                    SymbolEx.instance().delDocumentSymbol(uri);
                    DiagnosticProvider.instance().deleteChecking(uri);
                    break;
                }
            } // switch
        } // for
    }

    private onHover(handler: TextDocumentPositionParams): Hover | null {
        // return {
        //     contents: {
        //         //language: "lua",
        //         kind: MarkupKind.Markdown,
        //         value: "```lua\nfunction(a, b) return a + b end\n```"
        //     },
        //     range: {
        //         start: { line: 0, character: 0 },
        //         end: { line: 1, character: 0 }
        //     }
        // };

        return HoverProvider.instance().doHover(
            srv, handler.textDocument.uri, handler.position);
    }

    // 函数调用，参数辅助
    private onSignature(
        handler: TextDocumentPositionParams): SignatureHelp | null {

        const pos = handler.position;
        const uri = handler.textDocument.uri;
        const doc = this.documents.get(uri);

        if (!doc) {
            return null;
        }
        return SignatureProvider.instance().doSignature(
            this, uri, pos, doc.getText(), doc.offsetAt(pos));
    }

    // 配置变化，现在并没有做热更处理，需要重启vs code
    private onConfiguration(handler: DidChangeConfigurationParams) {
        Setting.instance().setConfiguration(handler.settings);
        DiagnosticProvider.instance().updateCmdArgs();
    }

    // 保存文件
    private onSaveDocument(handler: TextDocumentChangeEvent<TextDocument>) {
        if (!Setting.instance().isCheckOnSave()) {
            return;
        }
        const doc = handler.document;
        DiagnosticProvider.instance().check(doc.uri, doc.getText());
    }
}

const srv = new Server();
srv.init();

