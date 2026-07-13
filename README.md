# lua-tags

🌐 [English](README.en.md)

Lua编码辅助Visual Studio Code插件

本插件通过解析Lua文件并缓存必要的符号(tags)，在极小的资源占用(一个大项目大约400M内存，其他插件2G多)提供常见的功能。由于只处理必要的符号，一些变量是不会被解析（比如在if语句中写一个全局变量）。

## 功能

- 悬停提示（Hover）
- 函数参数提示（Signature Helps）
- 文档符号搜索（Document Symbol）
- 自动实例（Auto Completion）
- 全局符号搜索（Workspace Symbol）
- 定义跳转（Go To Definition）
- 代码检查（Lint(luacheck)）

![animation](animation.gif)

## 用法

在VSCode市场[Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=changnet.lua-tags)安装好插件。

安装好后，在插件的`FEATURES`标签可以看到所有的配置，根据自己的需求进行配置即可。

## luacheck

lua-tags已经集成luacheck，但如果希望使用特定的luacheck版本，可以自己在配置中指定luacheck的位置。

一个复杂的项目，luacheck至少要进行以下配置

- 配置`.luacheckrc`
- 自己维护全局符号
  由于`luacheck`本身不记录跨文件的符号引用，需要用户自己用脚本维护整个项目的全局符号，然后在`.luacheckrc`中用`globals`指定，这是`luacheck`社区常见的做法。lua-tags提供了一个`export global symbols`的功能，可以自动导出全局符号，有需要可以使用该功能来维护全局符号。
- 规范项目代码
  项目中应当有统一的规范使用面向对象还是Lua table来构建模块，如果使用面向对象应当写好注解，否则无法识别类型。如果是多线程、多进程项目应当避免同名变量，减少类型识别错误。

## 多目录工作空间(multi-root workspaces)

此插件不支持多目录工作空间[multi-root workspaces](code.visualstudio.com/docs/editor/multi-root-workspaces)，如果你的工作空间包含多个目录，它只识别第一个。

## 关键注释高亮（@param @return hightlight）

和其他语言一样， 关键注释高亮（@param @return hightlight）[grammars injection](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide#injection-grammars)

![grammars injection highlight](grammars_injection_highlight.png)

## 注解（Annotation）

尽量兼容[emmylua](https://emmylua.github.io/annotation.html)和[luals](https://luals.github.io/wiki/annotations/)，但不完全兼容，并且做了很多精简。

- 数据类型
  所有的Lua类型(`string`、`number`、`function`等等)，还支持自定义的`class`，`table`会被自动当作一个类型。

```lua
EXAMPLE = {
    a = 1,
    b = 2
}

-- @field a number 成员变量a
-- @field b string 成员变量b
-- @field c EXAMPLE 成员变量c，自动把EXAMPLE当作一个类型
```

- `@param`定义函数类型，`@return`定义返回类型

```lua
-- @param a number 参数a
-- @param b boolean 参数b
-- @return string 返回类型为string
function bar(a, b)
    return "str"
end
```

- `@class`声明一个类

```lua
-- @class Foo 类名
-- @field a number 成员变量a
-- @field b string 成员变量b
-- @field c Foo[] 可嵌套其他类型
```

- 类继承

```lua
-- @class Bar:Foo 类名
-- @field x number 成员变量x
```

注意，`:`前后可允许有空格，例如`Bar : Foo`或者`Bar: Foo`

不仅仅在纯注解中支持继承，在声明一个类时也可以

```lua
-- @class Bar:Foo 类名
local Bar = {}
```

则`Bar`的类型为`Bar`，它继承了`Foo`的所有成员变量和函数。

- `[]`定义数组

```lua
-- @type Foo[] 指定a的类型为Foo的数组
local a = {}
```

- `table<k, v>`定义hash

```lua
-- @type table<number, Foo>
local a = {}
```

- `func(a:number, b:string):boolean`定义函数

```lua
-- @type func(a:number, b:string):boolean
local a = function(a, b)
    return true
end

-- 没有返回时，可以不写返回，或者返回void
-- @type func(a:number, b:string)
local a = function(a, b)
end
```

- `@alias`定义别名
  类似于C++的`typedef`和`using`，当一个类型太复杂时，可以定义一个别名。

```lua
-- @alias Foo func(a:number, b:string):boolean

-- @type Foo
local a = function(a, b)
    return true
end
```

- `@type`指定一个变量的类型

```lua
-- @type Foo 指定a的类型为Foo
local a = get_obj()
```

## RPC 前缀识别（rpcPrefix）

在某些项目里，远程调用会写成 `RPC[addr].X.Y(a, b, c)` 或 `Call[addr].X.Y(a, b, c)`的形式。此时 `X` 或 `X.Y` 的跳转、补全功能不可用。

`lua-tags.rpcPrefix` 可配置RPC前缀，lua-tags 会在解析时会自动忽略前缀，把`RPC[addr].X.Y(a, b, c)`识别为`X.Y(a, b, c)`，这样直接跳转到`X.Y`。

配置示例（`.vscode/settings.json`）：

```json
{
    "lua-tags.rpcPrefix": ["RPC\\[(.*?)\\]/g", "Call\\[(.*?)\\]/g"]
}
```

配置使用的正则规则是`TypeScript`的正则。

## 文件加载方式（defaultFileMode / fileMode）

Lua 有两种常见的文件加载约定：

- `load`（普通 `loadfile`）：文件顶层全局变量就是真正的全局符号。
- `module`（Lua 5.1 的 `module("name", package.seeall)`）：文件顶层全局变量会被挂到模块名下，不污染全局。

`lua-tags.defaultFileMode` 设置全局默认的加载方式，取值 `load` 或 `module`，默认`load`。

`lua-tags.fileMode` 是一个数组，每项用 glob 指定一批文件单独覆盖默认值，匹配规则为「首个匹配生效」，glob 相对工程根目录：

```json
{
    "lua-tags.defaultFileMode": "load",
    "lua-tags.fileMode": [
        { "module": true, "files": "modules/*/*.lua" },
        { "module": false, "files": "global/*/*.lua" }
    ]
}
```

配置使用的正则规则是`TypeScript`的正则。

注意：`module`方式已被淘汰，不建议使用。此功能只是为了兼容一些老旧项目。

## 自定义加载函数（customLoadFunc）

除 `require` 之外，有些项目会用自定义函数（如 `import`、`include`）来加载模块。配置 `lua-tags.customLoadFunc` 后，这些函数与 `require` 完全等同处理

```json
{
    "lua-tags.customLoadFunc": ["import", "include"]
}
```

配置后，下面两种写法都会把变量M绑定到 `a.b.c` 模块：

```lua
local M = import("a.b.c")
local M = include("a.b.c.lua")
local M = include("a/b/c.lua")
```

效果与 `local M = require("a.b.c")` 一致

## Lua 5.5兼容

在Lua 5.5中`global`成为关键字，因此`global`不能作为变量名、函数名等。但如果定义了`#define LUA_COMPAT_GLOBAL`，则是可以的。即`local global = 1`是合法的。

本插件目前不支持兼容，所有`global`作为变量名、函数名均会报错。

## 感谢

- https://github.com/fstirlitz/luaparse
- https://github.com/farzher/fuzzysort
- https://github.com/lunarmodules/luacheck/
