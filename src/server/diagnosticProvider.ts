// lint 代码检查

import * as path from "path";
import { URI } from 'vscode-uri';
import { Utils } from './utils';

import { execFile } from "child_process";


import {
    Diagnostic,
    DiagnosticSeverity
} from 'vscode-languageserver';
import { Setting } from './setting';

// 对应child_process.execFile的Option字段
interface ProcOption {
    timeout: number; // default 0
    // Largest amount of data in bytes allowed on stdout or stderr. If exceeded,
    // the child process is terminated and any output is truncated. See caveat
    // at maxBuffer and Unicode. Default: 1024 * 1024.
    maxBuffer: number;
}

export enum CheckHow {
    DEFAULT = 0,
    INITIALIZE = 1
}

interface PendingTask {
    timeout: number;
    uri: string;
    how?: CheckHow;
}

const ChunkSize = 16384;

export class DiagnosticProvider {
    private static ins: DiagnosticProvider;

    // 正在等待检查的文件，key为uri
    private pendingCtx = new Map<string, string>();
    private pendingTask = new Array<PendingTask>();
    // 正在检查的文件，key为uri
    private checking = new Map<string, number>();

    // node.js child_process参数
    private option: ProcOption;
    private cmd: string = "";
    private args: string[] = [];
    private abort: boolean = false;

    // f:\lua-tags\src\test\sample\test.lua:1:7-13: (W211) unused variable 'Monster'
    private static regx = /(\d+):(\d+)-(\d+): \(([EW])(\d+)\) (.+)$/;

    private constructor() {
        this.option = {
            // it take some time to check large file
            timeout: 15000,
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
            return [];
        }

        let diags: Diagnostic[] = [];
        const lines = msg.split(/\r?\n/g);
        for (const line of lines) {
            // empty line at end of stdout
            if (line === "") {
                continue;
            }

            const matchs = line.match(DiagnosticProvider.regx);
            if (!matchs) {
                Utils.instance().error(`luacheck: ${line}`);
                continue;
            }

            const ln = parseInt(matchs[1]) - 1;
            const col = parseInt(matchs[2]) - 1;
            const endCol = parseInt(matchs[3]);
            const msg = `(${matchs[4]}${matchs[5]})${matchs[6]}`;

            let severity: DiagnosticSeverity = DiagnosticSeverity.Information;
            switch (matchs[4]) {
                case "E": severity = DiagnosticSeverity.Error; break;
                case "W": severity = DiagnosticSeverity.Warning; break;
            }

            diags.push({
                range: {
                    start: { line: ln, character: col },
                    end: { line: ln, character: endCol }
                },
                severity: severity,
                message: msg
            });
        }

        return diags;
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
            try {
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

                /* execFile is async
                 * child.on("error") or child.on("exit") does not work here.
                 * I do NOT find any thing to check if child is ready except
                 * it's pid. if child exec fail(e.g. permission denied),don't
                 * write to stdin.just return, it will throw a error later.
                 */
                if (!child.pid || !child.stdin) {
                    return;
                }
                if (ctx.length <= ChunkSize) {
                    return child.stdin.end(ctx);
                }

                /* https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
                 * you can NOT write large buffer using child.stdin.end once
                 * but you can write multi times
                 * While a stream is not draining, calls to write() will buffer chunk, and return false
                 */
                for (let index = 0; index < ctx.length; index += ChunkSize) {
                    child.stdin.write(ctx.substring(index, index + ChunkSize));
                }
                child.stdin.end();
            } catch (e) {
                // Utils.instance().anyError(e);
                reject(e);
            }
        });
    }

    public updateCmdArgs() {
        this.cmd = this.getLuaCheckCmd();
        this.args = this.getLuaCheckArgs();
    }

    private getLuaCheckCmd() {
        const checkPath = Setting.instance().getLuaCheckPath();
        if (checkPath !== "") {
            return checkPath;
        }

        // https://nodejs.org/api/process.html#process_process_platform
        // 其他平台默认要把luacheck添加到path
        let cmd = "luackeck";
        const platform = process.platform;

        if (platform === "win32") {
            cmd = path.resolve(
                __dirname, "../../luacheck/luacheck_0.23.0.exe");
        } else if (platform === "linux") {
            // platform === "darwin"
            // TODO:luacheck是静态编译，mac和linux不知道能否通用？
            cmd = path.resolve(__dirname, "../../luacheck/luacheck_0.23.0");
            Utils.instance().setExec(cmd);
        }

        return cmd;
    }

    private getLuaCheckArgs() {
        let args = [
            '--codes', // 日志里显示是错误还是警告(例如：W211)
            '--ranges', // 日志里显示有问题的范围

            // 日志格式，plain表示一个警告一个错误一行
            '--formatter', 'plain',

            // 文件名，由于是从stdin输入
            // 需要指定一个文件名，这样在输入日志的时候才有文件名
            '--filename', "__placeholder",
        ];

        const setting = Setting.instance();
        const rc = setting.getLuaCheckRc();
        if (rc !== "") {
            args.push('--config');
            args.push(rc);
        }

        args.push('-'); // 表示从stdin读取内容

        return args;
    }

    // https://nodejs.org/api/child_process.html
    private async rawCheck(rawUri: string, ctx: string, how?: CheckHow) {
        // 判断一下文件是否还存在，可能被删除了
        const uri = URI.parse(rawUri);
        this.args[5] = uri.fsPath;

        this.checking.set(rawUri, 1);

        try {
            // 用promisify没找到输入stdin的方法
            // const procExecFile = util.promisify(execFile);
            // await procExecFile(this.cmd, ['--filename', path, '-'], this.option);
            const msg = await this.runCheck(this.cmd, this.args, ctx);

            // likely,delete file from disk,no need to send to vs code anymore
            if (!this.checking.get(rawUri)) {
                return;
            }

            const diags = this.toDiagnostic(msg);
            // no need to send a message to vs code if no error
            if (how !== CheckHow.INITIALIZE || diags.length > 0) {
                Utils.instance().diagnostics(rawUri, diags);
            }
        } catch (e) {
            // if there are too many files in root dir,send too many error
            // message to vs code will crash it
            if (e.errno === "ENOENT" || e.errno === "EACCES") {
                this.abort = true;
            }
            Utils.instance().anyError(e);
            Utils.instance().error(`luacheck ${JSON.stringify(e)}`);
            Utils.instance().error(rawUri);
        }

        this.checking.delete(rawUri);
    }

    private async timeoutCheck() {
        let index = 0;
        let now = Date.now();

        for (const task of this.pendingTask) {
            if (task.timeout <= now) {
                index++;
                const uri = task.uri;
                let curCtx = this.pendingCtx.get(uri);
                this.pendingCtx.delete(uri);
                if (!curCtx || this.abort) {
                    continue;
                }

                await this.rawCheck(uri, curCtx, task.how);
            } else {
                this.pendingTask.splice(0, index);

                setTimeout(() => {
                    this.timeoutCheck();
                }, (now - task.timeout) * 1000);

                return;
            }
        }

        this.pendingTask = [];
    }

    public check(uri: string, ctx: string, how?: CheckHow) {
        if (this.abort) {
            return;
        }

        let setting = Setting.instance();
        if (setting.isCheckExclude(uri)) {
            return;
        }

        // 已经在等待检查，不用处理
        if (this.pendingCtx.get(uri)) {
            this.pendingCtx.set(uri, ctx);
            return;
        }

        let delay = setting.getCheckDelay();
        // delay a very small time is meaningless
        if (delay <= 100) {
            this.rawCheck(uri, ctx);
            return;
        }

        // delay too long may cause a lots of task pending
        if (delay > 5000) {
            delay = 5000;
        }

        this.pendingCtx.set(uri, ctx);
        this.pendingTask.push({
            uri: uri, how: how, timeout: Date.now() + delay / 1000
        });

        // already have a pending task, do NOT spawn massive child process
        if (this.pendingTask.length > 1) {
            return;
        }

        setTimeout(() => {
            this.timeoutCheck();
        }, delay);
    }

    // delete checking mark,make sure send empty diagnostic to vs code
    public deleteChecking(uri: string) {
        this.pendingCtx.delete(uri);
        this.checking.delete(uri);

        // clear existed diagnostics
        Utils.instance().diagnostics(uri, []);
    }
}
