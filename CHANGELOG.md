# Change Log

All notable changes to the "lua-tags" extension will be documented in this file.

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

-- v is show as
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
