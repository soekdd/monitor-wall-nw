var fs = require('fs');
var readline = require('readline');
var google = require('googleapis');
var googleAuth = require('google-auth-library');

// If modifying these scopes, delete your previously saved credentials
// at ~/.credentials/calendar-nodejs-quickstart.json
var SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
var TOKEN_DIR = './token/';
var TOKEN_PATH = TOKEN_DIR + 'calendar-nodejs-quickstart.json';

// Load client secrets from a local file.
fs.readFile('client_secret.json', function(err, content) {
    if (err) {
        console.log('Error loading client secret file: ' + err);
        return;
    }
    // Authorize a client with the loaded credentials, then call the
    // Google Calendar API.
    authorize(JSON.parse(content), listEvents);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    var clientSecret = credentials.installed.client_secret;
    var clientId = credentials.installed.client_id;
    var redirectUrl = credentials.installed.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
        if (err) {
            getNewToken(oauth2Client, callback);
        }
        else {
            oauth2Client.credentials = JSON.parse(token);
            callback(oauth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
        rl.close();
        oauth2Client.getToken(code, function(err, token) {
            if (err) {
                console.log('Error while trying to retrieve access token', err);
                return;
            }
            oauth2Client.credentials = token;
            storeToken(token);
            callback(oauth2Client);
        });
    });
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
function storeToken(token) {
    try {
        fs.mkdirSync(TOKEN_DIR);
    }
    catch (err) {
        if (err.code != 'EEXIST') {
            throw err;
        }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
}

/**
 * Lists the next 10 events on the user's primary calendar.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
    var nll = function(val) {
        return val < 10 ? '0' + val : val;
    };
    var calendar = google.calendar('v3');
    /*calendar.calendarList.list({
        auth: auth
    }, function(err,list) {
       // console.log(JSON.stringify(list));
    });*/
    calendar.events.list({
        auth: auth,
        calendarId: 'e2ip0q5os1qa16reerejcvsrd0@group.calendar.google.com',
        timeMin: (new Date()).toISOString(),
        maxResults: 5,
        singleEvents: true,
        orderBy: 'startTime'
    }, 'UTF-8', function(err, response) {
        if (err) {
            console.log('The API returned an error: ' + err);
            return;
        }
        var events = response.items;
        if (events.length == 0) {
            console.log('No upcoming events found.');
        }
        else {
            var days={};
            console.log('Upcoming 5 events:');
            for (var i = 0; i < events.length; i++) {
                var event = events[i];
                var startDate;
                var day = null;
                var time = null;
                if ("dateTime" in event.start) {
                    startDate = new Date(event.start.dateTime);
                    time = nll(startDate.getHours())+':'+nll(startDate.getMinutes());
                } else {
                    startDate = new Date(event.start.date);
                }
                var day = nll(startDate.getDate())+'.'+nll(startDate.getMonth()+1)+'.'+nll(startDate.getFullYear());
                if (days[day] == null) {
                    days[day] = {};
                }  
                if (!('list' in days[day])) {
                    days[day].list = [];
                } 
                if (!('times' in days[day])) {
                    days[day].times = {};
                } 
                var location=null
                if (event.location!=undefined) {
                    location = event.location.split(',')[0];
                }
                if ("dateTime" in event.start) {
                    days[day].times[time]={text:event.summary,loc:location};
                } else {
                    days[day].list.push({text:event.summary,loc:location});
                }
            }
            console.log(JSON.stringify(days));
            var s='';
            for (var day in days){
                s += '<span class="gcDay">'+day+'</span> ';
                if (days[day].list.length>0) {
                    days[day].list.forEach(function(e){
                        s += '<span class="gcEvent">'+e.text+'</span> ';
                        if (e.loc!=null)
                            s += '<span class="gcLocation">'+e.loc+'</span> ';
                    });
                }
                if (Object.keys(days[day].times).length>0) {
                    Object.keys(days[day].times).forEach(function(e){
                        s += '<span class="gcTime">'+e+'</span> ';
                        s += '<span class="gcEvent">'+days[day].times[e].text+'</span> ';
                        if (days[day].times[e].loc!=null)
                            s += '<span class="gcLocation">'+days[day].times[e].loc+'</span> ';
                    });
                }
            }
            console.log(s);
        }
    });
}
