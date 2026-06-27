-- 变量跟踪系统测试文件

-- @class Animal 动物基类
-- @field name string 动物名称
-- @field age number 动物年龄

-- @class Pet 宠物类
-- @field breed string 品种
-- @field owner string 主人
-- @field age number 动物年龄
-- @field type number 类型常量

-- 自动推导类型为number
local a = 1

-- 自动推导类型为string
local b = "hello"

-- 自动推导类型为boolean
local c = true

-- 根据注解判断为Pet
-- @type Pet
local my_dog = {}

-- @return Pet
local function get_pet()
end

-- 从函数返回值推断类型
local pet1 = get_pet()

-- 成员变量访问测试
my_dog.owner = "Buddy"
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
