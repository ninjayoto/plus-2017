var _ = require('lodash');
var SMB2 = require('smb2');

var timers = {};

// initialize config client will receive from server
var config = { 
	"cspi"  : 2, // client-server poll interval in seconds
	"smb" : [ ]
};

var postURL = "http://127.0.0.1:8008/plus";

// Create database in memory and create tables if do not exist.
var sqlite3 = require('sqlite3');
var db = new sqlite3.Database(':memory:');
db.run("CREATE TABLE if not exists smb (date INTEGER, share TEXT, domain TEXT, username TEXT, password TEXT)");


var updateCspi = function(){
	processDB();
    clearInterval(cspiInterval);
    cspiInterval = setInterval(updateCspi, config.cspi * 1000);
}
var cspiInterval = setInterval(updateCspi, config.cspi * 1000);

// Posts the entire DB in JSON format.
// Upon success, deletes posted rows and updates config
function postDB(dbObj) {
	var request = require('request');
	request.post(	postURL,
				  	{ json: dbObj },
                  	function (error, response, body) {
                  		console.log("POSTED BODY: " + JSON.stringify(dbObj))
                  		//  if successful delete posted rows and update config
    			  		if (!error && response.statusCode == 200) {
        					console.log("RETURNED BODY: " + JSON.stringify(body));
        					reConfig(response.body);
        					delPosted(dbObj);
    			    	}
				  	}
	);
}

// Process new config
function reConfig(newConfig) {
	// deep copy running config to comparison copy
	var oldConfig = _.cloneDeep(config);

					var addRows = _.difference(newConfig[ip_proto],oldConfig[ip_proto]);
				console.log("addRows: " + addRows.length)

	// did polling interval change?
	// if not, do nothing
	if ( oldConfig.cspi === newConfig.cspi ){
		console.log( "SAME CSPI");
	}
	// if so, change polling interval on running config
	// remove cspi from OLD and NEW config
	else {
		console.log( "DIFF CSPI");
		config.cspi = newConfig.cspi;
		delete newConfig.cspi;
		delete oldConfig.cspi;
	}
	// did anything other than polling interval change?
	// if not, do nothing
	if ( _.isEqual(oldConfig, newConfig) ) {
		console.log( "NO CHANGE");
	}
	else {
		// if there was a change, check every protocol
		for (var ip_proto in oldConfig) {
			// are contents of protocol config equal?
			// if equal, do nothing
			if (_.isEqual(oldConfig[ip_proto],newConfig[ip_proto])) {
				console.log("OBJ EQUAL")
			}
			else {
				// In NEW config, but NOT in OLD.
				var addRows = _.filter(newConfig[ip_proto], function(obj){ return !_.find(oldConfig[ip_proto], obj); });
				console.log("addRows: " + addRows.length)

				for(var i = 0; i < addRows.length; i++) {
					var generate = require('nanoid/generate');
					var id = generate('abcdefghijklmnopqrstuvwxyzABCDEJGHIJKLMNOPQRSTUVWXYZ', 16);
					timers[id] = { ip_proto: ip_proto, param: addRows[i]};
					//timers[id].timeoutID = setTimeout(procTimer.bind(null,id){}, 1000);
				}

				// in OLD config, but NOT in NEW
				var delRows = _.filter(oldConfig[ip_proto], function(obj){ return !_.find(newConfig[ip_proto], obj); });
				console.log("delRows: " + delRows.length);
				for(var i = 0; i < delRows.length; i++) {
					var delKey = _.findKey(timers, function(o) { return _.isEqual(o.param, delRows[i]); })
					delete timers[delKey];
					console.log("Deleted: " + delKey);
				}

				// in OLD config and NEW config   *****Dont have to do anything?*****
				//var keepRows = _.filter(oldConfig[ip_proto], function(obj){ return _.find(newConfig[ip_proto], obj); });
				//console.log("keepRows: " + keepRows.length)


				//for (var i = 0; i < oldConfig[ip_proto].length; i++){
					//console.log(oldConfig[ip_proto][i])
				//}
				console.log("OBJ NOT EQUAL")
			}

		}


		console.log( "CHANGE");
		config = newConfig;
	}
	//config = newConfig;
	for (var id in timers) {
		if ("timeoutID" in timers[id]) { console.log("Exists: " + id) }
		else { 
			console.log("Does not exist");
			if (timers[id].ip_proto === "smb"){
				procSMB(id);
			}
			else if (timers[id].ip_proto != "smb") {

			}
		 }
	}
}

// Converts entire DB to JSON
// Upon completion, calls postDB IOT post to server
function processDB() {
	const SqliteToJson = require('sqlite-to-json');
	const exporter = new SqliteToJson({ client: db });
	exporter.all(function (err, all) { 
		//console.log(all)
		postDB(all);
	});
}

// Delete posted DB rows
function delPosted(dbObj) {
	// initialize an array of SQL commands
	var sqlCMD = []
	// foreach table in the database object
	for (var table in dbObj) {
		// foreach row in the table
		for (var i = 0; i < dbObj[table].length; i++){
			// initialize a SQL delete
			sqlCMD[i] = 'delete from ' + table + ' where '
			var c = 0;  // initialize counter
			// foreach column in table			
			for (var f in dbObj[table][i]) {
				// prepend AND if not the first
				if (c != 0){ sqlCMD[i] += ' AND '} 
				// add 'column = value' to sql delete command 
				sqlCMD[i] += f + ' = "' + dbObj[table][i][f] + '"'
				c++;  // increment counter
			}
		}
	}
	// foreach SQL command
	for (var i = 0; i < sqlCMD.length; i++){
		console.log(sqlCMD[i])
		// delete row
		db.run(sqlCMD[i])
	}
}

function procSMB(id) {
	if (id in timers) {
		var smb2Client = new SMB2({	share:    timers[id].param.share,
								    domain:   timers[id].param.domain, 
								    username: timers[id].param.username,
								    password: timers[id].param.password} );
		var filename = "file" + Date.now() + '.txt';
		smb2Client.writeFile(filename, String(Date.now()), function (err) {
    		if (err) throw err;
    		smb2Client.readFile(filename, function(err, data){
    			if(err) throw err;
    			console.log(Date.now() + " SMB2 " + data);
    		});
		});
		console.log("*******************************Timer: " + id)
		timers[id].timeoutID = setTimeout(procSMB.bind(null,id), timers[id].param.interval * 1000)	
	}
}

///////////////////////////////////////////

setTimeout( function() {
				db.run("insert into smb (date, share, domain, username, password) values (0, 'A', 'A', 'A', 'A')");
				db.run("insert into smb (date, share, domain, username, password) values (1, 'B', 'B', 'B', 'B')");
			}, 50 );