X = {}
X.Y = function(a, b) return a + b end
X.Z = 100

RPC = {}
Call = {}

local r1 = RPC[addr].X.Y(1, 2)
local r2 = Call[addr].X.Z
