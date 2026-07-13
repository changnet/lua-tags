// 注解解析 - 从注释中解析注解符号

import { Comment } from 'luaparse';
import { SymInfoEx } from './parseSymbol';
import {
    AnnotationType,
    AnnotationParam,
    ClassAnnotation,
    FieldAnnotation,
    FunctionAnnotation,
    TypeAnnotation,
    AliasAnnotation,
    createSimpleType,
    createArrayType,
    createTableType,
    createFuncType,
} from './annotation';

// 注解正则表达式
// extractCommentText 已经去掉了 -- 或 --- 前缀，所以直接匹配 @annotation
// @class ClassName [description]
// 类型名允许带点（如 protobuf.a.b），作为一个整体，不是多层嵌套表
const CLASS_PATTERN = /^-?@class\s+([\w.]+)(?:\s*:\s*([\w.]+))?(?:\s+(?:-\s*)?(.*))?$/;
// @field fieldName typeName [description]
// 字段/参数名保持为单一标识符(\w+)；类型部分（含点）交给 extractTypeAndDescription
const FIELD_LINE = /^-?@field\s+(\w+)\s+(.*)$/;
// @param paramName typeName [description]
const PARAM_LINE = /^-?@param\s+(\w+)\s+(.*)$/;
// @return typeName [description]
const RETURN_LINE = /^-?@return\s+(.*)$/;
// @type typeName [description]
const TYPE_LINE = /^-?@type\s+(.*)$/;
// @alias AliasName typeName [description]
// 别名同样允许带点（如 protobuf.a.b）
const ALIAS_LINE = /^-?@alias\s+([\w.]+)\s+(.*)$/;

/**
 * 判断一个字符串是否「看起来像类型」。
 *
 * 类型表达式的合法字符集为：标识符字符（`\w`）、点（module 路径）、
 * 方括号/尖括号/圆括号（数组/泛型/函数）、逗号、冒号、空格（仅出现在括号内部，
 * 例如 `table<string, number>`、`func(a: number)`）。
 * 描述性文字（中文、全角标点、引号等）不在合法字符集中，因此可据此区分。
 *
 * 此外类型表达式必须以标识符字符（字母/下划线）开头，否则视为没有类型、
 * 整段都是描述。
 */
function isTypeLike(s: string): boolean {
    s = s.trim();
    if (s === '') {
        return false;
    }
    // 必须以字母/下划线开头
    if (!/^[A-Za-z_]/.test(s)) {
        return false;
    }
    // 只允许类型语法字符
    return /^[\w.<>\[\](),: ]+$/.test(s);
}

/**
 * 从注解尾部（@param/@field/@return/@type/@alias 去掉名字/关键字后的部分）中
 * 拆分出「类型」与「描述」。
 *
 * 两种情形：
 *  1. 包含类型：`@param name Type desc` —— 第一个「类型表达式」（括号配平地扫描，
 *     使 `table<K,V>`/`func(...)`/`Foo[]` 等保持完整）若通过 isTypeLike 校验，
 *     则作为类型，剩余部分（去掉可选的 `-` 前缀）作为描述。
 *  2. 不包含类型：`@param name 这是一段描述` —— 首个字符不是标识符（如中文），
 *     或首个 token 不是合法类型，则整段视为描述，不显示类型。
 *
 * 关键点：类型表达式可能包含括号字面量（如 `{"pid", 999}`、函数类型
 * `func(a:number)`、泛型 `table<K,V>`），内部允许空格和逗号；只有括号层级为 0
 * 的空格才作为「类型/描述」的分隔符，避免把描述里的 `{}` 截断。
 */
function extractTypeAndDescription(rest: string): { typeStr?: string; description?: string } {
    rest = rest.trim();
    if (rest === '') {
        return {};
    }

    // 不以标识符字符开头 → 没有类型，整段都是描述
    if (!/^[A-Za-z_]/.test(rest)) {
        let desc = rest;
        if (desc.startsWith('-')) {
            desc = desc.substring(1).trim();
        }
        return { description: desc.length > 0 ? desc : undefined };
    }

    let depth = 0;
    let i = 0;
    let lastNonSpace = '';
    for (; i < rest.length; i++) {
        const c = rest[i];
        if (c === '(' || c === '<' || c === '{') {
            depth++;
            lastNonSpace = c;
        } else if (c === ')' || c === '>' || c === '}') {
            if (depth > 0) {
                depth--;
            }
            lastNonSpace = c;
        } else if (c === ':') {
            // 冒号（如 func(...): 返回值）属于类型表达式的一部分，
            // 其后紧跟的空格不应作为「类型/描述」分隔符
            lastNonSpace = ':';
        } else if (c === ' ') {
            // 仅在括号层级为 0 且前一个非空格字符不是冒号时，
            // 才把空格视为类型与描述的分隔符
            if (depth === 0 && lastNonSpace !== ':') {
                break;
            }
            // 空格本身不更新 lastNonSpace
        } else {
            lastNonSpace = c;
        }
    }

    const candidate = rest.substring(0, i).trim();
    const restAfter = rest.substring(i).trim();

    if (candidate && isTypeLike(candidate)) {
        let desc = restAfter;
        // 兼容 `type - description` 写法，去掉描述前的连字符
        if (desc.startsWith('-')) {
            desc = desc.substring(1).trim();
        }
        return {
            typeStr: candidate,
            description: desc.length > 0 ? desc : undefined,
        };
    }

    // 不是合法类型：整段作为描述，不显示类型
    let desc = rest;
    if (desc.startsWith('-')) {
        desc = desc.substring(1).trim();
    }
    return { description: desc.length > 0 ? desc : undefined };
}

// 注解解析结果
export interface AnnotationResult {
    classes: Map<string, ClassAnnotation>;
    aliases: Map<string, AliasAnnotation>;
    types: Map<number, TypeAnnotation>;
    functions: Map<number, FunctionAnnotation>;
}

/**
 * 解析类型表达式
 * 支持: Foo, Foo[], table<K, V>, func(a:number, b:string):boolean, func()
 */
export function parseType(typeStr: string): AnnotationType {
    typeStr = typeStr.trim();

    // 检查是否为数组 Foo[]
    if (typeStr.endsWith('[]')) {
        const elementType = parseType(typeStr.slice(0, -2));
        return createArrayType(elementType);
    }

    // 检查是否为 table<K, V>
    const tableMatch = typeStr.match(/^table\s*<\s*(.+)\s*,\s*(.+)\s*>$/);
    if (tableMatch) {
        const keyType = parseType(tableMatch[1]);
        const valueType = parseType(tableMatch[2]);
        return createTableType(keyType, valueType);
    }

    // 检查是否为 func(...)
    const funcMatch = typeStr.match(/^func\s*\(([^)]*)\)\s*(:\s*(.+))?$/);
    if (funcMatch) {
        const paramsStr = funcMatch[1].trim();
        const returnsStr = funcMatch[3]?.trim();

        const params: AnnotationParam[] = [];
        if (paramsStr) {
            const paramParts = splitParams(paramsStr);
            for (const part of paramParts) {
                const colonIdx = part.indexOf(':');
                if (colonIdx > 0) {
                    const name = part.substring(0, colonIdx).trim();
                    const type = parseType(part.substring(colonIdx + 1).trim());
                    params.push({ name, type });
                } else {
                    // 没有指定类型，使用any
                    params.push({ name: part.trim(), type: createSimpleType('any') });
                }
            }
        }

        let returns: AnnotationType | undefined;
        if (returnsStr && returnsStr !== 'void') {
            returns = parseType(returnsStr);
        }

        return createFuncType(params, returns);
    }

    // 简单类型
    return createSimpleType(typeStr);
}

/**
 * 分割函数参数，处理嵌套泛型
 */
function splitParams(paramsStr: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let current = '';

    for (const ch of paramsStr) {
        if (ch === '<' || ch === '(') {
            depth++;
            current += ch;
        } else if (ch === '>' || ch === ')') {
            depth--;
            current += ch;
        } else if (ch === ',' && depth === 0) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current) {
        result.push(current);
    }

    return result;
}

/**
 * 解析一条注释行，返回注解类型
 */
interface AnnotationLine {
    type: 'class' | 'field' | 'param' | 'return' | 'type' | 'alias';
    data: any;
}

function parseAnnotationLine(line: string): AnnotationLine | null {
    // @class
    const classMatch = line.match(CLASS_PATTERN);
    if (classMatch) {
        return {
            type: 'class',
            data: {
                name: classMatch[1],
                parent: classMatch[2] || undefined,
                description: classMatch[3]?.trim() || undefined,
            },
        };
    }

    // @field
    const fieldMatch = line.match(FIELD_LINE);
    if (fieldMatch) {
        const { typeStr, description } = extractTypeAndDescription(fieldMatch[2]);
        return {
            type: 'field',
            data: {
                name: fieldMatch[1],
                typeStr,
                description,
            },
        };
    }

    // @param
    const paramMatch = line.match(PARAM_LINE);
    if (paramMatch) {
        const { typeStr, description } = extractTypeAndDescription(paramMatch[2]);
        return {
            type: 'param',
            data: {
                name: paramMatch[1],
                typeStr,
                description,
            },
        };
    }

    // @return
    const returnMatch = line.match(RETURN_LINE);
    if (returnMatch) {
        const { typeStr, description } = extractTypeAndDescription(returnMatch[1]);
        return {
            type: 'return',
            data: {
                typeStr,
                description,
            },
        };
    }

    // @type
    const typeMatch = line.match(TYPE_LINE);
    if (typeMatch) {
        const { typeStr, description } = extractTypeAndDescription(typeMatch[1]);
        return {
            type: 'type',
            data: {
                typeStr,
                description,
            },
        };
    }

    // @alias
    const aliasMatch = line.match(ALIAS_LINE);
    if (aliasMatch) {
        const { typeStr, description } = extractTypeAndDescription(aliasMatch[2]);
        return {
            type: 'alias',
            data: {
                name: aliasMatch[1],
                typeStr,
                description,
            },
        };
    }

    return null;
}

/**
 * 提取注释文本（去掉 -- 前缀）
 */
function extractCommentText(comment: string): string {
    // 去掉开头的 -- 或 ---
    let text = comment;
    if (text.startsWith('---')) {
        text = text.substring(3);
    } else if (text.startsWith('--')) {
        text = text.substring(2);
    }
    return text.trim();
}

/**
 * 解析注释中的注解，关联到对应的符号
 */
export function parseAnnotations(
    comments: Comment[],
    symList: SymInfoEx[],
    uri: string,
): AnnotationResult {
    const result: AnnotationResult = {
        classes: new Map(),
        aliases: new Map(),
        types: new Map(),
        functions: new Map(),
    };

    if (comments.length === 0) {
        return result;
    }

    // 构建行号到符号的映射
    const lineToSym = new Map<number, SymInfoEx>();
    for (const sym of symList) {
        const line = sym.location.range.start.line;
        lineToSym.set(line, sym);
    }

    // 构建行号到原始注释文本的映射，用于计算字符位置
    const rawLineMap = new Map<number, string>();
    for (const c of comments) {
        if (c.loc) {
            rawLineMap.set(c.loc.start.line - 1, c.raw);
        }
    }

    // 收集每个符号上方的注释块
    // 按行号排序注释
    const sortedComments = comments
        .filter(c => c.loc)
        .sort((a, b) => (a.loc!.start.line - b.loc!.start.line));

    // 当前正在处理的注释块
    let currentBlock: string[] = [];
    let currentBlockStartLine = -1;

    for (const comment of sortedComments) {
        if (!comment.loc) {
            continue;
        }

        const commentLine = comment.loc.start.line - 1; // 转换为0-based
        const text = extractCommentText(comment.raw);

        // 检查是否是连续的注释块
        if (currentBlockStartLine >= 0 && commentLine === currentBlockStartLine + currentBlock.length) {
            // 连续的注释
            currentBlock.push(text);
        } else {
            // 新的注释块，先处理之前的
            if (currentBlock.length > 0) {
                processCommentBlock(result, currentBlock, currentBlockStartLine, lineToSym, uri, rawLineMap);
            }
            currentBlock = [text];
            currentBlockStartLine = commentLine;
        }
    }

    // 处理最后一个注释块
    if (currentBlock.length > 0) {
        processCommentBlock(result, currentBlock, currentBlockStartLine, lineToSym, uri, rawLineMap);
    }

    return result;
}

/**
 * 计算注解中某个名字在原始行中的字符位置
 */
function calcAnnotationChar(rawLineMap: Map<number, string> | undefined, line: number, trimmed: string, name: string): number {
    if (rawLineMap) {
        const raw = rawLineMap.get(line);
        if (raw) {
            const atPos = raw.indexOf('@');
            if (atPos >= 0) {
                const namePosInTrimmed = trimmed.indexOf(name);
                if (namePosInTrimmed >= 0) {
                    return atPos + namePosInTrimmed;
                }
            }
        }
    }
    return 0;
}

/**
 * 处理一个连续的注释块
 */
function processCommentBlock(
    result: AnnotationResult,
    block: string[],
    blockStartLine: number,
    lineToSym: Map<number, SymInfoEx>,
    uri: string,
    rawLineMap?: Map<number, string>,
) {
    // 检查注释块中是否有注解
    const hasAnnotation = block.some(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('@class')
            || trimmed.startsWith('@field')
            || trimmed.startsWith('@param')
            || trimmed.startsWith('@return')
            || trimmed.startsWith('@type')
            || trimmed.startsWith('@alias');
    });

    if (!hasAnnotation) {
        return;
    }

    // 查找注释块下方的符号（紧邻的下一个符号）
    const targetLine = blockStartLine + block.length;
    const targetSym = lineToSym.get(targetLine);

    // 解析注释块中的注解
    let currentClass: ClassAnnotation | null = null;
    let currentFunction: FunctionAnnotation | null = null;
    let currentClassLine = -1;
    const classFields: FieldAnnotation[] = [];

    for (let lineIdx = 0; lineIdx < block.length; lineIdx++) {
        const line = block[lineIdx];
        const trimmed = line.trim();
        const annotation = parseAnnotationLine(trimmed);

        if (!annotation) {
            continue;
        }

        switch (annotation.type) {
            case 'class': {
                // 保存之前的class
                if (currentClass) {
                    result.classes.set(currentClass.name, currentClass);
                }
                const data = annotation.data;
                currentClassLine = blockStartLine + lineIdx;
                currentClass = {
                    name: data.name,
                    parent: data.parent,
                    description: data.description,
                    fields: new Map(),
                    uri: uri,
                    line: currentClassLine,
                    character: calcAnnotationChar(rawLineMap, currentClassLine, trimmed, data.name),
                };

                // 如果@class下方有变量声明，自动将该变量类型设置为类名
                if (targetSym) {
                    const typeAnnotation: TypeAnnotation = {
                        type: createSimpleType(data.name),
                        description: data.description,
                        uri: uri,
                        line: targetSym.location.range.start.line,
                    };
                    result.types.set(targetSym.location.range.start.line, typeAnnotation);
                }
                break;
            }
            case 'field': {
                if (currentClass) {
                    const data = annotation.data;
                    const field: FieldAnnotation = {
                        name: data.name,
                        type: data.typeStr ? parseType(data.typeStr) : createSimpleType('any'),
                        description: data.description,
                        uri: uri,
                        line: blockStartLine + lineIdx,
                        character: calcAnnotationChar(rawLineMap, blockStartLine + lineIdx, trimmed, data.name),
                    };
                    currentClass.fields.set(data.name, field);
                }
                break;
            }
            case 'param': {
                if (!currentFunction) {
                    currentFunction = { params: [], returns: undefined };
                }
                const data = annotation.data;
                currentFunction.params.push({
                    name: data.name,
                    type: data.typeStr ? parseType(data.typeStr) : undefined,
                    description: data.description,
                });
                break;
            }
            case 'return': {
                if (!currentFunction) {
                    currentFunction = { params: [], returns: undefined };
                }
                const data = annotation.data;
                currentFunction.returns = data.typeStr ? parseType(data.typeStr) : undefined;
                break;
            }
            case 'type': {
                if (targetSym) {
                    const data = annotation.data;
                    const typeAnnotation: TypeAnnotation = {
                        type: data.typeStr ? parseType(data.typeStr) : createSimpleType('any'),
                        description: data.description,
                        uri: uri,
                        line: targetSym.location.range.start.line,
                    };
                    result.types.set(targetSym.location.range.start.line, typeAnnotation);
                }
                break;
            }
            case 'alias': {
                const data = annotation.data;
                const alias: AliasAnnotation = {
                    name: data.name,
                    type: data.typeStr ? parseType(data.typeStr) : createSimpleType('any'),
                    description: data.description,
                    uri: uri,
                    line: blockStartLine + lineIdx,
                    character: calcAnnotationChar(rawLineMap, blockStartLine + lineIdx, trimmed, data.name),
                };
                result.aliases.set(data.name, alias);
                break;
            }
        }
    }

    // 保存最后的class
    if (currentClass) {
        result.classes.set(currentClass.name, currentClass);
    }

    // 保存函数注解（有@param或@return即可）
    if (currentFunction && (currentFunction.params.length > 0 || currentFunction.returns)) {
        const line = targetSym ? targetSym.location.range.start.line : blockStartLine + block.length;
        result.functions.set(line, currentFunction);
    }
}
