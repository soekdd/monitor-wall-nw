/*global $, manos, loadManos */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function fillnull(i){
    return parseInt(i)<10?'0'+i:i;
}

function getMonth() {
    return (new Date()).getMonth()+1;
}

function getHour() {
    return (new Date()).getHours();
}
var nll = function (val) {
    return val < 10 ? '0' + val : val;
};
var staticEastern = null;

function isEastern() {
    if (staticEastern != null) return staticEastern;
    var now = new Date();
    var year = now.getFullYear();
    var a = year % 19;
    var d = (19 * a + 24) % 30;
    var Tag = d + (2 * (year % 4) + 4 * (year % 7) + 6 * d + 5) % 7;
    if ((Tag == 35) || ((Tag == 34) && (d == 28) && (a > 10))) {
        Tag -= 7;
    }
    var OsterDatum = new Date(year, 2, 22);
    OsterDatum.setTime(OsterDatum.getTime() + 86400000 * Tag);
    var diff = OsterDatum.getTime() - now.getTime();
    staticEastern = (diff < 86400000 * 5 && diff > -86400000 * 2);
    return staticEastern;
}
var staticXmas = null;

function isXmas() {
    if (staticXmas != null) return staticXmas;
    var now = new Date();
    var year = now.getFullYear();
    var WeihnachtsDatum = new Date(year, 11, 24);
    var wday = WeihnachtsDatum.getDay();
    var diff = WeihnachtsDatum.getTime() - now.getTime();
    staticXmas = (diff > -86400000 * 14 && diff < 86400000 * 22 + 86400000 * wday);
    return staticXmas;
}

function soccer(team,league,callback) {
    $.get({
	url: 'https://www.openligadb.de/api/getmatchdata/'+league,
	method:'get',
	success: function (soccerResults) {
        var s = [];
	    soccerResults.forEach((game)=>{
	        if ((team.indexOf(game.Team1.TeamName)>-1 || team.indexOf(game.Team2.TeamName)>-1) && (game.MatchResults.length>0)) {
			var match = 0;
			if (game.MatchResults[1].PointsTeam1+game.MatchResults[1].PointsTeam2>game.MatchResults[0].PointsTeam1+game.MatchResults[0].PointsTeam2)
				match = 1;
	            s.push(game.Team1.TeamName + '&nbsp;<img src="' + game.Team1.TeamIconUrl + '"> - '+game.Team2.TeamName + '&nbsp;<img src="' + game.Team2.TeamIconUrl + '"> '+game.MatchResults[match].PointsTeam1+':'+game.MatchResults[match].PointsTeam2);
	        }
	    });
	    callback(s.join('&nbsp;/ '));
	},
	error: function (SOAPResponse) {
		// show error
	}
});
}

function cleanString(s){
    let t = '';
    for(let i = 0;i<s.length;i++){
        if (s.charCodeAt(i)<127) {
            t =  t + s.charAt(i);
        }
    }
    return t;
}

function vitztXMLFile(callback){
     $.ajax({
        type: "GET",
        url: 'https://'+settings['vitztAuth']+'@www.stundenplan24.de/10223946/vplan/vdaten/VplanKl.xml',
        dataType: "xml",
        error: function (e) {
            callback(null);
        },
        success: function (response) {
            callback($(response).find("datei").text())
        }
    });
}

function vitztGet(klasse, xmlFile, callback){
        $.ajax({
        type: "GET",
        url: 'https://'+settings['vitztAuth']+'@www.stundenplan24.de/10223946/vplan/vdaten/'+xmlFile,
        dataType: "xml",

        error: function (e) {
            callback('<span class="s404">' + klasse + ':&nbsp;Vertretungsplan konnte nicht geladen werden</span>');
        },

        success: function (response) {
			let hits = [];
       
            $(response).find("aktion").each(function () {
				//console.log("akction",$(this))
                if ($(this).find('klasse').text() == klasse) {
					hits.push($(this).find('stunde').text()+'|'+$(this).find('fach').text()+'|'+$(this).find('info').text())
				}
            });
			if (hits.length==0)
				callback(klasse + ':&nbsp;keine Vertretungen');
			else 
				callback(klasse + ':&nbsp;' + hits.join('&nbsp;/&nbsp;&nbsp;'));
        }
    });
}

function manosGet(klasse, part, callback){
    $.getJSON('https://'+settings['manosAuth']+'@manos-dresden.de/vplan/upload/'+part+'/students.json').done((vplan)=>{
        let hits = [];
        let date = vplan.head.title;
        vplan.body.filter(line => {
            let comp = line.class; 
            if (comp.split('/').length>1)
                comp = comp.split('/')[0];
            return comp==klasse
        }).forEach(line=>{
            hits.push(line.lesson+'|'+line.subject+'|'+line.info)
        })
        if (hits.length==0)
            callback(1,klasse + ':&nbsp;keine Vertretungen',date);
        else 
            callback(1,klasse + ':&nbsp;' + hits.join('&nbsp;/&nbsp;&nbsp;'),date);
    }).fail(()=>{
        callback(0,'<span class="s404">' + klasse + ':&nbsp;Vertretungsplan konnte nicht geladen werden</span>','');
    });
}

function vitztWS(klasse, callback) {
    vitztXMLFile(xmlFile=>{
        if (xmlFile == null) {
            callback('<span class="s404">' + klasse + ':&nbsp;Vertretungsplan konnte nicht geladen werden</span>','')
        } else {
            vitztGet(klasse, xmlFile, (text)=>callback(text))
        }
    })
}


function manosWS(klasse, callback) {
    manosGet(klasse, 'next', (result, text, date)=>{
        if (result == 1) {
            callback(text,date)
        } else {
            manosGet(klasse, 'current', (result, text, date)=>callback(text,date))
        }
    })
}
