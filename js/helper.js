/*global $*/
function getMonth() {
    return (new Date()).getMonth();
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
//const regex = /<tr>.*\n*.*<td class=\"tdaktionen\">(.*)<\/td>.*\n*.*<td.*>(.*)<\/td>.*\n*.*<td.*>(.*)<\/td>.*\n*.*<td.*>(.*)<\/td>.*\n*.*<td.*>(.*)<\/td>/g;
const regex = /<tr>\s*\n*\s*<td class=\"tdaktionen\">(.*)<\/td>\s*\n*\s*<td.*>(.*)<\/td>\s*\n*\s*<td.*>(.*)<\/td>\s*\n*\s*<td.*>(.*)<\/td>\s*\n*\s*<td.*>(.*)<\/td>\s*\n*\s*<td.*>(.*)<\/td>/g;

function manos(klasse, callback) {
    $.get("http://www.manos-dresden.de/aktuelles/quellen/VPlan_Schueler.html").success(function (data) {
        //$.get("http://localhost/Wall_copy/1/manos.html", function(data) {
        var match;
        var hits = [];
        while ((match = regex.exec(data)) !== null) {
            if (match.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            var klasses = match[1].split(",");
            //s += match[1];
            if (klasses.indexOf(klasse) > -1) {
                var s = match[2]; //Stunde
                s += '|' + match[3]; // Fach
                //s += '|'+matches[4][i];                 //Lehrer
                //s += '|'+matches[5][i];                 //Raum
                s += '|' + match[6];
                hits.push(s);
            }
        }
        if (hits.length==0)
            callback(klasse + ':&nbsp;keine Vertretungen');
        else 
            callback(klasse + ':&nbsp;' + hits.join('&nbsp;/&nbsp;&nbsp;'));
    }).error(function (jqXHR, textStatus, errorThrown) {
        callback('<span class="s404">' + klasse + ':&nbsp;Vertretungsplan konnte nicht geladen werden</span>');
    });;
}