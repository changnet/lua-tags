-- 注解测试文件 - @type和@alias

-- @alias MyFunc func(a:number, b:string):boolean

-- @type Animal - 动物
local my_pet = {}

-- @type Dog - 狗
local my_dog = {}

-- @type table<number, string> - 名称映射
local name_map = {}

-- @type string[] - 名称列表
local name_list = {}

-- completion test: my_dog.

local owner_name = my_dog.owner

-- go-to-definition test: my_dog.age
local animal_age = my_dog.age
