var _ = require('lodash');
var express = require('express');
var bodyParser = require('body-parser');
var sqlite3 = require('sqlite3');

var port = 80;
var ip_addr = "127.0.0.1"

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
	"http" : [ //{"interval": 15, "url": "http://www.google.com"}, 
	           //{"interval": 20, "url": "http://www.yahoo.com"}
	],
	"smtp" : [ { "interval": 15,
	             "f": "hugh@boilermaker.net",
	             "t": "address@example.org",
	             "s": "TEST EMAIL",
	             "m": "This is a test",
	             "serv": "127.0.0.1",
	             "port": 25 }
	]
};

// create DB in memory and create tables if do not exist
var db = new sqlite3.Database(':memory:');
db.run("CREATE TABLE if not exists smb  (date INTEGER, host TEXT, share TEXT, domain TEXT, username TEXT, password TEXT)");
db.run("CREATE TABLE if not exists http (date INTEGER, host TEXT, url TEXT, statuscode TEXT)");
db.run("CREATE TABLE if not exists smtp (d INTEGER, h TEXT, f TEXT, t TEXT, s TEXT, m TEXT, r TEXT, serv TEXT, port TEXT)");

var app = express();  // create web server
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
app.use('/',express.static('files'))
app.use('/font-awesome',express.static('font-awesome'))

// Dump DB to JSON
app.get('/smb_db', function (req, res) {
	db.all("select * FROM smb order by date desc",
        function (err, row) {
        	res.jsonp(row);
    	});
});

app.get('/http_db', function (req, res) {
	db.all("select * FROM http order by date desc",
        function (err, row) {
        	res.jsonp(row);
    	});
});

app.get('/smtp_db', function (req, res) {
	db.all("select * FROM smtp order by d desc",
        function (err, row) {
        	res.jsonp(row);
    	});
});


// Dump config to JSON
app.get('/config', function (req, res) {
  res.send( config )
});

// URI for clients to post data
app.post('/plus', function(req, res) {
	res.send( config );   // send config to client in response
	addPosted(req.body);  // add posted to db
});

app.post('/config_general', function(req, res) {
	var parsedReq = JSON.parse(req.body.request);
	if (parsedReq.cmd === 'save') {
		config.cspi = parsedReq.record.cspi;
	}
	res.send( '{ "status": "success", "record": { "cspi": "' + config.cspi + '" } }');
});

app.post('/config_smb', function(req, res) {
	var parsedReq = JSON.parse(req.body.request);
	//console.log(parsedReq)
	if (parsedReq.cmd === 'get') {
	}
	else if (parsedReq.cmd === 'save') {
		config.smb.push(parsedReq.record)
	}
	else if (parsedReq.cmd === 'delete') {
		var reversed = parsedReq.selected.sort().reverse();
		for (var i = 0; i < reversed.length; i++) {
			config.smb.splice(reversed[i]-1, 1);
		}
	}

    var copyConfig = _.cloneDeep(config);
	for(var i = 0; i < copyConfig.smb.length; i++) {
		config.smb[i].recid = i+1;
		copyConfig.smb[i].recid = i+1;
	}
	res.send( '{ "status": "success", "records": ' + JSON.stringify(copyConfig.smb) + ' }');
});

app.post('/config_smtp', function(req, res) {
	var parsedReq = JSON.parse(req.body.request);
	//console.log(parsedReq)
	if (parsedReq.cmd === 'get') {
	}
	else if (parsedReq.cmd === 'save') {
		config.smtp.push(parsedReq.record)
	}
	else if (parsedReq.cmd === 'delete') {
		var reversed = parsedReq.selected.sort().reverse();
		for (var i = 0; i < reversed.length; i++) {
			config.smtp.splice(reversed[i]-1, 1);
		}
	}

    var copyConfig = _.cloneDeep(config);
	for(var i = 0; i < copyConfig.smtp.length; i++) {
		config.smtp[i].recid = i+1;
		copyConfig.smtp[i].recid = i+1;
	}
	res.send( '{ "status": "success", "records": ' + JSON.stringify(copyConfig.smtp) + ' }');
});

app.post('/config_http', function(req, res) {
	var parsedReq = JSON.parse(req.body.request);
	//console.log(parsedReq)
	if (parsedReq.cmd === 'get') {
		//console.log("CONFIG_HTTP: GET")
	}
	else if (parsedReq.cmd === 'save') {
		config.http.push(parsedReq.record)
	}
	else if (parsedReq.cmd === 'delete') {
		var reversed = parsedReq.selected.sort().reverse();
		for (var i = 0; i < reversed.length; i++) {
			config.http.splice(reversed[i]-1, 1);
		}
	}

    var copyConfig = _.cloneDeep(config);
	for(var i = 0; i < copyConfig.http.length; i++) {
		config.http[i].recid = i+1;
		copyConfig.http[i].recid = i+1;
	}
	res.send( '{ "status": "success", "records": ' + JSON.stringify(copyConfig.http) + ' }');
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
		console.log(sqlCMD[i])
		// insert row
		db.run(sqlCMD[i])
	}
}