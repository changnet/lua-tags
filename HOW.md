配置
====
- MaxFileSisze  
    文件大小,单位kb。超过此大小的文件，除非是配置文件，否则不解析
- ExcludeDirectories  
    需要排除的目录数组，以正则匹配相对路径。比如主目录是/data/project，
    需要排除bin目录则写 bin/*
- ConfigDirectory  
    配置目录，这个配置是指工程中的配置文件（指用lua作配置文件的情况，
    有些项目用json、xml，那些不会被解析），而不是插件配置。同样采用正则匹配
- LuaVersion  
    lua的版本，字符串，值可能是: "5.1" 、 "5.2" 、 "5.3" 、 "LuaJIT"

文件过滤
========
工程目录：VS Code打开的目录会被认为工程目录，只解析该目录中以.lua结尾的文件

配置目录：配置中ConfigDirectory 指定的目录

- 非工程目录文件（包括被排除的目录）
    - 超长，不解析
    - 没超长，按单个文件解析，解析符号不会合并到工程符号中。但会使用工程中的符号
- 工程目录文件
    - 不超长，正常解析
    - 超长
        - 为配置文件，通过词法解析（即仅解析主要符号）
        - 非配置文件，不解析

类型推导
========
- 本地化
    - local M = M
    - TODO:local N = M
    - TODO:local M = require "no_name"
    - TODO:return {}
- oo(object-oriented)类
    - TODO:继承
- table类
    - TODO:成员函数名和本地不一样

符号查找
========
