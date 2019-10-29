local MetaObject = require "meta_object"
local NewObject  = require("new_object")

-- 测试oo类型对象成员函数跳转
local mo = MetaObject()
mo:show()
mo:base_test()
mo:meta_test()

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
    return
        function(param11, param12, param13)
        local ins = MetaObject()

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
    E_NONE = 1,
    E_DEFAULT = 2,

    E_MAX
}
