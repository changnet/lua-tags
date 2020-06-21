// 自动导出lua stand library

console.log(`Current directory: ${process.cwd()}`);

// chrome 打开 lua-5.3.5/doc/contents.html
// 选择所有 Lua functions

const name = "math.atan";
const file = "stl/doc_5_3/manual.html";

import * as fs from "fs";

const ctx = fs.readFileSync(file).toString();

/*
<p>
<hr><h3><a name="pdf-math.abs"><code>math.abs (x)</code></a></h3>


<p>
Returns the absolute value of <code>x</code>. (integer/float)
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

function searchDecl(name: string) {
    const begStr = `<hr><h3><a name="pdf-${name}"><code>`;
    let begPos = ctx.indexOf(begStr) + begStr.length;
    let endPos = ctx.indexOf("</code></a></h3>", begPos);

    let decl = ctx.substring(begPos, endPos);
    let desc = searchDesc(ctx, endPos);
    console.log(decl);
    console.log(desc);
}

searchDecl(name);

// 添加一个链接，直接打开html，这样不用联网也可以用
