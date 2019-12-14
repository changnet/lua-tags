// lint 代码检查

import Uri from 'vscode-uri';
import { Utils } from './utils';

import * as util from 'util';
import { execFile } from "child_process";

// 对应child_process.execFile的Option字段
interface ProcOption {
    timeout: number; // default 0
    //Largest amount of data in bytes allowed on stdout or stderr. If exceeded,
    // the child process is terminated and any output is truncated. See caveat
    // at maxBuffer and Unicode. Default: 1024 * 1024.
    maxBuffer: number;
}

export class DiagnosticProvider {
    private static ins: DiagnosticProvider;

    // 正在等待检查的文件，key为uri
    private pending = new Map<string, string>();
    private option: ProcOption;
    private cmd: string;

    private constructor() {
        // https://nodejs.org/api/process.html#process_process_platform
        // 其他平台默认要把luacheck添加到path
        this.cmd = "luackeck";
        const platform = process.platform;
        if (platform === "win32") {
            this.cmd = "../../../luacheck/luacheck_0.23.0.exe";
        } else if (platform === "linux") {
            this.cmd = "../../../luacheck/luacheck_0.23.0";
        }

        this.option = {
            timeout: 5000,
            maxBuffer: 1024 * 1024
        };

        // https://luacheck.readthedocs.io/en/stable/config.html
        // luacheck tries to load configuration from .luacheckrc file in the
        // current directory. If not found, it will look for it in the parent
        // directory and so on, going up until it reaches file system root
    }

    public static instance() {
        if (!DiagnosticProvider.ins) {
            DiagnosticProvider.ins = new DiagnosticProvider();
        }

        return DiagnosticProvider.ins;
    }

    private toDiagnostic(msg: string | null) {
        if (!msg || msg === "") {
            return;
        }
        Utils.instance().log(msg);
    }

    /* luacheck chooses exit code as follows:
     * Exit code is 0 if no warnings or errors occurred.
     * Exit code is 1 if some warnings occurred but there were no syntax errors or invalid inline options.
     * Exit code is 2 if there were some syntax errors or invalid inline options.
     * Exit code is 3 if some files couldn’t be checked, typically due to an incorrect file name.
     * Exit code is 4 if there was a critical error (invalid CLI arguments, config, or cache file).
     */
    private runCheck(cmd: string, args: string[], ctx: string): Thenable<any> {
        return new Promise((resolve, reject) => {
            let child = execFile(
                cmd, args, this.option, (error, stdout) => {
                    if (!error) {
                        resolve("");
                        return;
                    }
                    const code: number = (error as any).code;
                    if (1 === code || 2 === code) {
                        resolve(stdout);
                    } else {
                        reject(error);
                    }
                });
            child.stdin.end(ctx);
        })
    }

    // https://nodejs.org/api/child_process.html
    private async rawCheck(rawUri: string, ctx: string) {
        // 判断一下文件是否还存在，可能被删除了
        const uri = Uri.parse(rawUri);
        const path = uri.fsPath;

        try {
            // 用promisify没找到输入stdin的方法
            // const procExecFile = util.promisify(execFile);
            // await procExecFile(this.cmd, ['--filename', path, '-'], this.option);
            const msg = await this.runCheck(this.cmd, [
                '--codes', // 日志里显示是错误还是警告(例如：W211)
                '--ranges', // 日志里显示有问题的范围

                // 日志格式，plain表示一个警告一个错误一行
                '--formatter', 'plain',

                // 文件名，由于是从stdin输入
                // 需要指定一个文件名，这样在输入日志的时候才有文件名
                '--filename', path,

                '-' // 表示从stdin读取内容
            ], ctx);

            this.toDiagnostic(msg);
        } catch (e) {
            Utils.instance().anyError(e);
            Utils.instance().error(`luacheck ${JSON.stringify(e)}`);
        }
    }

    public check(uri: string, ctx: string) {
        // 已经在等待检查，不用处理
        if (this.pending.get(uri)) {
            return;
        }

        this.rawCheck(uri, ctx);
    }
}
