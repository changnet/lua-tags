// 处理鼠标悬浮提示

import { Hover, MarkupKind, SymbolKind } from 'vscode-languageserver';

import { SymbolEx } from './symbol';
import { Utils } from './utils';

import { SymInfoEx, CommentType } from './parseSymbol';

import { Search } from './search';

import { Server } from './server';

import { AnnotationRegistry, ClassAnnotation, createSimpleType } from './annotation';

import { getAnnotationSymbolAt } from './annotationNav';

import { Setting } from './setting';

import { ParseSymbol } from './parseSymbol';

import { Position } from 'vscode-languageserver';

export class HoverProvider {
    private static ins: HoverProvider;

    private constructor() {}

    public static instance() {
        if (!HoverProvider.ins) {
            HoverProvider.ins = new HoverProvider();
        }

        return HoverProvider.ins;
    }

    private toLuaMarkdown(sym: SymInfoEx, ctx: string, uri: string, annotationInfo?: string): string {
        const path = SymbolEx.getPathPrefix(sym, uri);
        let above = '';
        let lineEnd = '';
        let prefix = '';
        if (sym.comment) {
            switch (sym.ctType) {
                case CommentType.CT_ABOVE:
                    above = '\n' + sym.comment;
                    break;
                case CommentType.CT_LINEEND:
                    lineEnd = ' ' + sym.comment;
                    break;
                case CommentType.CT_HTML:
                    prefix = sym.comment + '\n';
                    break;
            }
        }

        const ref = SymbolEx.instance().getRefValue(sym);
        // eslint-disable-next-line max-len
        let extraInfo = '';
        if (annotationInfo) {
            extraInfo = '\n' + annotationInfo;
        }

        let luaBody = `${ctx}${ref}${lineEnd}`;
        if (above || extraInfo) {
            luaBody += `${above}${extraInfo}`;
        }
        return `${path}${prefix}\`\`\`lua\n${luaBody}\n\`\`\``;
    }

    /**
     * 格式化类的hover显示
     * 格式: class ClassName { field : type -- description }
     */
    private formatClassMarkdown(cls: ClassAnnotation, uri: string): string {
        const lines: string[] = [];
        const className = cls.parent ? `${cls.name} : ${cls.parent}` : cls.name;
        lines.push(`class ${className} {`);

        for (const [fieldName, field] of cls.fields) {
            const typeDesc = SymbolEx.instance().formatType(field.type);
            const desc = field.description ? ` -- ${field.description}` : '';
            lines.push(`    ${fieldName} : ${typeDesc}${desc}`);
        }

        lines.push('}');

        // 添加类描述
        if (cls.description) {
            lines.push('');
            lines.push(`-- ${cls.description}`);
        }

        return `\`\`\`lua\n${lines.join('\n')}\n\`\`\``;
    }

    private defaultTips(sym: SymInfoEx, uri: string) {
        const prefix = SymbolEx.getLocalTypePrefix(sym.local);
        const base = SymbolEx.getBasePrefix(sym);

        // 注解字段（来自@field），使用annotationType显示类型
        if (sym.annotationType) {
            return this.toLuaMarkdown(
                sym,
                `${prefix}${base}${sym.name} : ${sym.annotationType}`,
                uri,
            );
        }

        // 获取注解类型信息
        const typeDesc = SymbolEx.instance().getVariableTypeDesc(uri, sym) || 'any';

        if (sym.value) {
            return this.toLuaMarkdown(
                sym,
                `${prefix}${base}${sym.name} = ${sym.value} : ${typeDesc}`,
                uri
            );
        }

        if (sym.local || sym.refType) {
            return this.toLuaMarkdown(sym, `${prefix}${base}${sym.name} : ${typeDesc}`, uri);
        }

        if (sym.location.uri !== uri) {
            return this.toLuaMarkdown(sym, `${sym.name} : ${typeDesc}`, uri);
        }

        return null;
    }

    private toOneMarkdown(sym: SymInfoEx, uri: string): string | null {
        let tips: string | null = null;
        switch (sym.kind) {
            case SymbolKind.Function: {
                const local = sym.local ? 'local ' : '';
                let parameters = '';
                if (sym.parameters) {
                    parameters = sym.parameters.join(', ');
                }
                const base = SymbolEx.getBasePrefix(sym);

                // 检查函数注解
                const registry = AnnotationRegistry.instance();
                const funcAnnotation = registry.getLineFunction(
                    sym.location.uri,
                    sym.location.range.start.line,
                );

                // 如果有注解参数，使用注解参数
                let displayParams = parameters;
                if (funcAnnotation && funcAnnotation.params.length > 0) {
                    displayParams = funcAnnotation.params
                        .map(p => p.type
                            ? `${p.name}: ${SymbolEx.instance().formatType(p.type)}`
                            : p.name)
                        .join(', ');
                }

                let returnDesc = 'any';
                if (funcAnnotation?.returns) {
                    returnDesc = SymbolEx.instance().formatType(funcAnnotation.returns);
                }

                tips = this.toLuaMarkdown(
                    sym,
                    `${local}function ${base}${sym.name}(${displayParams}) : ${returnDesc}`,
                    uri,
                );
                break;
            }
            case SymbolKind.Namespace: {
                const local = sym.local ? 'local ' : '';
                const typeDesc = SymbolEx.instance().getVariableTypeDesc(uri, sym);
                if (typeDesc) {
                    tips = this.toLuaMarkdown(
                        sym,
                        `${local}${sym.name} : ${typeDesc}`,
                        uri,
                    );
                } else {
                    tips = this.toLuaMarkdown(
                        sym,
                        `(table) ${local}${sym.name}`,
                        uri,
                    );
                }
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
        const MAX_HOVER_COUNT = 64;
        if (symList.length > MAX_HOVER_COUNT) {
            Utils.instance().Debug(`hover result count ${symList.length} exceeds limit ${MAX_HOVER_COUNT}, truncated`);
            symList = symList.slice(0, MAX_HOVER_COUNT);
        }

        const list: string[] = [];
        const registry = AnnotationRegistry.instance();

        for (const sym of symList) {
            // 检查是否是类定义
            if (sym.kind === SymbolKind.Class) {
                const cls = registry.getGlobalClass(sym.name);
                if (cls) {
                    list.push(this.formatClassMarkdown(cls, uri));
                    continue;
                }
            }

            const markdown = this.toOneMarkdown(sym, uri);
            if (markdown) {
                list.push(markdown);
            }
        }

        return list.join('\n---\n');
    }

    /* 搜索模块名
     * 正常情况下，声明一个模块都会产生一个符号
     * 但table.empty = function() ... end这种扩展标准库或者C++导出的模块时就没有
     * 所以这里特殊处理
     */
    private searchModuleName(name: string) {
        if (!SymbolEx.instance().getGlobalModuleSubList([name])) {
            return null;
        }

        return `\`\`\`lua\n(module) ${name}\n\`\`\``;
    }

    /**
     * 为注解中的类型名（如 `-- @type Foo:Bar` 的 Foo / Bar）提供 hover 提示。
     * 与 GoToDefinition.getAnnotationTypeDefinition 共用同一套 token 提取逻辑，
     * 因此 Foo:Bar / Foo : Bar / Foo: Bar 三种写法表现一致。
     */
    private getAnnotationTypeHover(
        text: string,
        pos: Position,
        uri: string,
    ): string | null {
        // 从注解行取出光标处的符号（合法字符：字母/数字/点号），base 为冒号前的符号
        const sym = getAnnotationSymbolAt(text, pos.character);
        if (!sym) {
            return null;
        }

        const registry = AnnotationRegistry.instance();

        // 1) 类定义：Foo（包括 @class X : Foo 中的父类 Foo）直接展示类信息
        const cls = registry.getGlobalClass(sym.name);
        if (cls) {
            return this.formatClassMarkdown(cls, uri);
        }

        // 2) 别名定义
        const alias = registry.getGlobalAlias(sym.name);
        if (alias) {
            const typeStr = SymbolEx.instance().formatType(alias.type);
            return `\`\`\`lua\n(alias) ${alias.name} = ${typeStr}\n\`\`\``;
        }

        // 3) 冒号分隔的继承/成员符号（如 Foo:bar 中的 bar），解析为 Foo 的成员字段
        if (sym.base) {
            const baseCls = registry.getGlobalClass(sym.base);
            if (baseCls) {
                const field = registry.resolveField(
                    uri,
                    createSimpleType(baseCls.name),
                    sym.name,
                );
                if (field) {
                    const typeStr = SymbolEx.instance().formatType(field.type);
                    const desc = field.description
                        ? ` -- ${field.description}`
                        : '';
                    return `\`\`\`lua\n${field.name} : ${typeStr}${desc}\n\`\`\``;
                }
            }
        }

        return null;
    }

    public doHover(srv: Server, uri: string, pos: Position): Hover | null {
        const line = srv.getQueryText(uri, pos);
        if (!line) {
            return null;
        }

        // 注解中的类型名（Foo:Bar 等），展示类/字段/别名信息
        const annoValue = this.getAnnotationTypeHover(line, pos, uri);
        if (annoValue) {
            return {
                contents: {
                    kind: MarkupKind.Markdown,
                    value: annoValue,
                },
            };
        }

        const query = srv.getQuerySymbol(uri, line, pos);
        if (!query || query.name === '') {
            return null;
        }

        const list = Search.instance().search(srv, query);

        const value = list
            ? this.toMarkdown(list, uri)
            : this.searchModuleName(query.name);

        if (!value || value === '') {
            return null;
        }

        return {
            contents: {
                kind: MarkupKind.Markdown,
                value: value,
            },
        };
    }
}
