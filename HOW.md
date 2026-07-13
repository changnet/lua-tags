# Dev

按 https://code.visualstudio.com/api/get-started/your-first-extension 部署环境

1. 安装node.js
2. 安装`ESLint`和`Prettier - Code formatter`插件
3. 安装依赖`cd lua-tag && npm install`
4. 用vs code打开项目
   已经预告配置好了npm watch，在run或者debug中运行插件，都应该能够编译代码并运行。否则就是有问题，比如

powershell无法运行npm

```
npm : 无法加载文件 D:\Program Files\nodejs\npm.ps1，因为在此系统上禁止运行脚本。有关详细信息，请参阅 https:/go.microsoft.com/fwlink/?LinkID=135170 中的 about_Execution_Policies。
```

以管理员运行powershell，执行`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine`

## 断点调试

1. `extention.ts`和`lanuch.json`中应该是已经配置好了调试端口的
2. 在`Debug`界面选中`Run Extention`并按F5启动调试
3. 在`Debug`界面选中`Attach`并按F5启动，这时候应该能连接刚刚启动的另一个vs code断点调试
4. 注意在`extention.ts`中，默认使用`--inspect=6009`参数，它会直接启动插件，不等待调试器链接。如果要调试启动过程中的代码，则需要`--inspect-brk=6009`，这个会等待调试器连上才会启动插件

## 检测package是否最新

```bash
# 查看依赖版本
npm outdated

# 更新到最新
npm install -g npm-check-updates

ncu -u
npm install
```

## 使用git仓库作为node_modules

在`package.json`中，正常是这样配置的

```json
	"dependencies": {
		"fuzzysort": "^3.1.0",
		"luaparse": "^0.3.1",
		"vscode-languageclient": "^9.0.1",
		"vscode-languageserver": "^9.0.1",
		"vscode-languageserver-textdocument": "^1.0.12",
		"vscode-uri": "^3.1.0"
	},
```

但由于`luaparse`无人维护，于是使用自己的仓库

```json
	"dependencies": {
		"fuzzysort": "^3.1.0",
		"luaparse": "github:changnet/luaparse#master",
		"vscode-languageclient": "^9.0.1",
		"vscode-languageserver": "^9.0.1",
		"vscode-languageserver-textdocument": "^1.0.12",
		"vscode-uri": "^3.1.0"
	},
```

这样配置后，npm会下载对应仓库`package.json`中`files`字段指定的文件，执行`npm update luaparse`更新。如果git上的仓库更新了，得用`npm install changnet/luaparse#master`来更新，`npm update luaparse`不行，原因未知。

自己的`luaparse`仓库增加了`types`目录并做了修改，所以`package.json`不再依赖`@types/luaparse"`

```
"@types/luaparse": "^0.2.13",
```

执行`npm remove @types/luaparse`

注意typescript默认会查找与`luaparser.js`同级的`index.d.ts`，如果存在则使用。现在这个文件是放在`types`目录，则`luaparse`的`package.json`里要增加`types`字段指定`index.d.ts`

## 版本发布

https://code.visualstudio.com/api/working-with-extensions/publishing-extension

1. 安装vsce

```
npm install -g @vscode/vsce
```

2. 修改`package.json`中的版本号，检查`CHANGELOG.md`是否修改

3. 打包

```
$ cd myExtension
$ vsce package
# myExtension.vsix generated
$ vsce publish
# <publisher id>.myExtension published to VS Code Marketplace
```

如果是预发布

```
vsce package --pre-release
vsce publish --pre-release
```

4. 配置密钥
   上面的`publish`会提示输入密钥，但创建`Azure DevOps`的`Microsoft Entra ID`极其麻烦，如果没有其他需求建议不要用`publish`命令，直接登录[Visual Studio Marketplace Management](https://marketplace.visualstudio.com/)，手动上传vsix包来发布。
