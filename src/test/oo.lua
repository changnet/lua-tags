
oo = {}

-- 创建lua对象
local function new(clz, ...)
    local obj = {}

    setmetatable(obj, clz)
    obj:__init(...)

    if stat_flag then                  --check
        local name = class_name[clz] or "none"
        object[obj] = name
        obj_count[name] = (obj_count[name] or 0) + 1
    end

    return obj
end

-- 声明普通类
function oo.class(name,supers)
    local clz = {}
    super = super or class_base
    rawset(clz, "__super", super)
    -- 设置metatable的__index,创建实例(调用__call)时让自己成为一个metatable
    rawset(clz, "__index",clz)
    -- 设置自己的metatable为父类，这样才能调用父类函数
    setmetatable(clz, {__index = super, __call = new})

    return clz
end