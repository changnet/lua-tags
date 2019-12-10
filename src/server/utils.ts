import {
    Connection,
    Diagnostic
} from 'vscode-languageserver';

import * as fs from "fs";

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
        while (s.length < (size || 2)) {s = "0" + s;}
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
        fs.writeFileSync("lua-tags.log", now, { encoding: "utf8", flag: "a"});
        fs.writeFileSync("lua-tags.log", ctx, { encoding: "utf8", flag: "a"});
        fs.writeFileSync("lua-tags.log", "\n", { encoding: "utf8", flag: "a"});
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

