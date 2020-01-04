# lua-tags

Lua IntelliSense for Visual Studio Code.

## Features

* Hover
* Lint(luacheck)
* Signature Helps
* Document Symbol
* Auto Completion
* Workspace Symbol
* Go To Definition

![animation](animation.gif)

## Configure & Usage
Download and installation are available at Visual Studio Code Extension 
Marketplace. Once installed, all configure options details are at extension
Contributions page

ATTENTION: Hot configure reload NOT support, restart Visual Studio Code to 
activate new configure after configure changed

#### luacheck
lua-tags already integret with luacheck(win32 and linux)，if using MacOS or other
platform, specify luaCheckPath at configure or add luacheck to os excuate PATH

#### export global symbols
ctrl + shift + p: lua-tags: export global symbols command can export all global
symbols to file(lua-tags-global-symbols) in workspace root directory. It may
help to set .luacheckrc.

## Thanks
* https://github.com/fstirlitz/luaparse
* https://github.com/farzher/fuzzysort
* https://github.com/mpeterv/luacheck

* https://www.cockos.com/licecap/

## Known Bugs and Issues
The luaparse package at npm are very old(0.2.1), some bug already been fixed at 
github repository like https://github.com/fstirlitz/luaparse/issues/58

manually download and build package if necessary
