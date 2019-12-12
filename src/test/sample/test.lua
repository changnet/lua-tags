local Monster = require "Monster"

-- test path auto completion
-- 测试路径补全，打出这个.号才会触发路径补全
require "conf."

local BattleConf = require "conf.battle_conf"

-- 当我们搜索符号时，battle.start()和battle.的效果是不一样的
-- 但battle.会导致当前文件不可编译，因为在注释中测试
-- battle.

-- 测试声明多个变量
local M, N, X, Y = {}, 1, "X", false

-- 测试枚举
local ENUM =
{
    E_NUMBER = 1,  -- enum NUMBER
    E_STRING = "hello", -- enum STRING
    E_BOOLEAN = true, -- enum boolean
    E_EXPRESS = 4 + 0, -- enum expr
    E_FUNCTION = function() end, -- enum function
    E_UNKNOW = unknow,
}
ENUM.TEST = 3

-- test function assignment
-- multiline comment1
-- multiline comment2
table.empty = function(tbl)
    return not next(tbl)
end
-- tabl
-- table.

function signature_help(a, b, c)
end

function signature_help(a, b, c, d)
end

signature_help(a, {a = 1, b = 2}, signature_help(BattleConf.max_player, 8), 1)

-- 测试注释0
function cmt() -- 测试注释1
    -- 测试注释2
    -- 测试注释3
end -- 测试注释5
local cmt = cmt() -- 测试注释6

-- 解析后，test()被丢掉了，下面的support_comment也不应该有注释
test() -- test call
local support_comment = 9

-- 测试混合多行注释
-- comment 111
--[[
    这是
    多行
    注释
]]
local multi_comment = true
