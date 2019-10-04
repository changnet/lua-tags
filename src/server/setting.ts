// 插件配置

import { Options } from 'luaparse';

// let ver:string = "5.1"
// luaVersion = ver as Version
export type Version = "5.1" | "5.2" | "5.3" | "LuaJIT";

class Setting {
    // 查询符号时，默认搜索的作用域
    // 对lua而言，通常用table实现模块
    // 因此只搜索模块中的符号，对于多层镶嵌的变量或者函数，不处理
    public scopeDeepth: number = 2;

    public luaVersion: Version = "5.3";
}

export var g_setting = new Setting()
