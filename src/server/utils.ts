import {
    Connection,
    Diagnostic
} from 'vscode-languageserver';

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

    public log(ctx: string) {
        this.conn!.console.log(ctx);
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

