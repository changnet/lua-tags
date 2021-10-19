local case1 = require "case1"
case1.local_func_export()

g_func_test()

local function g_func_test()
end

g_func_test()
