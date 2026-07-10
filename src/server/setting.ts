// 插件配置

import * as path from 'path';
import { URI } from 'vscode-uri';
import { Utils } from './utils';

// let ver:string = "5.1"
// luaVersion = ver as Version
export type Version = '5.1' | '5.2' | '5.3' | '5.4' | '5.5' | 'LuaJIT';

// 按位(1是否需要解析 2是否超大 3是否工程文件)
export enum FileParseType {
    FPT_NONE = 0, // 不需要解析的文件
    FPT_NORMAL = 1, // 正常解析的工程文件
    FPT_LARGE = 2, // 超大的文件
    FPT_SINGLE = 4, // 单个文件，不属于工程文件
}

export class Setting {
    private static ins: Setting;

    private luaVersion: Version = '5.3';

    // 大于100kb的文件不解析，大概在2000代码以上了，取决于你写了啥
    private maxFileSize: number = 100 * 1024;

    private excludeDir: string[] = []; // 排除的目录
    private rootDir: string = ''; // 工程根目录
    private excludeDotDir: boolean = true; // 排除.开头的文件夹(.svn .git .vscode)

    private rawRootUri: string = ''; // vs code打开的根目录uri
    private rootUri: string = ''; // 完整的工程根目录uri

    // luacheck setting
    private luaCheck = true; // enable or disable luacheck
    private checkOnInit = true; // run luacheck on init
    private checkHow = 'save'; // run luacheck on file save or typing
    private checkDelay = 1000; // delay run luacheck
    private luaCheckPath = ''; // luacheck path
    private luaCheckRc = ''; // .luacheckrc path
    private checkExclude: string[] = []; // luacheck exclude dir
    private checkOnFileOpen = false; // run luacheck when open a lua file

    // export global symbol
    private exportPath = '';

    // rpc prefix: 编译好的正则数组，用于在 getQuerySymbol 中剥离 RPC 前缀
    private rpcPrefix: RegExp[] = [];

    // file mode
    private defaultFileMode: 'load' | 'module' = 'load';
    // 每条配置: {module, glob regex}
    private fileModeList: { module: boolean; re: RegExp }[] = [];

    // custom load func: 自定义加载函数名集合，等同 require
    private customLoadFunc = new Set<string>();

    private constructor() {}

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

    public setConfiguration(conf: any) {
        if (conf.luaVersion) {
            this.luaVersion = <Version>conf.luaVersion || '5.3';
        }

        if (conf.excludeDir) {
            this.excludeDir = <string[]>conf.excludeDir || [];
        }

        if (conf.maxFileSize) {
            this.maxFileSize = <number>conf.maxFileSize || 100 * 1024;
        }

        // boolean类型不用if判断
        this.excludeDotDir = <boolean>conf.excludeDotDir;

        if (conf.rootDir) {
            this.rootDir = <string>conf.rootDir || '';
        }

        this.luaCheck = <boolean>conf.luacheck;
        this.checkOnInit = <boolean>conf.checkOnInit;
        this.checkOnFileOpen = <boolean>conf.checkOnFileOpen;

        if (conf.checkHow) {
            this.checkHow = <string>conf.checkHow || 'save';
        }

        if (conf.checkDelay) {
            this.checkDelay = <number>conf.checkDelay || 1000;
        }

        if (conf.luaCheckPath) {
            this.luaCheckPath = <string>conf.luaCheckPath || '';
        }

        if (conf.luaCheckRc) {
            this.luaCheckRc = <string>conf.luaCheckRc || '';
        }

        if (conf.checkExclude) {
            this.checkExclude = <string[]>conf.checkExclude || [];
        }

        if (conf.exportPath) {
            this.exportPath = <string>conf.exportPath || '';
        }

        // rpc prefix
        this.rpcPrefix = Setting.parseRegexList(<string[]>conf.rpcPrefix);

        // default file mode
        if (conf.defaultFileMode === 'module' || conf.defaultFileMode === 'load') {
            this.defaultFileMode = conf.defaultFileMode;
        }

        // file mode list
        this.fileModeList = Setting.parseFileModeList(conf.fileMode);

        // custom load func
        this.customLoadFunc = new Set<string>(<string[]>conf.customLoadFunc || []);

        if ('' !== this.rawRootUri) {
            this.rootUri = this.parseRootPath(
                URI.parse(this.rawRootUri).fsPath,
                true,
            );
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

        return dirName.startsWith('.');
    }

    /**
     * 解析某个目录在根目录的位置，得到一个完整的路径
     * @param dir 子目录名
     * @param uriFmt 是否格式化为通用的字符串
     */
    public parseRootPath(dir: string, uriFmt: boolean = false) {
        const newPath = path.join(dir, this.rootDir);
        if (!uriFmt) {
            return newPath;
        }
        return URI.file(newPath).toString();
    }

    /**
     * 获取主目录
     */
    public getRoot() {
        return this.rootUri;
    }

    private isUriExclude(uri: string, excludes: string[]): boolean {
        for (const dir of excludes) {
            const re = new RegExp(`${this.rootDir}/${dir}`, 'g');
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
        if (this.rootUri !== '' && uri.startsWith(this.rootUri)) {
            isInRoot = true;
        }

        // 是否被排除
        const isExclude = this.isUriExclude(uri, this.excludeDir);

        if (!isInRoot || isExclude) {
            ft = ft | FileParseType.FPT_SINGLE;
        }

        // 如果是导出的符号文件，不要解析，否则写入文件，触发文件变动，触发解析，再触发文件写入就死循环了
        // file:///d%3A/dev/MServer/server/__globals.lua __globals.lua
        const exportPath = Setting.instance().getExportPath();
        if (exportPath && uri.endsWith(exportPath)) {
            return FileParseType.FPT_NONE;
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
        return this.luaCheck && 'typing' === this.checkHow;
    }

    public isCheckOnSave() {
        return this.luaCheck && 'save' === this.checkHow;
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

    // 是否在打开文件时运行luacheck，仅打开工程不运行luacheck时有效
    public isCheckOnFileOpen() {
        return this.luaCheck && this.checkOnFileOpen && !this.checkOnInit;
    }

    /** 获取保存全局符号路径 */
    public getExportPath() {
        return this.exportPath;
    }

    /**
     * 解析 rpcPrefix 配置（字符串数组）为编译好的 RegExp 数组
     * 支持 "pattern/flags" 和 "pattern" 两种写法，内部始终加 'g' 以便全文扫描
     */
    private static parseRegexList(list?: string[]): RegExp[] {
        const out: RegExp[] = [];
        if (!list || !Array.isArray(list)) {
            return out;
        }
        for (const raw of list) {
            if (typeof raw !== 'string' || raw.length === 0) {
                continue;
            }
            // 形如 "RPC\[(.*?)\]/g"
            const m = raw.match(/^(.+)\/([gimsuy]*)$/);
            let body: string;
            let flags: string;
            if (m) {
                body = m[1];
                flags = m[2];
            } else {
                body = raw;
                flags = '';
            }
            if (flags.indexOf('g') < 0) {
                flags += 'g';
            }
            try {
                out.push(new RegExp(body, flags));
            } catch (e) {
                Utils.instance().error(`invalid rpcPrefix regex: ${raw}`);
            }
        }
        return out;
    }

    /**
     * 解析 fileMode 配置数组，把 glob 编译成正则
     */
    private static parseFileModeList(list?: any[]): { module: boolean; re: RegExp }[] {
        const out: { module: boolean; re: RegExp }[] = [];
        if (!list || !Array.isArray(list)) {
            return out;
        }
        for (const item of list) {
            if (!item || typeof item !== 'object') {
                continue;
            }
            const files = item.files;
            if (typeof files !== 'string' || files.length === 0) {
                continue;
            }
            const re = Setting.globToRegex(files);
            if (!re) {
                continue;
            }
            out.push({ module: !!item.module, re: re });
        }
        return out;
    }

    /**
     * 把一个简单 glob 转成正则。支持 * / ** / ?，分隔符使用 /
     */
    private static globToRegex(glob: string): RegExp | null {
        let re = '';
        for (let i = 0; i < glob.length; i++) {
            const c = glob[i];
            if (c === '*') {
                if (glob[i + 1] === '*') {
                    re += '.*';
                    i++;
                } else {
                    re += '[^/]*';
                }
            } else if (c === '?') {
                re += '[^/]';
            } else if ('\\^$.|+()[]{}!'.indexOf(c) >= 0) {
                re += '\\' + c;
            } else {
                re += c;
            }
        }
        try {
            return new RegExp('^' + re + '$');
        } catch (e) {
            return null;
        }
    }

    /** 获取 rpc prefix 正则列表 */
    public getRpcPrefixes(): RegExp[] {
        return this.rpcPrefix;
    }

    /** 是否为自定义加载函数（等同 require） */
    public isCustomLoadFunc(name: string): boolean {
        return this.customLoadFunc.has(name);
    }

    /** 获取自定义加载函数名集合 */
    public getCustomLoadFuncs(): Set<string> {
        return this.customLoadFunc;
    }

    /**
     * 判断某个文件是否以 module 方式加载，并返回推导出的模块名
     * @return 模块名（如 "modules.sub.mod_a"）；返回 null 表示 load 方式
     */
    public getModuleMode(uri: string): string | null {
        const rel = this.getRelativePath(uri);
        if (null === rel) {
            // 无法计算相对路径时退化为 defaultFileMode 判断
            return this.defaultFileMode === 'module' ? '' : null;
        }

        // 先匹配 fileMode 列表，首个匹配生效
        for (const item of this.fileModeList) {
            if (item.re.test(rel)) {
                return item.module ? this.pathToModuleName(rel) : null;
            }
        }

        // 使用默认模式
        return this.defaultFileMode === 'module' ? this.pathToModuleName(rel) : null;
    }

    /** 计算文件相对 root 的路径（用 / 分隔），失败返回 null */
    private getRelativePath(uri: string): string | null {
        if ('' === this.rootUri || !uri.startsWith(this.rootUri)) {
            return null;
        }
        let rel = uri.substring(this.rootUri.length);
        // 去掉开头的 /
        while (rel.charAt(0) === '/') {
            rel = rel.substring(1);
        }
        return rel;
    }

    /** 把相对路径转成模块名：去掉 .lua，/ 替换为 . */
    private pathToModuleName(rel: string): string {
        let name = rel.replace(/\\/g, '/');
        if (name.endsWith('.lua')) {
            name = name.substring(0, name.length - '.lua'.length);
        }
        name = name.replace(/\//g, '.');
        return name;
    }
}
