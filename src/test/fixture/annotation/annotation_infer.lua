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

-- @class MailObj - 邮件对象
-- @field subject string - 邮件主题
-- @field body string - 邮件正文

-- @class Foo - 基类
-- @field base_field number - 基类字段

-- @class Bar : Foo - 子类
-- @field x number - 成员变量x
local Bar = {}

-- @param mail_obj MailObj - 邮件对象
local function prepare_mail_obj(mail_obj)
end

-- completion test: Bar.
local MailObj = require "annotation_return"
