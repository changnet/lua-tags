-- 测试对象函数

-- 用new函数创建一个对象
local NewObject = {}

local function new_test()
end

-- comment: test_other
local function test_other()
end

function NewObject.new()
    return
    {
        new_test = new_test,
        test_other = test_other
    }
end
