// 跳转到符号定义

import { Position, Definition } from 'vscode-languageserver';

import { SymbolEx } from './symbol';

import { Search } from './search';

import { Server } from './server';

import { AnnotationRegistry } from './annotation';

// 注解类型模式 - 支持 ---@ 和 -- @ 两种格式（匹配原始行文本）
const ANNOTATION_TYPE_PATTERN = /^--\s*-?@(?:type|field|param|return|alias|class)\s+(?:\w+\s+)?(\w+)/;

export class GoToDefinition {
    private static ins: GoToDefinition;

    private constructor() {}

    public static instance() {
        if (!GoToDefinition.ins) {
            GoToDefinition.ins = new GoToDefinition();
        }

        return GoToDefinition.ins;
    }

    // require("aaa.bbb")这种，则打开对应的文件
    private getRequireDefinition(
        text: string,
        pos: Position,
    ): Definition | null {
        // 注意特殊情况下，可能会有 require "a/b" require "a\b"
        const found = text.match(/require\s*[(]?\s*"([/|\\|.|\w]+)"\s*[)]?/);
        if (!found || !found[1]) {
            return null;
        }

        // 光标的位置不在require("a.b.c")范围内
        const start = text.indexOf(found[0]);
        if (start > pos.character || pos.character > start + found[0].length) {
            return null;
        }

        const uri = SymbolEx.instance().getRequireUri(found[1]);
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
     */
    private getAnnotationTypeDefinition(
        text: string,
        pos: Position,
        uri: string,
    ): Definition | null {
        // 检查是否是注解行（支持 ---@ 和 -- @ 格式）
        const trimmedLine = text.trim();
        if (!/^--\s*-?@/.test(trimmedLine)) {
            return null;
        }

        // 提取类型名
        const match = trimmedLine.match(ANNOTATION_TYPE_PATTERN);
        if (!match || !match[1]) {
            return null;
        }

        const typeName = match[1];

        // 检查光标是否在类型名范围内
        const typeStart = text.indexOf(typeName);
        if (typeStart < 0 || pos.character < typeStart || pos.character > typeStart + typeName.length) {
            return null;
        }

        // 查找类定义
        const registry = AnnotationRegistry.instance();
        const cls = registry.getGlobalClass(typeName);
        if (cls) {
            return {
                uri: cls.uri,
                range: {
                    start: { line: cls.line, character: 0 },
                    end: { line: cls.line, character: cls.name.length },
                },
            };
        }

        // 查找别名定义
        const alias = registry.getGlobalAlias(typeName);
        if (alias) {
            return {
                uri: alias.uri,
                range: {
                    start: { line: alias.line, character: 0 },
                    end: { line: alias.line, character: alias.name.length },
                },
            };
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
