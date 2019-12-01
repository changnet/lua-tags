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

    public diagnostics(uri: string, diags: Diagnostic[]): void {
        this.conn!.sendDiagnostics({ uri: uri, diagnostics: diags });
    }
}

