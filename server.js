var express = require('express');
var bodyParser = require('body-parser');
var sqlite3 = require('sqlite3');

var port = 8008;
var ip_addr = "127.0.0.1"

// Config to send to clients
var config = { 
	"cspi"  : 15, // client-server poll interval in seconds
	//"ping" : { "interval" : 20, "addresses": ["127.0.0.1", "192.168.127.10", "www.yahoo.com"]},
	//"http" : { "interval" : 5, "addresses": ["http://127.0.0.1"]}
	"smb" : [ { "interval": 15, 
	            "share": "\\\\127.0.0.1\\smb", 
	            "domain" : "WORKGROUP", 
	            "username": "Hugh", 
	            "password": "food411"},
	          { "interval": 17, 
	            "share": "\\\\127.0.0.1\\smb", 
	            "domain" : "WORKGROUP", 
	            "username": "Hugh", 
	            "password": "food411"} ]
};

// create DB in memory and create tables if do not exist
var db = new sqlite3.Database(':memory:');
//db.run("CREATE TABLE if not exists ping (date INTEGER, host TEXT, ipv4 TEXT, mac TEXT, ms INTEGER)");
//db.run("CREATE TABLE if not exists http (date INTEGER, url TEXT, ipv4 TEXT, mac TEXT)");
db.run("CREATE TABLE if not exists smb (date INTEGER, share TEXT, domain TEXT, username TEXT, password TEXT)");


var app = express();  // create web server
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

// just serve up something (for now) at root
app.get('/', function (req, res) {
  res.send(Date.now().toString())
});

// URI for clients to poll for config
app.get('/config', function (req, res) {
  res.send( config )
  console.log("got hit")
});

// URI for clients to post ping data
app.post('/plus', function(req, res) {
	console.log("got hit");
	console.log(req.body);
	res.send( config );  // send config back to client
	//for (var i = 0; i < req.body.length; i++){
	//	console.log(req.body[i])
		// insert posted data into DB
	    //db.run("insert into ping values (" + req.body[i].date  + ", '" +
	    //                                     req.body[i].host + "', '" +
	    //                                     req.body[i].ipv4 + "', '" +
	    //                                     req.body[i].mac + "', " +
	    //                                     req.body[i].ms + ")");
	//}
});

// web service start listening
app.listen( port, ip_addr, function () {
  console.log('Listening on port ' + port + '!')
})

// 4DEBUG ---- Prints num of rows in smb table
setInterval(sizeSMBDB, 60000);
function sizeSMBDB() {
	db.get("select count(*) numRows FROM smb", 
	//db.all("select * FROM smb", 
        function (err, rows) {
        console.log("Rows in smb: " + rows.numRows);
    });
}

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
				b[c] = dbObj[table][i][f];    // add value to value array
				c++;                          // increment counter
			}
			// turn arrays into strings in proper SQL insertion format
			a = JSON.stringify(a).replace(/(^\[)(.*)(\]$)/,"($2)");
			b = JSON.stringify(b).replace(/(^\[)(.*)(\]$)/,"($2)");
			// complete SQL insertion command
			sqlCMD[i] += ' ' + a + ' values ' + b;
		}
	}
	// foreach SQL command in array
	for (var i = 0; i < sqlCMD.length; i++){
		console.log(sqlCMD[i])
		// insert row
		db.run(sqlCMD[i])
	}
}