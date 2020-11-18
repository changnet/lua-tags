// 自动导出lua stand library

import * as fs from "fs";
import { assert } from "console";

// lua5.1.5的源码包中的contents.html不包含coroutine等模块的模块声明
// 但是 http://www.lua.org/manual/5.1/ 中的是包含的，目前解析的是从浏览器下载而来的
const stl = [
    {
        // jit using 5.1 manual now
        v: "LuaJIT",
        j: "stl/stl_LuaJIT.json",
        c: "stl/doc_5_1/contents.html",
        m: "stl/doc_5_1/manual.html",
    },
    {
        v: "5.1",
        j: "stl/stl_5.1.json",
        c: "stl/doc_5_1/contents.html",
        m: "stl/doc_5_1/manual.html",
    },
    {
        v: "5.2",
        j: "stl/stl_5.2.json",
        c: "stl/doc_5_2/contents.html",
        m: "stl/doc_5_2/manual.html",
    },
    {
        v: "5.3",
        j: "stl/stl_5.3.json",
        c: "stl/doc_5_3/contents.html",
        m: "stl/doc_5_3/manual.html",
    }
];

import {
    SymbolKind,
} from 'vscode-languageserver';

// 记录单个符号的信息
// TODO: 直接import symbol.ts中的SymInfoEx来处理？可能会有加载失败风险，比如版本不一致
interface SymbolEx {
    url: string;
    kind: SymbolKind;
    name: string;
    base?: string;
    parameters?: string[];
    comment?: string;
}

/**
 * 先从菜单里搜索出所有需要导出的模块名和函数名
 * @param ctx 需要搜索的文件内容
 */
function searchSymbol(ctx: string) {
    const begStr = '<H3><A NAME="functions">Lua functions</A></H3>';
    const endStr = '<H3><A NAME="env">environment<BR>variables</A></H3>';
    const endStr51 = '<H3>C API</H3>';

    const begPos = ctx.indexOf(begStr);
    let endPos = ctx.indexOf(endStr);
    if (endPos < 0) {
        endPos = ctx.indexOf(endStr51);
    }

    ctx = ctx.substring(begPos, endPos);

    const symbols: SymbolEx[] = [];
    const lines = ctx.split(/\r?\n/g);
    lines.forEach(line => {
        if (!line.startsWith('<A HREF="manual.html#')) {
            return;
        }

        // 模块 <A HREF="manual.html#6.6">table</A><BR>
        let matchs = line.match(
            /^<A HREF="manual.html#([.0-9]+)">(.+?)<\/A><BR>$/);
        if (matchs && "basic" !== matchs[2]) {
            symbols.push({
                name: matchs[2],
                url: matchs[1],
                kind: SymbolKind.Namespace,
            });
            return;
        }

        // 函数 <A HREF="manual.html#pdf-table.concat">table.concat</A><BR>
        matchs = line.match(
            /^<A HREF="manual.html#pdf-(.+?)">(.+?)<\/A><BR>$/);
        if (matchs && "basic" !== matchs[2]) {
            symbols.push({
                name: matchs[2],
                url: matchs[1],
                kind: SymbolKind.Function,
            });
            return;
        }
    });

    return symbols;
}

// 需要解析的html函数声明、描述格式大概如下
/*
<p>
<hr><h3><a name="pdf-math.abs"><code>math.abs (x)</code></a></h3>


<p>
Returns the absolute value of <code>x</code>. (integer/float)
*/

/**
 * 从html中解析出函数的描述
 * @param ctx contents.html的文本内容
 * @param from 从哪个位置开始解析
 */
function searchDesc(ctx: string, from: number) {
    const flag = "<p>\n";
    let begPos = from;
    if (ctx.charAt(begPos) === "\n") {
        begPos = ctx.indexOf(flag, from) + flag.length;
    }

    let maxLoop = 32; // just avoid dead loop
    let emptyLine = 0;
    let endPos = begPos;
    while (--maxLoop > 0) {
        const linePos = ctx.indexOf("\n", endPos);
        if (endPos === linePos) {
            emptyLine++;
            if (emptyLine >= 2) {
                endPos -= 2; // do't need 2 \n at line end
                break;
            }

            endPos += 1; // +1 mean "\n"
            continue;
        }
        const lineCtx = ctx.substring(endPos, linePos);
        if (lineCtx.startsWith("<hr>") || lineCtx.startsWith("<ul>")) {
            break;
        }

        endPos = linePos + 1; // +1 mean "\n"
    }

    assert(endPos > begPos);
    let desc = ctx.substring(begPos, endPos);

    // 在win下，其实不替换下面的html符号，也能正常显示，但linux下完全不行

    // 去掉换行(现在是按行解释，得到的换行并不是真的换行)
    desc = desc.replace(/\r?\n/g, " ");

    // g globa search，即搜索文中所有匹配的字符而不仅仅是第一次
    // m multi line，多行匹配
    // .+? 中的?表示非贪婪模式
    desc = desc.replace(/<code>(.+?)<\/code>/gm, (match, p1) => {
        if (p1.startsWith("*")) {
            return `__${p1}__`;
        }
        return `**${p1}**`;
    });
    desc = desc.replace(/<b>(.+?)<\/b>/gm, (match, p1) => {
        // 有些会同时被<a> <code>包括，已经替换的，不需要再替换
        if (p1.startsWith("**") || p1.startsWith("__")) {
            return p1;
        }
        return `**${p1}**`;
    });

    // <em> ... </em>的内容都是在 <pre> ... </pre>中，并且以4个空格开头，表示这部分
    // 内容为代码，因此不需要加粗
    desc = desc.replace(/<em>(.+?)<\/em>/gm, (match, p1) => {
        return p1;
    });
    // 次方符号，其实有些markdown是能解析的，比如markdown，但vscode不行
    // 
    desc = desc.replace(/<sup>(.+?)<\/sup>/gm, (match, p1) => {
        return `^${p1}`;
    });

    desc = desc.replace(/<a .+>(.+?)<\/a>/gm, (match, p1) => {
        // 有些会同时被<a> <code>包括，已经替换的，不需要再替换
        if (p1.startsWith("**") || p1.startsWith("__")) {
            return p1;
        }
        return `**${p1}**`;
    });
    desc = desc.replace("<p>", "");
    // html的横杠替换成真正的-
    desc = desc.replace(/&ndash;/g, "-");
    // html的&替换成真正的&
    desc = desc.replace(/&sect;/g, "&");
    // html的不换行空格替换成真正的空格
    desc = desc.replace(/&nbsp;/g, " ");
    // html的小于号替换成真正的<
    desc = desc.replace(/&lt;/g, "<");
    // 把html中的...替换成真正的...
    desc = desc.replace(/&middot;&middot;&middot;/g, "...");

    // 替换<pre> ... </pre> 这部分内容里一般都是代码
    // desc = desc.replace(/\<pre\>(.+?)\<\/pre\>/gm, (match, p1) => {
    //     return `${p1}`;
    // });
    desc = desc.replace("<pre>", "\n\n");
    desc = desc.replace("</pre>", "\n\n");

    return desc;
}

/**
 * 从html中解析出函数的声明
 * @param ctx contents.html的文本内容
 * @param name 需要解析的函数名
 */
function searchDecl(ctx: string, name: string): SymbolEx | null {
    const begStr = `<hr><h3><a name="pdf-${name}"><code>`;
    const endStr = "</code></a></h3>\n";

    const basePos = ctx.indexOf(begStr);
    if (basePos < 0) {
        return null;
    }

    const begPos = basePos + begStr.length;
    const endPos = ctx.indexOf(endStr, begPos);

    const decl = ctx.substring(begPos, endPos);

    let parameters;
    let kind: SymbolKind = SymbolKind.Function;
    const matchs = decl.match(/^(.+?)\s*\((.*)\)$/);
    if (matchs) {
        assert(name === matchs[1]);

        // 把html中的...替换成真正的...
        const rawParam = matchs[2].replace(/&middot;&middot;&middot;/g, "...");

        // 替换掉可选参数，不然singalhelp那里无法分解参数
        let paramStr = rawParam.replace(/ \[,/g, ",");
        paramStr = paramStr.replace(/]/g, "");
        paramStr = paramStr.replace(/\[/g, "");

        parameters = paramStr.split(", ");
    } else if ("_G" === name) {
        kind = SymbolKind.Namespace;
    } else {
        // _VERSION、math.pi、math.huge is variable
        kind = SymbolKind.Variable;
    }

    let base;
    const baseEndPos = name.indexOf(".");
    if (baseEndPos > 0) {
        base = name.substring(0, baseEndPos);
        name = name.substring(baseEndPos + 1);
    }

    const desc = searchDesc(ctx, endPos + endStr.length);

    return {
        url: "",
        name: name,
        base: base,
        kind: kind,
        comment: desc,
        parameters: parameters
    };
}

function searchNamespace(
    ctx: string, url: string, name: string): SymbolEx | null {
    //lua5.3 <h2>6.8 &ndash; <a name="6.8">
    let begStr = `<h2>${url} &ndash; <a name="${url}">`;

    let basePos = ctx.indexOf(begStr);
    if (basePos < 0) {
        // lua5.1 <h2>5.2 - <a name="5.2">Coroutine Manipulation</a></h2>
        begStr = `<h2>${url} - <a name="${url}">`;
        basePos = ctx.indexOf(begStr);

        if (basePos < 0) {
            return null;
        }
    }

    const endPos = ctx.indexOf("\n", basePos) + 1;
    const desc = searchDesc(ctx, endPos);

    return {
        url: "",
        name: name,
        kind: SymbolKind.Namespace,
        comment: desc
    };
}

/**
 * 从html中解析出函数的声明
 * @param ctx contents.html的文本内容
 * @param sym 需要解析的符号
 */
function search(ctx: string, sym: SymbolEx): SymbolEx | null {
    if (SymbolKind.Function === sym.kind) {
        return searchDecl(ctx, sym.name);
    }

    if (SymbolKind.Namespace === sym.kind) {
        return searchNamespace(ctx, sym.url, sym.name);
    }

    return null;
}

function main() {
    console.log(`Current directory: ${process.cwd()}`);

    stl.forEach(v => {
        console.log(`start search symbol for lua ${v.v}`);

        const cctx = fs.readFileSync(v.c).toString();
        const mctx = fs.readFileSync(v.m).toString();

        // let s = search(ctx, "debug.debug");
        // console.log(JSON.stringify(s));
        const symbols: SymbolEx[] = searchSymbol(cctx);

        // lua5.1的contents.html中不包含coroutine的模块声明，需要手动加上

        assert(symbols.length > 0, "no symbol found ...");
        const finalSymbols: SymbolEx[] = [];
        symbols.forEach(s => {
            if (s.name === "coroutine") {
                console.log(JSON.stringify(s));
            }
            const sym = search(mctx, s);
            if (!sym) {
                console.log(` symbol not found: ${s.name}`);
            } else {
                finalSymbols.push(sym);
            }
        });
        fs.writeFileSync(v.j, JSON.stringify(finalSymbols), 'utf8');
    });
}

main();
