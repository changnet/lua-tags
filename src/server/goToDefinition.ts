// 跳转到符号定义

import { Position, Definition } from 'vscode-languageserver';

import { SymbolEx } from './symbol';

import { Search } from './search';

import { Server } from './server';

import {
    AnnotationRegistry,
    createSimpleType,
} from './annotation';

import { getAnnotationSymbolAt } from './annotationNav';

import { Setting } from './setting';

import { ParseSymbol } from './parseSymbol';

export class GoToDefinition {
    private static ins: GoToDefinition;

    private constructor() {}

    public static instance() {
        if (!GoToDefinition.ins) {
            GoToDefinition.ins = new GoToDefinition();
        }

        return GoToDefinition.ins;
    }

    // require("aaa.bbb") / import("aaa.bbb") / include("aaa.bbb.lua") 这种，打开对应文件
    private getRequireDefinition(
        text: string,
        pos: Position,
    ): Definition | null {
        // 注意特殊情况下，可能会有 require "a/b" require "a\b"
        const found = Setting.instance().getLoadFuncPathRegex(text, true);
        if (!found || !found[1]) {
            return null;
        }

        // 光标的位置不在 require("a.b.c") 范围内
        const start = text.indexOf(found[0]);
        if (start > pos.character || pos.character > start + found[0].length) {
            return null;
        }

        // 统一用 toModulePath 归一化（去 .lua 后缀、/ \ 统一为 .）再解析 uri
        const uri = SymbolEx.instance().getRequireUri(
            ParseSymbol.toModulePath(found[1]),
        );
        if ('' === uri) {
            return null;
        }

        return {
            uri: uri,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
            },
        };
    }

    /**
     * 获取注解中类型名的跳转定义
     * 例如: ---@type Dog 中的Dog，跳转到Dog类的定义
     *
     * 支持继承/成员表达式（顶层冒号分隔）：
     *   -- @type Foo:Bar        点击 Bar → 跳转到 Bar 的定义（类，或 Foo 的成员字段）
     *   -- @type Foo : Bar      同上（冒号前后允许空格）
     *   -- @type Foo: Bar       同上
     *   -- @class Bar : Foo     点击 Foo（父类）→ 跳转到 @class Foo
     */
    private getAnnotationTypeDefinition(
        text: string,
        pos: Position,
        uri: string,
    ): Definition | null {
        // 从注解行取出光标处的符号（合法字符：字母/数字/点号），base 为冒号前的符号
        const sym = getAnnotationSymbolAt(text, pos.character);
        if (!sym) {
            return null;
        }

        const registry = AnnotationRegistry.instance();

        // 1) 当作类名跳转（@class X : Y 里的 Y 是父类，也走这里；@type Foo:Bar 里的
        //    Bar 若是类同样命中）
        const cls = registry.getGlobalClass(sym.name);
        if (cls) {
            return {
                uri: cls.uri,
                range: {
                    start: { line: cls.line, character: cls.character },
                    end: {
                        line: cls.line,
                        character: cls.character + cls.name.length,
                    },
                },
            };
        }

        // 2) 当作别名跳转
        const alias = registry.getGlobalAlias(sym.name);
        if (alias) {
            return {
                uri: alias.uri,
                range: {
                    start: { line: alias.line, character: alias.character },
                    end: {
                        line: alias.line,
                        character: alias.character + alias.name.length,
                    },
                },
            };
        }

        // 3) 若该符号被顶层冒号分隔（继承/成员），尝试解析为 base 的成员字段
        //    例如 @type Foo:bar 里的 bar 是 Foo 的成员字段
        if (sym.base) {
            const baseCls = registry.getGlobalClass(sym.base);
            if (baseCls) {
                const field = registry.resolveField(
                    uri,
                    createSimpleType(baseCls.name),
                    sym.name,
                );
                if (field && field.uri) {
                    return {
                        uri: field.uri,
                        range: {
                            start: { line: field.line, character: field.character },
                            end: {
                                line: field.line,
                                character: field.character + field.name.length,
                            },
                        },
                    };
                }
            }
        }

        return null;
    }

    public doDefinition(srv: Server, uri: string, pos: Position) {
        const line = srv.getQueryText(uri, pos);
        if (!line) {
            return [];
        }

        // require("a.b.c") 跳转到对应的文件
        let loc: Definition | null = this.getRequireDefinition(line, pos);
        if (loc) {
            return loc;
        }

        // 尝试从注解中跳转到类型定义
        loc = this.getAnnotationTypeDefinition(line, pos, uri);
        if (loc) {
            return loc;
        }

        const query = srv.getQuerySymbol(uri, line, pos);
        if (!query || query.name === '') {
            return [];
        }

        const list = Search.instance().search(srv, query);
        if (!list) {
            return [];
        }

        loc = [];
        for (const sym of list) {
            // stl 使用了一个空串作为位置
            if ('' === sym.location.uri) {
                continue;
            }
            loc.push(sym.location);
        }

        return loc;
    }
}
