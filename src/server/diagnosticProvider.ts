// lint 代码检查

import Uri from 'vscode-uri';
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

const ChunkSize = 16384;

export class DiagnosticProvider {
    private static ins: DiagnosticProvider;

    // 正在等待检查的文件，key为uri
    private pending = new Map<string, string>();
    // 正在检查的文件，key为uri
    private checking = new Map<string, number>();

    // node.js child_process参数
    private option: ProcOption;

    // f:\lua-tags\src\test\sample\test.lua:1:7-13: (W211) unused variable 'Monster'
    private static regx = /(\d+):(\d+)-(\d+): \(([EW])(\d+)\) (.+)$/;

    private constructor() {
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
            return [];
        }
        Utils.instance().log(msg);

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
            })
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

            if (ctx.length < 16384) {
                return child.stdin.end(ctx);
            }

            /* https://nodejs.org/api/stream.html#stream_writable_write_chunk_encoding_callback
             * you can NOT write large buffer using  child.stdin.end
             * buf can write multi times
             * While a stream is not draining, calls to write() will buffer chunk, and return false
             */
            for (let index = 0; index < ctx.length; index += ChunkSize) {
                child.stdin.write(ctx.substring(index, index + ChunkSize));
            }
            child.stdin.end();
        })
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
            cmd = "../../../luacheck/luacheck_0.23.0.exe";
        } else if (platform === "linux") {
            // platform === "darwin"
            // TODO:luacheck是静态编译，mac和linux不知道能否通用？
            cmd = "../../../luacheck/luacheck_0.23.0";
        }

        return cmd;
    }

    private getLuaCheckArgs(fileName: string) {
        let args = [
            '--codes', // 日志里显示是错误还是警告(例如：W211)
            '--ranges', // 日志里显示有问题的范围

            // 日志格式，plain表示一个警告一个错误一行
            '--formatter', 'plain',

            // 文件名，由于是从stdin输入
            // 需要指定一个文件名，这样在输入日志的时候才有文件名
            '--filename', fileName,
        ];

        const setting = Setting.instance();
        const rc = setting.getLuaCheckRc();
        if (rc !== "") {
            args.push('--config')
            args.push(rc);
        }

        args.push('-'); '-' // 表示从stdin读取内容

        return args;
    }

    // https://nodejs.org/api/child_process.html
    private async rawCheck(rawUri: string, ctx: string) {
        // 判断一下文件是否还存在，可能被删除了
        const uri = Uri.parse(rawUri);
        const cmd = this.getLuaCheckCmd();
        const args = this.getLuaCheckArgs(uri.fsPath);

        this.checking.set(rawUri, 1);
        try {
            // 用promisify没找到输入stdin的方法
            // const procExecFile = util.promisify(execFile);
            // await procExecFile(this.cmd, ['--filename', path, '-'], this.option);
            const msg = await this.runCheck(cmd, args, ctx);

            // likely,delete file from disk,no need to send to vs code anymore
            if (!this.checking.get(rawUri)) {
                return;
            }

            const diags = this.toDiagnostic(msg);
            Utils.instance().diagnostics(rawUri, diags);
        } catch (e) {
            Utils.instance().anyError(e);
            Utils.instance().error(`luacheck ${JSON.stringify(e)}`);
        }

        this.checking.delete(rawUri);
    }

    public check(uri: string, ctx: string) {
        // 已经在等待检查，不用处理
        if (this.pending.get(uri)) {
            this.pending.set(uri, ctx);
            return;
        }

        let delay = Setting.instance().getCheckDelay();
        // delay a very small time is meaningless
        if (delay <= 100) {
            this.rawCheck(uri, ctx);
            return;
        }

        // delay too long may cause a lots of task pending
        if (delay > 5000) {
            delay = 5000;
        }

        this.pending.set(uri, ctx);
        setTimeout(() => {
            // ctx could be update, do't use ctx
            let curCtx = this.pending.get(uri);
            this.pending.delete(uri);
            if (curCtx) {
                this.rawCheck(uri, curCtx);
            }
        }, delay);
    }

    // delete checking mark,make sure do send diagnostic to vs code
    public deleteChecking(uri: string) {
        this.pending.delete(uri);
        this.checking.delete(uri);

        // clear existed diagnostics
        Utils.instance().diagnostics(uri, []);
    }
}
