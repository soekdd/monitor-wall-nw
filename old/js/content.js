/*global persData, addOns, positions, monitors, settings, $, node, fotos, groups, seasons, daytime*/

function addOnControlContent() {
    var s = '';
    for (var addOnKey in addOns) {
        if (persData.addOns[addOnKey] == undefined)
            persData.addOns[addOnKey] = {
                display:0,
                name:addOnKey,
                pos:'or',
                monitor:'m1'
            };
        s += '<div class="input-group" role="group">';
        s += '<span class="input-group-addon control_title col-my-5">' + addOns[addOnKey].name + '</span>';
        s += '<span class="input-group-addon col-my-1"><input onchange="toggleAddOn(\'' + addOnKey + '\',\'' + (persData.addOns[addOnKey].display == 1 ? 0 : 1) + '\')" type="checkbox"' + (persData.addOns[addOnKey].display == 1 ? ' checked="checked"' : '') + '></span>';
        s += '<div class="input-group-btn col-my-3">';
        s += '<button type="button" class="control_dropdown btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">';
        s += positions[persData.addOns[addOnKey].pos].name + '&nbsp;&nbsp;<span class="caret"></span></button>';
        s += '<ul class="dropdown-menu">';
        for (var posKey in positions) {
            s += '<li><a href="#" onclick="setAddOnPosition(\'' + addOnKey + '\',\'' + posKey + '\')">' + positions[posKey].name + '</a></li>';
        }
        s += '</ul></div>';
        s += '<div class="input-group-btn col-my-3" role="group">';
        s += '<button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">';
        s += monitors[persData.addOns[addOnKey].monitor].name + '&nbsp;&nbsp;<span class="caret"></span></button>';
        s += '<ul class="dropdown-menu">';
        for (var monKey in monitors) {
            s += '<li><a href="#" onclick="setAddOnMonitor(\'' + addOnKey + '\',\'' + monKey + '\')">' + monitors[monKey].name + '</a></li>';
        }
        s += '</ul></div>';
        s += '</div>';
    }
    return s;
}

function fotoModeContent() {
    var s = '';
    var groupsCounter = {};
    for (var key in groups) {
        groupsCounter[key] = 0;
    }
    fotos.forEach(function(foto) {
        groupsCounter[foto.group]++;
    });
	if (fotos[persData.current]==null || fotos[persData.current]==undefined) {
		persData.current=0;
	}
    [{
        title: 'Collage',
        type: 'C',
        group: 0
    },{
        title: 'Raw Pictures',
        type: 'R',
        group: 0
    }, {
        title: 'Panorama',
        type: 'P',
        group: 1
    }, {
        title: 'IFrame',
        type: 'I',
        group: 0
    }, {
        title: 'Automatic',
        type: 'A',
        group: 2
    }].forEach(function(line) {
        s += '<div class="input-group" role="group">';
        s += '<span class="input-group-addon col-my-1"><input id="checkbox_' + line.type + '" type="checkbox"' + (persData.currentMode == line.type ? ' checked="checked" disabled="true"' : ' onchange="toggleFotoMode(\'' + line.type + '\')"') + '></span>';
        s += '<span class="input-group-addon col-my-' + (line.group == 0 ? '6' : '3') + ' fotoMode_title">' + line.title + '</span>';
        if (line.group == 1) {			
            s += '<div class="input-group-btn col-my-3">';
            s += '<button type="button" class="control_dropdown btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">';
            if (fotos[persData.current].type == line.type) {
                s += groups[fotos[persData.current].group] + '(' + groupsCounter[fotos[persData.current].group] + ')';
            }
            else {
                s += groups[Object.keys(groups)[0]] + '(' + groupsCounter[Object.keys(groups)[0]] + ')';
            }
            s += '&nbsp;&nbsp;<span class="caret"></span></button>';
            s += '<ul class="dropdown-menu">';
            for (var key in groups) {
                s += '<li><a href="#" onclick="setFotoGroup(\'' + key + '\')">' + groups[key] + '(' + groupsCounter[key] + ')</a></li>';
            }
            s += '</ul></div>';
        }
        if (line.group == 2) {
            s += '<span class="input-group-btn col-my-3"><button type="button" onclick="toggleFotoMode(\'A\');startChange(null);" class="btn btn-default">next</button></span>';
            s += '<div class="input-group-btn col-my-2">';
            s += '<input type="text" onblur="setChangeTime($(\'#secs\').val())" style="text-align: right" id="secs" class="form-control fotoMode_automaticTime" value="' + persData.changeTime + '"></div>';
            s += '<span class="input-group-addon col-my-3">Sekunden</span>';
        }
        if (line.group < 2) {
            s += '<div class="input-group-btn col-my-5">';
            s += '<button type="button" class="control_dropdown btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">';
            var title = "";
            var i = 0
            while (i < fotos.length && ((fotos[i].type != line.type) || ((line.group) == 1 && (fotos[i].group != Object.keys(groups)[0])))) {
                i++;
            }
            if (i < fotos.length) {
                title = fotos[i].title;
                if (fotos[persData.current].type == line.type) {
                    var i = 0;
                    title = 'not found';
                    while (i < fotos.length && (fotos[i].file != fotos[persData.current].file || fotos[i].type != fotos[persData.current].type)) {
                        i++
                    }
                    title = fotos[i].title;
                }
                s += title;
                s += '&nbsp;&nbsp;<span class="caret"></span></button>';
                s += '<ul class="dropdown-menu">';
                var groupKey = Object.keys(groups)[0];
                if (fotos[persData.current].type == line.type) {
                    groupKey = fotos[persData.current].group;
                }
                for (var i = 0; i < fotos.length; i++) {
                    var element = fotos[i];
                    if (((line.group == 0) && (element.type == line.type)) || ((line.group == 1) && (element.group == groupKey))) {
                        s += '<li><a href="#" onclick="setFotoIndex(' + i + ')">' + element.title + '</a></li>';
                    }
                }
                s += '</ul>';
            }
            s += '</div>';
        }
        s += '</div>';
    });
    return s;
}

function taggingContent() {
    var s = '';
    var keySeason = Object.keys(seasons)[0];
    var valSeason = seasons[keySeason];
    var i = 0;
    var next = -1;
    for (var i = 0; i < fotos.length; i++) {
        if (fotos[i].group == 'un' && fotos[i].type == 'P') {
            if (next.current) {
                next = i;
            }
        }
    }
    s += '<div class="input-group" role="group">';
    if (next > -1) {
        s += '<span class="input-group-addon col-my-2"><button type="button" onclick="setFotoIndex(' + next + ')" class="btn btn-default">next new</button></span>';
        s += '<span class="input-group-addon col-my-2">Titel</span>';
        s += '<span class="input-group-addon col-my-8">';
    }
    else {
        s += '<span class="input-group-addon col-my-3">Titel</span>';
        s += '<span class="input-group-addon col-my-9">';
    }
    s += '<input type="text" onblur="setFotoTitle($(\'#fotoTitle\').val())" id="fotoTitle" class="form-control fotoMode_automaticTime" value="' + fotos[persData.current].title + '">';
    s += '</span></div>'
    s += '<div class="input-group" role="group">';
    s += '<span class="input-group-addon col-my-1 my-left"><input id="checkbox_' + keySeason + '" type="checkbox"' + (fotos[persData.current].seasons.indexOf(keySeason) > -1 ? ' checked="checked"' : '') + ' onchange="setAllSeasons(\'' + keySeason + '\',' + !(fotos[persData.current].seasons.indexOf(keySeason) > -1) + ')"></span>';
    s += '<span class="input-group-addon col-my-5">' + valSeason.name + '</span>';
    s += '<span class="input-group-addon col-my-3 screenOnly">H&auml;ufigkeit</span>';
    s += '<span class="input-group-addon col-my-3">'
    for (var i = 0; i < fotos[persData.current].priority; i++) {
        s += '<span onclick="setPriority(' + (Math.trunc(i) + 1) + ')" class="glyphicon glyphicon-star">' + (i < 4 ? '&nbsp;' : '') + '</span>';
    }
    for (var i = fotos[persData.current].priority; i < 5; i++) {
        s += '<span onclick="setPriority(' + (Math.trunc(i) + 1) + ')" class="glyphicon glyphicon-star-empty">' + (i < 4 ? '&nbsp;' : '') + '</span>';
    }
    s += '</span></div>';
    for (var i = 1; i < Object.keys(seasons).length; i++) {
        s += '<div class="input-group" role="group" style="width:100%">';
        keySeason = Object.keys(seasons)[i];
        valSeason = seasons[keySeason];
        var keyDaytime = null;
        var valDaytime = null;
        if (i > 2) {
            keyDaytime = Object.keys(daytime)[i - 2];
            valDaytime = daytime[keyDaytime];
        }
        else if (i == 2) {
            keyDaytime = Object.keys(daytime)[0];
            valDaytime = daytime[keyDaytime];
        }
        s += '<span class="input-group-addon col-my-1 my-right"><input id="checkbox_' + keySeason + '" type="checkbox"' + (fotos[persData.current].seasons.indexOf(keySeason) > -1 ? ' checked="checked"' : '') + ' onchange="setSeason(\'' + keySeason + '\',' + !(fotos[persData.current].seasons.indexOf(keySeason) > -1) + ')"></span>';
        s += '<span class="input-group-addon col-my-5">' + valSeason.name + '</span>';
        if (i > 2) {
            s += '<span class="input-group-addon col-my-1 my-right"><input id="checkbox_' + keyDaytime + '" type="checkbox"' + (fotos[persData.current].seasons.indexOf(keyDaytime) > -1 ? ' checked="checked"' : '') + ' onchange="setDayTime(\'' + keyDaytime + '\',' + !(fotos[persData.current].seasons.indexOf(keyDaytime) > -1) + ')"></span>';
            s += '<span class="input-group-addon col-my-5">' + valDaytime.name + '</span>';
        }
        else if (i == 2) {
            s += '<span class="input-group-addon col-my-1 my-left"><input id="checkbox_' + keyDaytime + '" type="checkbox"' + (fotos[persData.current].seasons.indexOf(keyDaytime) > -1 ? ' checked="checked"' : '') + ' onchange="setAllTimes(\'' + keyDaytime + '\',' + !(fotos[persData.current].seasons.indexOf(keyDaytime) > -1) + ')"></span>';
            s += '<span class="input-group-addon col-my-5">' + valDaytime.name + '</span>';
        }
        else if (i == 1) {
            if (fotos[persData.current].type == 'P') {
                s += '<span class="input-group-addon col-my-3 screenOnly">Gruppe</span>';
                s += '<div class="input-group-btn col-my-3 mobile-6">';
                s += '<button type="button" class="control_dropdown btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">';
                s += groups[fotos[persData.current].group];
                s += '&nbsp;&nbsp;<span class="caret"></span></button>';
                s += '<ul class="dropdown-menu">';
                for (var key in groups) {
                    s += '<li><a href="#" onclick="setGroupToFoto(\'' + key + '\')">' + groups[key] + '</a></li>';
                }
                s += '</ul></div>';
            }
            else {
                s += '<span class="input-group-addon col-my-6">&nbsp;</span>';
            }
        }
        s += '</div>';
    }
    return s;
}
