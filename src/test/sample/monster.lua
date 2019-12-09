
local Animal = require "animal"

-- monster class, inherit from Animal
local Monster = oo.class(..., Animal)

-- called when monster was killed
function Monster:on_kill(who, ...)
end

return Monster
