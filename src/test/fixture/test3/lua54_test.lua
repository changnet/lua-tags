-- lua54_test.lua
-- 验证 lua-tags 对 Lua 5.4 新增语法的解析能力
-- 本文件先集中写出 Lua 5.4 相关的特殊语法，最后再声明一个变量。
-- 只要 vscode 能解析到末尾这个变量（hover/补全可见），即说明整文件语法解析正常。

-- 1. <const> 常量属性（Lua 5.4 新增）
local MAX_LEVEL <const> = 100

-- 2. <close> 待关闭变量属性（Lua 5.4 新增，依赖 __close 元方法）
local function openResource(name)
    return setmetatable({ name = name }, {
        __close = function(self)
            print("close " .. self.name)
        end
    })
end

local res <close> = openResource("test.txt")

-- 3. 十六进制浮点数字面量（Lua 5.4 新增的 0x...p... 形式）
local pi = 0x1.921fb54442d18p+1

-- 4. \u{} UTF-8 转义（字符串字面量）
local greeting = "hello \u{1F600} world"

-- 5. 整数除法（5.3 引入，5.4 沿用）
local half = 7 // 2

-- 6. 位运算 & | ~ << >>（5.3 引入，5.4 沿用）
local mask = (1 << 4) & 0xFF | ~0x0F

-- 7. goto 与标签
local function guard()
    goto skip
    ::skip::
    return true
end

-- 8. <const> 配合多返回值声明
local function dims()
    return 1920, 1080
end
local w, h <const> = dims()

-- 9. 在 for 循环中使用 <close>
for i = 1, 3 do
    local tmp <close> = openResource("tmp" .. i)
    print(i, tmp.name)
end

-- 末尾变量：若上方所有 Lua 5.4 语法均能被正确解析，
-- 则 vscode 能解析到这个变量，证明语法解析正常。

local lua54_parse_ok = true
