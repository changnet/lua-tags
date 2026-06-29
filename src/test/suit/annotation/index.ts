import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
    });

    const testsRoot = __dirname;

    return new Promise((c, e) => {
        glob('**/**.test.js', { cwd: testsRoot })
            .then((files: string[]) => {
                const paths: string[] = [];
                files.forEach((f) => {
                    if ('extension.test.js' === path.parse(f).base) {
                        mocha.addFile(path.resolve(testsRoot, f));
                    } else {
                        paths.push(path.resolve(testsRoot, f));
                    }
                });
                paths.forEach((p) => mocha.addFile(p));

                try {
                    mocha.run((failures) => {
                        if (failures > 0) {
                            e(new Error(`${failures} tests failed.`));
                        } else {
                            c();
                        }
                    });
                } catch (err) {
                    e(err);
                }
            })
            .catch((err: any) => e(err));
    });
}
