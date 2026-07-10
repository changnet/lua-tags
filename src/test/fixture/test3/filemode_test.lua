-- filemode_test.lua
-- 测试 file mode 配置：modules/sub/mod_a.lua 以 module 方式加载
-- 通过 require 引入后，M.greet / M.magic 能正确解析到模块内的符号
local M = require("modules.sub.mod_a")

local g = M.greet("world")
local m = M.magic()
