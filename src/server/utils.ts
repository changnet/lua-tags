import {
    Connection,
    Diagnostic
} from 'vscode-languageserver';

import * as path from "path";
import Uri from 'vscode-uri';
import * as syncfs from "fs";
import { promises as fs } from "fs";
import { Setting } from './setting';

type WalkerCallBack = (uri: string, ctx: string) => void;

export class DirWalker {
    private static ins: DirWalker;
    private constructor() {
    }

    public static instance() {
        if (!DirWalker.ins) {
            DirWalker.ins = new DirWalker();
        }

        return DirWalker.ins;
    }

    // 遍历单个目录的Lua文件
    private async walkDir(dirPath: string, callBack: WalkerCallBack) {
        if (Setting.instance().isExcludeDotDir(dirPath)) {
            return;
        }

        // 当使用 withFileTypes 选项设置为 true 调用 fs.readdir() 或
        // fs.readdirSync() 时，生成的数组将填充 fs.Dirent 对象，而不是路径字符串
        let files = await fs.readdir(dirPath, { withFileTypes: true });

        for (let file of files) {
            let subPath = path.join(dirPath, file.name);

            if (file.isDirectory()) {
                await this.walkDir(subPath, callBack);
            }
            else if (file.isFile()) {
                await this.walkFile(subPath, callBack);
            }

        }
    }

    // 处理单个Lua文件
    public async walkFile(
        filePath: string, callBack: WalkerCallBack, rawUri?: string) {
        if (!filePath.endsWith(".lua")) {
            return;
        }

        // uri总是用/来编码，在win下，路径是用\的
        // 这时编码出来的uri和vs code传进来的就会不一样，无法快速根据uri查询符号
        const uri = rawUri || Uri.from({
            scheme: "file",
            path: filePath.replace(/\\/g, "/")
        }).toString();

        let data = await fs.readFile(filePath);

        callBack(uri, data.toString());
    }

    public async walk(dirPath: string, callBack: WalkerCallBack) {
        let rootPath = Setting.instance().getRoot(dirPath);

        Utils.instance().log(`start parse root ${rootPath}`);
        try {
            await this.walkDir(rootPath, callBack);
        } catch (e) {
            Utils.instance().anyError(e);
        }
    }
}

export class Utils {
    private static ins: Utils;
    private conn: Connection | null = null;

    private constructor() {
    }

    public static instance() {
        if (!Utils.ins) {
            Utils.ins = new Utils();
        }

        return Utils.ins;
    }

    public initialize(conn: Connection) {
        this.conn = conn;
    }

    // 写日志到终端，设置了lua-tags.trace: verbose就可以在OUTPUT看到
    public log(ctx: string) {
        this.conn!.console.log(ctx);
    }

    public static pad(num: number, size: number) {
        var s = String(num);
        while (s.length < (size || 2)) { s = "0" + s; }
        return s;
    }

    // 写日志到文件
    // 测试时，不好调试的可以用日志来调试
    public logFile(ctx: string) {
        const date = new Date();

        const month = Utils.pad(date.getMonth(), 2);
        const day = Utils.pad(date.getMonth(), 2);
        const hour = Utils.pad(date.getHours(), 2);
        const min = Utils.pad(date.getMinutes(), 2);
        const sec = Utils.pad(date.getSeconds(), 2);

        const now = `${date.getFullYear()}-${month}-${day} ${hour}:${min}:${sec} `;
        syncfs.writeFileSync("lua-tags.log", now, { encoding: "utf8", flag: "a" });
        syncfs.writeFileSync("lua-tags.log", ctx, { encoding: "utf8", flag: "a" });
        syncfs.writeFileSync("lua-tags.log", "\n", { encoding: "utf8", flag: "a" });
    }

    public anyError(e: any) {
        let msg = "unknow";
        if (e) {
            let name: string = e.name || "unknow";
            let message: string = e.message || "unknow";
            let stack: string = e.stack || "";
            msg = `name: ${name}\nmessage: ${message}\nstack: ${stack}`;
        }

        this.error(msg);
    }

    public error(ctx: string) {
        // 发送自定义协议，这个要在client那定定义一个接收函数
        this.conn!.sendNotification("__error", ctx);
    }

    public diagnostics(uri: string, diags: Diagnostic[]): void {
        this.conn!.sendDiagnostics({ uri: uri, diagnostics: diags });
    }
}

