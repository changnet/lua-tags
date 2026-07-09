# lua-tags

Lua IntelliSense for Visual Studio Code.

## Features

- Hover
- Lint(luacheck)
- Signature Helps
- Document Symbol
- Auto Completion
- Workspace Symbol
- Go To Definition

![animation](animation.gif)

## Configure & Usage

Download and installation are available at [Visual Studio Code Extension
Marketplace](https://marketplace.visualstudio.com/items?itemName=changnet.lua-tags).

Once installed, all configure options details are at extension Contributions page

Hot configure reload NOT support, restart Visual Studio Code to activate new
configure after configure changed

## luacheck

lua-tags already integret with luacheck(win32 and linux)，if using MacOS or other
platform, specify luaCheckPath at configure or add luacheck to os excuate PATH

## export global symbols

ctrl + shift + p: "lua-tags: export global symbols" can export all global
symbols to file(lua-tags-global-symbols) in workspace root directory.

It may help to set .luacheckrc.

## multi-root workspaces

This extension does NOT support [multi-root workspaces](code.visualstudio.com/docs/editor/multi-root-workspaces).
If it is activated at multi-root workspaces, only the first folder works.

## @param @return hightlight

Just like other language, @param、@return in comment will be hightlight by
[grammars injection](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide#injection-grammars)

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

## Thanks

- https://github.com/fstirlitz/luaparse
- https://github.com/farzher/fuzzysort
- https://github.com/lunarmodules/luacheck/
