# lua-tags 项目知识库

## 项目目标
lua-tags 是一个 VSCode LSP 插件项目，为 Lua 语言提供智能感知（IntelliSense）功能。

## 核心功能
- 代码自动补全（Auto Completion）
- 跳转到定义（Go To Definition）
- 鼠标悬停提示（Hover）
- 函数签名帮助（Signature Help）
- 文档符号和工作空间符号（Document/Workspace Symbol）
- 代码检查（通过 luacheck 集成）
- 注解支持（@class、@field、@param、@return、@type、@alias）

## 基础设定
- **架构**: 客户端-服务器（Client-Server）架构
- **协议**: 使用 vscode-languageserver 和 vscode-languageclient 实现 LSP
- **Lua版本支持**: 5.1、5.2、5.3、LuaJIT
- **核心依赖**:
  - luaparse: Lua 代码解析器
  - fuzzysort: 模糊搜索库
  - luacheck: Lua 代码检查工具
- **注解系统**: 兼容 emmylua 和 luals 的注解语法

## 目录结构

### `src/client/`
LSP 客户端，负责与 VSCode 编辑器通信。

### `src/server/`
LSP 服务器，核心功能实现。所有符号解析、补全、跳转等逻辑都在这里。

### `src/test/`
测试文件目录。采用 `@vscode/test-cli` 管理，`.vscode-test.js` 中通过 `defineConfig` 定义多组测试配置，一次命令自动运行所有测试。

```
src/test/
├── helper.ts              # 公共测试接口（testHover, testCompletion, testGoToDefinition 等）
├── fixture/               # Lua 样本文件（作为 VSCode 工作区打开）
│   ├── core/              # 原 sample，测试核心 IntelliSense 功能
│   └── annotation/        # 原 sample2，测试注解系统
└── suit/                  # 测试用例
    ├── core/              # 核心功能测试（completion, definition, hover, signature 等）
    └── annotation/        # 注解功能测试
```

运行测试：`npm test`（先编译，再通过 `vscode-test` 依次运行 core 和 annotation 两组测试）。

如需只跑某一组：`npx vscode-test --label core` 或 `npx vscode-test --label annotation`。

### `src/tools/`
工具脚本，目前只有 autoSTL.ts 用于自动生成 Lua 标准库符号。

### `stl/`
Lua 标准库符号定义文件（JSON 格式），按版本分文件。

### `syntaxes/`
语法高亮定义文件，用于注入式语法高亮。

### `luacheck/`
luacheck 可执行文件，用于代码检查。

## 源代码文件说明

### `src/client/extension.ts`
- **作用**: LSP 客户端入口文件
- **职责**:
  - 激活插件时启动语言服务器
  - 配置服务器选项和客户端选项
  - 注册命令（如导出全局符号）
  - 处理自定义通知消息

### `src/server/server.ts`
- **作用**: LSP 服务器主文件
- **职责**:
  - 创建 LSP 连接和文档管理器
  - 处理各种 LSP 请求（补全、跳转、悬停等）
  - 初始化服务器和工作区
  - 管理文件变更事件

### `src/server/symbol.ts`
- **作用**: 符号管理核心类（SymbolEx）
- **职责**:
  - 管理全局符号缓存（globalSymbol、globalModule）
  - 管理文档符号缓存（documentSymbol、documentModule）
  - 解析变量类型注解
  - 格式化类型描述
  - 符号模糊匹配

### `src/server/parseSymbol.ts`
- **作用**: Lua 代码解析器（ParseSymbol）
- **职责**:
  - 使用 luaparse 解析 Lua 代码
  - 提取符号信息（函数、变量、表等）
  - 处理作用域和局部变量
  - 关联注释到符号
  - 解析注解并存储到注册表

### `src/server/autoCompletion.ts`
- **作用**: 自动补全功能（AutoCompletion）
- **职责**:
  - 处理代码自动补全请求
  - 搜索局部变量和全局符号
  - 处理 require 路径补全
  - 生成补全项

### `src/server/goToDefinition.ts`
- **作用**: 跳转到定义功能（GoToDefinition）
- **职责**:
  - 处理跳转到定义请求
  - 支持 require 路径跳转
  - 支持注解类型跳转

### `src/server/hoverProvider.ts`
- **作用**: 鼠标悬停提示功能（HoverProvider）
- **职责**:
  - 处理鼠标悬停请求
  - 生成符号的 Markdown 格式提示
  - 显示函数签名、常量值、注释等

### `src/server/search.ts`
- **作用**: 符号搜索功能（Search）
- **职责**:
  - 搜索局部变量（通过 AST 遍历）
  - 搜索全局模块和文档模块
  - 搜索注解类型
  - 位置过滤和本地化检测

### `src/server/signatureProvider.ts`
- **作用**: 函数签名帮助功能（SignatureProvider）
- **职责**:
  - 处理函数签名帮助请求
  - 扫描当前输入的函数调用
  - 显示函数参数信息

### `src/server/diagnosticProvider.ts`
- **作用**: 代码检查功能（DiagnosticProvider）
- **职责**:
  - 集成 luacheck 进行代码检查
  - 管理检查队列和延迟检查
  - 解析 luacheck 输出并发送诊断信息

### `src/server/setting.ts`
- **作用**: 配置管理（Setting）
- **职责**:
  - 管理插件配置项
  - 判断文件类型和解析规则
  - 管理 luacheck 相关配置

### `src/server/utils.ts`
- **作用**: 工具类（Utils、DirWalker）
- **职责**:
  - 日志记录和错误处理
  - 目录遍历和文件读取
  - 发送诊断信息到 VSCode

### `src/server/cacheSymbol.ts`
- **作用**: 符号缓存（CacheSymbol）
- **职责**:
  - 缓存已解析的文档符号（用于局部变量查找）
  - 实现 LRU 缓存策略

### `src/server/annotation.ts`
- **作用**: 注解注册表（AnnotationRegistry）
- **职责**:
  - 存储所有文档的注解数据
  - 提供注解查询接口
  - 解析类型表达式和字段
  - 管理全局类和别名缓存

### `src/server/parseAnnotation.ts`
- **作用**: 注解解析器
- **职责**:
  - 从注释中解析注解（@class、@field、@param 等）
  - 解析类型表达式（数组、泛型、函数类型）
  - 关联注解到对应符号

### `src/server/exportSymbol.ts`
- **作用**: 全局符号导出
- **职责**:
  - 将全局符号导出到文件
  - 用于 luacheck 配置生成

### `src/server/stlSymbol.ts`
- **作用**: Lua 标准库符号加载
- **职责**:
  - 从 JSON 文件加载 Lua 标准库符号
  - 解析并组织标准库符号结构

### `src/tools/autoSTL.ts`
- **作用**: 标准库符号自动生成工具
- **职责**:
  - 从 Lua 官方文档 HTML 中提取符号
  - 生成标准库符号 JSON 文件

## 注解系统
支持的注解类型：
- `@class ClassName`: 声明一个类
- `@field fieldName type`: 定义类字段
- `@param paramName type`: 定义函数参数类型
- `@return type`: 定义函数返回类型
- `@type type`: 指定变量类型
- `@alias AliasName type`: 定义类型别名

支持的类型语法：
- 基本类型: `string`, `number`, `boolean`, `function`, `table`
- 数组: `Foo[]`
- 泛型table: `table<K, V>`
- 函数类型: `func(a:number, b:string):boolean`
- 自定义类: 通过 `@class` 声明

## 配置项
- `lua-tags.luaVersion`: Lua 版本（5.1/5.2/5.3/LuaJIT）
- `lua-tags.maxFileSize`: 最大文件大小限制
- `lua-tags.excludeDir`: 排除的目录
- `lua-tags.luacheck`: 启用 luacheck
- `lua-tags.checkOnInit`: 初始化时检查所有文件
- `lua-tags.checkHow`: 检查时机（typing/save）
- `lua-tags.exportPath`: 全局符号导出路径
