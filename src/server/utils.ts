/// <reference types="node" />
import { Connection, Diagnostic } from 'vscode-languageserver';

import * as fs from 'fs';
import * as path from 'path';
import { URI } from 'vscode-uri';
import { Setting } from './setting';

type WalkerCallBack = (uri: string, ctx: string) => void;

export class DirWalker {
    private static ins: DirWalker;

    private files: number = 0;
    private constructor() {}

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
        const files = await fs.promises.readdir(dirPath, {
            withFileTypes: true,
        });

        for (const file of files) {
            const subPath = path.join(dirPath, file.name);

            if (file.isDirectory()) {
                await this.walkDir(subPath, callBack);
            } else if (file.isFile()) {
                await this.walkFile(subPath, callBack);
            }
        }
    }

    // 处理单个Lua文件
    public async walkFile(
        filePath: string,
        callBack: WalkerCallBack,
        rawUri?: string,
    ) {
        if (!filePath.endsWith('.lua')) {
            return;
        }

        // uri总是用/来编码，在win下，路径是用\的
        // 这时编码出来的uri和vs code传进来的就会不一样，无法快速根据uri查询符号
        const uri =
            rawUri ||
            URI.from({
                scheme: 'file',
                path: filePath.replace(/\\/g, '/'),
            }).toString();

        const data = await fs.promises.readFile(filePath);

        this.files++;
        callBack(uri, data.toString());
    }

    public async walk(dirPath: string, callBack: WalkerCallBack) {
        this.files = 0;
        const rootPath = Setting.instance().parseRootPath(dirPath);

        try {
            await this.walkDir(rootPath, callBack);
        } catch (e) {
            Utils.instance().anyError(e);
        }

        return this.files;
    }
}

export class Utils {
    private static ins: Utils;
    private conn: Connection | null = null;

    private constructor() {}

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
    // 默认情况下，vscode的日志是trace，如：[Trace - 2:39:21 PM] Received response 'textDocument/hover
    // 为了方便，自己的日志可加前缀
    public Info(str: string) {
        const text = `[Info ${Utils.formatTime()}] ${str}`;
        this.conn!.console.log(text);
    }

    public Debug(str: string) {
        if (process.env.LSP_DEBUG_MODE === 'true') {
            return;
        }
        const text = `[Debug ${Utils.formatTime()}] ${str}`;
        this.conn!.console.log(text);
    }

    public static formatTime() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const sec = String(date.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day} ${hour}:${min}:${sec} `;
    }

    // 写日志到文件，测试时，不好调试的可以用日志来调试
    public logFile(ctx: string) {
        const now = `${Utils.formatTime()} `;
        fs.writeFileSync('lua-tags.log', now, { encoding: 'utf8', flag: 'a' });
        fs.writeFileSync('lua-tags.log', ctx, { encoding: 'utf8', flag: 'a' });
        fs.writeFileSync('lua-tags.log', '\n', { encoding: 'utf8', flag: 'a' });
    }

    public anyError(e: any) {
        let msg = 'unknow';
        if (e) {
            const name: string = e.name || 'unknow';
            const message: string = e.message || 'unknow';
            const stack: string = e.stack || '';
            msg = `name: ${name}\nmessage: ${message}\nstack: ${stack}`;
        }

        this.error(msg);
    }

    // 在vs code右下角弹出一个错误信息窗口
    public error(ctx: string) {
        // 发送自定义协议，这个要在client那定定义一个接收函数
        this.conn!.sendNotification('__error', ctx);
    }

    public diagnostics(uri: string, diags: Diagnostic[]): void {
        this.conn!.sendDiagnostics({ uri: uri, diagnostics: diags });
    }

    // set file executable, use sync make sure luacheck executable before run
    // luacheck
    public setExec(exePath: string) {
        const stat = fs.statSync(exePath);
        if (stat.mode & fs.constants.S_IXUSR) {
            return; // already have permission
        }
        fs.chmodSync(exePath, stat.mode | fs.constants.S_IXUSR);
    }
}
