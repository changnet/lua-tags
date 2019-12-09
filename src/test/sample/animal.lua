-- base class for any entity can move in scene
local Animal = oo.class(...)

-- move to a destionation
-- @x: x coordinate
-- @y: y coordinate
-- @how: the way it moves. WALK、JUMP
function Animal:move(x, y, how)
end

-- called when the animal be killed
function Animal:on_kill(who, ...)
end

return Animal
