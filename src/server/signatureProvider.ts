// 参数填充辅助


import {
    Hover,
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
    FileChangeType,
    InitializeResult,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation
} from 'vscode-languageserver';
import { Server } from './server';
import { Utils } from './utils';
import { GoToDefinition } from './goToDefinition';
import { Symbol, SymInfoEx, LocalType } from './symbol';
import { Search } from './search';

/**
 * 处理函数特征(参数)显示
 */
export class SignatureProvider {
    private static ins: SignatureProvider;
    private constructor() {
    }

    public static instance() {
        if (!SignatureProvider.ins) {
            SignatureProvider.ins = new SignatureProvider();
        }

        return SignatureProvider.ins;
    }

    private toSignature(sym: SymInfoEx,
        uri: string, index: number): SignatureInformation | null {

        /**
         * local comp = string_comp
         * 当string_comp是函数时，需要显示string_comp的参数
         */
        const refSym = Symbol.instance().getRefSym(sym, uri);
        if (sym.kind !== SymbolKind.Function
            && (!refSym || refSym.kind !== SymbolKind.Function)) {
            return null;
        }

        /**
         * 拼接的参数
         */
        let funcParam = "";
        let symParam = sym.parameters;
        let funcName = `function ${sym.name}`;
        if (refSym && sym.refType) {
            symParam = refSym.parameters;
            funcName = `${funcName} -> ${sym.refType.join(".")}`;
        }
        let parameters: ParameterInformation[] = [];
        if (symParam) {
            funcParam = symParam.join(", ");

            // 如果当前输入的参数已超过这个函数的参数，则不用计算当前输入的参数
            // 显示全部参数就可以了
            if (index < symParam.length) {
                // +1是因为函数名和参数之间有个左括号
                let offset = funcName.length + 1;
                for (let param of symParam) {
                    parameters.push({
                        label: [offset, offset + param.length]
                    });
                    // test(a, b, c)每个参数的位置中包含一个逗号和上空格，所以加2
                    offset += param.length + 2;
                }
            }
        }

        let doc;
        if (uri !== sym.location.uri) {
            doc = Symbol.getSymbolPath(sym);
        }

        return {
            label: `${funcName}(${funcParam})`,
            parameters: parameters,
            documentation: doc ? doc : undefined
        };
    }

    /* 扫描出要查询的符号信息
     * test(a, {a = 1, b = 2}, function(a, b) end,)
     * 通过 {} () 配对查找出当前要提示的函数名和参数索引
     * 这个配对是不太准确的，如果中间有注释、字符串包含这些符号，那就不对了
     * 正确的做法是通过词法一个个解析，这个后面有时间再做了
     */
    private scanSym(text: string, offset: number) {
        let line = 0;
        let scope = 0;
        let index = 0;
        let symOffset = -1;

        // 调试发现，vs code发过来的位置在光标后一个字符
        offset = offset - 1;

        // 最多逆向查找256个字符
        let minOffset = Math.max(offset - 256, 0);
        for (let pos = offset; pos >= minOffset; pos--) {
            const char = text.charAt(pos);
            // 换行时，\r\n和\n都只用\n来判断
            if ("\n" === char) {
                line++;
                continue;
            }
            if (0 === scope && "," === char) {
                index++;
            } else if (")" === char || "}" === char) {
                scope++;
            } else if ("(" === char || "{" === char) {
                scope--;
                if (scope < 0) {
                    symOffset = pos;
                    break;
                }
            }
        }

        // 函数名所在行找出来(如果函数名刚好和()之前换行了，就找不到了，不处理)
        let character = 0;
        minOffset = Math.max(offset - 256, 0);
        for (let pos = symOffset; pos >= minOffset; pos--) {
            if ("\n" === text.charAt(pos)) {
                break;
            }
            character++;
        }
        let lineText = -1 === symOffset ?
            "" : text.substring(symOffset - character, symOffset);

        return {
            line: line,
            index: index,
            offset: symOffset,
            character: character,
            lineText: lineText
        };
    }

    public doSignature(srv: Server, uri: string,
        pos: Position, text: string, offset: number): SignatureHelp | null {
        let info = this.scanSym(text, offset);
        if (-1 === info.offset) {
            return null;
        }

        const line = pos.line - info.line;
        let query = srv.getQuerySymbol(uri, info.lineText, {
            line: line, character: info.character
        });
        if (!query) {
            return null;
        }

        const symList = Search.instance().search(srv, query);
        if (!symList) {
            return null;
        }

        let activeIndex: number | null = null;
        let activeParam: number | null = null; // 为null则vs code不选中参数
        let signatureList: SignatureInformation[] = [];
        symList.forEach((sym, index) => {
            // when define a function, do signature itself
            if (uri === sym.location.uri
                && line === sym.location.range.start.line) {
                return;
            }
            let sig = this.toSignature(sym, uri, info.index);
            if (sig) {
                signatureList.push(sig);
                // 如果有多个函数，输入的参数超过了第一个，尝试下一个
                if (null === activeIndex && (!sym.parameters
                    || info.index < sym.parameters.length)) {
                    activeIndex = index;
                    activeParam = info.index;
                }
            }
        });

        return {
            signatures: signatureList,
            activeSignature: activeIndex,
            activeParameter: activeParam
        };
    }
}
