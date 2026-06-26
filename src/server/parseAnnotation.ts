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
const CLASS_PATTERN = /^-?@class\s+(\w+)(?:\s+-\s*(.*))?$/;
// @field fieldName typeName [description]
const FIELD_PATTERN = /^-?@field\s+(\w+)\s+(.+?)(?:\s+-\s*(.*))?$/;
// @param paramName typeName [description]
const PARAM_PATTERN = /^-?@param\s+(\w+)\s+(.+?)(?:\s+-\s*(.*))?$/;
// @return typeName [description]
const RETURN_PATTERN = /^-?@return\s+(.+?)(?:\s+-\s*(.*))?$/;
// @type typeName [description]
const TYPE_PATTERN = /^-?@type\s+(.+?)(?:\s+-\s*(.*))?$/;
// @alias AliasName typeName [description]
const ALIAS_PATTERN = /^-?@alias\s+(\w+)\s+(.+?)(?:\s+-\s*(.*))?$/;

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
                description: classMatch[2].trim() || undefined,
            },
        };
    }

    // @field
    const fieldMatch = line.match(FIELD_PATTERN);
    if (fieldMatch) {
        return {
            type: 'field',
            data: {
                name: fieldMatch[1],
                typeStr: fieldMatch[2].trim(),
                description: fieldMatch[3]?.trim() || undefined,
            },
        };
    }

    // @param
    const paramMatch = line.match(PARAM_PATTERN);
    if (paramMatch) {
        return {
            type: 'param',
            data: {
                name: paramMatch[1],
                typeStr: paramMatch[2].trim(),
                description: paramMatch[3]?.trim() || undefined,
            },
        };
    }

    // @return
    const returnMatch = line.match(RETURN_PATTERN);
    if (returnMatch) {
        return {
            type: 'return',
            data: {
                typeStr: returnMatch[1].trim(),
                description: returnMatch[2]?.trim() || undefined,
            },
        };
    }

    // @type
    const typeMatch = line.match(TYPE_PATTERN);
    if (typeMatch) {
        return {
            type: 'type',
            data: {
                typeStr: typeMatch[1].trim(),
                description: typeMatch[2]?.trim() || undefined,
            },
        };
    }

    // @alias
    const aliasMatch = line.match(ALIAS_PATTERN);
    if (aliasMatch) {
        return {
            type: 'alias',
            data: {
                name: aliasMatch[1],
                typeStr: aliasMatch[2].trim(),
                description: aliasMatch[3]?.trim() || undefined,
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

    if (comments.length === 0 || symList.length === 0) {
        return result;
    }

    // 构建行号到符号的映射
    const lineToSym = new Map<number, SymInfoEx>();
    for (const sym of symList) {
        const line = sym.location.range.start.line;
        lineToSym.set(line, sym);
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
                processCommentBlock(result, currentBlock, currentBlockStartLine, lineToSym, uri);
            }
            currentBlock = [text];
            currentBlockStartLine = commentLine;
        }
    }

    // 处理最后一个注释块
    if (currentBlock.length > 0) {
        processCommentBlock(result, currentBlock, currentBlockStartLine, lineToSym, uri);
    }

    return result;
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
    const classFields: FieldAnnotation[] = [];

    for (const line of block) {
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
                currentClass = {
                    name: data.name,
                    description: data.description,
                    fields: new Map(),
                    uri: uri,
                    line: targetSym ? targetSym.location.range.start.line : blockStartLine + block.length,
                };
                break;
            }
            case 'field': {
                if (currentClass) {
                    const data = annotation.data;
                    const field: FieldAnnotation = {
                        name: data.name,
                        type: parseType(data.typeStr),
                        description: data.description,
                        uri: uri,
                        line: targetSym ? targetSym.location.range.start.line : blockStartLine + block.length,
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
                    type: parseType(data.typeStr),
                    description: data.description,
                });
                break;
            }
            case 'return': {
                if (!currentFunction) {
                    currentFunction = { params: [], returns: undefined };
                }
                const data = annotation.data;
                currentFunction.returns = parseType(data.typeStr);
                break;
            }
            case 'type': {
                if (targetSym) {
                    const data = annotation.data;
                    const typeAnnotation: TypeAnnotation = {
                        type: parseType(data.typeStr),
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
                    type: parseType(data.typeStr),
                    description: data.description,
                    uri: uri,
                    line: targetSym ? targetSym.location.range.start.line : blockStartLine + block.length,
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
