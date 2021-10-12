var java=null,
    fs = require('fs'),
    path = require('path'),
    extend = require('extend'),
    util = require('util'),
    temp = require('temp'),
    async = require('async'),
    cliProgress = require('cli-progress');

var defaults = {reports:{}, drivers:{}, conns:{}, tmpPath: '/tmp'};

var b1;

function walk(dir, done) {
    var results = [];
    fs.readdir(dir, function(err, list) {
        if (err) return done(err);
        var pending = list.length;
        if (!pending) return done(null, results);
        list.forEach(function(file) {
            file = path.join(dir, file);
            fs.stat(file, function(err, stat) {
                if (stat && stat.isDirectory()) {
                    walk(file, function(err, res) {
                        results = results.concat(res);
                        if (!--pending) done(null, results);
                    });
                } else {
                    results.push(file);
                    if (!--pending) done(null, results);
                }
            });
        });
    });
};

/*
 * options: {
 * 	path: , //Path to jasperreports-x.x.x-project directory
 *  tmpPath: '/tmp', // Path to a folder for storing compiled report files
 * 	reports: {
 * 		// Report Definition
 * 		"name": {
 * 			jasper: , //Path to jasper file,
 * 			jrxml: , //Path to jrxml file,
 * 			conn: , //Connection name, definition object or false (if false defaultConn won't apply)
 * 		}
 * 	},
 * 	drivers: {
 *		// Driver Definition
 * 		"name": {
 			path: , //Path to jdbc driver jar
 			class: , //Class name of the driver (what you would tipically place in "Class.forName()" in java)
 			type: //Type of database (mysql, postgres)
 		}
 * 	},
 * 	conns: {
 *		// Connection Definition
 * 		"name": {
 * 			host: , //Database hostname or IP
 * 			port: , //Database Port
 * 			dbname: , //Database Name
 * 			user: , //User Name
 * 			pass: , //User Password
 * 			jdbc: , //jdbc connection string
 *			driver: //name or definition of the driver for this conn
 * 		}
 *	},
 *	defaultConn: , //Default Connection name
	java: //Array of java options, for example ["-Djava.awt.headless=true"]
 * }
 */
function jasper(options) {
    if(options.javaInstance) {
        java = options.javaInstance
    } else {
        java = require('nodejs-java-dp')
    }
    this.java = java;
    if(options.java) {
        if(util.isArray(options.java)) {
            options.java.forEach(function(javaOption) {
                java.options.push(javaOption);
            });
        }
        if(typeof options.java == 'string') {
            java.options.push(options.java);
        }
    }
    var self = this;
    self.parentPath = path.dirname(module.parent.filename);
    //var jrPath = path.resolve(self.parentPath, options.path||'.');
    var jrPath = `${__dirname}/asset/lib/jasperreport-6.17.0`;
    async.auto({
        jrJars: function(cb) {
            if(fs.statSync(path.join(jrPath, 'lib')).isDirectory() && fs.statSync(path.join(jrPath, 'dist')).isDirectory()) {
                async.parallel([
                    function(cb) {
                        walk(path.join(jrPath, 'dist'), function(err, results) {
                            cb(err, results);
                        });
                    },
                    function(cb) {
                        walk(path.join(jrPath, 'lib'), function(err, results) {
                            cb(err, results);
                        });
                    }
                ], function(err, results) {
                    if(err) return cb(err);
                    var r = results.shift();
                    results.forEach(function(item) {
                        r = r.concat(item);
                    });
                    cb(null, r);
                })
            } else {
                walk(jrPath, function(err, results) {
                    cb(err, results);
                });
            }
        },
        dirverJars: function(cb) {
            var results = [];
            if(options.drivers) {
                for(var i in options.drivers) {
                    results.push(path.resolve(self.parentPath, options.drivers[i].path));
                }
            }
            cb(null, results);
        },
        loadJars: ['jrJars', 'dirverJars', function(cb, jars) {
            jars.jrJars.concat(jars.dirverJars).forEach(function(file) {
                if(path.extname(file) == '.jar') {
                    java.classpath.push(file)
                }
            });
            cb();
        }],
        debug: ['loadJars', function(cb) {
            if(!options.debug) options.debug = 'off';
            var levels = ['ALL', 'TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL', 'OFF'];
            if(levels.indexOf((options.debug+'').toUpperCase()) == -1) options.debug = 'DEBUG';

            /*
            commented because in java 1.8 this causes

            #
            # A fatal error has been detected by the Java Runtime Environment:
            #
            #  SIGSEGV (0xb) at pc=0x00007f5caeacbac2, pid=7, tid=0x00007f5caf3c8ae8
            #
            # JRE version: OpenJDK Runtime Environment (8.0_181-b13) (build 1.8.0_181-b13)
            # Java VM: OpenJDK 64-Bit Server VM (25.181-b13 mixed mode linux-amd64 compressed oops)
            # Derivative: IcedTea 3.9.0
            # Distribution: Custom build (Tue Oct 23 12:48:04 GMT 2018)
            # Problematic frame:
            # C  [nodejavabridge_bindings.node+0x20ac2]  javaGetEnv(JavaVM_*, _jobject*)+0xa2
            */

            /*
            var appender  = java.newInstanceSync('org.apache.log4j.ConsoleAppender');
            var pattern = java.newInstanceSync('org.apache.log4j.PatternLayout', "%d [%p|%c|%C{1}] %m%n");
            appender.setLayout(pattern);
            appender.setThreshold(java.getStaticFieldValue("org.apache.log4j.Level", (options.debug+'').toUpperCase()));
            appender.activateOptions();
            var root = java.callStaticMethodSync("org.apache.log4j.Logger", "getRootLogger");
            root.addAppender(appender);
            cb();
            */

            try {
                var appender  = java.newInstanceSync('org.apache.log4j.ConsoleAppender');
                var pattern = java.newInstanceSync('org.apache.log4j.PatternLayout', "%d [%p|%c|%C{1}] %m%n");
                appender.setLayout(pattern);
                appender.setThreshold(java.getStaticFieldValue("org.apache.log4j.Level", (options.debug+'').toUpperCase()));
                appender.activateOptions();
                var root = java.callStaticMethodSync("org.apache.log4j.Logger", "getRootLogger");
                root.addAppender(appender);
                cb();
            } catch (e) {
                cb();
            }
        }],
        loadClass: ['loadJars', function(cb) {
            var cl = java.callStaticMethodSync("java.lang.ClassLoader","getSystemClassLoader")
            for(var i in options.drivers) {
                cl.loadClassSync(options.drivers[i].class).newInstanceSync();
            }
            cb();
        }],
        imports: ['loadClass', function(cb) {
            self.dm = java.import('java.sql.DriverManager');
            self.jreds = java.import('net.sf.jasperreports.engine.JREmptyDataSource');
            self.jrjsonef = java.import('net.sf.jasperreports.engine.data.JsonDataSource');
            self.jbais = java.import('java.io.ByteArrayInputStream');
            self.jcm = java.import('net.sf.jasperreports.engine.JasperCompileManager');
            self.hm = java.import('java.util.HashMap');
            self.jfm = java.import('net.sf.jasperreports.engine.JasperFillManager');
            self.jem = java.import('net.sf.jasperreports.engine.JasperExportManager');
            self.loc = java.import('java.util.Locale');
            self.JRXlsxExporter = java.import('net.sf.jasperreports.engine.export.ooxml.JRXlsxExporter');
            self.JRDocxExporter = java.import('net.sf.jasperreports.engine.export.ooxml.JRDocxExporter');
            self.JRExporterParameter = java.import('net.sf.jasperreports.engine.JRExporterParameter');

            cb();
        }]

    }, function() {
        if(self.ready) {
            self.ready();
            if(options.autoCompileReportsPath) {
                var response = self.compileAllJrxmlSync(options.autoCompileReportsPath)
                console.log('\n')
                response.listOfSuccessReports.forEach(function(item) {
                    console.log('\x1b[32m%s\x1b[0m', item)
                })

                if(response.listOfFailedReports.length > 0) {
                    response.listOfFailedReports.forEach(function(item) {
                        console.log('\x1b[31m%s\x1b[0m', item)
                    })
                }

                console.log('\n')
                if(response.returnValue === 1) {
                    console.log('\x1b[32m%s\x1b[0m', `There are total of ${response.success}/${response.numberOfReports} report(s) successfully compiled`)
                    if(response.failed === 0) {
                        console.log('\x1b[32m%s\x1b[0m', `There are total of ${response.failed}/${response.numberOfReports} report(s) failed to compile`)
                    } else {
                        console.log('\x1b[31m%s\x1b[0m', `There are total of ${response.failed}/${response.numberOfReports} report(s) failed to compile`)
                    }
                    console.log('\x1b[36m%s\x1b[0m', 'Compilation of Reports finished.')
                } else {
                    console.log('\x1b[31m%s\x1b[0m', 'There are total of 0 reports successfully compiled')
                    console.log('\x1b[31m%s\x1b[0m', 'There are total of ' + response.numberOfReports + ' reports failed to compile')
                    console.log('\x1b[31m%s\x1b[0m', 'Compilation of Reports failed.')
                }

                console.log('\n')
                console.log('\x1b[36m%s\x1b[0m', 'Quick Summary: \n')

                console.log('\x1b[32m%s\x1b[0m', 'Success: ' + response.success)
                console.log('\x1b[31m%s\x1b[0m', 'Failed: ' + response.failed)
                console.log('\x1b[36m%s\x1b[0m', 'Number Of Reports: ' + response.numberOfReports + '\n')
            }
        }
    });

    delete options.path;
    extend(self, defaults, options);
}

jasper.prototype.ready = function(f) {
    var self = this;
    self.ready = f;
};

/*
 * name = Report Name
 * def = Report Definition
 */
jasper.prototype.add = function(name, def) {
    this.reports[name] = def;
}

jasper.prototype.pdf = function(report) {
    return this.export(report, 'pdf');
}

jasper.prototype.xlsx = function(report) {
    return this.export(report, 'xlsx');
}

jasper.prototype.docx = function(report) {
    return this.export(report, 'docx');
}

/*
 * report can be of any of the following types:
 * _ A string that represents report's name. No data is supplied.. defaultConn will be applied to get data with reports internal query.
 * _ An object that represents report's definition. No data is supplied.. defaultConn will be applied to get data with reports internal query.
 * _ An object that represents reports, data and properties to override for this specific method call.
 *
 * 	{
 * 		report: , //name, definition or an array with any combination of both
 * 		data: {}, //Data to be applied to the report. If there is an array of reports, data will be applied to each.
 * 		override: {} //properties of report to override for this specific method call.
 * 	}
 * _ An array with any combination of the three posibilities described before.
 * _ A function returning any combination of the four posibilities described before.
 */

var validConnections = {};
jasper.prototype.export = function(report, type) {

    var self = this;

    if(!type) return;

    type = type.charAt(0).toUpperCase()+type.toLowerCase().slice(1);

    var processReport = function(report) {
        if(typeof report == 'string') {
            return [extend({},self.reports[report])];
        } else if(util.isArray(report)) {
            var ret = [];
            report.forEach(function(i) {
                ret = ret.concat(processReport(i));
            });
            return ret;
        } else if(typeof report == 'function') {
            return processReport(report());
        } else if(typeof report == 'object') {
            if(report.data||report.override) {
                var reps = processReport(report.report);
                return reps.map(function(i) {
                    if(report.override) {
                        extend(i, report.override);
                    }
                    i.data = report.data;
                    i.dataset = report.dataset;
                    i.query = report.query;
                    return i;
                })
            } else {
                return [report];
            }
        }
    };

    var processConn = function(conn, item) {
        if(conn == 'in_memory_json') {
            var jsonString = JSON.stringify(item.dataset);

            var byteArray = [];
            var buffer = Buffer(jsonString);
            for (var i = 0; i < buffer.length; i++) {
                byteArray.push(buffer[i]);
            }
            byteArray = java.newArray('byte', byteArray);

            return new self.jrjsonef(new self.jbais(byteArray), item.query || '');
        }else if(typeof conn == 'string') {
            conn = self.conns[conn];
        } else if (typeof conn == 'function') {
            conn = conn();
        } else if(conn !== false && self.defaultConn) {
            conn = self.conns[self.defaultConn];
        }

        if(conn) {
            if(typeof conn.driver == 'string') {
                conn.driver = self.drivers[conn.driver];
            }
            var connStr = conn.jdbc?conn.jdbc:'jdbc:'+conn.driver.type+'://'+conn.host+':'+conn.port+'/'+conn.dbname;

            if(!validConnections[connStr] || !validConnections[connStr].isValidSync(conn.validationTimeout || 1)){
                validConnections[connStr] = self.dm.getConnectionSync(connStr, conn.user, conn.pass);
            }
            return validConnections[connStr];
        } else {

            return new self.jreds();

        }

    };

    var parseLocale = function (localeString) {
        var tokens = localeString.split(/[_|-]/);

        if (tokens.length > 1) {
            return self.loc(tokens[0], tokens[1]);
        }
        else {
            return self.loc(tokens[0]);
        }
    }

    var reports = processReport(report);
    var prints = [];
    reports.forEach(function(item) {
        if(!item.jasper && item.jrxml) {
            item.jasper = self.compileSync(item.jrxml, self.tmpPath);
        }

        if(item.jasper) {
            var data = null;
            if(item.data) {
                data = new self.hm();
                for(var j in item.data) {
                    if (j === 'REPORT_LOCALE') {
                        item.data[j] = parseLocale(item.data[j]);
                    }
                    data.putSync(j, item.data[j])
                }
            }

            var conn = processConn(item.conn, item);

            var p
            if(type === 'Xlsx' || type === 'Docx') {
                p = self.jfm.fillReportToFileSync(path.resolve(self.parentPath,item.jasper), data, conn);
            } else if(type === 'Pdf') {
                p = self.jfm.fillReportSync(path.resolve(self.parentPath,item.jasper), data, conn);
            }

            prints.push(p);
        }
    });

    if(prints.length) {
        var master = prints.shift();
        prints.forEach(function(p) {
            var s = p.getPagesSync().sizeSync();
            for(var j = 0; j < s; j++) {
                master.addPageSync(p.getPagesSync().getSync(j));
            }
        });

        var tempName;
        if(type === 'Xlsx') {
            tempName = temp.path({suffix: '.xlsx'});
            var jrxlsxExporter = new self.JRXlsxExporter();
            jrxlsxExporter.setParameterSync(self.JRExporterParameter.INPUT_FILE_NAME, master);
            jrxlsxExporter.setParameterSync(self.JRExporterParameter.OUTPUT_FILE_NAME, tempName);

            jrxlsxExporter.exportReportSync();
            fs.unlinkSync(master);
        } else if(type === 'Docx') {
            tempName = temp.path({suffix: '.docx'});
            var jrdocxExporter = new self.JRDocxExporter();
            jrdocxExporter.setParameterSync(self.JRExporterParameter.INPUT_FILE_NAME, master);
            jrdocxExporter.setParameterSync(self.JRExporterParameter.OUTPUT_FILE_NAME, tempName);

            jrdocxExporter.exportReportSync();
            fs.unlinkSync(master);
        } else if(type === 'Pdf') {
            tempName = temp.path({suffix: '.pdf'});
            self.jem['exportReportTo'+type+'FileSync'](master, tempName);
            var exp = fs.readFileSync(tempName);
            fs.unlinkSync(tempName);
            return exp;
        }
        var exp = fs.readFileSync(tempName);
        fs.unlinkSync(tempName);
        return exp;
    }

    return '';
}

/*
 * get all paths of jrxml file in under dir path
 *
 * dir = destination folder path where the compiled report files will be placed. If not specified, will use the options tmpPath or the defaults tmpPath value.
 *
 */
jasper.prototype.getAllJrxmlSync = function (dir) {
    var jrxmlResults = [];
    var self = this;

    fs.readdirSync(dir).forEach(function(file) {
        file = dir+'/'+file;
        var stat = fs.statSync(file);

        if (stat && stat.isDirectory()) {
            jrxmlResults = jrxmlResults.concat(self.getAllJrxmlSync(file))
        } else {
            var fileName = path.basename(file)
            if(path.extname(fileName) === '.jrxml') {
                jrxmlResults.push(file);
            }
        }
    });
    return jrxmlResults
}

/*
 * compiles all reports added to the reports definition collection with a jrxml file specified
 *
 * dstFolder = destination folder path where the compiled report files will be placed. If not specified, will use the options tmpPath or the defaults tmpPath value.
 *
 */
jasper.prototype.compileAllSync = function (dstFolder) {
    var self = this;
    for (var name in self.reports) {
        var report = self.reports[name];
        if (report.jrxml) {
            report.jasper = self.compileSync(report.jrxml, dstFolder || self.tmpPath);
        }
    }
}

/*
 * compiles all jrxml reports in dstFolder 
 *
 * dstFolder = destination folder path where the compiled report files will be placed. If not specified, will use the options tmpPath or the defaults tmpPath value.
 *
 */
jasper.prototype.compileAllJrxmlSync = function (dstFolder) {
    var response = {
        success: 0,
        failed: 0,
        numberOfReports: 0,
        listOfSuccessReports: [],
        listOfFailedReports: [],
        returnValue: 1
    }
    try {
        b1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        var self = this;
        var listOfJrxml = self.getAllJrxmlSync(dstFolder)
        response.numberOfReports = listOfJrxml.length
        b1.start(response.numberOfReports, 0, {
            speed: "N/A"
        });
        var count = 0;
        listOfJrxml.forEach(function(filePath) {
            try {
                count = count + 1;
                var dstFile = path.dirname(filePath)
                self.compileSync(filePath, dstFile)
                response.success = response.success + 1
                b1.update(count);
                response.listOfSuccessReports.push(`Successfully compiled ${path.basename(filePath)}`)
            } catch(e) {
                response.failed = response.failed + 1
                response.listOfFailedReports.push(`Failed to compile ${path.basename(filePath)}`)
            }
        })
        b1.stop();
        return response
    } catch(e) {
        console.log(e.message || e)
        response.returnValue = -1
        return response
    }
}

/*
 * compiles a jrxml report file to a jasper file with the same name
 *
 * dstFolder = destination folder path where the compiled report files will be placed. If not specified, will use the options tmpPath or the defaults tmpPath value.
 *
 * returns the full path of the created jasper file
 *
 */
jasper.prototype.compileSync = function (jrxmlFile, dstFolder) {
    var self = this;
    var name = path.basename(jrxmlFile, '.jrxml');
    var file = path.join(dstFolder || self.tmpPath, name + '.jasper');

    java.callStaticMethodSync(
        "net.sf.jasperreports.engine.JasperCompileManager",
        "compileReportToFile",
        path.resolve(self.parentPath, jrxmlFile), file
    );
    return file;
};

jasper.prototype.toJsonDataSource = function (dataset, query) {
    var self = this;
    var jsonString = JSON.stringify(dataset);
    var is = java.callStaticMethodSync("com.jdea.dental.StringToByteArray", "GetInputstream", jsonString);
    return new self.jrjsonef(is, query || '');
  }

module.exports = function(options) {
    return new jasper(options)
};
