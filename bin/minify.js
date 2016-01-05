#!/usr/bin/env node

'use strict';

var minifier = require('../lib/directory-minifier.js');

var directory = process.argv[2], 
	checksumFilepath = process.argv[3];

try {

	minifier.minify(directory, checksumFilepath);

} catch (e) {
	console.error(e)
	process.exit(1);
}