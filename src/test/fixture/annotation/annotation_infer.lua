-- 注解测试文件 - 类型推断

-- @class Player - 玩家类
-- @field name string - 玩家名称
-- @field level number - 玩家等级
-- @field health number - 生命值

-- @return Player - 返回玩家对象
function create_player()
    return { name = "hero", level = 1, health = 100 }
end

-- 类型推断：player的类型应为Player
local player = create_player()

-- 应该能识别player.name为Player的name字段
-- 应该能识别player.level为Player的level字段
