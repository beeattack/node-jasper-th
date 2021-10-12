const path = require('path')

require('./index')({
    path: './asset/lib/jasperreports-6.1.0/',
    autoCompileReportsPath: path.resolve(__dirname, './reports'),
});
