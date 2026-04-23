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
    // 缓存N个文档的符号数据，用于本地符号的查找等
    private docCacheList = new Array<string>();
    // [uri] = cache
    private docNodeCache = new Map<string, NodeCache>();

    private constructor() {}

    public static instance() {
        if (!CacheSymbol.ins) {
            CacheSymbol.ins = new CacheSymbol();
        }

        return CacheSymbol.ins;
    }

    // 初始化目录时，不要缓存任何文档
    public setCacheOpen() {
        this.openCache = true;
    }

    public getCache(uri: string): NodeCache | null {
        let cache = this.docNodeCache.get(uri);
        return cache || null;
    }

    private updateList(uri: string) {
        // 这不是标准的LRU
        // 如果已经在列表中，不处理。不更新到最新
        // 如果不在列表中，则插入到最后。插入后，如果超出N个文档，则把第一个删除掉
        if (this.docNodeCache.get(uri)) return;

        this.docCacheList.push(uri);

        // 通常修改或者查看代码的时候，才需要local符号，一般不会同时涉及太个文件
        if (this.docCacheList.length >= 16) {
            let remove = this.docCacheList.splice(0, 1);
            this.docNodeCache.delete(remove[0]);
        }
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

        this.updateList(uri);
        this.docNodeCache.set(uri, {
            uri: uri,
            nodes: nodes,
            comments: comments,
            codeLine: codeLine,
        });
    }
}
