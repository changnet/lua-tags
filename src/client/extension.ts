// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';

// add "vscode-languageclient": "^5.2.1" in package.json and run: npm install
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "lua-tags" is now active!');

    // https://code.visualstudio.com/api/language-extensions/language-server-extension-guide

    // 指定服务器入口文件路径
    let serverModule = context.asAbsolutePath(path.join('out', 'server', 'server.js'));

    // debug选项
    // 必须用F5调试模式打开插件，才有效
    // --inspect=6009表示server.js在6009监听debug连接
    // 在Debug-->Add Configuration里加一个选项Attack，注意新增的端口和监听端口对应
    // 用F5打开插件后，创建对应的文件激活插件，然后在左边栏切换到Debug View
    // 在Debug选项里选择Attach，即可连接到服务器，这时就可以断点调试server了
    // 如果断点显示Unverified breakpoint，应该是当前调试session不对，在debug界面应该
    // 能看到两个session，一个Run Extension，一个Attack，选中Attack即可
    let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    console.log(`server path:${serverModule}`)

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions
        }
    };

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // 设置触发插件功能的rui
        // lua为后缀的文件或者语言为Lua的untitled文件(新建一个文件，还没保存)
        documentSelector: [
            { scheme: 'file', language: 'lua' },
            { language: 'lua', scheme: 'untitled' }
        ],
        synchronize: {
            // Notify the server about file changes
            configurationSection: ['lua']
        }
    };

    // Create the language client and start the client.
    let client = new LanguageClient(
        'languageServerLua',
        'Language Server Lua',
        serverOptions,
        clientOptions
    );

    // "languageServerLua.trace.server": "verbose"
    // 把这个添加到设置(没错，就是File-->Preferences-->Setting)
    // F5调试插件，激活插件
    // 在新打开的的vsc里的控制台OUTPUT里即可看到这个选项，可以看到server日志

    // Start the client. This will also launch the server
    const disposable = client.start();

    // 在插件deactivate时，把这个client销毁掉
    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
