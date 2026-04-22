import { Node, Comment } from 'luaparse';

interface NodeCache {
    uri: string;
    nodes: Node[];
    codeLine: number[];
    comments: Comment[];
}

/**
 * 为了减少内存占用，symbol只记录全局和模块的符号，对于本地符号是没有记录的
 * 当在某个文件内修改代码或者跳转查看时，将会单独解析这个文件然后保存到cache中
 */
export class CacheSymbol {
    private static ins: CacheSymbol;

    private openCache = false;
    // 缓存8个文档的符号数据，用于本地符号的查找等
    private docNodeCache = new Array<NodeCache>();

    private constructor() {}

    public static instance() {
        if (!CacheSymbol.ins) {
            CacheSymbol.ins = new CacheSymbol();
        }

        return CacheSymbol.ins;
    }

    public setCacheOpen() {
        this.openCache = true;
    }

    public getCache(uri: string): NodeCache | null {
        for (const cache of this.docNodeCache) {
            if (uri === cache.uri) {
                return cache;
            }
        }

        return null;
    }

    // 更新文档缓存
    public updateCache(
        uri: string,
        nodes: Node[],
        comments: Comment[],
        codeLine: number[],
    ) {
        if (!this.openCache) {
            return;
        }

        let index = -1;
        for (const e of this.docNodeCache) {
            index++;
            if (e.uri === uri) {
                break;
            }
        }
        if (index >= 0) {
            this.docNodeCache.splice(index, 1);
        }
        if (this.docNodeCache.length >= 8) {
            this.docNodeCache.splice(0, 1);
        }
        this.docNodeCache.push({
            uri: uri,
            nodes: nodes,
            comments: comments,
            codeLine: codeLine,
        });
    }
}
