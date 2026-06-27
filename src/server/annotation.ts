// 注解处理 - 存储和查询注解数据

import { SymbolKind, Location } from 'vscode-languageserver';
import { SymInfoEx, LocalType, CommentType } from './parseSymbol';

// 解析后的类型表达式
export interface AnnotationType {
    name: string;           // 类型名，如 "Foo", "string", "number", "table", "func"
    isArray: boolean;       // 是否为数组，如 "Foo[]"
    generics?: {            // table<K, V> 的泛型参数
        key: AnnotationType;
        value: AnnotationType;
    };
    func?: {                // func(a:number, b:string):boolean 的函数签名
        params: AnnotationParam[];
        returns?: AnnotationType;
    };
    isVoid: boolean;        // func无返回值时为true
}

// 函数参数注解
export interface AnnotationParam {
    name: string;
    type: AnnotationType;
    description?: string;
}

// @class 类定义注解
export interface ClassAnnotation {
    name: string;
    description?: string;
    fields: Map<string, FieldAnnotation>;
    uri: string;
    line: number;
    character: number;
}

// @field 字段注解
export interface FieldAnnotation {
    name: string;
    type: AnnotationType;
    description?: string;
    uri: string;
    line: number;
    character: number;
}

// @param/@return 函数注解
export interface FunctionAnnotation {
    params: AnnotationParam[];
    returns?: AnnotationType;
    description?: string;
}

// @type 变量类型注解
export interface TypeAnnotation {
    type: AnnotationType;
    description?: string;
    uri: string;
    line: number;
}

// @alias 别名注解
export interface AliasAnnotation {
    name: string;
    type: AnnotationType;
    description?: string;
    uri: string;
    line: number;
    character: number;
}

// 单个文档的注解数据
interface DocumentAnnotation {
    classes: Map<string, ClassAnnotation>;      // className -> ClassAnnotation
    aliases: Map<string, AliasAnnotation>;      // aliasName -> AliasAnnotation
    types: Map<number, TypeAnnotation>;          // line -> TypeAnnotation
    functions: Map<number, FunctionAnnotation>;  // line -> FunctionAnnotation
}

// 创建空的类型表达式
export function createSimpleType(name: string): AnnotationType {
    return { name, isArray: false, isVoid: false };
}

// 创建数组类型
export function createArrayType(elementType: AnnotationType): AnnotationType {
    return {
        name: elementType.name,
        isArray: true,
        isVoid: false,
        generics: elementType.generics,
        func: elementType.func,
    };
}

// 创建泛型table类型
export function createTableType(keyType: AnnotationType, valueType: AnnotationType): AnnotationType {
    return {
        name: 'table',
        isArray: false,
        isVoid: false,
        generics: { key: keyType, value: valueType },
    };
}

// 创建函数类型
export function createFuncType(params: AnnotationParam[], returns?: AnnotationType): AnnotationType {
    return {
        name: 'func',
        isArray: false,
        isVoid: !returns,
        func: { params, returns },
    };
}

/**
 * 注解注册表 - 单例
 * 存储所有文档的注解数据，提供查询接口
 */
export class AnnotationRegistry {
    private static ins: AnnotationRegistry;

    // 各文档的注解数据，uri为key
    private documentAnnotation = new Map<string, DocumentAnnotation>();

    // 全局类缓存（懒构建）
    private globalClass: Map<string, ClassAnnotation> | null = null;
    // 全局别名缓存（懒构建）
    private globalAlias: Map<string, AliasAnnotation> | null = null;
    // 是否需要更新全局缓存
    private needUpdate = false;

    private constructor() {}

    public static instance() {
        if (!AnnotationRegistry.ins) {
            AnnotationRegistry.ins = new AnnotationRegistry();
        }
        return AnnotationRegistry.ins;
    }

    /**
     * 设置某个文档的注解数据
     */
    public setDocumentAnnotations(
        uri: string,
        classes: Map<string, ClassAnnotation>,
        aliases: Map<string, AliasAnnotation>,
        types: Map<number, TypeAnnotation>,
        functions: Map<number, FunctionAnnotation>,
    ) {
        this.documentAnnotation.set(uri, {
            classes,
            aliases,
            types,
            functions,
        });
        this.needUpdate = true;
    }

    /**
     * 获取某个文档的注解数据
     */
    public getDocumentAnnotation(uri: string): DocumentAnnotation | null {
        return this.documentAnnotation.get(uri) || null;
    }

    /**
     * 删除某个文档的注解数据
     */
    public clearDocument(uri: string) {
        this.documentAnnotation.delete(uri);
        this.needUpdate = true;
    }

    /**
     * 更新全局缓存
     */
    private updateGlobal() {
        this.globalClass = new Map();
        this.globalAlias = new Map();

        for (const [_uri, doc] of this.documentAnnotation) {
            for (const [name, cls] of doc.classes) {
                if (!this.globalClass.has(name)) {
                    this.globalClass.set(name, cls);
                }
            }
            for (const [name, alias] of doc.aliases) {
                if (!this.globalAlias.has(name)) {
                    this.globalAlias.set(name, alias);
                }
            }
        }
        this.needUpdate = false;
    }

    /**
     * 获取文档级别的类注解
     */
    public getDocumentClass(uri: string, name: string): ClassAnnotation | null {
        const doc = this.documentAnnotation.get(uri);
        if (!doc) {
            return null;
        }
        return doc.classes.get(name) || null;
    }

    /**
     * 获取全局类注解
     */
    public getGlobalClass(name: string): ClassAnnotation | null {
        if (this.needUpdate) {
            this.updateGlobal();
        }
        return this.globalClass?.get(name) || null;
    }

    /**
     * 获取文档级别的别名注解
     */
    public getDocumentAlias(uri: string, name: string): AliasAnnotation | null {
        const doc = this.documentAnnotation.get(uri);
        if (!doc) {
            return null;
        }
        return doc.aliases.get(name) || null;
    }

    /**
     * 获取全局别名注解
     */
    public getGlobalAlias(name: string): AliasAnnotation | null {
        if (this.needUpdate) {
            this.updateGlobal();
        }
        return this.globalAlias?.get(name) || null;
    }

    /**
     * 获取某个行号的类型注解
     */
    public getLineType(uri: string, line: number): TypeAnnotation | null {
        const doc = this.documentAnnotation.get(uri);
        if (!doc) {
            return null;
        }
        return doc.types.get(line) || null;
    }

    /**
     * 获取某个行号的函数注解
     */
    public getLineFunction(uri: string, line: number): FunctionAnnotation | null {
        const doc = this.documentAnnotation.get(uri);
        if (!doc) {
            return null;
        }
        return doc.functions.get(line) || null;
    }

    /**
     * 解析类型表达式，查找对应的类定义
     * 支持别名递归解析
     */
    public resolveType(
        uri: string,
        typeAnnotation: AnnotationType,
    ): ClassAnnotation | null {
        // 先检查是否是数组类型，去掉数组标记
        let typeName = typeAnnotation.name;
        if (typeAnnotation.isArray) {
            // 数组类型不直接解析类
            return null;
        }

        // 在当前文档查找类
        let cls = this.getDocumentClass(uri, typeName);
        if (cls) {
            return cls;
        }

        // 查找别名并递归解析
        const alias = this.getDocumentAlias(uri, typeName)
            || this.getGlobalAlias(typeName);
        if (alias && alias.type.name !== typeName) {
            return this.resolveType(uri, alias.type);
        }

        // 全局查找类
        return this.getGlobalClass(typeName);
    }

    /**
     * 解析类型表达式，查找字段
     */
    public resolveField(
        uri: string,
        baseType: AnnotationType,
        fieldName: string,
    ): FieldAnnotation | null {
        // 如果是数组类型，不支持字段访问（应该用索引）
        if (baseType.isArray) {
            return null;
        }

        // 如果是table<K,V>类型，字段访问返回V类型
        if (baseType.generics) {
            // table的字段访问返回值类型
            return {
                name: fieldName,
                type: baseType.generics.value,
                uri: '',
                line: 0,
                character: 0,
            };
        }

        // 如果是func类型，不支持字段访问
        if (baseType.func) {
            return null;
        }

        // 查找类定义
        const cls = this.resolveType(uri, baseType);
        if (!cls) {
            return null;
        }

        return cls.fields.get(fieldName) || null;
    }

    /**
     * 将注解字段转换为SymInfoEx
     * @param typeStr 格式化后的类型字符串（如 "number"），用于hover显示
     */
    public fieldToSym(
        field: FieldAnnotation,
        baseName: string,
        baseUri: string,
        typeStr?: string,
    ): SymInfoEx {
        const kind = this.typeToSymbolKind(field.type);
        const ch = field.character || 0;
        const sym: SymInfoEx = {
            name: field.name,
            kind: kind,
            location: {
                uri: field.uri || baseUri,
                range: {
                    start: { line: field.line, character: ch },
                    end: { line: field.line, character: ch + field.name.length },
                },
            },
            scope: 0,
        };
        if (typeStr) {
            sym.annotationType = typeStr;
        }
        if (field.description) {
            sym.comment = field.description;
            sym.ctType = CommentType.CT_LINEEND;
        }
        return sym;
    }

    /**
     * 将注解函数转换为SymInfoEx
     */
    public funcToSym(
        funcAnnotation: FunctionAnnotation,
        name: string,
        uri: string,
        line: number,
        local?: LocalType,
    ): SymInfoEx {
        return {
            name: name,
            kind: SymbolKind.Function,
            location: {
                uri: uri,
                range: {
                    start: { line: line, character: 0 },
                    end: { line: line, character: name.length },
                },
            },
            scope: 0,
            local: local,
            parameters: funcAnnotation.params.map(p => p.name),
        };
    }

    /**
     * 将注解类型转换为SymbolKind
     */
    private typeToSymbolKind(type: AnnotationType): SymbolKind {
        if (type.func) {
            return SymbolKind.Function;
        }
        if (type.name === 'table' || type.name === 'Table') {
            return SymbolKind.Namespace;
        }
        // string, number, boolean, class等都视为Variable
        return SymbolKind.Variable;
    }
}
