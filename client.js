const _ = require('lodash');
const SMB2 = require('smb2');
const myIP = require('my-local-ip')();
const request = require('request');
const shell = require('node-powershell');
const SqliteToJson = require('sqlite-to-json');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3');

// Create database in memory and create tables if do not exist.
var db = new sqlite3.Database(':memory:');

var timers = {};
var idTimer = 0;

// initialize config client; will receive update from server
var config = { "cspi"  : 2 };

var urls = { "base":   "http://127.0.0.1:80" };
urls.post = urls.base + "/plus";
urls.tables = urls.base + "/tables";

procTable();
function procTable() {
	request( urls.tables, function (error, response, body) {
		if (error) {
			console.log("Unable to download table config.  Waiting 3 seconds...");
			setTimeout(procTable(), 3000);
		}
		else {
			var dbTableCmds = JSON.parse(body);
			for (var i = 0; i < dbTableCmds.length; i++) {
				db.run(dbTableCmds[i]);
			};
			cspiInterval = setInterval(updateCspi, config.cspi * 1000);
		}			
	});
}

var updateCspi = function(){
	processDB();
    clearInterval(cspiInterval);
    cspiInterval = setInterval(updateCspi, config.cspi * 1000);
}

// Posts the entire DB in JSON format.
// Upon success, deletes posted rows and updates config
function postDB(dbObj) {
	request.post(	urls.post,
				  	{ json: dbObj },
                  	function (error, response, body) {
                  		//  if successful delete posted rows and update config
    			  		if (!error && response.statusCode == 200) {
        					reConfig(response.body);
        					delPosted(dbObj);
    			    	}
    			    	else {
    			    		console.log("Unable to POST db.")
    			    	}
				  	}
	);
}

// Process new config
function reConfig(newConfig) {
	// deep copy running config to comparison copy
	var oldConfig = _.cloneDeep(config);

	// if polling interval changed
	if ( oldConfig.cspi !== newConfig.cspi ){
		// change polling interval on running config
		config.cspi = newConfig.cspi;
		// remove cspi from OLD and NEW config
		delete newConfig.cspi;
		delete oldConfig.cspi;
	}
	// did anything other than polling interval change?
	// if not, do nothing
	if ( ! _.isEqual(oldConfig, newConfig) ) {
		// if there was a change, check every protocol
		for (var ip_proto in newConfig) {
			// are contents of protocol config equal?
			// if equal, do nothing
			if (_.isEqual(oldConfig[ip_proto],newConfig[ip_proto])) {
				//console.log("OBJ EQUAL");
			}
			else {
				// In NEW config, but NOT in OLD...put those items in an array
				var addRows = _.filter(newConfig[ip_proto], function(obj){ return !_.find(oldConfig[ip_proto], obj); });
				//console.log("addRows: " + addRows.length);
				// For each of those items
				for(var i = 0; i < addRows.length; i++) {
					// Generate a timer object along with a timer id
					timers[idTimer.toString()] = { ip_proto: ip_proto, param: addRows[i]};
					idTimer++;
				}
				// in OLD config, but NOT in NEW....make an array of old items
				var delRows = _.filter(oldConfig[ip_proto], function(obj){ return !_.find(newConfig[ip_proto], obj); });
				// delete the associated timer
				for(var i = 0; i < delRows.length; i++) {
					var delKey = _.findKey(timers, function(o) { return _.isEqual(o.param, delRows[i]); })
					delete timers[delKey];
				}
			}
		}
		newConfig.cspi = config.cspi;
		config = newConfig;
	}
	// Foreach of the timers
	for (var id in timers) {
		// If timeoutID not assigned
		if (  !("timeoutID" in timers[id])) { 
		    // then it is a new item and need to create a new timer event
			switch (timers[id].ip_proto) {
            	case "smb":
            	procSMB(id);
            	break;
            	case "http":
            	procHTTP(id);
            	break;
            	case "smtp":
            	procSMTP(id);
            	break;
            	case "mapiDelete":
            	procMapiDelete(id);
            	break;
            	case "mapiSend":
            	procMapiSend(id);
            	break; 
            }
		}
	}
}

function procMapiSend(id) {
	if (id in timers) {
		timers[id].timeoutID = setTimeout(procMapiSend.bind(null,id), timers[id].param.interval * 1000);

		let ps = new shell({
		  debugMsg: false
		});

		ps.addCommand( '$Outlook = New-Object -ComObject Outlook.Application' );
		ps.addCommand( '$Mail = $Outlook.CreateItem(0)' );
		ps.addCommand( '$Mail.To = "' + timers[id].param.recipient + '"' );
		ps.addCommand( '$Mail.Subject = "' + timers[id].param.subject + '"' );
		ps.addCommand( '$Mail.Body = "' + timers[id].param.body + '"' );
		ps.addCommand( '$Mail.Attachments.Add("C:\\Dell\\UpdatePackage\\log\\setup.log")');
	    ps.addCommand( '$Mail.Send()' );

		ps.invoke()
		.then(output => {
			db.run("insert into mapiSend (date, host, subject, recipient) values (" +
				Date.now() + ", '" +
				myIP + "', '" +
				timers[id].param.subject + "', '" + 
				timers[id].param.recipient + "' )", function(err) {});
		})
		.catch(err => {
		  console.log(err);
		  ps.dispose();
		});

		ps.dispose().then(code => {}).catch(err => {});
	}
}
function procMapiDelete(id) {
	if (id in timers) {
		timers[id].timeoutID = setTimeout(procMapiDelete.bind(null,id), timers[id].param.interval * 1000);

		let ps = new shell({
		  debugMsg: false
		});

		ps.addCommand( '$counter = 0' );
		ps.addCommand( '$ol = New-Object -ComObject Outlook.Application' );
		ps.addCommand( '$mapi = $ol.getnamespace("mapi");' );
		ps.addCommand( '$emails = $Mapi.Folders.Item("hugh@boilermaker.net").Folders.Item("AAA")' );
		var longCmd = 'For($i=($emails.items.count-1);$i -ge 0;$i--){ ' +
		              ' if ($emails.items[$i+1].subject -eq "' + timers[id].param.subject + '") {' +
		              '     $counter++;' + 
		              '     $emails.items[$i+1].Unread = $false;' + 
		              '     $emails.items[$i+1].delete(); } }';
		ps.addCommand( longCmd );
		ps.addCommand( '$obj = [PSCustomObject]@{counter=$counter} | ConvertTo-Json -Compress');
		ps.addCommand( 'echo $obj');

		ps.invoke()
		.then(output => {
			db.run("insert into mapiDelete (date, host, count, subject) values (" +
				Date.now() + ", '" +
				myIP + "', " +
				JSON.parse(output).counter + ", '" + 
				timers[id].param.subject + "' )", function(err) {});
		})
		.catch(err => {
		  console.log(err);
		  ps.dispose();
		});
		//ps.streams.stdout.on('data', data=>{});
		ps.dispose().then(code => {}).catch(err => {});
	}
}

// Converts entire DB to JSON.  Upon completion, calls postDB IOT post to server
function processDB() {
	const exporter = new SqliteToJson({ client: db });
	exporter.all(function (err, all) { 
		postDB(all);
	});
}

// Delete posted DB rows
function delPosted(dbObj) {
	// initialize an array of SQL commands
	var sqlCMD = [];
	// foreach table in the database object
	for (var table in dbObj) {
		// foreach row in the table
		for (var i = 0; i < dbObj[table].length; i++){
			// initialize a SQL delete
			sqlCMD[i] = 'delete from ' + table + ' where ';
			var c = 0;  // initialize counter
			// foreach column in table			
			for (var f in dbObj[table][i]) {
				// prepend AND if not the first
				if (c != 0){ sqlCMD[i] += ' AND '} 
				// add 'column = value' to sql delete command 
				sqlCMD[i] += f + ' = "' + dbObj[table][i][f] + '"';
				c++;  // increment counter
			}
		}
	}
	// foreach SQL command
	for (var i = 0; i < sqlCMD.length; i++){
		console.log(sqlCMD[i]);
		// delete row
		db.run(sqlCMD[i]);
	}
}

function procSMB(id) {
	// if the random assigned id is in timers then process it
	if (id in timers) {
		// create new smb client with parameters from config
		var smb2Client = new SMB2({	share:    timers[id].param.share,
								    domain:   timers[id].param.domain, 
								    username: timers[id].param.username,
								    password: timers[id].param.password} );
		// set filename
		var timestamp = Date.now();
		var filename = "file" + timestamp + '.txt';
		// create & write to file
		smb2Client.writeFile(filename, String(timestamp), function (err) {
    		if (err) throw err;
    		// read file
    		smb2Client.readFile(filename, function(err, data){
    			if(err) throw err;
    			// insert completed task in db
    			db.run("insert into smb (date, host, share, domain, username, password) values (" + 
    				timestamp + ", '" + 
    				myIP + "' , '" + 
    				timers[id].param.share + "', '" +
    				timers[id].param.domain + "', '" + 
    				timers[id].param.username + "', '" + 
    				timers[id].param.password +  "')", function(err) {});
    		});
		});
		// set the timer to run this function again
		timers[id].timeoutID = setTimeout(procSMB.bind(null,id), timers[id].param.interval * 1000);
	}
	// else, ignore it....this is mostly likely because it has been removed
}

function procHTTP(id) {
	if (id in timers) {
		request(timers[id].param.url, function (error, response, body) {
			var status = "";
			if (error) {
				status = error.code;
			}
			else {
				status = response.statusCode;
			}
			db.run("insert into http (date, host, url, statuscode) values (" +
				Date.now() + ", '" +
				myIP + "', '" +
				timers[id].param.url + "', '" +
				status + "')", function(err) {} );
			timers[id].timeoutID = setTimeout(procHTTP.bind(null,id), timers[id].param.interval * 1000);			
		});
			
	}
}

function procSMTP(id) {
	if (id in timers) {
		let transporter = nodemailer.createTransport({
		    host: timers[id].param.serv,
		    port: timers[id].param.port,
		    secure: false, // true for 465, false for other ports
		    tls: {
		        rejectUnauthorized: false  // do not fail on invalid (or self signed) certs 
		    }
		});

		// setup email data with unicode symbols
		console.log("FROM: " + timers[id].param.f);
		let mailOptions = {
		    from: timers[id].param.f, // sender address
		    recipient: timers[id].param.t, // list of receivers
		    subject: timers[id].param.s, // Subject line
		    text: timers[id].param.m // plain text body
		};

		// send mail with defined transport object
		transporter.sendMail(mailOptions, (error, info) => {
			var code = "";
		    if (error) {
				code = error.errno;
		    }
		    else {
		    	code = info.response;
			}
			db.run("insert into smtp (d, h, f, t, s, m, r, serv, port) values (" +
				Date.now() + ", '" +
				myIP + "', '" +
				timers[id].param.f + "', '" +
				timers[id].param.t + "', '" +
				timers[id].param.s + "', '" +
				timers[id].param.m + "', '" +
				code + "', '" +
				timers[id].param.serv + "', '" +
				timers[id].param.port + "')", function(err) {});
			timers[id].timeoutID = setTimeout(procSMTP.bind(null,id), timers[id].param.interval * 1000);
		});	
	}
}