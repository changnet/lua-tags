# Change Log

All notable changes to the "lua-tags" extension will be documented in this file.

## [TODO]
*. read type from comments like phpdoc
*. add lua、ngx_lua、love2d std library support

## [1.0.9] 2020-06-??
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
