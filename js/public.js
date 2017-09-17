/*global positions, $, persData, fotoModeContent, addOnControlContent, taggingContent, fotos*/

function generator(name, after) {
    //var generic = 'var ' + name + '= function(){';
    var generic = "var request = 'http://"+window.location.hostname+":8080/ws/" + name + "/'+Array.from(arguments).join('/');"
    generic += "$.get(request).success(function(data){";
    generic += "persData=JSON.parse(data);";
    generic += after + "();";
    generic += "});";
    return generic;
}


function getFotos() {
    var request = 'http://'+window.location.hostname+':8080/getFotos';
    $.get(request).success(function(data) {
        fotos = JSON.parse(data);
        refresh();
    });
}

function startCopy() {
    var request = 'http://'+window.location.hostname+':8080/copy';
    $.get(request);
}


/*
var toggleAddOn = new Function(generator('toggleAddOn'));
var setFotoIndex = new Function(generator('setFotoIndex'));
*/

function refresh() {
    $('#placeholder').html('<div id="fotoMode">' + fotoModeContent() + '</div>' +
        '<div id="addOnControl">' + addOnControlContent() + '</div>' +
        '<div id="tagging">' + taggingContent() + '</div>'+
        '<div class="input-group" role="group">'+
        '<span class="input-group-addon"><button type="button" onclick="startCopy()" class="btn btn-default">start copy</button></span></div>'
    );
}

function main() {
    for (var key in positions) {
        positions[key].name=key.toUpperCase();
    }
    ['toggleFotoMode', 'toggleAddOn', 'setFotoIndex', 'setAddOnPosition', 'setAddOnMonitor', 'toggleFotoMode', 'setFotoGroup', 'startChange', 'setChangeTime'].forEach(function(func) {
        window[func] = new Function(generator(func,'refresh'));
    });
    ['setFotoTitle', 'setAllSeasons', 'setPriority', 'setSeason', 'setDayTime', 'setAllTimes','setGroupToFoto'].forEach(function(func) {
        window[func] = new Function(generator(func,'getFotos'));
    });
    refresh();
}
