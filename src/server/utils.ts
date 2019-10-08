import {
    Connection,
    Diagnostic
} from 'vscode-languageserver';

class Utils {
    private conn:Connection | null = null;

    public initialize(conn:Connection) {
        this.conn = conn;
    }

    public log(ctx: string) {
        this.conn!.console.log(ctx)
    }

    public diagnostics(uri: string,diags: Diagnostic[]): void {
        this.conn!.sendDiagnostics({uri: uri,diagnostics: diags});
    }
}

export var g_utils = new Utils();
