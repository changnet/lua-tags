local MetaObject = require "meta_object"
local NewObject  = require("new_object")

-- 测试路径补全，打出这个.号才会触发路径补全
require "conf."

-- 测试oo类型对象成员函数跳转
local mo = MetaObject()
mo:show()
mo:base_test()
mo:meta_test()

-- 测试自动补全能否显示参数
mo:param_test()

-- 测试new table类型成员跳转
local no = NewObject.new()
no:new_test()
no:test_other()

-- 测试upvalue跳转
local function test_upvalue(param1, param2,param3)
    local Hash = {
        A = 1,
        B = 2
    }
    return function(param11, param12, param13)
        local ins = MetaObject()

        for k, v in pairs({}) do
            v = v + k

            -- 测试覆盖局部变量后还能不能跳转
            local ins = MetaObject()
        end

        -- 测试local声明的函数跳转
        local func = function(x, y, z)
            ins.v = x + y + z
        end

        -- 测试IndexExpression局部变量
        local list = {}
        list[1] = function(a, b, c)
            local count = 100
            count = count + 999 -- 试下这个count能不能跳转
        end

        local A = "88"

        -- 测试参数、upvalue跳转、局部变量自动补全
        local x = param1 + param11 + Hash.A
        ins:show(x)

        local other = no_such_func()
        other:show()
    end
end

-- 测试声明多个变量
local M, N, X, Y = {}, 1, "X", false

-- 测试枚举
local ENUM =
{
    E_NUMBER = 1,
    E_STRING = "hello",
    E_BOOLEAN = true,
    E_EXPRESS = 4 + 0,
    E_FUNCTION = function() end,
    E_UNKNOW = unknow,

    E_MAX -- unsupport for now
}
ENUM.TEST = 3

-- test function assignment
table.empty = function(tbl)
    return not next(tbl)
end

-- 测试本地化，注意后面的符号要能跳转到原符号
local LiteConf = LiteConf

--  测试真正类型自动补全，打出下面的点号，应该能够补全
-- LiteConf.

-- 测试本地化换名后是否能跟踪原类型
local LC = LiteConf
-- LC.

-- 测试require文件时是否能跟踪类型，尤其是require的文件是匿名模块时
local conf = require "conf.anno_conf"
-- conf.

-- 测试是否正常解析了超大的文件符号
local LargeConf = LargeConf
