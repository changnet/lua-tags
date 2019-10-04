// 符号处理

import { g_setting } from "./setting"

import {
    Options,
    parse as luaparse,

    Node,
    Identifier,
    FunctionDeclaration,
    LocalStatement,
    AssignmentStatement
} from 'luaparse';

/* luaparse
 * scope: 作用域，和lua中的作用域一致，注意一开始会有一个global作用域
 * node: 语法节点，注意顺序和编译器一样，从右到左。其类型参考luaparse的ast.Node声明
 *      local x = "aaa"
 *      x: Identifier
 *      "aaa": StringLiteral
 *      local: LocalStatement
 *      文件结束时，还会有lua特有的Chunk
 */

export class Symbol {
    private options: Options;
    private global: { [key: string]: [] } = {};

    // !表示log现在不需要初始化，后面赋值
    public log!: (ctx: string) => void;

    private scopeDeepth: number = 0;
    private parseSymbol: { [key: string]: Node } = {}

    public constructor() {
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
    private onCreateScope() {
        this.scopeDeepth++;
    }

    // 作用域结束
    private onDestoryScope() {
        this.scopeDeepth--;
    }

    //  语法节点结束
    private onCreateNode(node: Node) {
        // 不是全局或者模块中的符号，不用解析
        if (this.scopeDeepth > g_setting.scopeDeepth) return;

        // this.log(`onc onCreateNode ========== ${JSON.stringify(node)}`)
        switch (node.type) {
            case "FunctionDeclaration": // 函数
                this.parseFunctionNode(node);
                break;
            case "LocalStatement": // local变量
            case "AssignmentStatement": // 全局变量
                this.ParseVariableStatement(node);
                break
        }
    }

    // 解析函数声明
    private parseFunctionNode(node: FunctionDeclaration) {
        let identifier = node.identifier
        if (!identifier) return;

        let name: string
        if (identifier.type == "Identifier") {
            // function test() 这种直接声明函数的写法
            name = identifier.name
        }
        else if (identifier.type == "MemberExpression") {
            // function m:test() 或者 function m.test() 这种成员函数写法
            name = identifier.identifier.name
        }
        else {
            return;
        }
        this.parseSymbol[name] = node;
    }

    // 解析变量声明
    private ParseVariableStatement(node: LocalStatement | AssignmentStatement) {
        // lua支持同时初始化多个变量 local x,y = 1,2
        for (let variable of node.variables) {
            if (variable.type != "Identifier") continue;

            let name: string = variable.name
            this.parseSymbol[name] = variable
        }
    }

    public parse(uri: string, text: string) {
        this.scopeDeepth = 0;
        this.parseSymbol = {};

        luaparse(text, this.options);

        this.log(`parse done ${JSON.stringify(this.parseSymbol)}`)
    }
}
