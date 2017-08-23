var ping = require("ping");
var sqlite3 = require('sqlite3').verbose();
var macaddress = require('node-macaddress');

// Get my network interface information
function getMyInterface() {
	return macaddress.all(function(err,mac){
		if (err) throw err
	//})['Local Area Connection'];
	//})['Wi-Fi'];
	});
}

console.log(getMyInterface())

// Create database in memory and create tables if do not exist.
var db = new sqlite3.Database(':memory:');
db.run("CREATE TABLE if not exists ping (date INTEGER, host TEXT, ipv4 TEXT, mac TEXT, ms INTEGER)");
db.run("CREATE TABLE if not exists http (date INTEGER, url TEXT, ipv4 TEXT, mac TEXT)");

// Poll server for config
var config = { 
	"cspi"  : 1, // client-server poll interval in seconds
	"ping" : { "interval" : 5, "addresses": []},
	"http" : { "interval" : 5, "addresses": []}
};
function getConfig() {
	var request = require('request');
	request('http://127.0.0.1:8008/config', function (error, response, body) {
		config = JSON.parse(body);
	});
}

// Ping hosts, record results to local DB
function pingHosts() {
	pingTimeout = setTimeout(pingHosts, config.ping.interval * 1000);
	var myInterface = getMyInterface();
	config.ping.addresses.forEach(function (host) {
	    ping.promise.probe(host)
	        .then(function (res) {
	            //console.log([Date.now(),res.host,myInterface.ipv4,myInterface.mac,res.time]);
	            db.run("insert into ping values (" + Date.now()  + ", '" +
                                                     res.host + "', '" +
                                                     myInterface.ipv4 + "', '" +
                                                     myInterface.mac + "', " +
                                                     ((res.time === 'unknown') ? "NULL" : res.time) + ")");
	        })
	        .done();
	});
}

// Hits URL, record results to local DB
function getURL() {
	httpTimeout = setTimeout(getURL, config.http.interval * 1000);
	var myInterface = getMyInterface();
	config.http.addresses.forEach(function (url) {
		var request = require('request');
	    request.get({url:url}, function(e, r, user) {
            db.run("insert into http values (" + Date.now()  + ", '" +
                                                     url + "', '" +
                                                     myInterface.ipv4 + "', '" +
                                                     myInterface.mac + "')");
            //console.log(r);
	    })
	});
}

//setInterval(pingHosts, 5000);
//setInterval(getURL,    30000);

var updateCspi = function(){
	getPingsDB();
    clearInterval(cspiInterval);
    cspiInterval = setInterval(updateCspi, config.cspi * 1000);
}
var cspiInterval = setInterval(updateCspi, config.cspi * 1000);
var pingTimeout = setTimeout(pingHosts, config.ping.interval * 1000);
var httpTimeout = setTimeout(getURL, config.http.interval * 1000);

function getDbData(){
	var data = {};
	db.all("select * FROM ping", 
        function (err, rows) {
        	data.ping = rows;
        	db.all("select * FROM http", 
        		function (err, rows) {
        			data.http = rows;     
        			//console.log("DB: "+ JSON.stringify(data));   	
        			console.log("DB: "+ data.ping.length + " " + data.http.length); 
        		})
        }
    );
}
setInterval(getDbData,5000);

// Get ping records from local DB, post to server, delete from local DB
function getPingsDB() {
	db.all("select * FROM ping", 
        function (err, rows) {
        	//console.log(rows);
        	var request = require('request');
        	request.post(	'http://127.0.0.1:8008/ping',
	    				  	{ json: rows },
	                      	function (error, response, body) {
	        			  		if (!error && response.statusCode == 200) {
	            					//console.log("From http: " + JSON.stringify(body))
	            					//console.log(rows.length);
	            					//console.log(response.body);
	            					config = response.body;
	            					for (var i=0;i<rows.length;i++) {
	            						//console.log(rows[i].ipv4);
	            						//console.log(String(rows[i].ms));
	            						db.run('delete from ping where date = '  + rows[i].date + ' AND ' +
	            							                          'host = "' + rows[i].host + '" AND ' +
	            							                          'ipv4 = "' + rows[i].ipv4 + '" AND ' + 
	            							                          'mac  = "' + rows[i].mac  + '" AND ' +
	            							                          'ms '       + (( rows[i].ms === null ) ? "is null" : " = " + rows[i].ms)
	            						);
	            					}
	        			    	}
	    				  	}
			);
    });
}