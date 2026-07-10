import * as path from 'path';
import * as assert from 'assert';
import * as vscode from 'vscode';
import { testHover, testGoToDefinition, resolveFixture } from '../../helper';

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
        await testHover(uri, new vscode.Position(2, 10), []);
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
});
