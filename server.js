const _ = require('lodash');
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3');

var db = new sqlite3.Database(':memory:');

var port = 80;
var ip_addr = "127.0.0.1";

// Config to send to clients
var config = { 
	"cspi"  : 15, // client-server poll interval in seconds
	"smb" : [ //{ "interval": 15, 
	//             "share": "\\\\127.0.0.1\\smb", 
	//             "domain" : "WORKGROUP", 
	//             "username": "Hugh", 
	//             "password": "food411"},
	//           { "interval": 17, 
	//             "share": "\\\\127.0.0.1\\smb", 
	//             "domain" : "WORKGROUP", 
	//             "username": "Hugh", 
	//             "password": "food411"} 
	],
	"http" : [ {"interval": 30, "url": "http://127.0.0.1", "recid": 1}, 
	],
	"mapiDelete" : [ //{ "interval": 120,
	                 //  "subject": "Mail Test * Mail Test * Mail Test" } 
	],
	"mapiSend" : [ //{ "interval": 20,
	               //  "recipient": "hugh@boilermaker.net",
	               //  "subject": "Mail Test * Mail Test * Mail Test",
	               //  "body": "This is the mail body!" }
	],
	"smtp" : [ //{ "interval": 15,
	//             "f": "hugh@boilermaker.net",
	//             "t": "address@example.org",
	//             "s": "TEST EMAIL",
	//             "m": "This is a test",
	//             "serv": "127.0.0.1",
	//             "port": 25 }
	]
};

var dbTableCmds = [
	"CREATE TABLE if not exists smb  (date INTEGER, host TEXT, share TEXT, domain TEXT, username TEXT, password TEXT, PRIMARY KEY(date, host) )",
	"CREATE TABLE if not exists http (date INTEGER, host TEXT, url TEXT, statuscode TEXT, PRIMARY KEY(date, host) )",
	"CREATE TABLE if not exists mapiSend (date INTEGER, host TEXT, subject TEXT, recipient TEXT, PRIMARY KEY(date, host) )",
	"CREATE TABLE if not exists mapiDelete (date INTEGER, host TEXT, count INTEGER, subject TEXT, PRIMARY KEY(date, host))",
	"CREATE TABLE if not exists smtp (date INTEGER, h TEXT, f TEXT, t TEXT, s TEXT, m TEXT, r TEXT, serv TEXT, port TEXT, PRIMARY KEY(date, h) )"
];

// create DB tables if do not exist
for (var i = 0; i < dbTableCmds.length; i++) {
	db.run(dbTableCmds[i]);
};

var app = express();  // create web server
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use('/',express.static('files'));
app.use('/font-awesome',express.static('font-awesome'));

// Dump DB to JSON.  This is for displaying logs in browser.
app.get('/db/:db_name', function (req, res) {
	db.all("select * FROM " + req.params.db_name + " order by date desc",
        function (err, row) {
        	res.jsonp(row);
    	});
});

// Dump config to JSON
app.get('/config', function (req, res) {
  res.send( config )
});

// Dump table creation commands to JSON
app.get('/tables', function (req, res) {
  res.send( dbTableCmds )
});

// URI for clients to post data
app.post('/plus', function(req, res) {
	var copyConfig = _.cloneDeep(config);
	_.unset(copyConfig, 'cspi');
	for (var ip_proto in copyConfig) {
		for (var line in ip_proto) {
			_.unset(copyConfig[ip_proto][line], 'recid');
		}
	}
	copyConfig.cspi = config.cspi;
	res.send( copyConfig );   // send config to client in response
	addPosted(req.body);  // add posted to db
});

// Web Client Posts Update to general configuration.  For now, this only consists of polling
// interval (CSPI).  Updated general config is returned to client.
app.post('/config_general', function(req, res) {
	var parsedReq = JSON.parse(req.body.request);
	if (parsedReq.cmd === 'save') {
		config.cspi = parsedReq.record.cspi;
	}
	res.send( '{ "status": "success", "record": { "cspi": "' + config.cspi + '" } }');
});

// Web Client Posts Update to module config specified in URL as parameter 'config_name'
// Server updates the module's config and returns updated config to web client
app.post('/config/:config_name', function(req, res) {
	var parsedReq = JSON.parse(req.body.request);
	//console.log(parsedReq)
	if (parsedReq.cmd === 'get') {
		//console.log("CONFIG_HTTP: GET")
	}
	else if (parsedReq.cmd === 'save') {
		config[req.params.config_name].push(parsedReq.record)
		//config.mapiSend.push(parsedReq.record)
	}
	else if (parsedReq.cmd === 'delete') {
		var reversed = parsedReq.selected.sort().reverse();
		for (var i = 0; i < reversed.length; i++) {
			config[req.params.config_name].splice(reversed[i]-1, 1);
			//config.mapiSend.splice(reversed[i]-1, 1);
		}
	}

    var copyConfig = _.cloneDeep(config);
	//for(var i = 0; i < copyConfig.mapiSend.length; i++) {
	for(var i = 0; i < copyConfig[req.params.config_name].length; i++) {
		config[req.params.config_name][i].recid = i+1;
		copyConfig[req.params.config_name][i].recid = i+1;
	}
	res.send( '{ "status": "success", "records": ' + JSON.stringify(copyConfig[req.params.config_name]) + ' }');
});

app.get('/status', function(req, res) {
	db.get("select (select count(*) FROM smb  where date >= " + (Date.now() -  60000) + ")  smb60, "  +
		          "(select count(*) FROM smb  where date >= " + (Date.now() - 300000) + ") smb300, "  +
		          "(select count(*) FROM smb  where date >= " + (Date.now() - 600000) + ") smb600, "  +
		          "(select count(*) FROM smb) smb, "  +
		          "(select count(*) FROM http where date >= " + (Date.now() -  60000) + ") http60, "  +
		          "(select count(*) FROM http where date >= " + (Date.now() - 300000) + ") http300, " +
		          "(select count(*) FROM http where date >= " + (Date.now() - 600000) + ") http600, " +
		          "(select count(*) FROM http) http, "  +
		          "(select count(distinct host) FROM http where date >= " + (Date.now() - 600000) + ") http600host, " +
		          "(select count(distinct host) FROM smb where date >= "  + (Date.now() - 600000) + ") smb600host",
        function (err, row) {
        	var status = { "m": row, "c": config }
        	res.send(status);
    	});
});

// web service start listening
app.listen( port, ip_addr, function () {
  console.log('Listening on port ' + port + '!')
})

// Add posted data to DB in their respective tables
function addPosted(dbObj) {
	// initialize an array of SQL commands
	var sqlCMD = []
	// foreach table in the database object
	for (var table in dbObj) {
		// foreach row in the table
		for (var i = 0; i < dbObj[table].length; i++){
			// initialize a SQL insert
			sqlCMD[i] = 'insert into ' + table;
			var a = [];  // initialize an array of columns
			var b = [];  // initialize an array of values
			var c = 0;   // initialize counter
			// foreach column in table
			for (var f in dbObj[table][i]) {
				a[c] = f;                     // add column to column array
				b[c] = dbObj[table][i][f];
				c++;                          // increment counter
			}
			// complete SQL insertion command
			sqlCMD[i] += ' ( ' + a.join(", ") + ') values ( ' + 
			                     b.map(function(x){return "'" + x + "'"}).join(", ") + ' )';
		}
	}
	// foreach SQL command in array
	for (var i = 0; i < sqlCMD.length; i++){
		console.log(sqlCMD[i]);
		// insert row
		db.run(sqlCMD[i], function(err) {});
	}
}