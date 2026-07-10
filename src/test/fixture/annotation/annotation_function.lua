-- 注解测试文件 - 函数参数和返回值

-- @param a number - 参数a
-- @param b boolean - 参数b
-- @return string - 返回字符串
function test_func(a, b)
    return "result"
end

-- @param x string - 输入字符串
-- @return number - 返回长度
function get_length(x)
    return #x
end

-- @param name string - 名称
-- @return Animal - 返回动物对象
function create_animal(name)
    return { name = name, age = 0 }
end

--- @param tbl_name 表名
--- @param keys 数据唯一标识的键值对，这个要做缓存key，必须按顺序。比如{"pid", 999, "type", 1}
--- @param fields 需要读取的字段列表，如{"name", "level"}，nil表示读取全部字段
--- @param opts DataOpts 可选项，支持ikey字段指定需要还原数字键的字段列表，例如{"data", "vars"}
function DataCache_get(tbl_name, keys, fields, opts)
    return 0, {}
end
