local NewObject = {}

local function new_test()
end

local function test_other()
end

function NewObject.new()
    return
    {
        new_test = new_test,
        test_other = test_other
    }
end
