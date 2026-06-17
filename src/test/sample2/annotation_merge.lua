-- 注解测试文件 - 数据和注解合并

-- @class EXAMPLE 示例类
-- @field a number 变量a
-- @field b string 变量b

EXAMPLE = {
    a = 1,
    -- b没有默认值
}

-- 当hover在EXAMPLE.a上时，应该同时显示:
-- - 数据中的常量值 1
-- - 注解中的描述 "变量a"
