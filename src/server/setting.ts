// 插件配置

import * as path from "path";

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

export class Setting {
    private static ins: Setting;

    private luaVersion: Version = "5.3";

    // 大于100kb的文件不解析，大概在2000代码以上了，取决于你写了啥
    private maxFileSize: number = 100 * 1024;

    private excludeDir: string[] = []; // 排除的目录
    private rootDir: string = ""; // 工程根目录
    private excludeDotDir: boolean = true; // 排除.开头的文件夹(.svn .git .vscode)

    private rawRootUri: string = ""; // vs code打开的根目录uri
    private rootUri: string = ""; // 完整的工程根目录uri

    private constructor() {
    }

    public static instance() {
        if (!Setting.ins) {
            Setting.ins = new Setting();
        }

        return Setting.ins;
    }

    // 设置工程根目录
    public setRawRootUri(root: string) {
        this.rawRootUri = root;
    }

    public setConfiguration(conf: any, isUpdate: boolean = false) {
        if (conf.luaVersion) {
            this.luaVersion = <Version>(conf.luaVersion) || "5.3";
        }

        if (conf.excludeDir) {
            this.excludeDir = <string[]>(conf.excludeDir) || [];
        }

        if (conf.maxFileSize) {
            this.maxFileSize = <number>(conf.maxFileSize) || 100 * 1024;
        }

        if (conf.excludeDotDir) {
            this.excludeDotDir = <boolean>(conf.excludeDotDir) || true;
        }

        if (conf.rootDir) {
            this.rootDir = <string>(conf.rootDir) || "";
        }

        if ("" !== this.rawRootUri) {
            this.rootUri = this.getRoot(this.rawRootUri, "/");
        }
    }

    // 获取设置的Lua版本
    public getLuaVersion() {
        return this.luaVersion;
    }

    // 是否排除.开头的文件夹
    public isExcludeDotDir(pathNnme: string) {
        if (!this.excludeDotDir) {
            return false;
        }
        const dirName = path.parse(pathNnme).name;

        return dirName.startsWith(".");
    }

    // 获取设置的根目录
    public getRoot(oldPath: string, slash: string) {
        if ("" === this.rootDir) {
            return oldPath;
        }

        return oldPath + slash + this.rootDir;
    }

    // 获取文件的类型
    public getFileType(uri: string, size: number): FileParseType {
        let ft = FileParseType.FPT_NORMAL;
        if (size > this.maxFileSize) {
            ft = ft | FileParseType.FPT_LARGE;
        }

        let isInRoot = false; // 是否在工程目录
        if (this.rootUri !== "" && uri.startsWith(this.rootUri)) {
            isInRoot = true;
        }

        // 是否被排除
        let isExclude = false;
        for (let dir of this.excludeDir) {
            let re = new RegExp(`${this.rootDir}/${dir}`, "g");
            if (uri.match(re)) {
                isExclude = true;
                break;
            }
        }

        if (!isInRoot || isExclude) {
            ft = ft | FileParseType.FPT_SINGLE;
        }

        return ft;
    }
}

