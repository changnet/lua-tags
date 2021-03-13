// 参数填充辅助


import {
    SymbolKind,
    Position,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    MarkupContent,
    MarkupKind
} from 'vscode-languageserver';
import { Server } from './server';
import { SymbolEx, SymInfoEx, CommentType } from './symbol';
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
        uri: string): SignatureInformation | null {

        /**
         * local comp = string_comp
         * 当string_comp是函数时，需要显示string_comp的参数
         */
        const refSym = SymbolEx.instance().getRefSym(sym, sym.location.uri);
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
            const mark = SymbolEx.refMark;
            funcName = `${funcName} ${mark} ${sym.refType.join(".")}`;
        }
        const parameters: ParameterInformation[] = [];
        if (symParam) {
            funcParam = symParam.join(", ");

            // +1是因为函数名和参数之间有个左括号
            let offset = funcName.length + 1;
            for (const param of symParam) {
                parameters.push({
                    label: [offset, offset + param.length]
                });
                // test(a, b, c)每个参数的位置中包含一个逗号和上空格，所以加2
                offset += param.length + 2;
            }
        }

        // 当前符号没有注释，就显示引用的符号的
        let ctType = sym.ctType;
        let comment = sym.comment;
        if (!comment && refSym) {
            ctType = refSym.ctType;
            comment = refSym.comment;
        }

        const file = SymbolEx.getPathPrefix(sym, uri);

        let doc;
        if (comment || file) {
            let value = file;
            if (comment) {
                value += ctType === CommentType.CT_HTML
                    ? comment : `\`\`\`lua\n${comment}\n\`\`\``;
            }
            doc = {
                kind: MarkupKind.Markdown,
                value: value
            } as MarkupContent;
        }

        return {
            label: `${funcName}(${funcParam})`,
            parameters: parameters,
            documentation: doc
        };
    }

    /**
     * 扫描出要查询的符号信息
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
        const lineText = -1 === symOffset ?
            "" : text.substring(symOffset - character, symOffset);

        return {
            line: line,
            index: index,
            offset: symOffset,
            character: character,
            lineText: lineText
        };
    }

    private calcActivieParam(sym: SymInfoEx, index: number, indexer?: string) {
        // 以.声明的函数通过:调用，则参数会相差一个self
        if (sym.indexer === "." && indexer === ":") {
            index += 1;
        }

        if (sym.indexer === ":" && indexer === ".") {
            index -= 1;
        }

        // 如果有多个候选函数，这里是无法区分到底用哪一个的，尝试通过参数判断
        // TODO 可变参数未处理
        if (!sym.parameters || index < sym.parameters.length) {
            return index;
        }

        return null;
    }

    public doSignature(srv: Server, uri: string,
        pos: Position, text: string, offset: number): SignatureHelp | null {
        const info = this.scanSym(text, offset);
        if (-1 === info.offset) {
            return null;
        }

        const line = pos.line - info.line;
        const query = srv.getQuerySymbol(uri, info.lineText, {
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
        const signatureList: SignatureInformation[] = [];
        symList.forEach((sym, index) => {
            // when define a function, do signature itself
            if (uri === sym.location.uri
                && line === sym.location.range.start.line) {
                return;
            }
            const sig = this.toSignature(sym, uri);
            if (sig) {
                signatureList.push(sig);
                // 如果有多个函数，输入的参数超过了第一个，尝试下一个函数
                if (null === activeIndex) {
                    const idx = this.calcActivieParam(
                        sym, info.index, query.indexer);
                    if (idx) {
                        activeIndex = index;
                        activeParam = idx;
                    }
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
