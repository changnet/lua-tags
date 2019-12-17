// 插件配置

import * as path from "path";
import { Utils } from "./utils";

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

    // luacheck setting
    private luaCheck = true; // enable or disable luacheck
    private checkOnInit = true; // run luacheck on init
    private checkHow = "save"; // run luacheck on file save or typing
    private checkDelay = 1000; // delay run luacheck
    private luaCheckPath = ""; // luacheck path
    private luaCheckRc = ""; // .luacheckrc path
    private checkExclude: string[] = []; // luacheck exclude dir

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
        Utils.instance().log(`check conf ${JSON.stringify(conf)}`);
        if (conf.luaVersion) {
            this.luaVersion = <Version>(conf.luaVersion) || "5.3";
        }

        if (conf.excludeDir) {
            this.excludeDir = <string[]>(conf.excludeDir) || [];
        }

        if (conf.maxFileSize) {
            this.maxFileSize = <number>(conf.maxFileSize) || 100 * 1024;
        }

        // boolean类型不用if判断
        this.excludeDotDir = <boolean>(conf.excludeDotDir);

        if (conf.rootDir) {
            this.rootDir = <string>(conf.rootDir) || "";
        }


        this.luaCheck = <boolean>(conf.luacheck);
        this.checkOnInit = <boolean>(conf.checkOnInit);


        if (conf.checkHow) {
            this.checkHow = <string>(conf.checkHow) || "save";
        }

        if (conf.checkDelay) {
            this.checkDelay = <number>(conf.checkDelay) || 1000;
        }

        if (conf.luaCheckPath) {
            this.luaCheckPath = <string>(conf.luaCheckPath) || "";
        }

        if (conf.luaCheckRc) {
            this.luaCheckRc = <string>(conf.luaCheckRc) || "";
        }

        if (conf.checkExclude) {
            this.checkExclude = <string[]>(conf.checkExclude) || [];
        }

        if ("" !== this.rawRootUri) {
            this.rootUri = this.getRoot(this.rawRootUri);
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
    public getRoot(oldPath: string) {
        if ("" === this.rootDir) {
            return oldPath;
        }

        return path.join(oldPath, this.rootDir);
    }

    private isUriExclude(uri: string, excludes: string[]): boolean {
        for (let dir of excludes) {
            let re = new RegExp(`${this.rootDir}/${dir}`, "g");
            if (uri.match(re)) {
                return true;
            }
        }

        return false;
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
        let isExclude = this.isUriExclude(uri, this.excludeDir);

        if (!isInRoot || isExclude) {
            ft = ft | FileParseType.FPT_SINGLE;
        }

        return ft;
    }

    public isLuaCheckOpen() {
        return this.luaCheck;
    }

    public isCheckOnInit() {
        return this.luaCheck && this.checkOnInit;
    }

    public isCheckOnTyping() {
        return this.luaCheck && "typing" === this.checkHow;
    }

    public isCheckOnSave() {
        return this.luaCheck && "save" === this.checkHow;
    }

    public getCheckDelay() {
        return this.checkDelay;
    }

    public getLuaCheckPath() {
        return this.luaCheckPath;
    }

    public getLuaCheckRc() {
        return this.luaCheckRc;
    }

    public isCheckExclude(uri: string) {
        return this.isUriExclude(uri, this.checkExclude);
    }
}
