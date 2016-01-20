#!/usr/bin/env node

'use strict';

var minifier = require('../lib/directory-minifier.js');

var directory = process.argv[2],
	checksumFilepath,
	debug;

for (var i = 0, leni = process.argv.length; i < leni; i++) {

	var arg = process.argv[i];

	if (arg === '-v' || arg === '--verbose') {
		debug = true;

	} else if (arg === '-c' || arg === '--checksum') {

		if (i + 1 <= leni) {
			checksumFilepath = process.argv[++i];
		}
	}
}

try {

	minifier.minify(directory, {
		checksum: checksumFilepath,
		debug: debug
	});

} catch (e) {
	console.error(e);
	process.exit(1);
}