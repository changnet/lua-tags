-- 注解测试文件 - 函数参数和返回值

-- @param a number 参数a
-- @param b boolean 参数b
-- @return string 返回字符串
function test_func(a, b)
    return "result"
end

-- @param x string 输入字符串
-- @return number 返回长度
function get_length(x)
    return #x
end

-- @param name string 名称
-- @return Animal 返回动物对象
function create_animal(name)
    return { name = name, age = 0 }
end
