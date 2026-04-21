import * as fs from 'fs';
import { Setting } from './setting';
import { SymInfoEx, SymbolEx } from './symbol';
import { Utils } from './utils';

let exportVer: number = 0;
const exportSym = new Map<string, number>();

// 导出全局符号，不常用，直接用同步写入就可以了
export function writeGlobalSymbols(symList: SymInfoEx[]) {
    const fileName = Setting.instance().getExportPath();
    if (fileName === '') {
        Utils.instance().anyError({ message: 'invalid export file name' });
        return;
    }
    const option: { encoding?: BufferEncoding | null; flag?: string } = {
        encoding: 'utf8',
        flag: 'a',
    };

    const rootUri = Setting.instance().getRoot();

    symList.sort((a: SymInfoEx, b: SymInfoEx) => {
        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        }
        return 0;
    });

    try {
        fs.writeFileSync(
            fileName,
            `-- auto export by lua-tags ${symList.length} symbols\n\nreturn {\n`,
            { encoding: 'utf8', flag: 'w' },
        );

        for (const sym of symList) {
            const file = sym.location.uri.substring(rootUri.length + 1);
            fs.writeFileSync(fileName, `"${sym.name}", -- ${file}\n`, option);
        }
        fs.writeFileSync(fileName, `}\n`, option);
    } catch (e) {
        Utils.instance().anyError(e);
    }
}

export function tryExportGlobalSymbol() {
    const fileName = Setting.instance().getExportPath();
    if (fileName === '') {
        return;
    }

    const symbol = SymbolEx.instance();

    if (exportVer === symbol.getUpdateVersion()) {
        return;
    }

    exportVer = symbol.getUpdateVersion();
    const symList = symbol.getGlobalSymbolList();

    let change = false;
    if (symList.length === exportSym.size) {
        for (const sym of symList) {
            if (!exportSym.get(sym.name)) {
                change = true;
                break;
            }
        }
    } else {
        change = true;
    }

    if (!change) {
        return;
    }

    exportSym.clear();
    for (const sym of symList) {
        exportSym.set(sym.name, 1);
    }

    writeGlobalSymbols(symList);
}
