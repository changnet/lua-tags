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

    // 大于100kb的文件不解析，大概在2000代码以上了，取决于你写了啥
    public maxFileSize: number = 100 * 1024;
}

export var g_setting = new Setting()
