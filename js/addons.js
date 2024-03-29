﻿/*global $,nll,fotos,persData,node,isEastern,isXmas,getMonth,getHour,manos,soccer*/
var addOns = {
	cnc:{
		update:60,
		name: "CNC Cameras",
		content: function(id) {
			let imageUrls=['http://192.168.0.70:8081/?action=stream','http://192.168.0.70:8082/?action=stream','http://192.168.0.56/video/mjpg.cgi'];
			$.get('http://192.168.0.70/index.html')
				.done(function() { 
					let s = '';
					for (let i = 0; i<3; i++) {
					s += '<img style="width:300px;height:200px" src="'+imageUrls[i]+'/">'
					}
					$(id).html(s);
				}).fail(function() { 
					$(id).html();
				});
		}
	},
    mpd:{
        update:1,
        name: "Music Player Deamon",
        content: function(id) {
            if (node.mpdClient!=null && node.mpdClient.connected) {
                node.mpdClient.updateStatus(function(s){
					let isStream = s.current.file.indexOf('http')==0;
					if (isStream) {
                        let cover = '/img/'+s.current.name.replace('?','')+'.jpg';
                        $(id).html('<table><tr><td><img class="cover" src="file://' + cover + '"></td><td>' + s.current.name + '<br/>' + s.current.title + '</td></tr></table>')						
					} else if (s.current.artist!=undefined) {                  
                        let file = s.current.file.split('/');
                        file.pop();
                        file = file.join('/')+'/_front.jpg';        
                        if (fs.existsSync(settings.mpdCover+file)) {
                            s.current.cover = settings.mpdCover+file;
                        }
                        
                        $(id).html('<table><tr><td><img class="cover" src="file://' + s.current.cover + '"></td><td>' + s.current.artist + ' / ' + (s.current.album!=undefined?s.current.album:'') + '<br>' + s.current.title + ' / ' + fillnull(Math.floor(s.time.elapsed/60)) + ':' + fillnull(s.time.elapsed%60) + '/' + fillnull(Math.floor(s.time.length/60)) + ':' + fillnull(s.time.length%60)+'</td></tr></table>')
                    } else 
                        $(id).html('...');
                });
            } else {
                if (node.mpdCount == undefined) {
                    node.mpdCount = 1;
                } else {
                    node.mpdCount++;
                }
                if(node.mpdCount % 5 == 0) {
                    console.log('try to reconnect');
                    node.mpdClient.connect();   
                } 
            }
        }
    },
    google:{
        update:30,
        name: "Familienkalender",
        content: function(id) {
            node.googleCalendar(function(s){$(id).html(s)});            
        }
    },
    dvb: {
        update:30,
        name: "DVB Abfahrten",
        content: function(id) {
            $.getJSON('http://widgets.vvo-online.de/abfahrtsmonitor/Abfahrten.do?hst=Fritz-Meinhard').success(function(data) {
                var busses = data;
                $.getJSON('http://widgets.vvo-online.de/abfahrtsmonitor/Abfahrten.do?hst=Georg-Palitzsch', function(data) {
                    var trams = data;
                    var s = '<img src="./img/transport-bus.png">';
                    var counter = 0;
                    busses.forEach(function(bus) {
                        if ((bus[2] > 8) && (bus[1] != "Possendorf") && (bus[1] != "Nickern") && (bus[1] != "Lockwitz") && (counter < 2)) {
                            s += "&nbsp;(" + bus[0] + ")&nbsp;" + bus[2] + "min,";
                            counter++;
                        }
                    });
                    s = s.substring(0, s.length - 1) + '&nbsp;<img src="./img/transport-tram.png">';
                    counter = 0;
                    trams.forEach(function(tram) {
                        if ((tram[2] > 10) && (tram[1] != "Prohlis") && (counter < 5)) {
                            s += "&nbsp;(" + tram[0] + ")&nbsp;" + tram[2] + "min,";
                            counter++;
                        }
                    });
                    return $(id).html(s.substring(0, s.length - 1));
                }).error(function(jqXHR, textStatus, errorThrown) {return $(id).html('<span class="s404">Fahrplan konnte nicht geladen werden</span>');}); 
            }).error(function(jqXHR, textStatus, errorThrown) {return $(id).html('<span class="s404">Fahrplan konnte nicht geladen werden</span>');});;
        }
    },
    manos: {
        update:600,
        name: "Vertretungspläne",
        content: function(id) {
            $(id).html('<span id="manosDate"></span><br><span id="child1"></span><br><span id="child2"></span><br><span id="child3"></span><br>');
            manosWS(settings.child2,function(s,d){$('#child2').html(s);$('#manosDate').html(d)});
            manosWS(settings.child1,function(s,d){$('#child1').html(s);$('#manosDate').html(d)});
			vitztWS(settings.child3,function(s){$('#child3').html(s)});
        }
    },
    soccer: {
        update:60,
        name: "Fussballergebnisse",
        content: function(id) {
            $(id).html('<span id="bl1"></span>&nbsp;<span id="bls"></span> <span id="bl2"></span><br>');
            soccer(['Borussia Dortmund'],'bl1',(s)=>{
				if (s!='') {
					$('#bl1').html(s);
					$('#bls').html($('#bl2').html()==''?'':'/');
					console.log('-'+$('#bl2').html()+'-');
				}
			});
            soccer(['SG Dynamo Dresden'],'bl3',(s)=>{
				if (s!='') {
					$('#bl2').html(s);
					$('#bls').html($('#bl1').html()==''?'':'/');
					console.log('-'+$('#bl1').html()+'-');
				}
			});
        }
    },
    weather: {
        update:600,
        name: "Wetterbericht",
        content: function(id) {
            $.getJSON('http://api.openweathermap.org/data/2.5/forecast?id=2935022&mode=json&appid=e0cf30e234e416e8dc0bcc0c34d75785&lang=de').success(function(data) {
                var weatherIn = data;
                var week = ['So','Mo','Di','Mi','Do','Fr','Sa'];
                var s = "";
                //var counter = 0;
                var lastWeekDay = -1;
                var temps = [];
                var lastText = "";
                for (var i = 0; i < 4; i++) {
                    [6, 12, 18].forEach(function(times) {
                        var nextDay = Date.now() + (i * 24 * 60 * 60 * 1000);
                        var day = nll((new Date(nextDay)).getDate());
                        var month = nll((new Date(nextDay)).getMonth()+1);
                        var year = (new Date(nextDay)).getFullYear();
                        var weekDay = (new Date(nextDay)).getDay();
                        if (weekDay != lastWeekDay) {
                            s += lastText + temps.join("/") + (i == 0 ? "" : "&nbsp;&nbsp;") + (i > 0  && i < 3? week[weekDay] + ":&nbsp;" : "");
                            lastWeekDay = weekDay;
                            temps = [];
                        }
        		        weatherIn.list.forEach(function(weatherPart){
        		            var compareDate = year+'-'+month+'-'+day+' '+nll(times)+':00:00';
        			        if (weatherPart.dt_txt==compareDate) {
        				        temps.push(Math.round(weatherPart.main.temp-273.15)+"&deg;");
        				        if (times==12) {
        				            let dest = weatherPart.weather[0].description.replace(/berwiegend/g, "berw.").replace(/teilweise/g, "teilw.");
        					        lastText = '<img src="http://openweathermap.org/img/w/'+weatherPart.weather[0].icon+'.png">&nbsp;'+dest+"&nbsp;";
                				}
        			        }
        		        });
                    });
                }
                $(id).html(s);
            }).error(function(jqXHR, textStatus, errorThrown) {return $(id).html('<span class="s404">Wetterbericht konnte nicht geladen werden</span>');});;
        }
    },
    birthDay: {
        update:3600,
        name: "Geburtstage",
        content: function(id) {
            var birthDays = node.getBirthDays();
            var minDiff = -1;
            var winner = -1;
            for(var i=0;i<birthDays.length;i++){
                var bDay = birthDays[i];
                if (bDay.date!=undefined) {
                    var parts = bDay.date.split('.');
                    var thisDay = (new Date()).getDate();
                    var thisYear = (new Date()).getFullYear();
                    var thisMonth = (new Date()).getMonth()+1;
                    var newDate=parts[1]+"/"+parts[0]+"/"+(thisMonth<parseInt(parts[1])?thisYear+1:thisYear);
                    var todayDate=nll(thisMonth)+"/"+nll(thisDay)+"/"+(thisYear);
                    var diff = (new Date(newDate))-(new Date(todayDate));
                    if (diff>=0 && (minDiff==-1 || minDiff>diff)) {
                        minDiff=diff
                        winner = i;
                    }
                }
            }
            var s = '';
            if (winner>-1) 
                s = '<span'+(minDiff==0?' style="color:orange;text-weight:800"':'')+'>'+birthDays[winner].name+' ('+(minDiff==0?'heute!':birthDays[winner].date.trim().substring(0,6))+')'+'</span>';
            else 
                s = '<span class="s404">Geburtstagskalender nicht gefunden!</span>';
            $(id).html(s);
        }
    },
    title: {
        update:-1,
        name: "Bild-Titel",
        content: function(id) {
            $(id).html(fotos[persData.current].title);
        }
    },
    dayTime: {
        update:5,
        name: "Datum",
        content: function(id) {
            var date = new Date();
            var months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
            var weekDays = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
            $(id).html(weekDays[date.getDay()] + ', ' + date.getDate()+'. '+ months[date.getMonth()] + ' ' + date.getFullYear() +' '+ nll(date.getHours()) + ":" + nll(date.getMinutes()));
        }
    }
};
var seasons = {
    y: {
        name: "Das ganze Jahr",
        is: function() {
            return true;
        },
        all: 1
    },
    p: {
        name: "Frühling",
        is: function() {
            return !isEastern() && (getMonth() > 2 && getMonth() < 6);
        }
    },
    s: {
        name: "Sommer",
        is: function() {
            return (getMonth() > 5 && getMonth() < 9);
        }
    },
    f: {
        name: "Herbst",
        is: function() {
            return !isXmas() && getMonth() > 8;
        }
    },
    w: {
        name: "Winter",
        is: function() {
            return !isXmas() && getMonth() < 3;
        }
    },
    o: {
        name: "Ostern",
        is: function() {
            return isEastern();
        }
    },
    c: {
        name: "Weihnachten",
        is: function() {
            return isXmas();
        }
    }
};
var daytime = {
    t: {
        name: "Jederzeit",
        is: function() {
            return true;
        },
        all: 1
    },
    m: {
        name: "Morgens",
        is: function() {
            return (getHour() < 11);
        }
    },
    n: {
        name: "Mittag",
        is: function() {
            return (getHour() > 10) && (getHour() < 17);
        }
    },
    e: {
        name: "Abend",
        is: function() {
            return (getHour() > 16) && (getHour() < 21);
        }
    },
    i: {
        name: "Nacht",
        is: function() {
            return (getHour() > 19);
        }
    }
};
var monitors = {
    m1: {
        name: "Monitor 1",
        x: 0,
        y: 0
    },
    m2: {
        name: "Monitor 2",
        x: settings.mon_width,
        y: 0
    },
    m3: {
        name: "Monitor 3",
        x: 2 * settings.mon_width,
        y: 0
    },
    m4: {
        name: "Monitor 4",
        x: 3 * settings.mon_width,
        y: 0
    }
};
var positions = {
    ol: {
        name: "Oben links",
        top: 0,
        textAlign: "left",
        width: settings.mon_width
    },
    om: {
        name: "Oben mitte",
        top: 0,
        textAlign: "center",
        width: settings.mon_width
    },
    or: {
        name: "Oben rechts",
        top: 0,
        textAlign: "right",
        width: settings.mon_width
    },
    ul: {
        name: "Unten links",
        bottom: 0,
        textAlign: "left",
        width: settings.mon_width
    },
    um: {
        name: "Unten mitte",
        bottom: 0,
        textAlign: "center",
        width: settings.mon_width
    },
    ur: {
        name: "Unten rechts",
        bottom: 0,
        textAlign: "right",
        width: settings.mon_width
    }
};
var groups = {
    "own": "Eigene",
    "art": "Kunst",
    "k": "Kinder",
    "fun": "Spass",
    "pc": "Stadtpanorama",
    "pn": "Naturpanorama",
    "xx": "für Erwachsene",
    "ss": "Sonnenuntergänge",
    "sr": "Sonnenaufgänge",
    "ar": "Architektur",
    "map": "Karten",
    "os": "Weltraum",
    "ni": "Nachtaufnahmen",
    "te": "Technik",
    "ti": "4 verschiedene",
    "tx": "Texturen",
    "sai": "Feiertage",
    "mov": "Filmplakate",
    "un": "Neue Unsortierte"
};
