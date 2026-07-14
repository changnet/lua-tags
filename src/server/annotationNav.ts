// 注解行中的符号提取（供 hover / go-to-definition 复用）
//
// 设计要点（按需求）：
// 1. 判断光标所在行是否为「注解注释行」——用 @type/@class/@field/@param/@return/@alias
//    关键字来判断，而不是去匹配 `--` 前缀。这样无论注释是 `--`、`----`、`---` 还是
//    `-[[`（块注释）都能覆盖。
// 2. 从注解内容中提取光标处的「符号名」，合法字符只有：字母、数字、点号（[A-Za-z0-9.]+）。
// 3. 调用方拿到符号名后，去注解注册表 / 全局符号里查它是否存在，存在就跳转或 hover。
//
// 说明：代码中的符号（由 getQuerySymbol 解析）与注释中的符号来源不同，但「查符号是否存在」
// 这一步完全一致。这里只负责「从注释里取出正确的符号名」。

const ANNOTATION_KW = 'type|class|field|param|return|alias';

const KW_RE = new RegExp(`@(${ANNOTATION_KW})\\b`);

// 判断一行是否为注解行（兼容 -- / ---- / -[[ 任意前缀，只要含 @关键字）
export function isAnnotationLine(line: string): boolean {
    return KW_RE.test(line);
}

export interface AnnotationSymbol {
    // 光标处提取到的符号名，如 Foo、Bar、foo.bar
    name: string;
    // 若该符号以「顶层冒号」紧跟在另一个符号之后（继承/成员，如 Foo:Bar 的 Bar），
    // base 为冒号前的那个符号名（Foo）；否则为 undefined
    base?: string;
}

/**
 * 提取光标处的注解符号名。
 * @param line   整行文本
 * @param offset 光标在行内的字符下标
 * @returns 符号信息；光标不在注解符号上则返回 null
 */
export function getAnnotationSymbolAt(
    line: string,
    offset: number,
): AnnotationSymbol | null {
    if (!isAnnotationLine(line)) {
        return null;
    }

    // 定位注解关键字，并跳过 @field/@param 后的首个「字段名/参数名」
    // （那个名字本身不是类型，不能当类型符号跳）
    const kwMatch = line.match(KW_RE);
    if (!kwMatch || kwMatch.index === undefined) {
        return null;
    }

    let contentStart = kwMatch.index + kwMatch[0].length;
    let rest = line.substring(contentStart);

    if (kwMatch[1] === 'field' || kwMatch[1] === 'param') {
        const fm = rest.match(/^\s*[A-Za-z0-9.]+/);
        if (fm) {
            contentStart += fm[0].length;
            rest = rest.substring(fm[0].length);
        }
    }

    // 行内块注释闭合 ]] 之后不再是注解内容（处理 `--[[ @type ABC ]] DEF` 这种）
    const closeIdx = rest.search(/\]=?\]/);
    if (closeIdx >= 0) {
        rest = rest.substring(0, closeIdx);
    }

    // 扫描注解内容里的符号，记录「每个符号前是否隔着顶层冒号」
    const SYM = /[A-Za-z0-9.]+/g;
    let m: RegExpExecArray | null;
    let prevSym: string | null = null;
    let prevWithColon = false; // 上一个符号与当前符号之间是否有顶层冒号（可带空格）

    while ((m = SYM.exec(rest)) !== null) {
        const s = contentStart + m.index;
        const e = s + m[0].length;

        // 光标落在该符号上
        if (offset >= s && offset <= e) {
            const base = prevWithColon && prevSym ? prevSym : undefined;
            return { name: m[0], base };
        }

        // 该符号与下一个符号之间是否隔着顶层冒号（Foo:Bar / Foo : Bar / Foo: Bar）
        const after = rest.substring(m.index + m[0].length);
        prevWithColon = /^\s*:/.test(after);
        prevSym = m[0];
    }

    return null;
}
