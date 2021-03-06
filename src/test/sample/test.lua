local Monster = require "Monster"

-- test path auto completion
-- 测试路径补全，打出这个.号才会触发路径补全
require "sample."

local BattleConf = require "conf.battle_conf" -- localized here and test at battle.lua

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
-- table.e

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

-- 局部函数
function top_function()
    function sub_func(sub_param)
        sub_func(sub_param)
    end
    -- sub_fu
end

-- exclude context
local exclude = EXCLUDE

-- 在找不到其他符号情况下，允许跳转到无法访问的local变量
-- 因为写代码的时候有时候会写错，允许直接跳转到对应变量去改顺序
foo()
local function foo(args, arg) -- local function foo(args,)
end

-- test ref value
local scene = BattleConf.scene
-- scen

-- main chunk for local symbol search
for idx = 1, 100 do
    local count = idx
    count = count + 1
end

-- main chunk do end block local symbol search
do
    local function sub()
        local var = 100 -- const

        return var
    end
    
    sub();
end

-- test local symbol duplicate filter
local function local_symbol_duplicate_filter(lsdf_name)
    lsdf_name = "local"
    lsdf_name = "symbol"

    -- should only show one auto completion item
    --  lsdf_na
end

-- test global recursive search symbol
-- BattleConf.resource.area.

-- test document recursive search symbol
local SkillConf = require "conf.skill_conf"
local BossParam = SkillConf.parameters.boss

-- BossParam.
-- SkillConf.parameters.boss.factor

-- test function reference

local empty = table.empty
local is_empty = empty({})

local ref_tbl = {}
ref_tbl.empty = table.empty

local ipair = ipair

-- test ref function signature
-- ref_tbl.empty()

-- test const expression hover
local const_v = -16 + 1 << 32 + 8 >> "32" + 2 * 4 - 5 / 2 + 8 % 2

-- test luaparse v0.3.0 encoding mode
local str = "能不能正常解析中文utf8字符"

-- do NOT jump to file battle_conf
local BattleConfErr = require "attle_conf"

-- max_player should jump to BattleConf.max_player
local dummy_max_player = max_player

local wrap = {
    BC = BattleConf,
    OO = oo
}
-- wrap.OO.

-- test lua standard
local pl = table.p
local ti = table.insert -- table.insert(a,)

function test_local_document_sym()
    pl = pl + 1
end

-- test grammar inject
-- @param g grammarrrrrrrrrrrr
--@param i injectttttttttttttt
---@param h hightlightttttttttttttttt
-- @param ... 其他参数
--[[@return return something]]
function grammar_inject_hightlight(g, i, h, ...)
    return
end


-- test _G sub variable
local gs = test_v

-- test global reference
function ref_func()
end
RefMob.ref_func = ref_func

local Indexer = {}
function Indexer:call_with_dot(args1, args2)
end
function Indexer.call_with_colon(args1, args2)
end
index.call_with_dot(ins, args1) -- args1应该和声明中的args1匹配
index:call_with_colon(args2) -- args2应该和函数声明中的args2匹配
