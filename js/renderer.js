/*global persData, addOns, positions, monitors, settings, $, node, fotos, groups, seasons, daytime, addOnControlContent, taggingContent, fotoModeContent*/
"use strict";
var lastChange = new Date();
var zCounter = 0;
var cCounter = 0;
var cFotos = [];

function setAddOnPosition(addOnKey, posKey) {
    persData.addOns[addOnKey].pos = posKey;
    refreshAddOnControl();
    node.storeData();
}

function toggleAddOn(addOnKey, enable) {
    persData.addOns[addOnKey].display = enable;
    refreshAddOnControl();
    node.storeData();
}

function setAddOnMonitor(addOnKey, monKey) {
    persData.addOns[addOnKey].monitor = monKey;
    refreshAddOnControl();
    node.storeData();
}

function refreshAddOnControl() {
    $('#addOnControl').html(addOnControlContent());
    for (var addOnKey in addOns) {
        var position = positions[persData.addOns[addOnKey].pos];
        var monitor = monitors[persData.addOns[addOnKey].monitor];
        var css = {
            width: settings.mon_width,
            left: monitor.x,
            top: '',
            bottom: '',
            display: persData.addOns[addOnKey].display == 1 ? 'block' : 'none'
        };
        for (var key in position) {
            if (key != "name") css[key] = position[key];
        }
        $('#' + addOnKey).css(css);
    }
};

function toggleFotoMode(type) {
    if (persData.currentMode == type) return;
    persData.currentMode = type;

    if (type != 'A' && type != fotos[persData.current].type) {
        let i = 0;
        while (i < fotos.length && fotos[i].type != type) {
            i++;
        }
        if (i == fotos.length) return;
        persData.current = i;
        startChange(i);
    }
    refreshTagging();
    refreshFotoMode();
    node.storeData();
}

function setChangeTime(timeIn) {
    persData.changeTime = timeIn;
    toggleFotoMode('A');
    refreshFotoMode();
    node.storeData();
}


function setFotoGroup(group) {
    var i = 0;
    while (i < fotos.length && (fotos[i].type != 'P' || fotos[i].group != group)) {
        i++;
    }
    if (i == fotos.length) return;
    persData.current = i;
    if (persData.currentMode != 'P')
        toggleFotoMode('P');
    else {
        refreshFotoMode();
        refreshTagging();
    }
    startChange(persData.current);
    node.storeData();
}

function setFotoIndex(index) {
    persData.current = index;
    if (persData.currentMode != fotos[persData.current].type) {
        toggleFotoMode(fotos[persData.current].type);
    }
    else {
        refreshFotoMode();
        refreshTagging();
    }
    startChange(index);
    node.storeData();
}

function refreshFotoMode() {
    $('#fotoMode').html(fotoModeContent());
}

function dayTimeStringToObject(daytimeString) {
    var dummy = {};
    for (var i = 0; i < daytimeString.length; i++) {
        dummy[daytimeString[i]] = 1;
    }
    return dummy;
}

function dayTimeObjectToString(daytimeObject) {
    var dummy = "";
    for (var key in daytimeObject) {
        dummy += key;
    }
    return dummy;
}

function setPriority(prio) {
    fotos[persData.current].priority = prio;
    refreshTagging();
    node.storeFotos();
}

function setFotoTitle(titleIn) {
    fotos[persData.current].title = titleIn;
    refreshFotoMode();
    refreshTagging();
    addOns['title'].content('#title');
    node.storeFotos();
}

function setAllTimes(all) {
    var obj = dayTimeStringToObject(fotos[persData.current].seasons);
    ['m', 'n', 'e', 'i', 't'].forEach(function(dayTime) {
        delete obj[dayTime];
    });
    if (all) {
        obj.t = 1;
    }
    fotos[persData.current].seasons = dayTimeObjectToString(obj);
    refreshTagging();
    node.storeFotos();
}

function setDayTime(dayTime, all) {
    var obj = dayTimeStringToObject(fotos[persData.current].seasons);
    if (all) {
        obj[dayTime] = 1;
        delete obj.t;
    }
    else {
        delete obj[dayTime];
    }
    var i = 0;
    ['m', 'n', 'e', 'i'].forEach(function(dayTime) {
        if (Object.keys(obj).indexOf(dayTime) > -1) i++;
    });
    if (i == 4) {
        setAllTimes(true);
        return;
    }
    fotos[persData.current].seasons = dayTimeObjectToString(obj);
    refreshTagging();
    node.storeFotos();
}

function setAllSeasons(all) {
    var obj = dayTimeStringToObject(fotos[persData.current].seasons);
    ['p', 's', 'f', 'w', 'o', 'c', 'y'].forEach(function(dayTime) {
        delete obj[dayTime];
    });
    if (all) {
        obj.y = 1;
    }
    fotos[persData.current].seasons = dayTimeObjectToString(obj);
    refreshTagging();
    node.storeFotos();
}

function setSeason(season, all) {
    var obj = dayTimeStringToObject(fotos[persData.current].seasons);
    if (all) {
        obj[season] = 1;
        delete obj.y;
    }
    else {
        delete obj[season];
    }
    var i = 0;
    ['p', 's', 'f', 'w', 'o', 'c'].forEach(function(dayTime) {
        if (Object.keys(obj).indexOf(dayTime) > -1) i++;
    });
    if (i == 6) {
        setAllSeasons(true);
        return;
    }
    fotos[persData.current].seasons = dayTimeObjectToString(obj);
    refreshTagging();
    node.storeFotos();
}

function setGroupToFoto(key) {
    fotos[persData.current].group = key;
    refreshFotoMode();
    refreshTagging();
    node.storeFotos();
}

function refreshTagging() {
    $('#tagging').html(taggingContent());
}

function toggleControl(id, speed) {
    $('#' + id).slideToggle(speed * 100);
    $('#span_' + id).toggleClass('glyphicon-chevron-down');
    $('#span_' + id).toggleClass('glyphicon-chevron-up');
}

function checkSeason(seasons, time, season) {
    var gott = false;
    var gots = false;
    for (var i = 0; i < time.length; i++) {
        gott = gott || seasons.indexOf(time[i]) > -1
    }
    for (var i = 0; i < season.length; i++) {
        gots = gots || seasons.indexOf(season[i]) > -1
    }
    return gott && gots;
}

function findeNext() {
    var time = [];
    var season = [];
    for (var key in seasons) {
        if (seasons[key].is()) season.push(key);
    }
    for (var key in daytime) {
        if (daytime[key].is()) time.push(key);
    }
    var stars = 0;
    fotos.forEach(function(foto) {
        if (checkSeason(foto.seasons, time, season)) {
            stars += Math.trunc(foto.priority) * (foto.type == 'C' ? 5 : 1);
        }
    });
    var randomStars = Math.trunc(stars * Math.random());
    stars = 0;
    for (var i = 0; i < fotos.length; i++) {
        if (checkSeason(fotos[i].seasons, time, season)) {
            stars += Math.trunc(fotos[i].priority) * (fotos[i].type == 'C' ? 5 : 1);
            if (stars > randomStars) return i;
        }
    }
    return 0;
}

function twoMaxRandom(factor) {
    if (Math.random() < 0.5) {
        return Math.round(factor * (Math.random() * Math.random()) / 2);
    }
    else {
        return Math.round(factor * (0.5 + (Math.random() * Math.random()) / 2));
    }
}

function startChange(preset) {
    node.setPos();
    if (preset == null || preset == '')
        persData.current = findeNext();
    else
        persData.current = preset;
    refreshTagging();
    refreshAddOnControl();
    var nextDiv = $('.next');
    var currentDiv = $('.current');
    if (fotos[persData.current].type == 'P') {
        nextDiv.html('');
        nextDiv.removeAttr("style");
        nextDiv.css('background', 'url("panos/' + fotos[persData.current].file + '")').waitForImages(function() {
            addOns['title'].content('#title');
            currentDiv.fadeOut(3000, function() {
                currentDiv.removeClass('current');
                currentDiv.addClass('next');
                nextDiv.removeClass('next');
                nextDiv.addClass('current');
            })
        }, $.noop, true);
    }
    else if (fotos[persData.current].type == 'C') {
        cFotos = node.getFotosForCollage(fotos[persData.current].file);
        var s = '';
        zCounter = 0;
        var l = Math.trunc(cFotos.length / 4);
        for (var i = 0; i < 4; i++) {
            var max = (l > 40 ? 40 : l);
            s += '<div class="monitors">';
            for (var j = 0; j < max; j++) {
                zCounter++;
                var css = '';
                css += 'filter: brightness(' + Math.round(80 * (j + 1) / max + 20) + '%);'
                css += 'z-index:' + zCounter + ';';
                css += 'left:' + (twoMaxRandom(60) + 20) + '%;';
                css += 'top:' + (twoMaxRandom(40) + 30) + '%;';
                css += 'transform: rotate(' + Math.round(Math.random() * 20 - 10) + 'deg) translate(-50%, -50%)';
                s += '<div style="' + css + '" class="collage"><image src="./fotos/' + fotos[persData.current].file + '/' + cFotos[i * l + Math.round(Math.random() * l)] + '"></div>';
            }
            s += '</div>';
        }
        nextDiv.html('');
        nextDiv.removeAttr("style");
        nextDiv.css('background', 'rgba(0,0,0,100)');
        nextDiv.html(s).waitForImages(function() {
            addOns['title'].content('#title');
            currentDiv.fadeOut(3000, function() {
                currentDiv.removeClass('current');
                currentDiv.addClass('next');
                nextDiv.removeClass('next');
                nextDiv.addClass('current');
            })
        }, $.noop, true);
    }
}

function everySecond() {
    if (persData.currentMode == 'A') {
        var now = new Date();
        let changeTime = persData.changeTime;
        if (fotos[persData.current].type == 'C') changeTime += changeTime;
        if (now - lastChange > changeTime * 1000) {
            lastChange = now;
            startChange(null);
        }
    }
    if (fotos[persData.current].type == 'C') {
        cCounter++;
        if (cCounter > 20) {
            cCounter = 0;
            var c = document.getElementsByClassName('collage');
            zCounter++;
            //$(c[Math.trunc(Math.random() * c.length)]).css('z-index', zCounter);
            $(c[Math.trunc(Math.random() * c.length)]).attr('style', 'opacity:100%;z-index:' + zCounter + ';left:' + Math.round(Math.random() * 60 + 20) + '%;top:' + Math.round(Math.random() * 40 + 30) + '%;transform: translate(-50%, -50%) rotate(' + Math.round(Math.random() * 20 - 10) + 'deg)');
        }
    }
    //node.setPos();
}

function refreshAddOns() {
    for (var key in addOns) {
        addOns[key].content('#' + key);
        if (addOns[key].update > -1) {
            setInterval(function(key) {
                addOns[key].content('#' + key);
            }, addOns[key].update * 1000, key);
        }
    }
}

function mainContent() {
    var s = '<div class="control">';
    [{
        title: "Foto Modus",
        id: 'fotoMode',
        speed: 3
    }, {
        title: "Zusatzinformationen",
        id: 'addOnControl',
        speed: Object.keys(addOns).length
    }, {
        title: "Bilder Tagging",
        id: 'tagging',
        speed: 5
    }].forEach(function(panel) {
        s += '<button type="button" onclick="toggleControl(\'' + panel.id + '\',' + panel.speed + ')" class="btn btn-default" aria-label="Left Align">';
        s += '<span id="span_' + panel.id + '" class="glyphicon glyphicon-chevron-down" aria-hidden="true"></span>';
        s += '</button>&nbsp;<span class="controlTitle">' + panel.title + '</span><br><div id="' + panel.id + '" style="display:none"></div>';
    });
    s += '</div>';
    for (var key in addOns) {
        s += '<div class="addOn" id="' + key + '"></div>';
    }
    s += '<div class="current"></div>';
    s += '<div class="next"></div>';
    return s;
}

function handleRequest(request, response) {
    var params = request.url.split("/");
    // /ws/order
    if (params[1] == 'ws') {
        ['setGroupToFoto','toggleFotoMode', 'toggleAddOn', 'setFotoIndex', 'setAddOnPosition', 'setAddOnMonitor', 'toggleFotoMode', 'setFotoGroup', 'startChange', 'setChangeTime', 'setFotoTitle', 'setAllSeasons', 'setPriority', 'setSeason', 'setDayTime', 'setAllTimes'].forEach(function(func) {
            if (params[2] == func) {
                var s=func+'(';
                for(var i=3;i<params.length;i++) {
                    if ($.isNumeric(params[i]) || params[i]=='false' || params[i]=='true') {
                        s += params[i]+",";
                    } else {
                        s += "'"+decodeURIComponent(params[i])+"',";
                    }
                }
                s += 'null)';
                eval(s);
                /*var args = [];
                for (var i = 3; i < params.length; i++) {
                    args.push(params[i]);
                }
                window[params[2]](args);*/
                response.end(JSON.stringify(persData));
            }
        });
    } else if (params[1] == 'getFotos') {
        response.end(JSON.stringify(fotos));
    } else if (params[1] == 'copy') {
        let bat = spawn('cmd.exe', ['/c', 'copy.bat']);
        bat.on('exit', function (code) {
            //location.reload();
            chrome.runtime.reload();
        });
        response.end('tried');
    }
    else {
        node.serve(request, response, node.finalhandler(request, response));
    }
}

function main() {
    node.initialCheck();
    $('body').html(mainContent());
    refreshFotoMode();
    refreshAddOnControl();
    refreshTagging();
    refreshAddOns();
    if (persData.currentMode == 'A')
        startChange();
    else
        startChange(persData.current);
    setInterval(everySecond, 1000);
    node.setWebserver(handleRequest);
}
