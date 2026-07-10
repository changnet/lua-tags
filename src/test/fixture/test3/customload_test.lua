-- customload_test.lua
-- 测试自定义加载函数 import / include，配置后等同 require
-- import("a.b.c") 和 include("a.b.c.lua") 都会绑定到 a.b.c 模块
local N = import("modules.sub.mod_a")
local v1 = N.greet("custom")

local P = include("modules.sub.mod_a.lua")
local v2 = P.magic()
