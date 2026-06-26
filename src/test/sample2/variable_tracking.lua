-- 变量跟踪系统测试文件

-- @class Animal 动物基类
-- @field name string 动物名称
-- @field age number 动物年龄

-- @class Dog 狗类
-- @field breed string 品种
-- @field owner string 主人
-- @field type number 类型常量

-- 自动推导类型为number
local a = 1

-- 自动推导类型为string
local b = "hello"

-- 自动推导类型为boolean
local c = true

-- 根据注解判断为Dog
-- @type Dog
local my_dog = {}

-- @return Dog
local function get_dog()
end

-- 从函数返回值推断类型
local dog1 = get_dog()

-- 成员变量访问测试
my_dog.name = "Buddy"
my_dog.age = 3

-- 测试函数
-- @param a number
-- @param b boolean
-- @return string
function test(a, b)
    return "result"
end

-- 测试变量类型推断
local result = test(1, true)
