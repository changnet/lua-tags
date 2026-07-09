-- lua55_test.lua
-- 验证 lua-tags 对 Lua 5.5 新增语法（global 关键字、命名可变参数 ...args）的解析能力
-- 本文件先集中写出 Lua 5.5 相关的特殊语法，最后再声明一个普通变量。
-- 只要 vscode 能解析到末尾这个变量（hover/补全可见），即说明整文件语法解析正常。

-- 1. global 关键字：global 函数
global function gAdd(a, b)
    return a + b
end

-- 2. global 关键字：global 变量
global gCounter = 0

-- 3. global 关键字：global <const> 变量
global <const> gPi = 3.14159

-- 4. global 关键字：多个 global 变量（<const> 前缀属性对整个列表生效）
global <const> gE, gName = 2.718, "lua55"

-- 5. 命名可变参数：function test(...args)
function test(...args)
    local sum = 0
    for i = 1, #args do
        sum = sum + args[i]
    end
    return sum
end

-- 6. global 函数中使用命名可变参数
global function gConcat(...rest)
    return table.concat(rest, ",")
end

-- 末尾变量：若上方所有 Lua 5.5 语法均能被正确解析，
-- 则 vscode 能解析到这个变量，证明语法解析正常。

local lua55_parse_ok = true
