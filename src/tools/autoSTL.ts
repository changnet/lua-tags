// 自动导出lua stand library

import * as fs from "fs";

// chrome 打开 lua-5.3.5/doc/contents.html
// 选择所有 Lua functions
const stl = [
    {
        m: 5, v: 3, f: "stl/doc_5_3/manual.html",
        symbols: [
            "_G",
            "_VERSION",
            "assert",
            "collectgarbage",
            "dofile",
            "error",
            "getmetatable",
            "ipairs",
            "load",
            "loadfile",
            "next",
            "pairs",
            "pcall",
            "print",
            "rawequal",
            "rawget",
            "rawlen",
            "rawset",
            "require",
            "select",
            "setmetatable",
            "tonumber",
            "tostring",
            "type",
            "xpcall",
            "coroutine",
            "coroutine.create",
            "coroutine.isyieldable",
            "coroutine.resume",
            "coroutine.running",
            "coroutine.status",
            "coroutine.wrap",
            "coroutine.yield",
            "debug",
            "debug.debug",
            "debug.gethook",
            "debug.getinfo",
            "debug.getlocal",
            "debug.getmetatable",
            "debug.getregistry",
            "debug.getupvalue",
            "debug.getuservalue",
            "debug.sethook",
            "debug.setlocal",
            "debug.setmetatable",
            "debug.setupvalue",
            "debug.setuservalue",
            "debug.traceback",
            "debug.upvalueid",
            "debug.upvaluejoin",
            "io",
            "io.close",
            "io.flush",
            "io.input",
            "io.lines",
            "io.open",
            "io.output",
            "io.popen",
            "io.read",
            "io.stderr",
            "io.stdin",
            "io.stdout",
            "io.tmpfile",
            "io.type",
            "io.write",
            "file:close",
            "file:flush",
            "file:lines",
            "file:read",
            "file:seek",
            "file:setvbuf",
            "file:write",
            "math",
            "math.abs",
            "math.acos",
            "math.asin",
            "math.atan",
            "math.ceil",
            "math.cos",
            "math.deg",
            "math.exp",
            "math.floor",
            "math.fmod",
            "math.huge",
            "math.log",
            "math.max",
            "math.maxinteger",
            "math.min",
            "math.mininteger",
            "math.modf",
            "math.pi",
            "math.rad",
            "math.random",
            "math.randomseed",
            "math.sin",
            "math.sqrt",
            "math.tan",
            "math.tointeger",
            "math.type",
            "math.ult",
            "os",
            "os.clock",
            "os.date",
            "os.difftime",
            "os.execute",
            "os.exit",
            "os.getenv",
            "os.remove",
            "os.rename",
            "os.setlocale",
            "os.time",
            "os.tmpname",
            "package",
            "package.config",
            "package.cpath",
            "package.loaded",
            "package.loadlib",
            "package.path",
            "package.preload",
            "package.searchers",
            "package.searchpath",
            "string",
            "string.byte",
            "string.char",
            "string.dump",
            "string.find",
            "string.format",
            "string.gmatch",
            "string.gsub",
            "string.len",
            "string.lower",
            "string.match",
            "string.pack",
            "string.packsize",
            "string.rep",
            "string.reverse",
            "string.sub",
            "string.unpack",
            "string.upper",
            "table",
            "table.concat",
            "table.insert",
            "table.move",
            "table.pack",
            "table.remove",
            "table.sort",
            "table.unpack",
            "utf8",
            "utf8.char",
            "utf8.charpattern",
            "utf8.codepoint",
            "utf8.codes",
            "utf8.len",
            "utf8.offset",
        ],
    }
];

// 符号类型，和vs code的SymbolKind对应
enum SymbolType {
    NameSpace = 3, // SymbolKind.Namespace
    Function = 12 // SymbolKind.Function
}

// 记录单个符号的信息
interface Symbol {
    url: string;
    type: SymbolType;
    name: string;
    args?: string[];
    desc: string;
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
    let begPos = ctx.indexOf(flag, from) + flag.length;

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
function search(ctx: string, name: string): Symbol | null {
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

function main() {
    console.log(`Current directory: ${process.cwd()}`);

    stl.forEach(v => {
        console.log(`start search symbol for lua ${v.m}.${v.v}`);
        const ctx = fs.readFileSync(v.f).toString();

        // let s = search(ctx, "debug.debug");
        // console.log(JSON.stringify(s));
        let symbols: Symbol[] = [];
        v.symbols.forEach(s => {
            let sym = search(ctx, s);
            if (!sym) {
                console.log(` symbol not found: ${s}`);
            } else {
                symbols.push(sym);
            }
        });
        //console.log(JSON.stringify(symbols));
    });
}

main();

// 添加一个链接，直接打开html，这样不用联网也可以用
