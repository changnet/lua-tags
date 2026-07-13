# lua-tags

🌐 [中文](README.md)

A Lua coding assistance extension for Visual Studio Code

This extension parses Lua files and caches the necessary symbols (tags), providing common features with a very small resource footprint (about 400M of memory for a large project, compared to over 2G for other extensions). Since it only processes the necessary symbols, some variables are therefore not parsed(for example, a global variable declared inside an if statement).

## Features

- Hover
- Signature Helps
- Document Symbol
- Auto Completion
- Workspace Symbol
- Go To Definition
- Lint (luacheck)

![animation](animation.gif)

## Usage

Install the extension from the [Visual Studio Code Extension Marketplace](https://marketplace.visualstudio.com/items?itemName=changnet.lua-tags).

After installation, you can see all the settings under the extension's `FEATURES` tab and configure them according to your needs.

## luacheck

lua-tags already integrates luacheck, but if you want to use a specific version of luacheck, you can specify the location of luacheck in the settings yourself.

For a complex project, luacheck requires at least the following configuration:

- Configure `.luacheckrc`
- Maintain the global symbols yourself
  Since `luacheck` itself does not track cross-file symbol references, you need to maintain the global symbols of the whole project with your own script, and then specify them with `globals` in `.luacheckrc`. This is a common practice in the `luacheck` community.

lua-tags provides an `export global symbols` feature that can automatically export global symbols. You can use this feature to maintain global symbols if needed.

## Multi-root workspaces

This extension does not support [multi-root workspaces](https://code.visualstudio.com/docs/editor/multi-root-workspaces). If your workspace contains multiple directories, it will only recognize the first one.

## Key comment highlighting (@param @return highlight)

Just like other languages, key comment highlighting (@param @return highlight) is done via [grammars injection](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide#injection-grammars).

![grammars injection highlight](grammars_injection_highlight.png)

## Annotation

It tries to be compatible with [emmylua](https://emmylua.github.io/annotation.html) and [luals](https://luals.github.io/wiki/annotations/), but it is not fully compatible and has been greatly simplified.

- Data types
  All Lua types (`string`, `number`, `function`, etc.), and it also supports custom `class`. A `table` is automatically treated as a type.

```lua
EXAMPLE = {
    a = 1,
    b = 2
}

-- @field a number member variable a
-- @field b string member variable b
-- @field c EXAMPLE member variable c, EXAMPLE is automatically treated as a type
```

- `@param` defines parameter types, `@return` defines the return type

```lua
-- @param a number parameter a
-- @param b boolean parameter b
-- @return string the return type is string
function bar(a, b)
    return "str"
end
```

- `@class` declares a class

```lua
-- @class Foo class name
-- @field a number member variable a
-- @field b string member variable b
-- @field c Foo[] other types can be nested
```

- Class inheritance

```lua
-- @class Bar:Foo class name
-- @field x number member variable x
```

Note that spaces are allowed before and after `:`, for example `Bar : Foo` or `Bar: Foo`.

Inheritance is supported not only in pure annotations but also when declaring a class:

```lua
-- @class Bar:Foo class name
local Bar = {}
```

Then the type of `Bar` is `Bar`, and it inherits all the member variables and functions of `Foo`.

- `[]` defines an array

```lua
-- @type Foo[] specify that the type of a is an array of Foo
local a = {}
```

- `table<k, v>` defines a hash

```lua
-- @type table<number, Foo>
local a = {}
```

- `func(a:number, b:string):boolean` defines a function

```lua
-- @type func(a:number, b:string):boolean
local a = function(a, b)
    return true
end

-- when there is no return value, you can omit the return, or return void
-- @type func(a:number, b:string)
local a = function(a, b)
end
```

- `@alias` defines an alias
  Similar to C++'s `typedef` and `using`, when a type is too complex, you can define an alias for it.

```lua
-- @alias Foo func(a:number, b:string):boolean

-- @type Foo
local a = function(a, b)
    return true
end
```

- `@type` specifies the type of a variable

```lua
-- @type Foo specify that the type of a is Foo
local a = get_obj()
```

## RPC prefix recognition (rpcPrefix)

In some projects, remote calls are written in the form `RPC[addr].X.Y(a, b, c)` or `Call[addr].X.Y(a, b, c)`. In this case, the go-to-definition and completion features for `X` or `X.Y` are unavailable.

`lua-tags.rpcPrefix` can be used to configure the RPC prefix. lua-tags will automatically ignore the prefix during parsing, recognizing `RPC[addr].X.Y(a, b, c)` as `X.Y(a, b, c)`, so that it jumps directly to `X.Y`.

Configuration example (`.vscode/settings.json`):

```json
{
    "lua-tags.rpcPrefix": ["RPC\\[(.*?)\\]/g", "Call\\[(.*?)\\]/g"]
}
```

The regex rules used in the configuration are `TypeScript` regular expressions.

## File loading mode (defaultFileMode / fileMode)

Lua has two common conventions for loading files:

- `load` (ordinary `loadfile`): the top-level global variables of the file are the real global symbols.
- `module` (Lua 5.1's `module("name", package.seeall)`): the top-level global variables of the file are attached under the module name and do not pollute the global scope.

`lua-tags.defaultFileMode` sets the global default loading mode, with a value of `load` or `module`, defaulting to `load`.

`lua-tags.fileMode` is an array. Each item uses a glob to override the default value for a group of files. The matching rule is "first match wins", and the glob is relative to the project root:

```json
{
    "lua-tags.defaultFileMode": "load",
    "lua-tags.fileMode": [
        { "module": true, "files": "modules/*/*.lua" },
        { "module": false, "files": "global/*/*.lua" }
    ]
}
```

The regex rules used in the configuration are `TypeScript` regular expressions.

Note: the `module` approach is deprecated and not recommended. This feature only exists to be compatible with some legacy projects.

## Custom load functions (customLoadFunc)

Besides `require`, some projects use custom functions (such as `import`, `include`) to load modules. After configuring `lua-tags.customLoadFunc`, these functions are treated exactly the same as `require`.

```json
{
    "lua-tags.customLoadFunc": ["import", "include"]
}
```

After configuration, both of the following forms will bind the variable M to the `a.b.c` module:

```lua
local M = import("a.b.c")
local M = include("a.b.c.lua")
local M = include("a/b/c.lua")
```

The effect is the same as `local M = require("a.b.c")`.

## Thanks

- https://github.com/fstirlitz/luaparse
- https://github.com/farzher/fuzzysort
- https://github.com/lunarmodules/luacheck/
