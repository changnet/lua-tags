local MetaObject = require "meta_object"
local NewObject  = require("new_object")

local mo = MetaObject()

mo:show()
mo:base_test()
mo:meta_test()


local no = NewObject.new()
no:new_test()
no:test_other()
