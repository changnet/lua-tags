import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { testHover, testGoToDefinition, testHoverContains, resolveFixture } from '../../helper';

const fixturePath = resolveFixture(__dirname, 'annotation');

suite('Annotation Test Suite', () => {

    test("test @type annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        await testHover(uri, new vscode.Position(8, 9), [{
            contents: [{ value: "```lua\nlocal my_dog : Dog\n-- @type Dog - 狗\n```" } as vscode.MarkdownString],
        }]);
    });

    test("test @alias annotation hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        // @alias 名称现在会被当作注释中的符号查表，hover 应展示别名定义
        await testHoverContains(uri, new vscode.Position(2, 10), "MyFunc");
    });

    test("test type inference hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_infer.lua"));
        await testHover(uri, new vscode.Position(13, 8), [{
            contents: [{ value: "```lua\nlocal player : Player\n-- 类型推断：player的类型应为Player\n```" } as vscode.MarkdownString],
        }]);
    });

    test("test data and annotation merge hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_merge.lua"));
        await testHover(uri, new vscode.Position(6, 4), [{
            contents: [{ value: "```lua\nclass EXAMPLE {\n    a : number -- 变量a\n    b : string -- 变量b\n}\n\n-- 示例类\n```" } as vscode.MarkdownString],
        }]);
    });

    test("test @param annotation function hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_function.lua"));
        await testHover(uri, new vscode.Position(5, 12), [{
            contents: [{ value: "```lua\nfunction test_func(a: number, b: boolean) : string\n-- @param a number - 参数a\n-- @param b boolean - 参数b\n-- @return string - 返回字符串\n```" } as vscode.MarkdownString],
        }]);
    });

    test("@param type recognition: show type only when recognizable, else only name", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_function.lua"));
        await testHover(uri, new vscode.Position(25, 12), [{
            contents: [{ value: [
                "```lua",
                "function DataCache_get(tbl_name, keys, fields, opts: DataOpts) : any",
                "--- @param tbl_name 表名",
                "--- @param keys 数据唯一标识的键值对，这个要做缓存key，必须按顺序。比如{\"pid\", 999, \"type\", 1}",
                "--- @param fields 需要读取的字段列表，如{\"name\", \"level\"}，nil表示读取全部字段",
                "--- @param opts DataOpts 可选项，支持ikey字段指定需要还原数字键的字段列表，例如{\"data\", \"vars\"}",
                "```",
            ].join("\n") } as vscode.MarkdownString],
        }]);
    });

    test("test hover on type name in @type annotation", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        await testHover(uri, new vscode.Position(7, 9), [{
            contents: [{ value: "```lua\nclass Dog {\n    breed : string -- 品种\n    owner : string -- 主人\n    age : number -- 年龄\n}\n\n-- 狗类\n```" } as vscode.MarkdownString],
        }]);
    });

    test("test go to definition on type name in @type annotation", async () => {
        const classUri = vscode.Uri.file(path.join(fixturePath, "annotation_class.lua"));
        const typeUri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        await testGoToDefinition(typeUri, new vscode.Position(7, 9), [{
            uri: classUri,
            range: new vscode.Range(6, 10, 6, 13),
        }]);
    });

    test("test @type variable member completion", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        const actualList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(16, 27),
        )) as vscode.CompletionList;

        const names = actualList.items.map(i => i.label as string).sort();
        assert.ok(names.includes('breed'), `should include 'breed', got: ${names}`);
        assert.ok(names.includes('owner'), `should include 'owner', got: ${names}`);
    });

    test("test go to definition on @field member access", async () => {
        const classUri = vscode.Uri.file(path.join(fixturePath, "annotation_class.lua"));
        const typeUri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        await testGoToDefinition(typeUri, new vscode.Position(18, 30), [{
            uri: classUri,
            range: new vscode.Range(8, 10, 8, 15),
        }]);
    });

    test("test go to definition on my_dog.age", async () => {
        const classUri = vscode.Uri.file(path.join(fixturePath, "annotation_class.lua"));
        const typeUri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        await testGoToDefinition(typeUri, new vscode.Position(21, 26), [{
            uri: classUri,
            range: new vscode.Range(9, 10, 9, 13),
        }]);
    });

    test("test hover on my_dog.age", async () => {
        const typeUri = vscode.Uri.file(path.join(fixturePath, "annotation_type.lua"));
        await testHover(typeUri, new vscode.Position(21, 27), [{
            contents: [{ value: "annotation_class.lua  \n```lua\nage : number 年龄\n```" } as vscode.MarkdownString],
        }]);
    });

    test("test go to definition on my_dog.age in variable_tracking", async () => {
        const trackUri = vscode.Uri.file(path.join(fixturePath, "variable_tracking.lua"));
        await testGoToDefinition(trackUri, new vscode.Position(34, 8), [{
            uri: trackUri,
            range: new vscode.Range(9, 10, 9, 13),
        }]);
    });

    test("test hover on my_dog.age in variable_tracking", async () => {
        const trackUri = vscode.Uri.file(path.join(fixturePath, "variable_tracking.lua"));
        await testHover(trackUri, new vscode.Position(34, 8), [{
            contents: [{ value: "```lua\nage : number 动物年龄\n```" } as vscode.MarkdownString],
        }]);
    });

    // -- 新测试：函数参数类型来自@param
    test("test function parameter type from @param hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_infer.lua"));
        await testHover(uri, new vscode.Position(30, 34), [{
            contents: [{ value: "```lua\n(parameter) mail_obj : MailObj\n```" } as vscode.MarkdownString],
        }]);
    });

    // -- 新测试：require文件通过@return推断类型
    test("test require type from @return hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_infer.lua"));
        await testHover(uri, new vscode.Position(34, 10), [{
            contents: [{ value: "```lua\nlocal MailObj : MailObj\n-- completion test: Bar.\n```" } as vscode.MarkdownString],
        }]);
    });

    // -- 新测试：类继承，type显示为类名
    test("test class inheritance type hover", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_infer.lua"));
        await testHover(uri, new vscode.Position(27, 8), [{
            contents: [{ value: "```lua\nlocal Bar : Bar\n-- @class Bar : Foo - 子类\n-- @field x number - 成员变量x\n```" } as vscode.MarkdownString],
        }]);
    });

    // -- 新测试：@class Bar:Foo 中Bar有@class定义，hover显示类格式
    test("test class inheritance hover on class name", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_infer.lua"));
        await testHover(uri, new vscode.Position(25, 10), [{
            contents: [{ value: "```lua\nclass Bar : Foo {\n    x : number -- 成员变量x\n}\n\n-- 子类\n```" } as vscode.MarkdownString],
        }]);
    });

    // -- 新测试：类继承，子类能补全到父类的字段（通过Bar.触发）
    test("test class inheritance child field completion", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_infer.lua"));
        const actualList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(34, 25),
        )) as vscode.CompletionList;

        const names = actualList.items.map(i => i.label as string).sort();
        assert.ok(names.includes('x'), `should include 'x', got: ${names}`);
        assert.ok(names.includes('base_field'), `should include 'base_field', got: ${names}`);
    });

    // -- 新测试：@return语句的类型推断
    test("test return @return type inference", async () => {
        const returnUri = vscode.Uri.file(path.join(fixturePath, "annotation_return.lua"));
        await testHover(returnUri, new vscode.Position(0, 13), [{
            contents: [{ value: "```lua\nclass MailObj {\n    subject : string -- 邮件主题\n    body : string -- 邮件正文\n}\n\n-- 邮件对象\n```" } as vscode.MarkdownString],
        }]);
    });

    // -- 带点类型名（整体，不是多层嵌套表）
    // annotation_dotted.lua:
    //   line 1: -- @class protobuf.a.b - 带点类型
    //   line 2: -- @field c number - 字段c
    //   line 4: -- @type protobuf.a.b
    //   line 5: local x = {}
    //   line 8: local v = x.c
    test("test go to definition on dotted type name in @type annotation", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_dotted.lua"));
        await testGoToDefinition(uri, new vscode.Position(4, 9), [{
            uri: uri,
            range: new vscode.Range(1, 10, 1, 22),
        }]);
    });

    test("test go to definition on dotted class name", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_dotted.lua"));
        await testGoToDefinition(uri, new vscode.Position(1, 10), [{
            uri: uri,
            range: new vscode.Range(1, 10, 1, 22),
        }]);
    });

    test("test hover on dotted-typed variable", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_dotted.lua"));
        await testHover(uri, new vscode.Position(5, 7), [{
            contents: [{ value: "```lua\nlocal x : protobuf.a.b\n-- @type protobuf.a.b\n```" } as vscode.MarkdownString],
        }]);
    });

    test("test dotted type field completion", async () => {
        const uri = vscode.Uri.file(path.join(fixturePath, "annotation_dotted.lua"));
        const actualList = (await vscode.commands.executeCommand(
            'vscode.executeCompletionItemProvider',
            uri,
            new vscode.Position(8, 12),
        )) as vscode.CompletionList;

        const names = actualList.items.map(i => i.label as string).sort();
        assert.ok(names.includes('c'), `should include field 'c', got: ${names}`);
    });

    // -- excludeDir 配置生效：被排除的文件不应进入符号索引
    // helper 在激活时已设置 excludeDir: ["exclude/*"]，exclude/excludeme.lua
    // 的相对路径为 exclude/excludeme.lua，应被排除，符号不可被检索到
    test("test excludeDir: excluded file symbol is not indexed", async () => {
        const ws = await vscode.commands.executeCommand(
            'vscode.executeWorkspaceSymbolProvider',
            'EXCLUDED_SYMBOL_XYZ',
        ) as vscode.SymbolInformation[];
        assert.strictEqual(ws.length, 0, 'excluded symbol should not be indexed');
    });

    // -- 注解中的冒号表达式：类型名中的冒号（Foo:Bar）前后允许空格。
    //    注释检测以 @type/@class 等关键字为准（兼容 -- / ---- / -[[ 任意前缀），
    //    合法符号字符为 字母/数字/点号。
    //    - Foo:bar 形式：bar 是 Foo 的成员字段 → 跳转到 @field
    //    - Child:Base 形式：Base 是父类（类）→ 跳转到 @class
    const colonUri = vscode.Uri.file(path.join(fixturePath, "annotation_colon.lua"));

    // == 成员字段跳转（ColonBase:colonMember）==

    // @type ColonBase:colonMember 无空格，点击 colonMember 跳转到 @field colonMember
    test("test colon member no-space go to field", async () => {
        await testGoToDefinition(colonUri, new vscode.Position(4, 25), [{
            uri: colonUri,
            range: new vscode.Range(1, 10, 1, 21),
        }]);
    });

    // @type ColonBase :colonMember 冒号前空格
    test("test colon member space before go to field", async () => {
        await testGoToDefinition(colonUri, new vscode.Position(6, 26), [{
            uri: colonUri,
            range: new vscode.Range(1, 10, 1, 21),
        }]);
    });

    // @type ColonBase: colonMember 冒号后空格
    test("test colon member space after go to field", async () => {
        await testGoToDefinition(colonUri, new vscode.Position(8, 26), [{
            uri: colonUri,
            range: new vscode.Range(1, 10, 1, 21),
        }]);
    });

    // == 基类（父类）跳转（ColonChild:ColonBase）==

    // @class ColonChild : ColonBase 继承，点击父类 ColonBase 跳转到 @class ColonBase
    test("test colon parent class go to definition", async () => {
        await testGoToDefinition(colonUri, new vscode.Position(11, 28), [{
            uri: colonUri,
            range: new vscode.Range(0, 10, 0, 19),
        }]);
    });

    // @type ColonChild:ColonBase 无空格，点击父类 ColonBase 跳转到 @class ColonBase
    test("test colon parent class no-space go to definition", async () => {
        await testGoToDefinition(colonUri, new vscode.Position(14, 25), [{
            uri: colonUri,
            range: new vscode.Range(0, 10, 0, 19),
        }]);
    });

    // @type ColonBase:colonMember 无空格，点击 ColonBase（基类）也跳转到 @class ColonBase
    test("test colon base type go to class", async () => {
        await testGoToDefinition(colonUri, new vscode.Position(4, 10), [{
            uri: colonUri,
            range: new vscode.Range(0, 10, 0, 19),
        }]);
    });

    // == hover ==

    // @type ColonBase:colonMember 无空格，hover 在 colonMember 上应显示成员字段
    test("test colon member no-space hover field", async () => {
        await testHoverContains(colonUri, new vscode.Position(4, 25), "colonMember : number -- 字段colonMember");
    });

    // @type ColonBase :colonMember 冒号前空格，hover 在 colonMember 同样显示字段
    test("test colon member space before hover field", async () => {
        await testHoverContains(colonUri, new vscode.Position(6, 26), "colonMember : number -- 字段colonMember");
    });

    // @type ColonBase: colonMember 冒号后空格，hover 在 colonMember 同样显示字段
    test("test colon member space after hover field", async () => {
        await testHoverContains(colonUri, new vscode.Position(8, 26), "colonMember : number -- 字段colonMember");
    });

    // @class ColonChild : ColonBase 继承，hover 在父类 ColonBase 上应显示 @class ColonBase
    test("test colon parent class hover", async () => {
        await testHoverContains(colonUri, new vscode.Position(11, 28), "class ColonBase {");
    });

    // @type ColonBase:colonMember 无空格，hover 在 ColonBase 上应显示 @class ColonBase
    test("test colon base type hover class", async () => {
        await testHoverContains(colonUri, new vscode.Position(4, 10), "class ColonBase {");
    });
});
