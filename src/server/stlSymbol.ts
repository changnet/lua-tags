import * as fs from 'fs';
import * as path from 'path';
import { Utils } from './utils';
import { SymInfoEx, CommentType } from './parseSymbol';
import { Setting } from './setting';
import { SymbolEx } from './symbol';
import { SymbolKind } from 'vscode-languageserver';

function parseSTLSym(stlSymbol: SymInfoEx[], symbols: any) {
    // 先把模块都找出来缓存
    const stlModule = new Map<string, SymInfoEx>();
    for (const v of symbols) {
        if (v.kind !== SymbolKind.Namespace) {
            continue;
        }

        //Utils.instance().log(`json parse stl ${JSON.stringify(v)}`);
        const sym: SymInfoEx = {
            name: v.name,
            kind: v.kind,
            location: SymbolEx.invalidLoc,
            scope: 0,
            comment: v.comment,
            ctType: CommentType.CT_HTML,
        };

        stlModule.set(v.name, sym);
        stlSymbol.push(sym);
    }

    for (const v of symbols) {
        if (v.kind === SymbolKind.Namespace) {
            continue;
        }

        const sym: SymInfoEx = {
            name: v.name,
            kind: v.kind,
            base: v.base,
            parameters: v.parameters,
            location: SymbolEx.invalidLoc,
            scope: v.base ? 1 : 0,
            comment: v.comment,
            ctType: CommentType.CT_HTML,
        };

        stlSymbol.push(sym);

        if (v.base) {
            const baseSym = stlModule.get(v.base);
            if (!baseSym) {
                Utils.instance().error(`load stl no module found: ${v.base}`);
                return;
            }

            if (!baseSym.subSymList) {
                baseSym.subSymList = new Array<SymInfoEx>();
            }
            baseSym.subSymList.push(sym);
        }
    }
}

/**
 * 加载lua stand library
 */
export function loadStl(stlSymbol: SymInfoEx[]) {
    const ver = Setting.instance().getLuaVersion();
    const uri = path.resolve(__dirname, `../../stl/stl_${ver}.json`);

    Utils.instance().debug(`load stl from ${uri}`);
    fs.readFile(uri, 'utf8', (err, data) => {
        if (err) {
            Utils.instance().debug(`${JSON.stringify(err)}`);
            return;
        }
        const symbols = JSON.parse(data.toString());
        if (!symbols) {
            Utils.instance().debug(`json parse stl for lua ${ver} error`);
            return;
        }

        parseSTLSym(stlSymbol, symbols);
    });
}
