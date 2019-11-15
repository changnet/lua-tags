// 插件配置

import { Options } from 'luaparse';

// let ver:string = "5.1"
// luaVersion = ver as Version
export type Version = "5.1" | "5.2" | "5.3" | "LuaJIT";

// 按位(1是否需要解析 2是否超大 3是否工程文件)
export enum FileParseType {
    FPT_NONE = 0, // 不需要解析的文件
    FPT_NORMAL = 1, // 正常解析的工程文件
    FPT_LARGE = 2, // 超大的文件
    FPT_SINGLE = 4, // 单个文件，不属于工程文件
}

class Setting {
    // 查询符号时，默认搜索的作用域深度
    // 一般只搜索模块中的函数，不搜索局部变量，默认为1
    public scopeDeepth: number = 1;

    public luaVersion: Version = "5.3";

    // 大于100kb的文件不解析，大概在2000代码以上了，取决于你写了啥
    public maxFileSize: number = 100 * 1024;

    private excludeDir: string[] = []; // 排除的目录
    private rootPath: string = ""; // 工程根目录

    // 设置工程根目录
    public setRootPath(root: string) {
        this.rootPath = root;
    }

    // 获取文件的类型
    public getFileType(uri: string, size: number): FileParseType {
        let ft = FileParseType.FPT_NORMAL;
        if (size > this.maxFileSize) {
            ft = ft | FileParseType.FPT_LARGE;
        }

        let isInPro = false; // 是否在工程目录
        if (this.rootPath !== "" && uri.startsWith(this.rootPath)) {
            isInPro = true;
        }

        // 是否被排除
        let isExclude = false;
        for (let dir of this.excludeDir) {
            let re = new RegExp(`${this.rootPath}/${dir}`, "g");
            if (uri.match(re)) {
                isExclude = true;
                break;
            }
        }

        if (!isInPro || isExclude) {
            ft = ft | FileParseType.FPT_SINGLE;
        }

        return ft;
    }
}

export var g_setting = new Setting();
