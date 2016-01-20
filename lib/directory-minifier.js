/*
 * directory-minifier
 * https://github.com/thiagoh/directory-minifier
 *
 * Copyright (c) 2016 Thiago Andrade
 * Licensed under the MIT license.
 */

'use strict';

var UglifyJS = require("uglify-js"),
	worker = require('co-work'),
	fs = require('fs'),
	crypto = require('crypto'),
	Q = require('q'),
	_ = require('underscore'),
	path = require('path'),
	debug = false,

	readDirDeeply = function(dir, filter, callback) {

		var results = [],
			pending,
			filterAndPush = function(file) {
				if (typeof file !== 'undefined' && filter(file) === true) {
					results.push(file);
				}
			},
			checkPendingAndCallback = function() {

				if (pending === 0) {
					return callback({
						files: results
					});
				}
			},
			processCurFile = function(file) {

				file = path.resolve(dir, file);

				fs.stat(file, function(err, stat) {

					if (stat && stat.isDirectory()) {
						readDirDeeply(file, filter, function(result) {

							if (typeof result.error !== 'undefined') {
								return callback({
									error: result.error,
									files: results
								});
							}

							results = results.concat(result.files);

							--pending;
							checkPendingAndCallback();
						});

					} else {

						--pending;
						filterAndPush(file);
						checkPendingAndCallback();
					}
				});
			},
			_iterateFiles = function(err, files) {

				if (err) {
					return callback({
						error: err,
						files: results
					});
				}

				if (files.length === 0) {
					return callback({
						files: results
					});
				}

				pending = files.length;

				files.forEach(function(file) {
					processCurFile(file);
				});
			};

		fs.readdir(dir, function(err, files) {
			_iterateFiles(err, files);
		});
	},

	endsWith = function(value, suffix) {
		return value.indexOf(suffix, value.length - suffix.length) !== -1;
	},

	formattedSize = function(bytes) {
		return (bytes / 1024).toFixed(2);
	},

	minifyFile = function(directory, file) {

		if (debug) {
			console.log('Minifying file: ' + file);
		}

		var deferred = Q.defer(),
			promise = deferred.promise,
			minifiedDirectory = path.dirname(file),
			minifiedFilename = path.basename(file),
			ext = path.extname(minifiedFilename),
			sourceMapFilename = minifiedFilename.substring(0, minifiedFilename.indexOf(ext)) + ".min" + ext + ".map",
			sourceMapFilepath = minifiedDirectory + '/' + sourceMapFilename,
			minifiedFilepath = minifiedDirectory + '/' + minifiedFilename.substring(0, minifiedFilename.indexOf(ext)) + ".min" + ext;

		try {

			var source_map = UglifyJS.SourceMap({
				file: path.relative(path.dirname(directory), sourceMapFilepath),
				root: directory
			});

			var result = UglifyJS.minify(file, {
				outSourceMap: path.relative(path.dirname(directory), sourceMapFilepath),
				compress: {
					booleans: false,
					comparisons: false,
					conditionals: false,
					evaluate: false,
					negate_iife: false,
					keep_fnames: true,
					properties: false,
					warnings: true
				}
			}, true);

			fs.writeFile(minifiedFilepath, result.code, function(err) {

				if (err) {
					console.error(err);
					deferred.reject(err);
				}

				if (debug) {
					console.log('Saving minified file at', minifiedFilepath);
				}

				fs.stat(file, function(err1, fullStat) {
					fs.stat(minifiedFilepath, function(err1, minifiedStat) {
						if (debug) {
							console.log('Minified ' + minifiedFilepath + ' from: ' + formattedSize(fullStat.size) + ' to: ' + formattedSize(minifiedStat.size));
						}
					});
				});

				fs.writeFile(sourceMapFilepath, result.map, function(err) {
					if (err) {
						deferred.reject(err);
					}
					deferred.resolve();
				});
			});

		} catch (e) {
			console.error(e);
			deferred.reject(e);
		}

		return promise;
	},

	processFile = function(checksumHash, directory, file) {

		var deferred = Q.defer(),
			promise = deferred.promise,
			relativePath = path.relative(directory, file);

		fs.readFile(file, function(err, data) {

			var newHashValue;

			if (err) {
				deferred.reject(err);
			}

			if (debug) {
				console.log("Checking hash of file ", file);
			}

			try {

				newHashValue = crypto.createHash('md5').update(data).digest('hex');

			} catch (e) {
				console.warn(e);
			}

			if (debug) {
				//console.log(checksumHash[relativePath], newHashValue);
			}

			if (checksumHash[relativePath] !== newHashValue || typeof newHashValue === 'undefined') {

				if (debug) {
					console.log("Hash is different or doesn't exists", checksumHash[relativePath], newHashValue);
				}

				minifyFile(directory, file)
					.then(function() {
						deferred.resolve();
					}, function(err) {
						deferred.reject(err);
					});

			} else {
				deferred.resolve();
			}

			checksumHash[relativePath] = newHashValue;
		});

		return promise;
	},

	minify = function(directory, settings) {

		var slots = 300,
			checksumHash = {},
			deferred1 = Q.defer(),
			promise1 = deferred1.promise;

		settings = settings || {};
		debug = typeof settings.debug === 'undefined' ? false : settings.debug;

		var checksumFilepath = settings.checksum;

		if (typeof directory === 'undefined' || directory === '') {
			throw new Error("Nothing to minify");
		}

		if (endsWith(directory, '/') !== true) {
			directory = directory + '/';
		}

		if (typeof checksumFilepath === 'undefined' || checksumFilepath === '') {
			checksumFilepath = directory + 'source-hash.json';
		}

		if (debug) {
			console.log("Minifying " + directory + " ...");
		}

		Q.nfcall(fs.lstat, checksumFilepath)
			.then(function(data) {

				if (debug) {
					console.log('Checksum data exists', checksumFilepath);
				}

				fs.readFile(checksumFilepath, function(err, data) {
					deferred1.resolve(data);
				});

			}, function(err) {

				if (debug) {
					console.log('Checksum data not exists', checksumFilepath);
				}

				fs.createWriteStream(checksumFilepath);

				fs.readFile(checksumFilepath, function(err, data) {
					deferred1.resolve(data);
				});
			})
			.catch(function(err) {
				deferred1.reject(err);
			});

		promise1.then(function(result) {

			var deferred2 = Q.defer(),
				promise2 = deferred2.promise;

			try {

				checksumHash = JSON.parse(result);
				if (debug) {
					console.log('There is a checksum file ' + checksumFilepath);
				}

			} catch (e) {
				console.warn('There is no checksum file ' + checksumFilepath + ' or is invalid. Creating a new one. Cause:', e);
			}

			readDirDeeply(directory,
				function(file) {
					return endsWith(file, ".js") === true && endsWith(file, ".min.js") === false;
				},
				function(result) {

					if (typeof result.error !== 'undefined') {
						console.error(result.error);
						return;
					}

					if (debug) {
						console.log("Minifying " + result.files.length + " files...");
					}

					try {

						worker.work(slots, function(file) {

							return processFile(checksumHash, directory, file);

						}, result.files, function() {


							var data = JSON.stringify(checksumHash);

							fs.writeFile(checksumFilepath, data, function(err) {
								if (err) {
									console.error('Error saving checksum file', err);
								} else {
									console.log('Final checksum saved at ', checksumFilepath);
								}

								deferred2.resolve();
							});
						});

					} catch (error) {
						console.error(error);
						deferred2.reject(error);
					}
				});

			return promise2;
		});

		// var result = UglifyJS.minify("/data/dev/recife-26/target2/portal-web/docroot/html/js/target/app.js");
		// console.log(result.code); // minified output

		return promise1;
	};

exports.minify = minify;