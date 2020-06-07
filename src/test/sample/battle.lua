-- we handle a battle here

-- this should not be a member of module battle
function battle_check()
end

module("battle", package.seeall)

local SkillConf = require "conf.skill_conf"

-- create a battle
function factory(monId, max, round)
    -- battle type
    local BATTLE_TYPE = 
    {
        BT_PVP = 1, -- player vs player
        BT_PVE = 2, -- player vs monster
    }

    return function(player, battle_type)
        -- get the monster conf by id
        local conf = MonsterConf[monId]

        local monster_attack = {}
        for index = 1, max do
            -- now we create a monster one by one
            local monster = Monster(conf)

            local conf = SkillConf -- SkillConf.
            monster_attack[index] = function(player)
                monster:move(player.x, player.y, JUMP)
                monster:attack(conf.id) -- mons
            end
        end

        local attack = function()
            player:attack(SkillConf.id) -- play
        end

        repeat
            attack()
            for _, one_attack in pairs(monster_attack) do
                one_attack(player)
            end

            local next_round = round - 1

            round = next_round
        until (round > 0)

        if battle_type == BATTLE_TYPE.BT_PVE then -- BATTLE_TYPE.
            return
        end

        monster:on_kill(player, round, val_undefined)
    end
end

-- start a battle
function start()
end

-- stop a battle
function stop()
    local scene = BattleConf.scene
end

-- should only show local new，not oo.lua new
-- new
