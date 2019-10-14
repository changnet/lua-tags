local MetaObject = require "meta_object"
local NewObject  = require("new_object")

local mo = MetaObject()

mo:show()
mo:base_test()
mo:meta_test()


local no = NewObject.new()
no:new_test()
no:test_other()

local function test_upvalue(param1, param2,param3)
    local Hash = {
        A = 1,
        B = 2
    }
    return function(param11, param12, param13)
        local ins = MetaObject()

        local x = param1 + param11 + Hash.A
        ins:show(x)
    end
end
