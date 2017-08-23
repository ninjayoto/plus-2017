var express = require('express');
var bodyParser = require('body-parser');
var sqlite3 = require('sqlite3').verbose();

// Config to send to clients
var config = { 
	"cspi"  : 20, // client-server poll interval in seconds
	"ping" : { "interval" : 20, "addresses": ["127.0.0.1", "192.168.127.10", "www.yahoo.com"]},
	"http" : { "interval" : 5, "addresses": ["http://127.0.0.1"]}
};

// create DB in memory and create tables if do not exist
var db = new sqlite3.Database(':memory:');
db.run("CREATE TABLE if not exists ping (date INTEGER, host TEXT, ipv4 TEXT, mac TEXT, ms INTEGER)");
db.run("CREATE TABLE if not exists http (date INTEGER, url TEXT, ipv4 TEXT, mac TEXT)");


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
app.post('/ping', function(req, res) {
	console.log("got hit")
	res.send( config );  // send config back to client
	for (var i = 0; i < req.body.length; i ++){
		console.log(req.body[i])
		// insert posted data into DB
	    db.run("insert into ping values (" + req.body[i].date  + ", '" +
	                                         req.body[i].host + "', '" +
	                                         req.body[i].ipv4 + "', '" +
	                                         req.body[i].mac + "', " +
	                                         req.body[i].ms + ")");
	}
});

// web service start listening
app.listen(8008, function () {
  console.log('Example app listening on port 8008!')
})

// 4DEBUG ---- Prints num of rows in ping table
setInterval(sizePingDB, 5000);
function sizePingDB() {
	db.get("select count(*) numRows FROM ping", 
	//db.all("select * FROM ping", 
        function (err, rows) {
        console.log("Rows in ping: " + rows.numRows);
    });
}