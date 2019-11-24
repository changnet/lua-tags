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

    private getPathPrefix(sym: SymInfoEx) {
        let file = Symbol.getSymbolPath(sym);
        return file ? `${file}:\n` : "";
    }

    private toLuaMarkdown(sym: SymInfoEx, ctx: string): string {
        return `${this.getPathPrefix(sym)}\`\`\`lua\n${ctx}\n\`\`\``;
    }

    private toOneMarkdown(sym: SymInfoEx): string | null {
        let tips: string | null = null;
        switch (sym.kind) {
            case SymbolKind.Function: {
                let local = sym.local ? "local " : "";
                let parameters = "";
                if (sym.parameters) {
                    parameters = sym.parameters.join(", ");
                }
                tips = this.toLuaMarkdown(sym,
                    `${local}function ${sym.name}(${parameters})`);
                break;
            }
            case SymbolKind.Module: {
                let file = Symbol.getSymbolPath(sym);
                tips = `${this.getPathPrefix(sym)}(Module) ${sym.name}`;
                break;
            }
            default: {
                if (!sym.value) {
                    return null;
                }

                let file = Symbol.getSymbolPath(sym);
                let local = sym.local ? "local " : "";
                tips = this.toLuaMarkdown(sym,
                    `${local}${sym.name} = ${sym.value}`);
            }
        }
        return tips;
    }

    private toMarkdown(symList: SymInfoEx[]): string {
        let list: string[] = [];
        for (let sym of symList) {
            const markdown = this.toOneMarkdown(sym);
            if (markdown) {
                list.push(markdown);
            }
        }

        return list.join("\n---\n");
    }

    public doHover(srv: Server, uri: string, pos: Position): Hover {
        let ctx: MarkupContent = {
            kind: MarkupKind.Markdown,
            value: ""
        };
        let hover: Hover = {
            contents: ctx
        };
        let line = srv.getQueryLineText(uri, pos);
        if (!line) { return hover; }

        let query = srv.getSymbolQuery(uri, line, pos);
        if (!query || query.symName === "") { return hover; }

        let list = GoToDefinition.instance().searchSym(srv, query);

        if (list) {
            ctx.value = this.toMarkdown(list);
        }
        return hover;
    }
}
