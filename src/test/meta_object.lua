-- using meta table __call to construct object

local BaseObject = require "base_object"

local MetaObject = oo.class( ...,BaseObject )

-- overwrite base show function
function MetaObject:show()
end

function MetaObject:meta_test()
end

-- 测试能否显示参数
function MetaObject:param_test(a, b, c, ...)
end

return MetaObject
