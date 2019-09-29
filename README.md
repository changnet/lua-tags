# lua-tags

This is the README for your extension "lua-tags". After writing up a brief description, we recommend including the following sections.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: enable/disable this extension
* `myExtension.thing`: set to `blah` to do something

## Todo
* Document Symbol:
  打开工程时生成缓存
  保存文件时更新
  如果失败，使用上次的
* Workspace Symbol:
  做一个全局缓存，从各个文档缓存取
  如果某个文件有变化，就清空全局缓存，下次取全局时重新生成缓存
* Go to Definition
    优先和全局类型匹配，对就直接跳转
    直接匹配函数名，给出列表

