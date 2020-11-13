import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export function run(): Promise<void> {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
	});
	mocha.options.color = true;

	const testsRoot = path.resolve(__dirname, '..');

	return new Promise((c, e) => {
		glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
			if (err) {
				return e(err);
			}

			// extension activate is in extension.test.ts, so this file MUST
			// be added to mocha first, so it can lanunch extension before other
			// test
			const paths: string[] = [];
			// Add files to the test suite
			files.forEach(f => {
				if ("extension.test.js" === path.parse(f).base) {
					mocha.addFile(path.resolve(testsRoot, f));
				}
				else {
					paths.push(path.resolve(testsRoot, f));
				}
			});
			paths.forEach(p => mocha.addFile(p));

			try {
				// Run the mocha test
				mocha.run(failures => {
					if (failures > 0) {
						e(new Error(`${failures} tests failed.`));
					} else {
						c();
					}
				});
			} catch (err) {
				e(err);
			}
		});
	});
}
