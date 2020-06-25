// 自动导出lua stand library

import * as fs from "fs";

// chrome 打开 lua-5.3.5/doc/contents.html
// 选择所有 Lua functions
const stl = [
    {
        v: 5, vv: 3,
        j: "stl/doc_5_3/stl.json",
        c: "stl/doc_5_3/contents.html",
        m: "stl/doc_5_3/manual.html",
    }
];

// 符号类型，和vs code的SymbolKind对应
enum SymbolType {
    Namespace = 3, // SymbolKind.Namespace
    Function = 12 // SymbolKind.Function
}

// 记录单个符号的信息
interface Symbol {
    url: string;
    type: SymbolType;
    name: string;
    args?: string[];
    desc?: string;
}

function searchSymbol(ctx: string) {
    const begStr = '<H3><A NAME="functions">Lua functions</A></H3>';
    const endStr = '<H3><A NAME="env">environment<BR>variables</A></H3>';

    let begPos = ctx.indexOf(begStr);
    let endPos = ctx.indexOf(endStr);

    ctx = ctx.substring(begPos, endPos);

    let symbols: Symbol[] = [];
    let lines = ctx.split(/\r?\n/g);
    lines.forEach(line => {
        if (!line.startsWith('<A HREF="manual.html#')) {
            return;
        }

        // 模块 <A HREF="manual.html#6.6">table</A><BR>
        let matchs = line.match(
            /^\<A HREF=\"manual.html\#([.0-9]+)\"\>(.+?)\<\/A\>\<BR\>$/);
        if (matchs && "basic" !== matchs[2]) {
            symbols.push({
                name: matchs[2],
                url: matchs[1],
                type: SymbolType.Namespace,
            });
            return;
        }

        // 函数 <A HREF="manual.html#pdf-table.concat">table.concat</A><BR>
        matchs = line.match(
            /^\<A HREF=\"manual.html\#pdf-(.+?)\"\>(.+?)\<\/A\>\<BR\>$/);
        if (matchs && "basic" !== matchs[2]) {
            symbols.push({
                name: matchs[2],
                url: matchs[1],
                type: SymbolType.Function,
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
    let begPos = from; //ctx.indexOf(flag, from) + flag.length;
    if (ctx.charAt(begPos) === "\n") {
        begPos = ctx.indexOf(flag, from) + flag.length;
    }

    let maxLoop = 32; // just avoid dead loop
    let emptyLine = 0;
    let endPos = begPos;
    while (--maxLoop > 0) {
        let linePos = ctx.indexOf("\n", endPos);
        if (endPos === linePos) {
            emptyLine++;
            if (emptyLine >= 3) {
                break;
            }

            endPos += 1; // +1 mean "\n"
            continue;
        }
        let lineCtx = ctx.substring(endPos, linePos);
        if (lineCtx.startsWith("<hr>")) {
            break;
        }

        endPos = linePos + 1; // +1 mean "\n"
    }

    return ctx.substring(begPos, endPos);
}

/**
 * 从html中解析出函数的声明
 * @param ctx contents.html的文本内容
 * @param name 需要解析的函数名
 */
function searchDecl(ctx: string, name: string): Symbol | null {
    const begStr = `<hr><h3><a name="pdf-${name}"><code>`;

    let basePos = ctx.indexOf(begStr);
    if (basePos < 0) {
        return null;
    }

    let begPos = basePos + begStr.length;
    let endPos = ctx.indexOf("</code></a></h3>", begPos);

    let decl = ctx.substring(begPos, endPos);
    // 把html中的...替换成真正的...
    decl = decl.replace(/&middot;&middot;&middot;/g, "...");

    let desc = searchDesc(ctx, endPos);

    /*
    // g globa search，即搜索文中所有匹配的字符而不仅仅是第一次
    // m multi line，多行匹配
    // .+? 中的?表示非贪婪模式
    desc = desc.replace(/\<code\>(.+?)\<\/code\>/gm, (match, p1) => {
        return `**${p1}**`;
    });
    // 去掉换行
    desc = desc.replace(/\r?\n/g, "");
    // html的横杠替换成真正的-
    desc = desc.replace(/&ndash;/g, "-");
    */
    return {
        url: "",
        name: decl,
        type: SymbolType.Function,
        desc: desc
    };
}

function searchNamespace(ctx: string, url: string, name: string) {
    // <h2>6.8 &ndash; <a name="6.8">
    const begStr = `<h2>${url} &ndash; <a name="${url}">`;

    let basePos = ctx.indexOf(begStr);
    if (basePos < 0) {
        return null;
    }

    let endPos = ctx.indexOf("\n", basePos) + 1;
    let desc = searchDesc(ctx, endPos);

    return {
        url: "",
        name: name,
        type: SymbolType.Namespace,
        desc: desc
    };
}

/**
 * 从html中解析出函数的声明
 * @param ctx contents.html的文本内容
 * @param sym 需要解析的符号
 */
function search(ctx: string, sym: Symbol): Symbol | null {
    if (SymbolType.Function === sym.type) {
        return searchDecl(ctx, sym.name);
    }

    if (SymbolType.Namespace === sym.type) {
        return searchNamespace(ctx, sym.url, sym.name);
    }

    return null;
}

function main() {
    console.log(`Current directory: ${process.cwd()}`);

    stl.forEach(v => {
        console.log(`start search symbol for lua ${v.v}.${v.vv}`);

        const cctx = fs.readFileSync(v.c).toString();
        const mctx = fs.readFileSync(v.m).toString();

        // let s = search(ctx, "debug.debug");
        // console.log(JSON.stringify(s));
        let symbols: Symbol[] = searchSymbol(cctx);

        let finalSymbols: Symbol[] = [];
        symbols.forEach(s => {
            let sym = search(mctx, s);
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

// 添加一个链接，直接打开html，这样不用联网也可以用
