# Change Log

All notable changes to the "lua-tags" extension will be documented in this file.

## [TODO]
* read type from comments like phpdoc
* add lua、ngx_lua、love2d std library support

## [1.0.16] 2020-??-??
1. fix global symbol go to reference symbol
```lua
function ref_func() end -- fix this function to to RefMob.ref_func
RefMob.ref_func = ref_func
```

2. use `==` to represent reference symbol instead of `->`, since `->` means a lambda function in most language
```lua
local V = 1
M.v = V -- M.v == V = 1
```

3. improve symbol search

## [1.0.15] 2020-11-19
1. update npm packages(vscode engine version update to 1.51.0)
2. load stl no module found: coroutine #5

## [1.0.14] 2020-11-11
1. fix symbol hover duplicate
```lua
-- file_a.lua
_G.T = {}
T.t = 1

-- file_b.lua
local a = t -- hover on t show two same t definition
```

2. fix `...` param grammars injection invalid
3. add auto export global symbol timer
4. clear it's diagnostic message when file close if it is not in workspace

## [1.0.13] 2020-08-17
1. fix grammars injection

## [1.0.12] 2020-07-31
1. fix local document symbol not found in completion and hovers
2. fix some stl render incorrect(like string.format)
3. @param、@return hightlight

## [1.0.11] 2020-07-14
1. fix standard library comment render html error(especially in linux)
2. add lua5.2、luajit standard library
3. improve autocompletion accurate
4. fix extension did NOT work when setting subdir as root

## [1.0.10] 2020-06-28
1. improve autocompletion、signaturehelp message(using markdown)
2. add lua5.1、lua5.3 standard library

## [1.0.9] 2020-06-08
1. fix table function field hover
```lua
E = { FAIL = function() end } -- FAIL will be show as E.FAIL
```
2. fix goto require file error
```lua
local conf = require "conf/aaabbb"
local err_conf = require "bbb" -- do NOT goto file conf/aaabbb
```
3. if symbol not found,fall back to table field
```lua
tbl = 
{
    sym = "a table field"
}
-- sym will jump to tbl.sym if no other symbol name "sym" found
local str = "try to find " .. sym
```
4. improve auto completion ref symbol
```lua
local wrap = {
    BC = BattleConf
}
wrap.BC. -- this should list all field in BattleConf
```
5. improve auto completion match

## [1.0.8] 2020-04-22
1. fix chinese string parse error when using luaparse v0.3.0

## [1.0.7] 2020-04-19
1. show ref function at signature
2. update luaparse from 0.2.1 to 0.3.0
3. show const expression at hover
```lua
local a = 1 << 32
```

## [1.0.6] 2020-03-10
1. fix symbol search error when init more values than expect:
```lua
local a = 1, 2
```
2. show ref function infomation at hover and auto completion
3. fix document open/change event run before configuration sync

## [1.0.5] 2020-02-15
1. add command: export global symbols
2. local symbol duplicate completion item filter
3. recursive search table symbol

## [1.0.4] 2020-01-02
1. fix duplicate symbol bug from 1.0.3

## [1.0.3] 2019-12-27
1. fix require path auto completion show duplicate path
2. fix luacheck permission deny on linux
3. allow jump to local unreachable symbol definition
4. do't do completion or signature when definte a function
5. add main chunk none function local symbol search
6. show reference value at hover and completion
```lua
X.Y = true
local V = X.Y
-- v is shown as
local V -> X.Y = true
```

## [1.0.2] 2019-12-18
1. set luacheck timeout to 15s
2. fix luacheck pending task stop

## [1.0.1] 2019-12-17
1. fix signature help parameter index incorrect
2. fix workspace symbol send too many symbol infomation
3. add sub function declaration support
4. filter other document local symbol at definition、auto completion、hover
5. add luacheck

## [1.0.0] 2019-12-12

Initial release
