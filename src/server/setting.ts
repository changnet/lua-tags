// 插件配置

import {Options} from 'luaparse';

// let ver:string = "5.1"
// luaVersion = ver as Version
export type Version = "5.1" | "5.2" | "5.3" | "LuaJIT";

class Setting
{
    public luaVersion: Version = "5.3" ;
}

export var g_setting = new Setting()
