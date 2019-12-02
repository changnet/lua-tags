-- using meta table __call to construct object

local BaseObject = require "base_object"

local MetaObject = oo.class( ...,BaseObject )

-- overwrite base show function
function MetaObject:show()
end

function MetaObject:meta_test()
end

-- 测试能否显示参数
-- @a: 参数a
-- @b: 参数b
-- @c: 参数c
function MetaObject:param_test(a, b, c, ...)
end

return MetaObject
