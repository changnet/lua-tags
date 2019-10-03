// 符号处理

import { g_setting } from "./setting"
import {Options,Node,parse as luaparse} from 'luaparse';

/* luaparse
 * scope: 作用域，和lua中的作用域一致，注意一开始会有一个global作用域
 * node: 语法节点，注意顺序和编译器一样，从右到左。其类型参考luaparse的ast.Node声明
 *      local x = "aaa"
 *      x: Identifier
 *      "aaa": StringLiteral
 *      local: LocalStatement
 *      文件结束时，还会有lua特有的Chunk
 */

export class Symbol
{
    private global: { [key: string]: [] } = {};
    private options: Options;

    // !表示log现在不需要初始化，后面赋值
    public log!: (ctx: string) => void;

    public constructor()
    {
        this.options = {
            locations: true, // 是否记录语法节点的位置(node)
            scope: true, // 是否记录作用域
            wait: false, // 是否等待显示调用end函数
            comments: false, // 是否记录注释
            ranges: true, // 记录语法节点的字符位置(第几个字符开始，第几个结束)
            luaVersion: g_setting.luaVersion,
            onCreateScope: () => this.onCreateScope(),
            onDestroyScope: () => this.onDestoryScope(),
            onCreateNode: (node) => this.onCreateNode(node)
        } as Options;
    }

    // 作用域，和lua中的作用域一致，注意一开始会有一个global作用域
    private onCreateScope()
    {
        this.log("onc reate scope==========")
    }

    // 作用域结束
    private onDestoryScope()
    {
        this.log("onc destory scope==========")
    }

    //  语法节点结束
    private onCreateNode(node: Node)
    {
        this.log(`onc onCreateNode ========== ${node.type}`)
    }

    public parse(uri: string,text: string)
    {
        luaparse(text,this.options);
    }
}
