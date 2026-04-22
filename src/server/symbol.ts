// 符号处理

import { Utils } from './utils';
import * as fuzzysort from 'fuzzysort';
import { Setting, FileParseType } from './setting';
import { ParseSymbol, SymInfoEx, VSCodeSymbol, LocalType } from './parseSymbol';
import { Location, SymbolKind } from 'vscode-languageserver';
import { loadStl } from './stlSymbol';

//符号位置
export interface QueryPos {
    line: number;
    beg: number;
    end: number;
}

// 用于go to definition查询的数据结构
export interface SymbolQuery {
    uri: string; // 要查询的符号在哪个文档
    base?: string; // 模块名，m:test中的m
    extBase?: string[]; // A.B.C.E中的B.C
    name: string; // 符号名，m:test中的test
    kind: SymbolKind; // 查询的符号是什么类型
    position: QueryPos; //符号位置
    text: string; // 符号所在的整行代码
    indexer?: string; // 调用方式，是通过.还是:调用
}

export interface NameInfo {
    name: string;
    base?: string;
    indexer?: string;
}

export class SymbolEx {
    private static ins: SymbolEx;
    public static invalidLoc: Location = {
        uri: '',
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
        },
    };

    public static refMark = '==';

    // 是否需要更新全局符号
    private needUpdate: boolean = true;
    private updateVer: number = 0;

    // 全局符号缓存（即_G中的符号），符号名为k，v为数组(可能存在同名全局符号)
    private globalSymbol = new Map<string, SymInfoEx[]>();

    // 全局模块缓存，符号名为k，方便快速查询符号 identifier
    private globalModule = new Map<string, SymInfoEx>();

    // lua标准库符号，符号名为k
    private stlSymbol = new Array<SymInfoEx>();

    /**
     * 各个文档的符号缓存，uri为key
     * 注意每个文档的符号是全部存到一个数组里，不是以树形结构存的
     * 必要时根据scope判断是否为自己所需要符号
     */
    private documentSymbol = new Map<string, SymInfoEx[]>();

    // 各个文档的符号缓存，第一层uri为key，第二层模块名为key
    // 下面这种写法，M就会被认为是一个documentModule
    // local M = MM
    // M.a = ...
    private documentModule = new Map<string, Map<string, SymInfoEx>>();

    private constructor() {}

    public static instance() {
        if (!SymbolEx.ins) {
            SymbolEx.ins = new SymbolEx();
        }

        return SymbolEx.ins;
    }

    private isGlobalSym(sym: SymInfoEx) {
        // 不在顶层作用域的不放到全局符号，因为太多了，多数是配置
        // 一般都是宏定义或者配置字段，如 M = { a = 1 }这种
        // M:func = funciton() ... end 这种算是顶层的，这些在解析符号处理
        if (sym.local || sym.scope > 0 || sym.base || sym.baseModule) {
            return false;
        }

        return true;
    }

    private setGlobalSym(sym: SymInfoEx) {
        if (!this.isGlobalSym(sym)) {
            return;
        }
        const name = sym.name;
        let nameList = this.globalSymbol.get(name);
        if (!nameList) {
            nameList = new Array<SymInfoEx>();
            this.globalSymbol.set(name, nameList);
        }

        nameList.push(sym);
    }

    // 更新全局符号缓存
    private updateGlobal() {
        this.globalSymbol.clear();
        this.globalModule.clear();

        for (const v of this.stlSymbol) {
            this.setGlobalSym(v);
            if (v.kind === SymbolKind.Namespace && v.scope === 0) {
                if (this.globalModule.get(v.name)) {
                    Utils.instance().error(
                        `update global stl symbol module error: ${v.name}`,
                    );
                }
                this.globalModule.set(v.name, v);
            }
        }

        for (const [_name, symList] of this.documentSymbol) {
            for (const sym of symList) {
                this.setGlobalSym(sym);
            }
        }

        // 处理globalModule
        for (const [_uri, docModules] of this.documentModule) {
            for (const [name, sym] of docModules) {
                // local模块不放到全局
                if (!this.isGlobalSym(sym)) {
                    continue;
                }
                let moduleSym = this.globalModule.get(name);
                if (!moduleSym) {
                    this.globalModule.set(name, sym);
                    continue;
                }
                // 当同一个模块的符号分布在不同文档时，最终需要合并
                // 合并时不能修改原符号，只能重新创建一个
                if (-1 !== moduleSym.scope) {
                    // let newSym: SymInfoEx = Object.assign(moduleSym);
                    const newSym = ParseSymbol.createModuleSym(name, -1);

                    newSym.location = moduleSym.location;
                    if (!newSym.subSymList) {
                        newSym.subSymList = [];
                    }
                    if (moduleSym.subSymList) {
                        newSym.subSymList.push(...moduleSym.subSymList);
                    }
                    this.globalModule.set(name, newSym);

                    moduleSym = newSym;
                }

                // 之前保存的可能是外部符号，现在遇到定义的地方，则把位置修正为定义的位置
                if ('' !== sym.location.uri) {
                    moduleSym.location = sym.location;
                }
                // 合并模块中的符号
                if (!sym.subSymList) {
                    continue;
                }
                if (!moduleSym.subSymList) {
                    moduleSym.subSymList = [];
                }
                moduleSym.subSymList.push(...sym.subSymList);
            }
        }
        this.needUpdate = false;
    }

    /**
     * 获取引用的符号
     * @param base local N = M.X.Y中的M X Y
     * @param uri 当前需要搜索的文档
     */
    public getRefSym(sym: SymInfoEx, uri: string): VSCodeSymbol {
        const refType = sym.refType;
        if (!refType || refType.length <= 0) {
            return null;
        }

        const globalSym = this.getGlobalModule(refType);
        if (globalSym) {
            return globalSym;
        }

        // 本次查找不再递归查找引用的符号
        // 防止 local ipairs = ipairs这种同名引用死循环
        const docSym = this.getDocumentModule(uri, refType, false);
        if (docSym instanceof Array) {
            return null;
        }

        return docSym;
    }

    private getSymbolFromList(
        base: string[],
        index: number,
        symList?: SymInfoEx[],
    ) {
        let final;
        for (let idx = index; idx < base.length; idx++) {
            if (!symList) {
                return null;
            }

            let found;
            const name = base[idx];
            for (const subSym of symList) {
                if (name === subSym.name) {
                    found = subSym;
                    break;
                }
            }

            if (!found || !found.subSymList) {
                return found || null;
            }

            final = found;
            symList = found.subSymList;
        }

        return final || null;
    }
    // 获取某个符号的子符号
    public getSubSymbolFromList(
        base: string[],
        index: number,
        uri: string,
        symList?: SymInfoEx[],
    ) {
        const sym = this.getSymbolFromList(base, index, symList);
        if (!sym) {
            return null;
        }

        // 本身包含子符号列表，直接返回列表
        if (sym.subSymList) {
            return sym.subSymList;
        }

        // 本身引用了另一个模块，则返回另一个模块的符号列表
        if (sym.refType) {
            const refSym = this.getRefSym(sym, uri);
            if (refSym && refSym.subSymList) {
                return refSym.subSymList;
            }
        }

        return null;
    }

    // 获取全局模块本身
    private getGlobalModule(bases: string[]) {
        if (bases.length <= 0) {
            return null;
        }

        if (this.needUpdate) {
            this.updateGlobal();
        }

        const sym = this.globalModule.get(bases[0]);
        if (!sym || 1 === bases.length) {
            return sym || null;
        }
        return this.getSymbolFromList(bases, 1, sym.subSymList);
    }

    // 获取全局模块的所有子符号
    // @base: local N = M.X.Y中的M X Y
    public getGlobalModuleSubList(bases: string[]) {
        const sym = this.getGlobalModule(bases);

        return sym && sym.subSymList ? sym.subSymList : null;
    }

    // 解析一段代码，如果这段代码有错误，会发给vs code
    public parse(
        uri: string,
        text: string,
        isLog: boolean = false,
    ): SymInfoEx[] {
        const ft = Setting.instance().getFileType(uri, text.length);
        if (FileParseType.FPT_NONE === ft) {
            Utils.instance().debug(`${uri} being ignore`);
            return [];
        }

        if (isLog) {
            if (0 !== (FileParseType.FPT_LARGE & ft)) {
                Utils.instance().debug(`${uri} parse in large mode`);
            }
            if (0 !== (FileParseType.FPT_SINGLE & ft)) {
                Utils.instance().debug(`${uri} parse in single mode`);
            }
        }

        let parser = new ParseSymbol();
        let parseSymList = parser.parse(uri, text, ft);

        // 不是工程文件，不要把符号添加到工程里
        if (0 !== (FileParseType.FPT_SINGLE & ft)) {
            return parseSymList;
        }

        // 解析成功，更新缓存，否则使用旧的
        this.documentSymbol.set(uri, parseSymList);
        this.documentModule.set(uri, parser.getParseModule());

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalModule.clear();
        this.globalSymbol.clear();
        this.needUpdate = true;
        this.updateVer++;
        if (this.updateVer > 0xffffffff) {
            this.updateVer = 1;
        }

        return parseSymList;
    }

    public getUpdateVersion() {
        return this.updateVer;
    }

    // 遍历所有文档的uri
    public eachUri(callBack: (uri: string) => void) {
        for (const [uri] of this.documentSymbol) {
            callBack(uri);
        }
    }

    // 遍历所有文档的uri
    public eachModuleName(callBack: (name: string) => void) {
        if (this.needUpdate) {
            this.updateGlobal();
        }

        for (const [name] of this.globalModule) {
            callBack(name);
        }
    }

    // 删除某个文档的符号
    public delDocumentSymbol(uri: string) {
        this.documentSymbol.delete(uri);
        this.documentModule.delete(uri);

        // 符号有变化，清空全局符号缓存，下次请求时生成
        this.globalModule.clear();
        this.globalSymbol.clear();
        this.needUpdate = true;
    }

    // 获取某个文档的符号
    public getDocumentSymbol(uri: string): SymInfoEx[] | null {
        return this.documentSymbol.get(uri) || null;
    }

    // 获取某个文档里的某个模块
    public getDocumentModule(uri: string, bases: string[], ref = true) {
        // 先在当前文档的模块中查找
        const base = bases[0];
        const moduleHash = this.documentModule.get(uri);
        if (moduleHash) {
            const sym = moduleHash.get(base);
            if (sym) {
                if (1 === bases.length) {
                    return sym;
                }
                return this.getSymbolFromList(bases, 1, sym.subSymList);
            }
        }

        // 如果模块中找不到，则在变量里找
        // 正常情况下，没记录到documentModule的变量不会是模块
        // 但local M = A.B.C，如果C是一个模块，则M也是
        const symList = this.getDocumentSymbol(uri);
        if (!symList) {
            return null;
        }
        for (const sym of symList) {
            if (sym.name !== base) {
                continue;
            }

            if (ref && sym.refType) {
                const rawSym = this.getRefSym(sym, uri);
                if (1 === bases.length) {
                    return rawSym;
                }
                return rawSym
                    ? this.getSymbolFromList(bases, 1, sym.subSymList)
                    : null;
            }

            if (sym.refUri) {
                const rawUri = this.getRawUri(uri, base);
                if (!rawUri) {
                    return null;
                }
                const docSymList = this.getDocumentSymbol(rawUri);
                // 引用另一个文件的符号时，不包含local符号
                const symList = [];
                if (docSymList) {
                    for (const docSym of docSymList) {
                        if (!docSym.local) {
                            symList.push(docSym);
                        }
                    }
                }
                // TODO:这里不太好处理 local M = require "a.b.c" 引用特定文件时
                // 由于没有解析对应文件的return值，无法确定引用的模块，或者该模块是
                // 一个匿名table，没有符号，这里返回所有符号，需要的地方需要特殊处理
                if (1 === bases.length) {
                    return symList;
                }
                return symList
                    ? this.getSymbolFromList(bases, 1, symList)
                    : null;
            }

            // 本身没有引用其他变量
            return sym;
        }

        return null;
    }
    // 获取某个文档里的某个模块的所有子符号
    public getDocumentModuleSubList(uri: string, bases: string[]) {
        const sym = this.getDocumentModule(uri, bases);
        if (sym instanceof Array) {
            return sym;
        }
        return sym && sym.subSymList ? sym.subSymList : null;
    }

    /**
     * 把newSymList符号列表合并到另一个列表 symList
     * @param isSub 是否合并子符号
     * @param symList 最终的列表
     * @param newSymList 需要合并的列表
     * @param filter 过滤器，哪些符号需要合并
     */
    private appendSymList(
        isSub: boolean,
        symList: SymInfoEx[],
        newSymList: SymInfoEx[],
        filter?: (sym: SymInfoEx) => boolean,
    ) {
        for (const sym of newSymList) {
            if (!filter || filter(sym)) {
                symList.push(sym);
            }

            if (isSub && sym.subSymList) {
                this.appendSymList(isSub, symList, sym.subSymList, filter);
            }
        }
    }

    /**
     *  获取全局符号
     * @param isSub 是否查找子符号。跳转和自动补全无法精准定位时，会全局查找。这时并不
     * 希望查找子符号，因为这些符号都是必须通过模块名精准访问的
     */
    public getGlobalSymbol(
        isSub: boolean,
        filter?: (sym: SymInfoEx) => boolean,
        maxSize?: number,
    ): SymInfoEx[] {
        if (this.needUpdate) {
            this.updateGlobal();
        }

        const symList: SymInfoEx[] = [];
        for (const [_name, newSymList] of this.globalSymbol) {
            this.appendSymList(isSub, symList, newSymList, filter);
            if (maxSize && symList.length >= maxSize) {
                break;
            }
        }

        return symList;
    }

    /**
     * 获取所有符号，包括本地和全局的
     */
    public getAnySymbol(
        isSub: boolean,
        filter?: (sym: SymInfoEx) => boolean,
        maxSize?: number,
    ): SymInfoEx[] {
        // 先搜索全局的
        const symList = this.getGlobalSymbol(isSub, filter, maxSize);

        // 再搜索非全局的
        // documentSymbol中不是以树形结构存符号，子符号也是在同一个数组里的
        for (const [_name, newSymList] of this.documentSymbol) {
            for (const sym of newSymList) {
                // return { a = 2 } 这种匿名table里的符号scope > 0，但无base
                if (this.isGlobalSym(sym) || (sym.scope > 0 && sym.base)) {
                    continue;
                }

                if (!filter || filter(sym)) {
                    symList.push(sym);
                }

                if (isSub && sym.subSymList) {
                    this.appendSymList(isSub, symList, sym.subSymList, filter);
                }
            }
            if (maxSize && symList.length >= maxSize) {
                break;
            }
        }

        return symList;
    }

    // 查找经过本地化的原符号uri
    public getRawUri(uri: string, base: string): string | null {
        // 模块名为self则是当前文档self:test()这种用法
        if ('self' === base || '_G' === base) {
            return null;
        }

        const symList = this.documentSymbol.get(uri);
        if (!symList) {
            return null;
        }

        let sym;
        for (const one of symList) {
            if (one.name === base) {
                sym = one;
                break;
            }
        }
        if (!sym) {
            return null;
        }

        // local M = require "abc" 这种用法
        if (sym.refUri) {
            return this.getRequireUri(sym.refUri);
        }

        // 都找不到，默认查找当前文档
        return null;
    }

    // 查找经过本地化的原符号名字，local N = M时转到模块M查找
    public getRawModule(uri: string, base: string): string[] {
        // 模块名为self则是当前文档self:test()这种用法
        if ('self' === base || '_G' === base) {
            return [base];
        }

        const symList = this.documentSymbol.get(uri);
        if (!symList) {
            return [base];
        }

        let sym;
        for (const one of symList) {
            if (one.name === base) {
                sym = one;
                break;
            }
        }
        if (!sym || !sym.refType) {
            return [base];
        }

        return sym.refType;
    }

    // 转换成uri路径格式
    public toUriFormat(path: string): string {
        // 这个路径，可能是 a.b.c a/b/c a\b\c 这三种形式
        // uri总是使用a/b/c这种形式
        path = path.replace(/\\/g, '/');
        path = path.replace(/\./g, '/');

        return path;
    }

    // 获取 require("a.b.c") 中 a.b.c 路径的uri形式
    public getRequireUri(path: string): string {
        const endUri = `${this.toUriFormat(path)}.lua`;

        // 在所有uri里查询匹配的uri
        // 由于不知道项目中的path设置，因此这个路径其实可长可短
        // 如果项目中刚好有同名文件，而且刚好require的路径无法区分，那也没办法了
        for (const [uri, _val] of this.documentModule) {
            if (uri.endsWith(endUri)) {
                // make sure bbb do not match conf/aaabbb
                const offset = uri.length - endUri.length;
                if (0 === offset || '/' === uri[offset - 1]) {
                    return uri;
                }
            }
        }

        return '';
    }

    /**
     * 获取符号所在的文件路径，展示用。目前只展示文件名
     */
    public static getSymbolPath(sym: SymInfoEx): string | null {
        if ('' === sym.location.uri) {
            return 'Lua Standard Libraries';
        }
        const match = sym.location.uri.match(/\/(\w+.\w+)$/);
        return match ? match[1] : null;
    }

    /**
     * 获取符号所在的文件路径，展示用。目前只展示文件名
     */
    public static getPathPrefix(sym: SymInfoEx, uri?: string) {
        // 不在当前文件的符号中显示文件名
        if (uri && sym.location.uri === uri) {
            return '';
        }

        const file = SymbolEx.getSymbolPath(sym);

        // 加上markdown的换行，两个空格加\n
        return file ? `${file}  \n` : '';
    }

    // 获取符号的local类型，展示用
    public static getLocalTypePrefix(local?: LocalType) {
        if (!local) {
            return '';
        }

        switch (local) {
            case LocalType.LT_LOCAL:
                return 'local ';
            case LocalType.LT_PARAMETER:
                return '(parameter) ';
            default:
                return '';
        }
    }

    // 获取符号的base，如 E = { FAIL = 1 } 中 E.FAIL中E.为base
    public static getBasePrefix(sym: SymInfoEx) {
        if (!sym.base) {
            return '';
        }

        // table field like: local tbl = { a = false } have no index
        const indexer = sym.indexer ? sym.indexer : '.';
        return `${sym.base}${indexer}`;
    }

    // 获取变量本地化的引用提示
    // local M = X.Y.Z 提示为 local M = X.Y.Z = 5
    public getRefValue(sym: SymInfoEx) {
        if (!sym.refType) {
            return '';
        }

        const refSym = this.getRefSym(sym, sym.location.uri);
        if (!refSym) {
            return '';
        }

        // 如果引用的是一个常量，那显示常量
        let val = '';
        let prefix = '';
        if (refSym.value) {
            val = ` = ${refSym.value}`;
        } else if (refSym.kind === SymbolKind.Function) {
            prefix = 'function ';

            let parameters = '';
            if (refSym.parameters) {
                parameters = refSym.parameters.join(', ');
            }
            val = `(${parameters})`;

            // 如果原符号无注释，这里在后面显示注释
            if (refSym.comment && !sym.comment) {
                val += '\n' + refSym.comment;
            }
        }

        return ` ${SymbolEx.refMark} ${prefix}${sym.refType.join('.')}${val}`;
    }

    /**
     * 获取全局符号(不包含STL中的符号)
     */
    public getGlobalSymbolList() {
        const symList: SymInfoEx[] = [];
        for (const [_uri, docSymList] of this.documentSymbol) {
            for (const sym of docSymList) {
                if (this.isGlobalSym(sym)) {
                    symList.push(sym);
                }
            }
        }

        return symList;
    }

    // 判断两个符号相似度
    public static checkMatch(src: string, dst: string): number {
        const res = fuzzysort.single(src, dst);

        // exact match returns a score of 0. lower is worse
        return res ? res.score : -1000000000;
    }

    // 加载stl符号
    public loadFromStl() {
        loadStl(this.stlSymbol);
    }
}
