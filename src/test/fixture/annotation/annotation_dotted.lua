-- 注解测试 - 带点的类型名（整体，不是嵌套表）
-- @class protobuf.a.b - 带点类型
-- @field c number - 字段c

-- @type protobuf.a.b
local x = {}

-- completion/hover test: x.c
local v = x.c
