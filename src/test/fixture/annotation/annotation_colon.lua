-- @class ColonBase - 基类ColonBase
-- @field colonMember number - 字段colonMember（ColonBase的成员）
local cb = {}

-- @type ColonBase:colonMember
local x1 = {}
-- @type ColonBase :colonMember
local x2 = {}
-- @type ColonBase: colonMember
local x3 = {}

-- @class ColonChild : ColonBase - 子类ColonChild继承ColonBase
local cc = {}

-- @type ColonChild:ColonBase
local x5 = {}
