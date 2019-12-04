// 处理鼠标悬浮提示


import {
    Hover,
    Range,
    Position,
    Location,
    MarkupKind,
    MarkupContent,
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

import {
    Symbol,
    SymInfoEx,
    SymbolQuery,
    VSCodeSymbol
} from "./symbol";

import {
    Node
} from 'luaparse';

import {
    Search
} from "./search";

import {
    Server
} from "./server";

import {
    GoToDefinition
} from "./goToDefinition";

export class HoverProvider {
    private static ins: HoverProvider;

    private constructor() {
    }

    public static instance() {
        if (!HoverProvider.ins) {
            HoverProvider.ins = new HoverProvider();
        }

        return HoverProvider.ins;
    }

    private getPathPrefix(sym: SymInfoEx, uri?: string) {
        // 不在当前文件的符号中显示文件名
        if (uri && sym.location.uri === uri) {
            return "";
        }

        let file = Symbol.getSymbolPath(sym);
        return file ? `${file}\n` : "";
    }

    private toLuaMarkdown(sym: SymInfoEx, ctx: string, uri: string): string {
        let path = this.getPathPrefix(sym, uri);
        let comment = sym.comment ? `\`\`\`txt\n${sym.comment}\n\`\`\`\n` : "";
        return `${path}${comment}\`\`\`lua\n${ctx}\n\`\`\``;
    }

    private defaultTips(sym: SymInfoEx, uri: string) {
        if (sym.value) {
            let local = Symbol.getLocalTypePrefix(sym.local);
            return this.toLuaMarkdown(sym,
                `${local}${sym.name} = ${sym.value}`, uri);
        }

        if (sym.local) {
            let local = Symbol.getLocalTypePrefix(sym.local);
            if ("" === local) {
                return null;
            }
            return this.toLuaMarkdown(sym, `${local}${sym.name}`, uri);
        }

        return null;
    }

    private toOneMarkdown(sym: SymInfoEx, uri: string): string | null {
        let tips: string | null = null;
        switch (sym.kind) {
            case SymbolKind.Function: {
                let local = sym.local ? "local " : "";
                let parameters = "";
                if (sym.parameters) {
                    parameters = sym.parameters.join(", ");
                }
                let base = sym.base ? `${sym.base}${sym.indexer}` : "";

                tips = this.toLuaMarkdown(sym,
                    `${local}function ${base}${sym.name}(${parameters})`, uri);
                break;
            }
            case SymbolKind.Namespace: {
                let local = sym.local ? "local " : "";
                tips = this.toLuaMarkdown(sym,
                    `(table) ${local}${sym.name}`, uri);
                break;
            }
            case SymbolKind.Module: {
                tips = this.toLuaMarkdown(sym, `(module) ${sym.name}`, uri);
                break;
            }
            default: {
                return this.defaultTips(sym, uri);
            }

        }
        return tips;
    }

    private toMarkdown(symList: SymInfoEx[], uri: string): string {
        let list: string[] = [];
        for (let sym of symList) {
            const markdown = this.toOneMarkdown(sym, uri);
            if (markdown) {
                list.push(markdown);
            }
        }

        return list.join("\n---\n");
    }

    public doHover(srv: Server, uri: string, pos: Position): Hover | null {
        let line = srv.getQueryText(uri, pos);
        if (!line) { return null; }

        let query = srv.getSymbolQuery(uri, line, pos);
        if (!query || query.name === "") { return null; }

        let list = Search.instance().search(srv, query);

        if (!list) {
            return null;
        }

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: this.toMarkdown(list, uri)
            }
        };
    }
}
