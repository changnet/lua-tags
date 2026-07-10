import * as path from 'path';
import * as vscode from 'vscode';
import { testHover, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'test3');
const testUri = vscode.Uri.file(path.join(fixturePath, 'rpc_test.lua'));

// 测试 RPC 前缀剥离特性（lua-tags.rpcPrefix）
// 配置了 rpcPrefix: ["RPC\\[(.*?)\\]/g", "Call\\[(.*?)\\]/g"] 后：
//   - RPC[addr].X.Y 中的 X 当作顶层符号、X.Y 当作 base=X name=Y，前缀被忽略
//   - 但搜索 RPC/Call 本身仍正常
//
// rpc_test.lua 内容（行号从 0 开始）：
//   0: X = {}
//   1: X.Y = function(a, b) return a + b end
//   2: X.Z = 100
//   3: (空)
//   4: RPC = {}
//   5: Call = {}
//   6: (空)
//   7: local r1 = RPC[addr].X.Y(1, 2)
//   8: local r2 = Call[addr].X.Z
suite('RPC Prefix Test3 Suite', () => {
    // 光标在 RPC[addr].X.Y 的 Y 上：应解析为 base=X name=Y
    test('hover on Y in RPC[addr].X.Y', async () => {
        const val = '```lua\nfunction X.Y(a, b) : any\n```';
        await testHover(testUri, new vscode.Position(7, 23), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);

    // 光标在 RPC[addr].X 的 X 上：应解析为顶层符号 X（无 base）
    test('hover on X in RPC[addr].X', async () => {
        const val = '```lua\nX : table\n```';
        await testHover(testUri, new vscode.Position(7, 21), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);

    // 光标在 Call[addr].X.Z 的 Z 上：应解析为 base=X name=Z
    test('hover on Z in Call[addr].X.Z', async () => {
        const val = '```lua\nX.Z = 100 : number\n```';
        await testHover(testUri, new vscode.Position(8, 24), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);

    // 光标在 RPC 前缀本身上：仍正常搜索符号 RPC
    test('hover on RPC prefix itself', async () => {
        const val = '```lua\nRPC : table\n```';
        await testHover(testUri, new vscode.Position(7, 11), [{
            contents: [{ value: val } as vscode.MarkdownString],
        }]);
    }).timeout(10240);
});
