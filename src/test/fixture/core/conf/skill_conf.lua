-- anonymous skill config
-- test: anonymous

return
{
    skill_id = 2001,
    level = 1,
    desc = "this is a skill descript",
    parameters = 
    {
        boss = 
        {
            effect = 1001,
            factor = 0.01,
        },
        monster =
        {
            effect = 1002,
            factor = 0.03,
        },
        player =
        {
            effect = 1003,
            factor = 0.06,
        },
    }
}
