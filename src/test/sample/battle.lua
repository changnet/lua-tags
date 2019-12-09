-- we handle a battle here

-- this should not be a member of module battle
function battle_check()
end

module("battle", package.seeall)

-- create a battle
function factory(monId, max)
    -- battle type
    local BATTLE_TYPE = 
    {
        BT_PVP = 1, -- player vs player
        BT_PVE = 2, -- player vs monster
    }

    return function(player)
        -- get the monster conf by id
        local conf = MonsterConf[monId]

        for _ = 1, max do
            -- now we create a monster one by one
            local monster = Monster(conf)

            monster:move(player.x, player.y, JUMP)
        end

        player:attack()

    end
end

-- start a battle
function start()
end

-- stop a battle
function stop()
end
