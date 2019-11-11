// 插件配置

import { Options } from 'luaparse';

// let ver:string = "5.1"
// luaVersion = ver as Version
export type Version = "5.1" | "5.2" | "5.3" | "LuaJIT";

export enum FileType {
    FT_NONE = 0, // 不需要解析的文件
    FT_NORMAL = 1, // 正常解析的工程文件
    FT_CONFIG = 2, // 超大的配置文件
    FT_SINGLE = 3, // 单个文件，不属于工程文件
}

class Setting {
    // 查询符号时，默认搜索的作用域深度
    // 一般只搜索模块中的函数，不搜索局部变量，默认为1
    public scopeDeepth: number = 1;

    public luaVersion: Version = "5.3";

    // 大于100kb的文件不解析，大概在2000代码以上了，取决于你写了啥
    public maxFileSize: number = 100 * 1024;

    private confDir: string = ""; // 配置文件目录，特殊解析
    private excludeDir: string[] = []; // 排除的目录
    private rootPath: string = ""; // 工程根目录

    // 设置工程根目录
    public setRootPath(root: string) {
        this.rootPath = root;
    }

    // 获取文件的类型
    public getFileType(uri: string, size: number): FileType {
        let isInPro = false; // 是否在工程目录
        if (this.rootPath !== "" && uri.startsWith(this.rootPath)) {
            isInPro = true;
        }

        if (size > this.maxFileSize) {
            if (this.rootPath !== "" && this.confDir !== ""
                && uri.startsWith(this.rootPath + this.confDir)) {
                return FileType.FT_CONFIG;
            }

            return FileType.FT_NONE;
        }

        // 是否被排除
        let isExclude = false;

        if (!isInPro || isExclude) {
            return FileType.FT_SINGLE;
        }

        return FileType.FT_NORMAL;
    }
}

export var g_setting = new Setting();
